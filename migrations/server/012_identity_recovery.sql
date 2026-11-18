CREATE TABLE medora.legacy_session_access (
  owner text NOT NULL REFERENCES medora.accounts(id),
  digest text NOT NULL,
  expires_at bigint NOT NULL,
  PRIMARY KEY(owner,digest)
);
CREATE TABLE medora.password_resets (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner text NOT NULL REFERENCES medora.accounts(id),
  previous jsonb NOT NULL,
  following jsonb NOT NULL
);
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.legacy_session_access
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.password_resets
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_truncate BEFORE TRUNCATE ON medora.legacy_session_access
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();
CREATE TRIGGER note_truncate BEFORE TRUNCATE ON medora.password_resets
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();

-- Only a completed reset has a legacy credential and session representation.
-- Registration and other identity changes still require their own mapping.
CREATE FUNCTION medora.record_account_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton) <> 'rehearsal' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND current_setting('medora.password_reset',true)='true'
     AND (OLD.id,OLD.email,OLD.username,OLD.created_at,OLD.sync_generation)
       IS NOT DISTINCT FROM (NEW.id,NEW.email,NEW.username,NEW.created_at,NEW.sync_generation) THEN
    INSERT INTO medora.password_resets(owner,previous,following)
      VALUES(NEW.id,jsonb_build_array(OLD.password_salt,OLD.password_proof,OLD.password_key),
        jsonb_build_array(NEW.password_salt,NEW.password_proof,NEW.password_key));
  ELSE
    INSERT INTO medora.rollback_exceptions VALUES('accounts') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER account_identity_write ON medora.accounts;
CREATE TRIGGER account_identity_write AFTER INSERT OR DELETE OR UPDATE OF
  id,email,username,password_salt,password_proof,password_key,created_at,sync_generation ON medora.accounts
  FOR EACH ROW EXECUTE FUNCTION medora.record_account_change();

-- Provider calls hold the same read lock as a business write. Freeze waits for
-- a bounded send to finish and later attempts cannot contact the provider.
CREATE FUNCTION medora.lock_writer() RETURNS void LANGUAGE plpgsql AS $$
DECLARE writer_phase text;
BEGIN
  SELECT phase INTO STRICT writer_phase FROM medora.writer_transition WHERE singleton FOR SHARE;
  IF writer_phase='frozen' OR
     (writer_phase='rehearsal' AND current_setting('medora.source_fenced',true) IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'writer_fenced' USING ERRCODE='55000';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION medora.guard_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM medora.lock_writer();
  RETURN NULL;
END;
$$;
