# DEAL API

## Authentication

Agents and humans authenticate with bearer credentials. The local demo seeds
`local-agent-key` and `local-human-key`; production deployments should issue
short-lived credentials, rotate them, and keep the raw token only at the client.

Human credentials can rotate an agent credential with
`POST /v1/agents/{agent_id}/credentials/rotate` or revoke a known credential with
`POST /v1/credentials/{credential_id}/revoke`. Revoked, expired, or suspended agent
credentials are rejected before any domain operation runs.

### External human authentication

When `DEAL_AUTH_ISSUER`, `DEAL_AUTH_AUDIENCE`, and `DEAL_AUTH_JWKS_URL` are
configured, DEAL verifies external JWTs against the issuer's JWKS. A human must
explicitly link the provider subject first:

```http
POST /v1/auth/external/link
Authorization: Bearer <local-human-token>
Content-Type: application/json

{ "token": "<provider-jwt>" }
```

The linked provider JWT can then authenticate human-scoped endpoints. DEAL does
not auto-link identities by email.

`GET /healthz` is a liveness check. `GET /readyz` checks the canonical store.
`GET /metrics` exposes Prometheus metrics and can be protected with
`DEAL_METRICS_TOKEN`.

## Create context request

```http
POST /v1/context
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "task": "Improve our outbound campaign",
  "conversationId": "conversation_123",
  "channel": "chat",
  "audience": "the founder",
  "activeTopic": "positioning",
  "userIntent": "pressure-test the new message",
  "context": {
    "include": ["persona:work"],
    "exclude": ["relationship:family"],
    "usePersonalContext": true
  },
  "tools": [
    {
      "name": "mail_sender",
      "action": "external_commitment",
      "effect": "external"
    }
  ],
  "skills": [
    {
      "name": "customer-replies",
      "description": "Draft customer replies using the support playbook.",
      "version": "2.0.0",
      "contentHash": "<sha256-of-SKILL.md>",
      "source": "project"
    }
  ]
}
```

The packet's `composition` explains which task, professional, persona, and
relationship contexts were selected or excluded. `contextFacts` carries
source, confirmation, confidence, visibility, validity, and scope for each
fact; `contextPolicy` carries the selected entries' retention, sensitivity,
restricted-action, and approval controls. Reading confirmed context is
automatic after delegation checks. External or irreversible actions still
require policy evaluation and, where returned, a human-approved execution
token.

### Context transparency and controls

Humans can inspect and correct the active model without exposing it to an
agent:

```http
GET /v1/profile/context
GET /v1/context/{packet_id}/inspect
GET /v1/context/revision
GET /v1/context-entries
GET /v1/context-entries/{entry_id}
```

Use the existing memory correction and forget endpoints to change or remove a
fact. The revision endpoint invalidates SDK packet caches automatically after
those changes.

### Response

```json
{
  "packetId": "ctx_123",
  "packet": {
    "schemaVersion": "6",
    "skills": {
      "active": [
        {
          "name": "customer-replies",
          "description": "Draft customer replies using the support playbook.",
          "version": "2.0.0",
          "contentHash": "<sha256-of-SKILL.md>",
          "source": "project"
        }
      ],
      "precedence": [
        "deal_authority",
        "deal_boundaries",
        "deal_human_context",
        "skill_instructions",
        "skill_resources"
      ],
      "attestations": []
    },
    "humanModel": {},
    "cognition": {
      "routeId": "task_healthcare_health_education_assistant_v1",
      "profileId": "health_education_assistant_v1",
      "profileVersion": "1.0.0",
      "title": "Health Education Guide",
      "category": "healthcare",
      "confidence": 0.91,
      "risk": "high",
      "signals": ["task:diabetic"],
      "retrievedPatterns": ["evidence_first", "plain_language_first"],
      "responsePlan": {
        "leadWith": "answer",
        "askAtMost": 1,
        "avoid": ["false reassurance"],
        "escalateWhen": ["urgent symptoms"]
      }
    },
    "behavior": {},
    "responseGuidance": {
      "style": ["Lead with the point and avoid unnecessary hedging"],
      "prioritize": ["State uncertainty instead of manufacturing confidence"],
      "avoid": ["Never claim unsupported certainty"],
      "whenUncertain": "ask",
      "whenDisagreeing": "challenge_respectfully",
      "whenWrong": "admit_and_correct",
      "identityDisclosure": "Be truthful that you are an AI agent acting with delegated context."
    },
    "interaction": {},
    "grounding": {}
  },
  "signature": "..."
}
```

