# DEAL MCP Server

The MCP adapter exposes DEAL’s human-context surfaces over stdio and delegates
all compilation, memory, continuity, and boundary decisions to the DEAL API.

```bash
DEAL_API_URL=http://localhost:3000 \
DEAL_API_KEY=local-agent-key \
node apps/mcp/dist/index.js
```

Available tools:

- `deal_get_context`
- `deal_start_conversation`
- `deal_add_conversation_turn`
- `deal_feedback_context`
- `deal_check_permission`
- `deal_request_approval`
- `deal_consume_approval`
- `deal_verify_execution`
- `deal_remember`
- `deal_report_outcome`
- `deal_start_workflow`
- `deal_transition_workflow`
