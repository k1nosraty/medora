CREATE TABLE medora.imports (
  snapshot text PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE medora.legacy_people (
  snapshot text NOT NULL REFERENCES medora.imports,
  owner text NOT NULL,
  epoch text,
  zone text,
  source_revision bigint NOT NULL CHECK(source_revision>=0),
  PRIMARY KEY(snapshot,owner)
);
CREATE TABLE medora.legacy_care (
  snapshot text NOT NULL,
  owner text NOT NULL,
  kind text NOT NULL,
  id text NOT NULL,
  value jsonb NOT NULL,
  PRIMARY KEY(snapshot,owner,kind,id),
  FOREIGN KEY(snapshot,owner) REFERENCES medora.legacy_people
);
CREATE TABLE medora.legacy_sessions (
  snapshot text NOT NULL,
  owner text NOT NULL,
  digest text NOT NULL,
  expires_at bigint NOT NULL,
  PRIMARY KEY(snapshot,owner,digest),
  FOREIGN KEY(snapshot,owner) REFERENCES medora.legacy_people
);
CREATE TABLE medora.households (
  snapshot text NOT NULL REFERENCES medora.imports,
  id text NOT NULL,
  owner text NOT NULL,
  label text NOT NULL,
  icon text,
  PRIMARY KEY(snapshot,id)
);
CREATE TABLE medora.memberships (
  snapshot text NOT NULL,
  id text NOT NULL,
  group_id text NOT NULL,
  person text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY(snapshot,id),
  UNIQUE(snapshot,group_id,person),
  FOREIGN KEY(snapshot,group_id) REFERENCES medora.households
);
CREATE TABLE medora.grants (
  snapshot text NOT NULL,
  group_id text NOT NULL,
  owner text NOT NULL,
  recipient text NOT NULL,
  policy jsonb NOT NULL,
  expires_at bigint,
  PRIMARY KEY(snapshot,group_id,owner,recipient),
  FOREIGN KEY(snapshot,group_id,owner) REFERENCES medora.memberships(snapshot,group_id,person),
  FOREIGN KEY(snapshot,group_id,recipient) REFERENCES medora.memberships(snapshot,group_id,person)
);
CREATE TABLE medora.import_devices (
  snapshot text NOT NULL REFERENCES medora.imports,
  device text NOT NULL,
  state jsonb NOT NULL,
  PRIMARY KEY(snapshot,device)
);
CREATE TABLE medora.account_devices (
  snapshot text NOT NULL,
  owner text NOT NULL,
  device text NOT NULL,
  PRIMARY KEY(snapshot,owner,device),
  FOREIGN KEY(snapshot,owner) REFERENCES medora.legacy_people
);
