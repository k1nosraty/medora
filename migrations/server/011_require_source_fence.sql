-- An old API process on this same database must lose write access at the instant
-- the source cohort changes. Hold the guard through transaction completion.
CREATE OR REPLACE FUNCTION medora.guard_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  writer_phase text;
BEGIN
  SELECT phase INTO STRICT writer_phase FROM medora.writer_transition WHERE singleton FOR SHARE;
  IF writer_phase='frozen' OR
     (writer_phase='rehearsal' AND current_setting('medora.source_fenced',true) IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'writer_fenced' USING ERRCODE='55000';
  END IF;
  RETURN NULL;
END;
$$;
