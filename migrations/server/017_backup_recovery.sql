CREATE TABLE medora.backup_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  previous jsonb,
  following jsonb
);
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.backup_history
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.backup_history
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();
CREATE FUNCTION medora.record_backup_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' THEN
    INSERT INTO medora.backup_history(previous,following) VALUES(to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER note_unmapped ON medora.backups;
CREATE TRIGGER record_change AFTER INSERT OR UPDATE OR DELETE ON medora.backups
  FOR EACH ROW EXECUTE FUNCTION medora.record_backup_change();