`cognition` is selected for the current task. It is separate from
`professional`, which represents the person's declared identity. A founder can
therefore ask a health question without being represented as a clinician. DEAL
routes the task, retrieves the reviewed operating patterns and safety limits,
and signs the complete packet for the host agent. Route IDs, confidence, and
internal metadata are for the agent's control logic; they should not be
announced to the person in a normal response.

The host agent supplies the task and uses its own tools. `requestedCapabilities`
is retained only as an optional delegated-scope assertion for deployments that
want DEAL to verify an agent’s declared authority; DEAL does not provide or
authenticate those external tools. `skills` is metadata about the host agent's
active Agent Skills. It is included for provenance and composition guidance;
it cannot grant authority, consent, identity, or access to sensitive context.

## Combining Agent Skills with DEAL

Agent Skills own task-specific procedures. DEAL owns the human model and the
control plane around it. The host agent should load the skill according to its
runtime, then send only its validated descriptor with the context request:

```ts
const skill = parseSkillMarkdown(skillMarkdown, { source: 'project' });
const prepared = await runtime.prepare({
  task: 'Reply to this customer',
  skills: [skill.descriptor],
  channel: 'support',
});
```

The host keeps `skill.instructions`, references, assets, and scripts. DEAL does
not execute them. The rendered packet explicitly enforces this order:

```text
DEAL authority and boundaries
  > DEAL human context and corrections
  > skill instructions
  > skill references and scripts
```

This lets a customer-support skill change the workflow while the human's voice,
privacy rules, approval requirements, and corrections remain stable across
Claude, Codex, LangChain, OpenAI, Vercel AI, OpenRouter, and custom runtimes.

## Organization skill registry

Organizations can register and review a skill artifact without giving DEAL any
ability to execute it:

```http
POST /v1/skills
POST /v1/skills/{skill_id}/submit
POST /v1/skills/{skill_id}/review
GET  /v1/skills/{name}/{version}
POST /v1/skills/{skill_id}/revoke
GET  /v1/skills/keys
```

Registration requires the `SKILL.md` content hash and a file manifest. Approval
creates an Ed25519 signature over the descriptor and manifest. An organization
skill sent to `/v1/context` must pin both `version` and `contentHash`; DEAL
resolves it to the organization's approved registry entry and adds a signed
`skills.attestations[]` record. Revoked versions are rejected on new context
requests even though their historical signatures remain available for audit.

## Professional profiles

Onboarding is optional. `POST /v1/onboarding/skip` records the human's choice
without changing saved profile details; subsequent sign-ins open the app directly.
The dashboard exposes “Skip for now” on every onboarding step. Setup can be
completed later or context edited in Human Model. The context compiler always
includes natural conversational defaults, including when personal context is
disabled or empty. Onboarding and profile details refine these defaults in both
API-key context requests and the dashboard's DEAL-active Try it response.

The dashboard onboarding flow has three steps: identity basics (preferred name,
country, optional age and language), everyday life and priorities, then
communication preferences and boundaries. Each intermediate step saves through
`PATCH /v1/profile`; the final step saves through `POST /v1/onboarding` and marks
onboarding complete. Refreshing the page restores an account-scoped session draft.
Agents authenticated with that human's API key receive the saved context through
`POST /v1/context` and SDK context preparation, together with relevant catalog
knowledge. The key authenticates access; it does not itself embed the profile.

Use the professional catalog to select an operating model for a delegation and
to discover its safety boundaries:

```http
GET /v1/professions?search=finance
GET /v1/professions/personal_finance_organizer_v1
```

The selected profile is compiled into the context packet under `professional`.
It includes role patterns, knowledge areas, failure modes, escalation triggers,
regulated-domain markers, and missing required context. It does not claim that
the human is licensed or that the agent can perform regulated work. See
[`PROFESSIONAL_CONTEXT.md`](PROFESSIONAL_CONTEXT.md).

