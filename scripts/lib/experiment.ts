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
};

export type HumanizedRecord = GenerationRecord & {
  context: {
    packetId: string;
    expiresAt: string;
    policyVersion: string;
    professionalProfile?: string;
  };
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

function generationSettings(system: string | undefined, task: string) {
  const settings: {
    model: string;
    prompt: string;
    system?: string;
    maxOutputTokens?: number;
    temperature?: number;
  } = {
    model: modelId(),
    prompt: task,
  };

  if (system) settings.system = system;
  if (process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS) {
    settings.maxOutputTokens = Number(process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS);
  }
  if (process.env.AI_GATEWAY_TEMPERATURE) {
    settings.temperature = Number(process.env.AI_GATEWAY_TEMPERATURE);
  }
  return settings;
}

function record(
  result: Awaited<ReturnType<typeof generateText>>,
): GenerationRecord {
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
  };
}

export async function runRaw(task: string): Promise<GenerationRecord> {
  const result = await generateText(generationSettings(undefined, task));
  return record(result);
}

export async function prepareHumanContext(
  task: string,
): Promise<PreparedDealContext> {
  const runtime = createDealAgentRuntime(new deal(required('DEAL_API_KEY')));
  return runtime.prepare({
    task,
    channel: process.env.COMPARE_CHANNEL || 'chat',
    audience: process.env.COMPARE_AUDIENCE || 'the human using this agent',
  });
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
    },
  };
}

export function printSection(title: string, value: unknown): void {
  console.log(`\n=== ${title} ===`);
  console.log(
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  );
}
