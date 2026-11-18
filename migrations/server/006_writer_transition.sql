-- Taking an exclusive lock on this row drains transactions that passed the
-- statement guard. Keep the frozen state across restarts and failed restores.
CREATE TABLE medora.writer_transition (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL CHECK (phase IN ('open','rehearsal','frozen')),
  snapshot text REFERENCES medora.imports
);
INSERT INTO medora.writer_transition (phase) VALUES ('open');
CREATE TABLE medora.cutover_accounts (
  owner text PRIMARY KEY REFERENCES medora.accounts,
  seed_cursor bigint NOT NULL CHECK (seed_cursor >= 0)
);
CREATE TABLE medora.rollback_exceptions (
  relation_name text PRIMARY KEY
);

CREATE FUNCTION medora.guard_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  phase_now text;
BEGIN
  SELECT phase INTO STRICT phase_now FROM medora.writer_transition WHERE singleton FOR SHARE;
  IF phase_now = 'frozen' THEN
    RAISE EXCEPTION 'writer_fenced' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END;
$$;
-- An irreversible mutation must invalidate a water-only reverse projection,
-- even if subsequent operations happen to restore the original row count.
CREATE FUNCTION medora.note_unmapped_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton) = 'rehearsal' THEN
    INSERT INTO medora.rollback_exceptions VALUES (TG_TABLE_NAME) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['accounts','changes','records','sessions','login_attempts',
    'challenges','mail_outbox','backups','families','family_members','family_invites','water_grants','access_audit'] LOOP
    EXECUTE format('CREATE TRIGGER guard_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write()', rel);
    IF rel NOT IN ('accounts','changes','records','sessions','login_attempts') THEN
      EXECUTE format('CREATE TRIGGER note_unmapped AFTER INSERT OR UPDATE OR DELETE ON medora.%I
        FOR EACH ROW EXECUTE FUNCTION medora.note_unmapped_write()', rel);
    END IF;
    EXECUTE format('CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.%I
      FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write()', rel);
  END LOOP;
END;
$$;
CREATE TRIGGER account_identity_write AFTER INSERT OR DELETE OR UPDATE OF
  id,email,username,password_salt,password_proof,password_key,created_at,sync_generation ON medora.accounts
  FOR EACH ROW EXECUTE FUNCTION medora.note_unmapped_write();
