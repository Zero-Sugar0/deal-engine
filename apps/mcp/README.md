# DEAL MCP Server

The MCP adapter exposes DEAL’s human-context surfaces over stdio and delegates
all compilation, memory, continuity, and boundary decisions to the DEAL API.

```bash
DEAL_API_KEY=your-agent-api-key \
node apps/mcp/dist/index.js
```

`DEAL_API_URL` is optional for the hosted service; the MCP adapter defaults to
the hosted deal API when it is omitted.

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
