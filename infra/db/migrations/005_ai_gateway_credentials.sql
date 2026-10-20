CREATE TABLE IF NOT EXISTS ai_gateway_credentials (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  human_id uuid NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('vercel_ai_gateway')),
  encrypted_api_key text NOT NULL,
  key_hint text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_gateway_credentials_one_active_per_human_idx
  ON ai_gateway_credentials (human_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_gateway_credentials_human_idx
  ON ai_gateway_credentials (human_id, updated_at DESC);

ALTER TABLE ai_gateway_credentials ENABLE ROW LEVEL SECURITY;
