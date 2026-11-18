CREATE FUNCTION medora.empty_care() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"medicines":{},"doses":{},"visits":{},"routines":{},"routineLogs":{},"settings":{},"water":[]}'::jsonb
$$;
CREATE TABLE medora.care_state (
  owner text PRIMARY KEY REFERENCES medora.accounts,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  records jsonb NOT NULL DEFAULT medora.empty_care(),
  zone text
);
CREATE TABLE medora.care_log (
  owner text REFERENCES medora.care_state,
  revision bigint NOT NULL,
  operation uuid NOT NULL,
  request jsonb NOT NULL,
  input_digest bytea,
  PRIMARY KEY(owner,revision),
  UNIQUE(owner,operation)
);
ALTER TABLE medora.changes ADD COLUMN care_operation uuid;
ALTER TABLE medora.changes ADD FOREIGN KEY(owner,care_operation)
  REFERENCES medora.care_log(owner,operation) DEFERRABLE INITIALLY DEFERRED;

INSERT INTO medora.care_state(owner,records)
SELECT a.id, jsonb_set(medora.empty_care(),'{water}',coalesce((
  SELECT jsonb_agg(r.body || jsonb_build_object('id',r.id) ORDER BY r.revision)
  FROM medora.records r WHERE r.owner=a.id AND r.kind='water' AND r.body IS NOT NULL), '[]'))
FROM medora.accounts a WHERE a.sync_generation=2;
CREATE FUNCTION medora.create_care_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO medora.care_state(owner) VALUES (NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER new_care AFTER INSERT ON medora.accounts FOR EACH ROW WHEN (NEW.sync_generation=2)
  EXECUTE FUNCTION medora.create_care_state();

-- The water journal and document writers share the account row lock. A water
-- change produced by a document commit already has a deferred FK to its receipt.
CREATE FUNCTION medora.reflect_water() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  doc medora.care_state%ROWTYPE;
  water jsonb;
  item jsonb;
  patch jsonb;
BEGIN
  SELECT * INTO doc FROM medora.care_state WHERE owner=NEW.owner FOR UPDATE;
  IF NOT FOUND THEN
    IF (SELECT sync_generation FROM medora.accounts WHERE id=NEW.owner)=1 THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'missing_care_state';
  END IF;
  SELECT value INTO item FROM jsonb_array_elements(doc.records->'water') WHERE value->>'id'=NEW.record_id;
  IF NEW.body IS NULL THEN
    SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO water
      FROM jsonb_array_elements(doc.records->'water') WITH ORDINALITY AS entries(value,ord)
      WHERE value->>'id'<>NEW.record_id;
    patch=jsonb_build_array('water',NEW.record_id);
  ELSE
    item=coalesce(item,'{}') || NEW.body || jsonb_build_object('id',NEW.record_id);
    SELECT coalesce(jsonb_agg(CASE WHEN value->>'id'=NEW.record_id THEN item ELSE value END ORDER BY ord),'[]') INTO water
      FROM jsonb_array_elements(doc.records->'water') WITH ORDINALITY AS entries(value,ord);
    IF NOT water @> jsonb_build_array(jsonb_build_object('id',NEW.record_id)) THEN water=water || jsonb_build_array(item); END IF;
    patch=jsonb_build_array('water',NEW.record_id,item);
  END IF;
  doc.records=jsonb_set(doc.records,'{water}',water);
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' AND
    octet_length(jsonb_build_object('owner',NEW.owner||'.'||repeat('0',32),'revision',doc.revision+1,
        'records',doc.records,'zone',coalesce(doc.zone,'Asia/Tehran'))::text)>4194304 THEN
    RAISE EXCEPTION 'legacy_reader_capacity' USING ERRCODE='22001';
  END IF;
  UPDATE medora.care_state SET revision=revision+1,records=doc.records WHERE owner=NEW.owner;
  INSERT INTO medora.care_log(owner,revision,operation,request) VALUES(NEW.owner,doc.revision+1,NEW.operation,
    jsonb_build_object('baseRevision',doc.revision,'changes',jsonb_build_array(patch)));
  RETURN NULL;
END;
$$;
CREATE TRIGGER merge_water AFTER INSERT ON medora.changes FOR EACH ROW
  WHEN (NEW.kind='water' AND NEW.care_operation IS NULL) EXECUTE FUNCTION medora.reflect_water();
CREATE TRIGGER guard_state BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.care_state
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER guard_log BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.care_log
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
