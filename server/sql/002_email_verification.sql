ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Аккаунты, созданные в закрытом пилоте по приглашениям, считаем доверенными.
UPDATE parents
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_parent_idx
  ON email_verification_tokens(parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_verification_expires_idx
  ON email_verification_tokens(expires_at);
