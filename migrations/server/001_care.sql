CREATE SCHEMA medora;
CREATE TABLE medora.accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_proof text NOT NULL,
  password_key text NOT NULL,
  created_at bigint,
  sync_generation smallint NOT NULL DEFAULT 1 CHECK (sync_generation IN (1, 2)),
  cursor bigint NOT NULL DEFAULT 0 CHECK (cursor BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE medora.sessions (
  digest text PRIMARY KEY,
  owner text NOT NULL REFERENCES medora.accounts(id),
  expires_at bigint NOT NULL
);
CREATE INDEX session_owner ON medora.sessions(owner);
CREATE TABLE medora.login_attempts (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE TABLE medora.records (
  owner text NOT NULL REFERENCES medora.accounts(id),
  kind text NOT NULL,
  id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  body jsonb,
  PRIMARY KEY (owner, kind, id)
);
-- The immutable feed is also the transactional outbox and replay receipt.
CREATE TABLE medora.changes (
  owner text NOT NULL REFERENCES medora.accounts(id),
  cursor bigint NOT NULL,
  operation uuid NOT NULL,
  kind text NOT NULL,
  record_id text NOT NULL,
  base_revision bigint NOT NULL CHECK (base_revision >= 0),
  body jsonb,
  committed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner, cursor),
  UNIQUE (owner, operation),
  FOREIGN KEY (owner, kind, record_id) REFERENCES medora.records(owner, kind, id)
);
CREATE TABLE medora.source_objects (
  snapshot text NOT NULL,
  namespace text NOT NULL,
  object_id text NOT NULL,
  digest text NOT NULL,
  archive bytea NOT NULL,
  PRIMARY KEY (snapshot, namespace, object_id)
);
