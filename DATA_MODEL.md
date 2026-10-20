# DEAL Data Model

## Core entities

### Human

A person represented by DEAL.

```sql
CREATE TABLE humans (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

The current runtime stores the active human model on `humans` as structured JSON:
identity facets, self-concept, biography, persona mechanics, relationship
contexts, relational/emotional cues, boundaries, domain, decision heuristics,
behavioral contract, current priorities, and known constraints. Each structured
fact can carry confidence, confirmation, source, validity, and sensitivity. A
context packet also contains derived `responseGuidance` so an agent knows how to
speak truthfully and consistently for the relevant audience.

### Organization

A business, household, clinic, school, or team.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Membership

Links humans to organizations with roles.

```sql
CREATE TABLE memberships (
  id UUID PRIMARY KEY,
  human_id UUID REFERENCES humans(id),
  organization_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Agent

A registered agent runtime or integration.

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  runtime TEXT NOT NULL,
  owner_human_id UUID REFERENCES humans(id),
  public_key TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Delegation

Explicit authority from a human to an agent.

```sql
CREATE TABLE delegations (
  id UUID PRIMARY KEY,
  human_id UUID REFERENCES humans(id),
  agent_id UUID REFERENCES agents(id),
  purpose TEXT NOT NULL,
  scopes JSONB NOT NULL,
  spend_limit_usd NUMERIC,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Persona

Versioned human context.

```sql
CREATE TABLE personas (
  id UUID PRIMARY KEY,
  human_id UUID REFERENCES humans(id),
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### MemoryRecord

A structured, attributable memory.

```sql
CREATE TABLE memory_records (
  id UUID PRIMARY KEY,
  human_id UUID REFERENCES humans(id),
  organization_id UUID REFERENCES organizations(id),
  kind TEXT NOT NULL,
  content JSONB NOT NULL,
  confidence NUMERIC,
  source TEXT,
  confirmation TEXT,
  priority INTEGER DEFAULT 50,
  sensitivity TEXT DEFAULT 'normal',
  external_ref TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  superseded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Packets are schema-versioned, signed, short-lived, and include grounding
precedence, uncertainty markers, memory provenance, and bounded interaction
continuity.

### Conversation and feedback

Conversations retain a bounded summary and recent turns. Context feedback records
whether a packet was helpful and can create a user-confirmed correction that
supersedes stale assumptions.

Memory kinds:

- `identity`
- `preference`
- `boundary`
- `correction`
- `episode`
- `outcome`
- `domain_knowledge`
- `relationship`

### PolicyRule

Explicit judgment and safety rules.

```sql
CREATE TABLE policy_rules (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  expert_profile_id TEXT,
  condition JSONB NOT NULL,
  action TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Policy actions:

- `allow`
- `allow_with_redaction`
- `require_approval`
- `escalate`
- `deny`

### ContextPacket

Issued context for an agent task.

```sql
CREATE TABLE context_packets (
  id UUID PRIMARY KEY,
  delegation_id UUID REFERENCES delegations(id),
  agent_id UUID REFERENCES agents(id),
  human_id UUID REFERENCES humans(id),
  task TEXT,
  packet JSONB NOT NULL,
  signature TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### AuditEvent

Immutable event log.

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  human_id UUID,
  organization_id UUID,
  agent_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT now()
);
```

Event types:

- `context.requested`
- `context.issued`
- `policy.evaluated`
- `approval.requested`
- `approval.granted`
- `approval.denied`
- `action.executed`
- `memory.created`
- `memory.corrected`
- `memory.forgotten`
- `delegation.revoked`
