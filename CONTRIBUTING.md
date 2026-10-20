# Contributing

1. Do not add agent-specific logic to `packages/core`.
2. All memory access must go through a `MemoryAdapter`.
3. Every consequential action must pass through the policy engine.
4. Every context issuance and policy decision must create an audit event.
5. Add evaluation scenarios for any new expert profile or judgment rule.
