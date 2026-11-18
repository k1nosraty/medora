CREATE TABLE medora.reminder_devices (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
  values jsonb NOT NULL DEFAULT '{}',
  wake bigint,
  CHECK (jsonb_typeof(values)='object')
);
CREATE INDEX reminder_due ON medora.reminder_devices(wake,id) WHERE wake IS NOT NULL;
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.reminder_devices
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.reminder_devices
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();

CREATE TABLE medora.reminder_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device text NOT NULL,
  previous jsonb,
  following jsonb
);
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.reminder_history
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.reminder_history
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();
CREATE FUNCTION medora.record_reminder_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' THEN
    INSERT INTO medora.reminder_history(device,previous,following)
      VALUES(coalesce(NEW.id,OLD.id),to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER record_change AFTER INSERT OR UPDATE OR DELETE ON medora.reminder_devices
  FOR EACH ROW EXECUTE FUNCTION medora.record_reminder_write();
