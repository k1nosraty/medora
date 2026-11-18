-- This fence moves a PostgreSQL installation. The legacy-generation fence remains independent.
CREATE TABLE medora.infrastructure_handoff (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  installation uuid NOT NULL DEFAULT gen_random_uuid(),
  phase text NOT NULL DEFAULT 'compatibility'
    CHECK (phase IN ('compatibility','active','frozen','retired')),
  transfer uuid,
  destination uuid,
  CHECK ((phase IN ('compatibility','active') AND transfer IS NULL AND destination IS NULL)
      OR (phase='frozen' AND transfer IS NOT NULL AND destination IS NULL)
      OR (phase='retired' AND transfer IS NOT NULL AND destination IS NOT NULL))
);
INSERT INTO medora.infrastructure_handoff DEFAULT VALUES;

CREATE OR REPLACE FUNCTION medora.lock_writer() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE
  infrastructure_phase text;
  writer_phase text;
BEGIN
  SELECT phase INTO STRICT infrastructure_phase FROM medora.infrastructure_handoff WHERE singleton FOR SHARE;
  SELECT phase INTO STRICT writer_phase FROM medora.writer_transition WHERE singleton FOR SHARE;
  IF infrastructure_phase IN ('frozen','retired') OR writer_phase='frozen' OR
     (writer_phase='rehearsal' AND current_setting('medora.source_fenced',true) IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'writer_fenced' USING ERRCODE='55000';
  END IF;
END;
$$;
