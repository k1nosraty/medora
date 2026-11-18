CREATE TABLE medora.backups (
  owner text NOT NULL REFERENCES medora.accounts(id),
  digest char(64) NOT NULL,
  bytes integer NOT NULL CHECK (bytes BETWEEN 52 AND 16777216),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner,digest)
);