## Update the human model

Human-owned clients can update the layered model without flattening it into a
prompt. Existing flat onboarding fields remain supported, while new clients can
send the richer sections directly:

```http
PATCH /v1/profile
Authorization: Bearer <human-token>
Content-Type: application/json

{
  "selfConcept": {
    "summary": "A careful builder who prefers durable trust.",
    "valuesHierarchy": [
      { "value": "trust", "priority": 100 },
      { "value": "speed", "priority": 40 }
    ],
    "nonNegotiables": [
      { "value": "Do not trade trust for vanity metrics" }
    ]
  },
  "persona": {
    "sentenceRhythm": "conversational",
    "leadWith": "recommendation",
    "askStyle": "one_question_at_a_time",
    "modes": [
      {
        "id": "investor-mode",
        "audience": "investors",
        "tone": "formal",
        "directness": 0.9
      }
    ]
  },
  "boundaries": {
    "mustAsk": ["before making a public commitment"],
    "neverInfer": ["private health or family information"]
  }
}
```

The API increments `modelVersion` and records the changed sections in the
audit log. When a context request includes `audience`, DEAL selects the matching
persona mode and derives explicit guidance for voice, trust, emotion, judgment,
and consent.

Sensitive structured facts are withheld from agent packets by default. A
delegation must explicitly include the `sensitive_context_read` capability in
its `mayRead` scope before those facts can be included. The packet records the
redacted paths and tells the host agent that sensitive context was withheld.

## Conversation continuity

Agents can create a conversation, append human/agent turns, and request context
with the conversation ID. DEAL returns a bounded recent window, summary, active
topic, and open loops. The window is deliberately capped so continuity does not
become an unbounded prompt transcript.

```http
POST /v1/conversations
POST /v1/conversations/{conversation_id}/turns
POST /v1/context/feedback
GET  /v1/context/{packet_id}
```

Human feedback with a correction is stored as user-confirmed, high-priority
memory. Explicit corrections take precedence over inferred or stale memory in
future packets.

## Evaluate an action

```http
POST /v1/policy/evaluate
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "action": "external_commitment",
  "resource": "campaign_123",
  "contextPacketId": "ctx_123",
  "recipientCount": 1240,
  "spendUsd": 0,
  "irreversible": true
}
```

### Response

```json
{
  "decision": "require_approval",
  "reason": "Recipient count exceeds autonomous send limit",
  "matchedRules": [],
  "redactions": [],
  "risk": "high"
}
```

## Request approval

```http
POST /v1/approvals
Authorization: Bearer <agent-token>

{
  "contextPacketId": "ctx_123",
  "action": "external_commitment",
  "summary": "Commit to an external action on the human’s behalf",
  "payload": {}
}
```

The API accepts camelCase JSON fields. An approval request is accepted only when
the current deterministic policy result is `require_approval` or `escalate`; the
result is stored with the approval as a policy snapshot.

After a human decision, the agent consumes the exact approved payload once:

```http
POST /v1/approvals/apr_456/consume
Authorization: Bearer <agent-token>

{ "payload": { "recipients": ["lead@example.com"] } }
```

The returned five-minute `executionToken` can be verified immediately before
the host agent performs the external side effect:

```http
POST /v1/actions/verify
Authorization: Bearer <agent-token>

{
  "executionToken": "eyJ...",
  "action": "external_commitment",
  "payload": { "recipients": ["lead@example.com"] }
}
```

## Record outcome

```http
POST /v1/memory/outcomes
Authorization: Bearer <agent-token>

{
  "contextPacketId": "ctx_123",
  "outcome": {
    "type": "task_result",
    "result": "The response was accepted with one correction"
  }
}
```

## MCP tools

Expose DEAL as MCP tools:

- `deal_get_context`
- `deal_check_permission`
- `deal_request_approval`
- `deal_consume_approval`
- `deal_verify_execution`
- `deal_remember`
- `deal_correct_memory`
- `deal_report_outcome`
- `deal_start_conversation`
- `deal_add_conversation_turn`
- `deal_feedback_context`
