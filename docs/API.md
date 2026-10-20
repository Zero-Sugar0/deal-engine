# DEAL API

## Authentication

Agents and humans authenticate with bearer credentials. The local demo seeds
`local-agent-key` and `local-human-key`; production deployments should issue
short-lived credentials, rotate them, and keep the raw token only at the client.

Human credentials can rotate an agent credential with
`POST /v1/agents/{agent_id}/credentials/rotate` or revoke a known credential with
`POST /v1/credentials/{credential_id}/revoke`. Revoked, expired, or suspended agent
credentials are rejected before any domain operation runs.

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
  "userIntent": "pressure-test the new message"
}
```

### Response

```json
{
  "packetId": "ctx_123",
  "packet": {
    "schemaVersion": "3",
    "humanModel": {},
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

The host agent supplies the task and uses its own tools. `requestedCapabilities`
is retained only as an optional delegated-scope assertion for deployments that
want DEAL to verify an agent’s declared authority; DEAL does not provide or
authenticate those external tools.

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
