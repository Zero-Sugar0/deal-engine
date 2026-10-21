# Vercel AI Gateway comparison scripts

These scripts make the first DEAL experiment concrete. They call the same
Vercel AI Gateway model with the same task twice:

- `raw` sends only the task to the AI SDK.
- `humanized` asks DEAL for a signed, scoped context packet and uses the
  packet's rendered human context as the model system instruction.
- `compare` presents both responses in a readable terminal report, along with
  usage and packet metadata.

Interactive runs include compact status spinners, color, rendered Markdown,
context metadata, and a short comparison checklist. Add `--json` when the
output needs to be consumed by CI or another script.

The scripts use the local `@deal/sdk` workspace package. Publishing the SDK to
npm is not required for this experiment.

## Setup

Copy the relevant values into `.env` (never commit that file):

```env
AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
AI_GATEWAY_MODEL=provider/model-from-https://ai-gateway.vercel.sh/v1/models
DEAL_API_KEY=your-deal-agent-key
```

`AI_GATEWAY_MODEL` must be an exact current model ID from the Gateway model
catalog. `AI_GATEWAY_API_KEY` is read by the AI SDK; no provider-specific key
is needed for this test. Leave `DEAL_API_URL` unset for the hosted DEAL API;
the SDK supplies its default endpoint. Only self-hosted deployments need that
override.

Optional controls:

```env
AI_GATEWAY_MAX_OUTPUT_TOKENS=500
AI_GATEWAY_TEMPERATURE=0
COMPARE_CHANNEL=chat
COMPARE_AUDIENCE=the human using this agent
```

## Run

```bash
pnpm ai:raw -- "Help me decide what to prioritize this week."
pnpm ai:humanized -- "Help me decide what to prioritize this week."
pnpm compare:ai -- "Help me decide what to prioritize this week."

# Machine-readable output
pnpm compare:ai --json -- "Help me decide what to prioritize this week."
```

The comparison is a useful first signal, not a scientific benchmark. Even at
temperature zero, hosted model responses can vary. For a reliable evaluation,
run several trials with fixed tasks and score them against explicit persona,
boundary, and decision-style criteria.

## Multi-turn conversational evaluation

Run a small paired conversation suite against the same model:

```bash
pnpm eval:conversations
pnpm eval:conversations -- --json
pnpm eval:conversations -- --raw-only --json
pnpm eval:conversations -- --raw-only --scenario=decision_context_carryover
```

The suite covers a casual greeting, listening when advice is declined,
carrying apartment trade-offs across turns, and a reflective question. Raw and
DEAL runs receive the same user turns, but each follows its own generated
assistant history. The report includes the paired replies, selected-context and
memory counts, generation/context latency, empty outputs, response length, and
narrow checks for irrelevant AI-identity preambles and explicit feature-menu
preambles. Bullet counts are reported separately as a format signal, not
mistaken for a product menu.

Those checks are observable signals, not a score for whether a reply is
"human." Review each pair for conversational fit, continuity, usefulness, and
whether any saved identity or preference was used accurately. Repeat runs
because hosted model output varies. Each run makes model API calls and one DEAL
context lookup for each DEAL turn.

Use `--raw-only` when the model gateway is reachable but the DEAL context API
is not; it records the no-context baseline without claiming a paired
comparison.

DEAL provides context and governance; it does not execute tools or skills.
