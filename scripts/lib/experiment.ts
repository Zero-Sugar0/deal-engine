import { generateText } from 'ai';
import {
  createDealAgentRuntime,
  deal,
  type PreparedDealContext,
} from '@deal/sdk';

export type GenerationRecord = {
  text: string;
  finishReason: string;
  usage: unknown;
  contentTypes: string[];
};

export type HumanizedRecord = GenerationRecord & {
  context: {
    packetId: string;
    expiresAt: string;
    policyVersion: string;
    professionalProfile?: string;
    selectedContextCount: number;
    memoryItemCount: number;
    identityFieldCount: number;
  };
};

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TimedGenerationRecord = GenerationRecord & {
  generationMs: number;
  contextPreparationMs?: number;
  context?: HumanizedRecord['context'];
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env or export it in the shell.`,
    );
  }
  return value;
}

export function taskFromArgs(): string {
  const task =
    process.argv
      .slice(2)
      .filter((argument) => argument !== '--json')
      .join(' ')
      .trim() || process.env.COMPARE_TASK;
  if (!task) {
    throw new Error(
      'Provide a task argument, for example: pnpm compare:ai -- "Help me decide what to prioritize."',
    );
  }
  return task;
}

export function modelId(): string {
  return required('AI_GATEWAY_MODEL');
}

function generationOptions() {
  const settings: {
    model: string;
    maxOutputTokens?: number;
    temperature?: number;
  } = {
    model: modelId(),
  };

  if (process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS) {
    settings.maxOutputTokens = Number(process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS);
  }
  if (process.env.AI_GATEWAY_TEMPERATURE) {
    settings.temperature = Number(process.env.AI_GATEWAY_TEMPERATURE);
  }
  return settings;
}

function generationSettings(system: string | undefined, task: string) {
  return {
    ...generationOptions(),
    prompt: task,
    ...(system ? { instructions: system } : {}),
  };
}

function record(
  result: Awaited<ReturnType<typeof generateText>>,
): GenerationRecord {
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    contentTypes: result.content.map((part) => part.type),
  };
}

export async function runRaw(task: string): Promise<GenerationRecord> {
  const result = await generateText(generationSettings(undefined, task));
  return record(result);
}

export async function prepareHumanContext(
  task: string,
  recentTurns?: Array<{ role: 'human' | 'agent'; content: string }>,
  runtime = createHumanContextRuntime(),
): Promise<PreparedDealContext> {
  return runtime.prepare({
    task,
    recentTurns,
    channel: process.env.COMPARE_CHANNEL || 'chat',
    audience: process.env.COMPARE_AUDIENCE || 'the human using this agent',
  });
}

export function createHumanContextRuntime() {
  return createDealAgentRuntime(new deal(required('DEAL_API_KEY')));
}

export async function runHumanized(task: string): Promise<HumanizedRecord> {
  const prepared = await prepareHumanContext(task);
  const result = await generateText(
    generationSettings(prepared.systemInstruction, task),
  );

  return {
    ...record(result),
    context: {
      packetId: prepared.packetId,
      expiresAt: prepared.packet.expiresAt,
      policyVersion: prepared.packet.policyVersion,
      professionalProfile: prepared.packet.professional.profileId,
      selectedContextCount: prepared.packet.composition.selected.length,
      memoryItemCount:
        prepared.packet.memory.preferences.length +
        prepared.packet.memory.corrections.length +
        prepared.packet.memory.episodes.length +
        prepared.packet.memory.references.length +
        prepared.packet.memory.items.length,
      identityFieldCount:
        prepared.packet.composition.applied.identityFields.length,
    },
  };
}

export async function runRawConversationTurn(
  history: ConversationMessage[],
  currentMessage: string,
): Promise<TimedGenerationRecord> {
  const startedAt = performance.now();
  const result = await generateText({
    ...generationOptions(),
    messages: [...history, { role: 'user', content: currentMessage }],
  });
  return {
    ...record(result),
    generationMs: Math.round(performance.now() - startedAt),
  };
}

export async function runHumanizedConversationTurn(
  history: ConversationMessage[],
  currentMessage: string,
  runtime = createHumanContextRuntime(),
): Promise<TimedGenerationRecord> {
  const recentTurns = history.slice(-8).map((message) => ({
    role: message.role === 'user' ? ('human' as const) : ('agent' as const),
    content: message.content.slice(0, 2_000),
  }));
  const contextStartedAt = performance.now();
  const prepared = await prepareHumanContext(
    currentMessage,
    recentTurns,
    runtime,
  );
  const contextPreparationMs = Math.round(performance.now() - contextStartedAt);
  const startedAt = performance.now();
  const result = await generateText({
    ...generationOptions(),
    messages: [...history, { role: 'user', content: currentMessage }],
    ...(prepared.systemInstruction
      ? { instructions: prepared.systemInstruction }
      : {}),
  });

  return {
    ...record(result),
    generationMs: Math.round(performance.now() - startedAt),
    contextPreparationMs,
    context: {
      packetId: prepared.packetId,
      expiresAt: prepared.packet.expiresAt,
      policyVersion: prepared.packet.policyVersion,
      professionalProfile: prepared.packet.professional.profileId,
      selectedContextCount: prepared.packet.composition.selected.length,
      memoryItemCount:
        prepared.packet.memory.preferences.length +
        prepared.packet.memory.corrections.length +
        prepared.packet.memory.episodes.length +
        prepared.packet.memory.references.length +
        prepared.packet.memory.items.length,
      identityFieldCount:
        prepared.packet.composition.applied.identityFields.length,
    },
  };
}

export function printSection(title: string, value: unknown): void {
  console.log(`\n=== ${title} ===`);
  console.log(
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  );
}
