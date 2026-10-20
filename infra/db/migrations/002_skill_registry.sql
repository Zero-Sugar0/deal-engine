CREATE TABLE IF NOT EXISTS skill_registry (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  descriptor jsonb NOT NULL,
  manifest jsonb NOT NULL,
  review_status text NOT NULL CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected', 'revoked')),
  created_by uuid NOT NULL REFERENCES humans(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES humans(id),
  reviewed_at timestamptz,
  review_note text,
  revoked_by uuid REFERENCES humans(id),
  revoked_at timestamptz,
  revocation_reason text,
  signature text,
  signing_key_id text,
  signing_public_key text,
  signed_at timestamptz,
  UNIQUE (organization_id, name, version)
);

ALTER TABLE skill_registry ADD COLUMN IF NOT EXISTS signing_public_key text;

CREATE INDEX IF NOT EXISTS skill_registry_org_name_idx
  ON skill_registry (organization_id, name, version);
CREATE INDEX IF NOT EXISTS skill_registry_org_status_idx
  ON skill_registry (organization_id, review_status, updated_at DESC);

ALTER TABLE skill_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON skill_registry;
CREATE POLICY organization_isolation ON skill_registry
  USING (organization_id = deal_current_organization());
