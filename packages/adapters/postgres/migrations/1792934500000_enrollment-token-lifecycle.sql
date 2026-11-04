-- Up Migration

-- G3 item 33: the owner's token commands name a token by an identifier, may
-- revoke it, and a rotation records the token that replaced it.
ALTER TABLE enrollment_tokens
  ADD COLUMN token_id text,
  ADD COLUMN revoked_at timestamptz;

-- Every stored token, pending or not, gets a minted identifier; no row is
-- deleted (control-plane wire contracts section 6).
UPDATE enrollment_tokens SET token_id = 'e' || replace(gen_random_uuid()::text, '-', '');

ALTER TABLE enrollment_tokens
  ALTER COLUMN token_id SET NOT NULL,
  ADD CONSTRAINT enrollment_tokens_token_id_key UNIQUE (token_id),
  ADD COLUMN replacement_token_id text REFERENCES enrollment_tokens (token_id);

-- Down Migration

ALTER TABLE enrollment_tokens
  DROP COLUMN replacement_token_id,
  DROP COLUMN revoked_at,
  DROP COLUMN token_id;
