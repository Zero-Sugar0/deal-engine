CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'business',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS humans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role text,
  identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  persona jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_concept jsonb NOT NULL DEFAULT '{}'::jsonb,
  biography jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb,
  relational jsonb NOT NULL DEFAULT '{}'::jsonb,
  boundaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  domain jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  known_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version integer NOT NULL DEFAULT 1,
  judgment jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE humans ADD COLUMN IF NOT EXISTS identity jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS self_concept jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS biography jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS relationships jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS relational jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS boundaries jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS decision jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS behavior jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS current_priorities jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS known_constraints jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE humans ADD COLUMN IF NOT EXISTS model_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_human_id uuid NOT NULL REFERENCES humans(id),
  name text NOT NULL,
  runtime text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  purpose text NOT NULL,
  authority jsonb NOT NULL,
  policy_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_id text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('agent', 'human')),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid REFERENCES agents(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  kind text NOT NULL,
  content jsonb NOT NULL,
  content_text text NOT NULL DEFAULT '',
  embedding jsonb,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source text,
  confirmation text CHECK (confirmation IS NULL OR confirmation IN ('user_confirmed', 'agent_observed', 'inferred')),
  priority integer NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  sensitivity text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'personal', 'sensitive')),
  external_ref text,
  valid_from timestamptz,
  valid_until timestamptz,
  superseded_by uuid REFERENCES memory_records(id),
  forgotten_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS confirmation text;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50;
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'normal';
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS content_text text NOT NULL DEFAULT '';
ALTER TABLE memory_records ADD COLUMN IF NOT EXISTS embedding jsonb;
UPDATE memory_records SET content_text = COALESCE(content->>'text', content::text) WHERE content_text = '';
UPDATE memory_records SET confirmation = 'user_confirmed' WHERE confirmation IS NULL AND source = 'user_confirmed';
UPDATE memory_records SET priority = 100 WHERE kind = 'correction' AND priority = 50 AND confirmation = 'user_confirmed';

CREATE TABLE IF NOT EXISTS context_packets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  delegation_id uuid NOT NULL REFERENCES delegations(id),
  task_hash text NOT NULL,
  packet jsonb NOT NULL,
  signature text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  context_packet_id uuid NOT NULL REFERENCES context_packets(id),
  action text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  decided_by uuid REFERENCES humans(id),
  decided_at timestamptz,
  consumed_at timestamptz,
  policy_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS policy_result jsonb;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid REFERENCES agents(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  profile_id text NOT NULL,
  goal text NOT NULL,
  current_step text NOT NULL,
  context_packet_id uuid REFERENCES context_packets(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  title text,
  channel text,
  audience text,
  summary text,
  active_topic text,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('human', 'agent', 'system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS context_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  context_packet_id uuid NOT NULL REFERENCES context_packets(id),
  rating text NOT NULL CHECK (rating IN ('helpful', 'mixed', 'unhelpful')),
  correction text,
  what_worked text,
  what_to_change text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  human_id uuid NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_records_human_kind_idx ON memory_records (human_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_records_human_priority_idx ON memory_records (human_id, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_records_content_search_idx ON memory_records USING GIN (to_tsvector('simple', content_text));
CREATE INDEX IF NOT EXISTS external_identities_human_idx ON external_identities (human_id);
CREATE INDEX IF NOT EXISTS rate_limit_windows_updated_idx ON rate_limit_windows (updated_at);
CREATE INDEX IF NOT EXISTS context_packets_agent_expiry_idx ON context_packets (agent_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS approvals_human_status_idx ON approvals (human_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_human_time_idx ON audit_events (human_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_human_updated_idx ON workflow_runs (human_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_human_updated_idx ON conversations (human_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversation_turns_conversation_created_idx ON conversation_turns (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS context_feedback_human_created_idx ON context_feedback (human_id, created_at DESC);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION deal_current_organization() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

DROP POLICY IF EXISTS organization_isolation ON organizations;
DROP POLICY IF EXISTS human_isolation ON humans;
DROP POLICY IF EXISTS agent_isolation ON agents;
DROP POLICY IF EXISTS delegation_isolation ON delegations;
DROP POLICY IF EXISTS credential_isolation ON credentials;
DROP POLICY IF EXISTS memory_isolation ON memory_records;
DROP POLICY IF EXISTS context_isolation ON context_packets;
DROP POLICY IF EXISTS approval_isolation ON approvals;
DROP POLICY IF EXISTS audit_isolation ON audit_events;
DROP POLICY IF EXISTS workflow_isolation ON workflow_runs;
DROP POLICY IF EXISTS conversation_isolation ON conversations;
DROP POLICY IF EXISTS conversation_turn_isolation ON conversation_turns;
DROP POLICY IF EXISTS context_feedback_isolation ON context_feedback;
DROP POLICY IF EXISTS external_identity_isolation ON external_identities;

CREATE POLICY organization_isolation ON organizations USING (id = deal_current_organization());
CREATE POLICY human_isolation ON humans USING (organization_id = deal_current_organization());
CREATE POLICY agent_isolation ON agents USING (organization_id = deal_current_organization());
CREATE POLICY delegation_isolation ON delegations USING (organization_id = deal_current_organization());
CREATE POLICY credential_isolation ON credentials USING (organization_id = deal_current_organization());
CREATE POLICY memory_isolation ON memory_records USING (organization_id = deal_current_organization());
CREATE POLICY context_isolation ON context_packets USING (organization_id = deal_current_organization());
CREATE POLICY approval_isolation ON approvals USING (organization_id = deal_current_organization());
CREATE POLICY audit_isolation ON audit_events USING (organization_id = deal_current_organization());
CREATE POLICY workflow_isolation ON workflow_runs USING (organization_id = deal_current_organization());
CREATE POLICY conversation_isolation ON conversations USING (organization_id = deal_current_organization());
CREATE POLICY conversation_turn_isolation ON conversation_turns USING (organization_id = deal_current_organization());
CREATE POLICY context_feedback_isolation ON context_feedback USING (organization_id = deal_current_organization());
CREATE POLICY external_identity_isolation ON external_identities USING (organization_id = deal_current_organization());
