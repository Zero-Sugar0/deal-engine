# DEAL API

## Authentication

Agents authenticate using an agent client credential or delegated token. Humans authenticate through the dashboard using email, OAuth, or passkeys.

## Create context request

```http
POST /v1/context
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "task": "Improve our outbound campaign",
  "requested_capabilities": [
    "read_business_profile",
    "read_campaign_history",
    "draft_outreach",
    "send_email"
  ],
  "task_metadata": {
    "channel": "email",
    "audience": "HR leaders"
  }
}
```

### Response

```json
{
  "packet_id": "ctx_123",
  "packet": {
    "persona": {},
    "domain": {},
    "memory": {},
    "authority": {},
    "judgment": {}
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
  "action": "send_email",
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
  "action": "send_email",
  "summary": "Send 38 personalized emails to qualified leads",
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
    "type": "campaign_result",
    "emails_sent": 38,
    "replies": 7,
    "meetings_booked": 2
  }
}
```

## MCP tools

Expose DEAL as MCP tools:

- `deal_get_context`
- `deal_check_permission`
- `deal_request_approval`
- `deal_remember`
- `deal_correct_memory`
- `deal_report_outcome`
