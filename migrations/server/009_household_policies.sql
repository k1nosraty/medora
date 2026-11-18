ALTER TABLE medora.families ADD COLUMN icon text NOT NULL DEFAULT 'group';
ALTER TABLE medora.family_members ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE medora.family_members ADD COLUMN label text;
ALTER TABLE medora.water_grants ADD COLUMN sections text[] NOT NULL DEFAULT ARRAY['water'];
ALTER TABLE medora.water_grants ADD COLUMN can_record boolean NOT NULL DEFAULT false;
ALTER TABLE medora.water_grants ADD COLUMN can_add boolean NOT NULL DEFAULT false;
ALTER TABLE medora.water_grants ADD COLUMN expires_ms bigint;
ALTER TABLE medora.family_invites ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE medora.family_invites ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE medora.family_invites ADD COLUMN recipient_label text;
ALTER TABLE medora.family_invites DROP CONSTRAINT family_invites_family_email_key;
CREATE UNIQUE INDEX pending_family_invite ON medora.family_invites(family,email) WHERE status='pending';
CREATE TABLE medora.family_operations (
  owner text NOT NULL REFERENCES medora.accounts(id), key text NOT NULL, expires_ms bigint NOT NULL,
  fingerprint bytea, PRIMARY KEY(owner,key)
);
CREATE TRIGGER guard_family_operations BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON medora.family_operations
  FOR EACH STATEMENT EXECUTE FUNCTION medora.guard_write();
CREATE TRIGGER note_family_operations AFTER INSERT OR UPDATE OR DELETE ON medora.family_operations
  FOR EACH ROW EXECUTE FUNCTION medora.note_unmapped_write();
-- Audit events retain the stable group identifier after a manager deletes a group.
ALTER TABLE medora.access_audit DROP CONSTRAINT access_audit_family_fkey;
ALTER TABLE medora.access_audit ADD COLUMN subject text;
CREATE TABLE medora.household_changes (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation_name text NOT NULL, previous jsonb, following jsonb
);
CREATE FUNCTION medora.record_household_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT phase FROM medora.writer_transition WHERE singleton)='rehearsal' THEN
    INSERT INTO medora.household_changes(relation_name,previous,following)
      VALUES(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW));
  END IF;
  RETURN NULL;
END;
$$;
DO $$
DECLARE rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['families','family_members','family_invites','water_grants','access_audit','family_operations'] LOOP
    IF rel='family_operations' THEN DROP TRIGGER note_family_operations ON medora.family_operations;
    ELSE EXECUTE format('DROP TRIGGER note_unmapped ON medora.%I',rel); END IF;
    EXECUTE format('CREATE TRIGGER record_change AFTER INSERT OR UPDATE OR DELETE ON medora.%I
      FOR EACH ROW EXECUTE FUNCTION medora.record_household_change()',rel);
  END LOOP;
END;
$$;
CREATE TRIGGER note_truncate AFTER TRUNCATE ON medora.family_operations
  FOR EACH STATEMENT EXECUTE FUNCTION medora.note_unmapped_write();
