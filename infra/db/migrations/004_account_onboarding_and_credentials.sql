ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
