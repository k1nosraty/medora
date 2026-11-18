CREATE TABLE medora.challenges (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register','reset')),
  proof text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX challenge_expiry ON medora.challenges(expires_at);
CREATE TABLE medora.mail_outbox (
  challenge uuid PRIMARY KEY REFERENCES medora.challenges(id) ON DELETE CASCADE,
  nonce bytea NOT NULL,
  ciphertext bytea NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  sent_at timestamptz
);
