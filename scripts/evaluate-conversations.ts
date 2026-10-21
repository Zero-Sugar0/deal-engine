import {
  conversationBenchmarkCases,
  measureReply,
} from './lib/conversation-benchmark.js';
import {
  createHumanContextRuntime,
  modelId,
  runHumanizedConversationTurn,
  runRawConversationTurn,
  type ConversationMessage,
} from './lib/experiment.js';

type EvaluatedReply = {
  text: string;
  finishReason: string;
  contentTypes: string[];
  signals: ReturnType<typeof measureReply>;
  generationMs: number;
  contextPreparationMs?: number;
  usage: unknown;
  context?: {
    selectedContextCount: number;
    memoryItemCount: number;
    identityFieldCount: number;
    professionalProfile?: string;
  };
};

const asEvaluatedReply = (
  result: Awaited<ReturnType<typeof runRawConversationTurn>>,
  allowProductMenu: boolean,
): EvaluatedReply => ({
  text: result.text,
  finishReason: result.finishReason,
  contentTypes: result.contentTypes,
  signals: measureReply(result.text, { allowProductMenu }),
  generationMs: result.generationMs,
  ...(result.contextPreparationMs === undefined
    ? {}
    : { contextPreparationMs: result.contextPreparationMs }),
  usage: result.usage,
  ...(result.context
    ? {
        context: {
          selectedContextCount: result.context.selectedContextCount,
          memoryItemCount: result.context.memoryItemCount,
          identityFieldCount: result.context.identityFieldCount,
          ...(result.context.professionalProfile
            ? { professionalProfile: result.context.professionalProfile }
            : {}),
        },
      }
    : {}),
});

const totals = {
  raw: {
    replies: 0,
    emptyReplies: 0,
    identityDisclosures: 0,
    featureMenuPreambles: 0,
    bulletHeavyReplies: 0,
    words: 0,
    generationMs: 0,
  },
  deal: {
    replies: 0,
    emptyReplies: 0,
    identityDisclosures: 0,
    featureMenuPreambles: 0,
    bulletHeavyReplies: 0,
    words: 0,
    generationMs: 0,
  },
};
const rawOnly = process.argv.includes('--raw-only');
const dealRuntime = rawOnly ? undefined : createHumanContextRuntime();
let dealUnavailable: string | undefined;
const requestedScenario = process.argv
  .find((argument) => argument.startsWith('--scenario='))
  ?.slice('--scenario='.length);
const activeCases = requestedScenario
  ? conversationBenchmarkCases.filter(
      (scenario) => scenario.id === requestedScenario,
    )
  : conversationBenchmarkCases;
if (requestedScenario && activeCases.length === 0) {
  throw new Error(
    `Unknown conversation benchmark scenario: ${requestedScenario}`,
  );
}
const scenarios = [];

for (const scenario of activeCases) {
  const rawHistory: ConversationMessage[] = [];
  const dealHistory: ConversationMessage[] = [];
  const turns = [];

  for (const turn of scenario.turns) {
    const rawPromise = runRawConversationTurn(rawHistory, turn.user);
    const dealPromise =
      dealRuntime && !dealUnavailable
        ? runHumanizedConversationTurn(dealHistory, turn.user, dealRuntime)
        : Promise.resolve(undefined);
    const [rawOutcome, dealOutcome] = await Promise.allSettled([
      rawPromise,
      dealPromise,
    ]);
    if (rawOutcome.status === 'rejected') throw rawOutcome.reason;
    const rawResult = rawOutcome.value;
    if (dealOutcome.status === 'rejected') {
      dealUnavailable =
        dealOutcome.reason instanceof Error &&
        /^(Internal server error|deal request failed with \d{3}|fetch failed)$/.test(
          dealOutcome.reason.message,
        )
          ? dealOutcome.reason.message
          : 'Context request failed; details omitted.';
    }
    const dealResult =
      dealOutcome.status === 'fulfilled' ? dealOutcome.value : undefined;
    const raw = asEvaluatedReply(rawResult, turn.allowProductMenu ?? false);
    const deal = dealResult
      ? asEvaluatedReply(dealResult, turn.allowProductMenu ?? false)
      : undefined;

    const replies: Array<['raw' | 'deal', EvaluatedReply]> = [['raw', raw]];
    if (deal) replies.push(['deal', deal]);
    for (const [name, reply] of replies) {
      totals[name].replies += 1;
      totals[name].emptyReplies += Number(reply.signals.empty);
      totals[name].identityDisclosures += Number(
        reply.signals.unpromptedIdentityDisclosure,
      );
      totals[name].featureMenuPreambles += Number(
        reply.signals.featureMenuPreambleOnNonMenuTurn,
      );
      totals[name].bulletHeavyReplies += Number(reply.signals.bulletCount >= 3);
      totals[name].words += reply.signals.wordCount;
      totals[name].generationMs += reply.generationMs;
    }

    turns.push({ user: turn.user, raw, ...(deal ? { deal } : {}) });
    rawHistory.push(
      { role: 'user', content: turn.user },
      { role: 'assistant', content: rawResult.text },
    );
    if (dealResult) {
      dealHistory.push(
        { role: 'user', content: turn.user },
        { role: 'assistant', content: dealResult.text },
      );
    }
  }

  scenarios.push({ id: scenario.id, purpose: scenario.purpose, turns });
}

