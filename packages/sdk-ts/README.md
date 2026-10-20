# DEAL TypeScript SDK

```ts
import { DEAL } from "@deal/sdk-ts";

const deal = new DEAL({
  agentId: "agent_cursor_001",
  apiKey: process.env.DEAL_API_KEY!
});

const context = await deal.getContext({
  task: "Prepare release notes for v2.4",
  capabilities: ["read_code_context", "draft_docs", "create_pr"]
});

const decision = await deal.checkPermission({
  contextPacketId: context.packetId,
  action: "create_pr",
  riskSignals: { irreversible: false }
});

if (decision.decision === "allow") {
  // proceed
}
```
