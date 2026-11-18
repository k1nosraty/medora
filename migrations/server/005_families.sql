CREATE TABLE medora.families (
  id uuid PRIMARY KEY, label text NOT NULL,
  creator text NOT NULL REFERENCES medora.accounts(id)
);
CREATE TABLE medora.family_members (
  family uuid NOT NULL REFERENCES medora.families(id),
  person text NOT NULL REFERENCES medora.accounts(id),
  PRIMARY KEY(family,person)
);
CREATE INDEX family_person ON medora.family_members(person,family);
CREATE TABLE medora.family_invites (
  id uuid PRIMARY KEY, family uuid NOT NULL REFERENCES medora.families(id),
  email text NOT NULL, expires_at timestamptz NOT NULL,
  UNIQUE(family,email)
);
CREATE INDEX family_recipient ON medora.family_invites(email,expires_at);
CREATE TABLE medora.water_grants (
  family uuid NOT NULL, owner text NOT NULL, viewer text NOT NULL,
  PRIMARY KEY(family,owner,viewer),
  FOREIGN KEY(family,owner) REFERENCES medora.family_members(family,person),
  FOREIGN KEY(family,viewer) REFERENCES medora.family_members(family,person),
  CHECK(owner<>viewer)
);
CREATE TABLE medora.access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  family uuid NOT NULL REFERENCES medora.families(id),
  actor text NOT NULL REFERENCES medora.accounts(id),
  action text NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now()
);
