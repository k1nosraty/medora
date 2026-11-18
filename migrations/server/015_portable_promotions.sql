CREATE TABLE medora.promotion_values (
  key text PRIMARY KEY,
  value jsonb,
  bytes bytea,
  CHECK ((value IS NULL) <> (bytes IS NULL))
);
CREATE TABLE medora.promotion_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  previous jsonb,
  following jsonb
);
CREATE FUNCTION medora.record_promotion_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' THEN
    INSERT INTO medora.promotion_history(key,previous,following)
      VALUES(coalesce(NEW.key,OLD.key),to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER record_change AFTER INSERT OR UPDATE OR DELETE ON medora.promotion_values
  FOR EACH ROW EXECUTE FUNCTION medora.record_promotion_write();
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['promotion_values','promotion_history'] LOOP
    EXECUTE format('CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write()',relation);
    EXECUTE format('CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write()',relation);
  END LOOP;
END;
$$;
