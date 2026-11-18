CREATE TABLE medora.release_batches (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  batch jsonb
);
INSERT INTO medora.release_batches VALUES(true,NULL);
CREATE TABLE medora.release_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  previous jsonb,
  following jsonb
);
CREATE FUNCTION medora.record_release_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' THEN
    INSERT INTO medora.release_history(previous,following) VALUES(OLD.batch,NEW.batch);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER record_change AFTER UPDATE OF batch ON medora.release_batches
  FOR EACH ROW WHEN (OLD.batch IS DISTINCT FROM NEW.batch) EXECUTE FUNCTION medora.record_release_write();
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['release_batches','release_history'] LOOP
    EXECUTE format('CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write()',relation);
    EXECUTE format('CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write()',relation);
  END LOOP;
END;
$$;
