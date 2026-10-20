# DEAL API

## Authentication

Agents authenticate using an agent client credential or delegated token. Human
identity is intentionally provider-neutral; this API only needs a verified human
credential from the deployment’s chosen identity layer.

## Create context request

```http
POST /v1/context
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "task": "Help me pressure-test this positioning",
  "conversationId": "conversation_123",
  "channel": "chat",
  "audience": "the founder",
  "activeTopic": "positioning",
  "userIntent": "surface the strongest tradeoff"
}
```

### Response

```json
{
  "packet_id": "ctx_123",
  "packet": {
    "schemaVersion": "3",
    "humanModel": {},
    "behavior": {},
    "responseGuidance": {},
    "interaction": {},
    "grounding": {}
  },
  "signature": "..."
}
```

## Evaluate an action

```http
POST /v1/policy/evaluate
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "action": "external_commitment",
  "resource": "campaign_123",
  "context_packet_id": "ctx_123",
  "risk_signals": {
    "recipient_count": 1240,
    "spend_usd": 0,
    "irreversible": true
  }
}
```

### Response

```json
{
  "decision": "require_approval",
  "reason": "Recipient count exceeds autonomous send limit",
  "approval_id": "apr_456"
}
```

## Request approval

```http
POST /v1/approvals
Authorization: Bearer <agent-token>

{
  "context_packet_id": "ctx_123",
  "action": "external_commitment",
  "summary": "Commit to an external action on the human’s behalf",
  "payload": {}
}
```

## Record outcome

```http
POST /v1/memory/outcomes
Authorization: Bearer <agent-token>

{
  "context_packet_id": "ctx_123",
  "outcome": {
    "type": "task_result",
    "result": "The response was accepted with one correction"
  }
}
```

## Continuity and feedback

Use `/v1/conversations` and `/v1/conversations/{id}/turns` to preserve bounded
conversation continuity. Request context with `conversationId` to receive the
summary, active topic, open loops, and recent turns.

Use `POST /v1/context/feedback` after a response. Human corrections become
user-confirmed, high-priority memories and outrank inferred memories in future
packets. `GET /v1/context/{packet_id}` returns a packet for inspection and
verifies its stored signature.

## MCP tools

Expose DEAL as MCP tools:

- `deal_get_context`
- `deal_check_permission`
- `deal_request_approval`
- `deal_remember`
- `deal_correct_memory`
- `deal_report_outcome`
