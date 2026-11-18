CREATE TABLE medora.account_deletions (
  owner text PRIMARY KEY REFERENCES medora.accounts(id),
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE medora.backup_cleanup (
  owner text NOT NULL REFERENCES medora.account_deletions(owner),
  digest char(64) NOT NULL,
  PRIMARY KEY(owner,digest)
);
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.account_deletions
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.backup_cleanup
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.account_deletions
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.backup_cleanup
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();

CREATE OR REPLACE FUNCTION medora.record_account_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton) <> 'rehearsal' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND OLD.sync_generation=2 AND NEW.sync_generation=1 AND OLD.id=NEW.id
     AND EXISTS(SELECT 1 FROM medora.account_deletions WHERE owner=OLD.id) THEN
    RETURN NULL;
  END IF;
  IF TG_OP='INSERT' AND current_setting('medora.account_registration',true)='true' AND NEW.sync_generation=2 THEN
    INSERT INTO medora.account_registrations(owner,proof)
      VALUES(NEW.id,jsonb_build_array(NEW.password_salt,NEW.password_proof,NEW.password_key));
  ELSIF TG_OP='UPDATE' AND current_setting('medora.password_reset',true)='true'
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
