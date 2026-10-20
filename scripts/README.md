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

DEAL provides context and governance; it does not execute tools or skills.
