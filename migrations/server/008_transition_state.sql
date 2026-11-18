CREATE FUNCTION medora.check_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phase=OLD.phase AND NEW.snapshot IS NOT DISTINCT FROM OLD.snapshot THEN RETURN NEW; END IF;
  IF OLD.phase='open' AND NEW.phase='rehearsal' AND NEW.snapshot IS NOT NULL THEN RETURN NEW; END IF;
  IF OLD.phase='rehearsal' AND NEW.phase='frozen' AND NEW.snapshot=OLD.snapshot THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'invalid_writer_transition' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER one_way_writer BEFORE UPDATE ON medora.writer_transition
  FOR EACH ROW EXECUTE FUNCTION medora.check_transition();