const summary = Object.fromEntries(
  Object.entries(totals.deal.replies > 0 ? totals : { raw: totals.raw }).map(
    ([name, values]) => [
      name,
      {
        ...values,
        averageWordsPerReply: Number(
          (values.words / values.replies).toFixed(1),
        ),
        averageGenerationMs: Math.round(values.generationMs / values.replies),
      },
    ],
  ),
);
const report = {
  model: modelId(),
  mode: rawOnly
    ? 'raw-only-baseline'
    : dealUnavailable
      ? totals.deal.replies > 0
        ? 'partial-paired'
        : 'raw-only-after-context-error'
      : 'paired',
  dealContextStatus: rawOnly
    ? 'not-requested'
    : dealUnavailable
      ? 'unavailable'
      : 'available',
  ...(dealUnavailable ? { dealContextError: dealUnavailable } : {}),
  comparison:
    rawOnly || (dealUnavailable && totals.deal.replies === 0)
      ? 'raw branch only; DEAL context was not measured'
      : 'same user turns; independent raw and DEAL conversation histories',
  scenarioCount: activeCases.length,
  turnCount: activeCases.reduce(
    (sum, scenario) => sum + scenario.turns.length,
    0,
  ),
  summary,
  scenarios,
  interpretation:
    'Identity/menu checks are narrow text heuristics. Word count and latency are descriptive only; review the paired replies for conversational fit, continuity, usefulness, and profile accuracy.',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Conversation benchmark · ${report.model}`);
  console.log(
    `${report.scenarioCount} dialogues · ${report.turnCount} user turns`,
  );
  console.log('\nSignal summary:');
  console.log(JSON.stringify(report.summary, null, 2));
  for (const scenario of scenarios) {
    console.log(`\n## ${scenario.id} — ${scenario.purpose}`);
    for (const [index, turn] of scenario.turns.entries()) {
      console.log(`\nTurn ${index + 1} · User: ${turn.user}`);
      console.log(
        `\nNO CONTEXT (${turn.raw.generationMs}ms; ${turn.raw.finishReason}; ${JSON.stringify(turn.raw.usage)}):\n${turn.raw.text}`,
      );
      if (turn.deal) {
        console.log(
          `\nDEAL (${turn.deal.generationMs}ms; context lookup ${turn.deal.contextPreparationMs}ms; ${turn.deal.finishReason}; ${JSON.stringify(turn.deal.usage)}):\n${turn.deal.text}`,
        );
        console.log(
          `signals raw=${JSON.stringify(turn.raw.signals)} deal=${JSON.stringify(turn.deal.signals)} context=${JSON.stringify(turn.deal.context ?? {})}`,
        );
      } else {
        console.log(`signals raw=${JSON.stringify(turn.raw.signals)}`);
      }
    }
  }
  if (dealUnavailable) {
    console.log(
      `\nDEAL context unavailable (${dealUnavailable}); the raw conversation baseline continued.`,
    );
  }
  console.log(`\n${report.interpretation}`);
}
