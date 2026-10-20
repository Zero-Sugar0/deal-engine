import type { ContextRequest } from './index.js';
import {
  extractLatestUserText,
  type DealAgentRuntime,
  type PreparedDealContext,
} from './agent.js';

export type DealRequestBuilder<TInput> = (
  input: TInput,
) => ContextRequest | Promise<ContextRequest>;

export type DealIntegrationOptions<TInput> = {
  runtime: DealAgentRuntime;
  /** Optional custom mapping for applications with their own run context. */
  request?: DealRequestBuilder<TInput>;
  /** Defaults used when the adapter can infer the task from the chat input. */
  context?: Partial<ContextRequest>;
  baseInstructions?: string | ((prepared: PreparedDealContext) => string);
};

function combineInstructions(...parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim())
    .join('\n\n');
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text: unknown }).text);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function taskFromInput(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (Array.isArray(input)) return extractLatestUserText(input);
  if (!input || typeof input !== 'object') return '';

  const value = input as Record<string, unknown>;
  if (typeof value.task === 'string' && value.task.trim())
    return value.task.trim();
  if (Array.isArray(value.messages))
    return extractLatestUserText(value.messages);
  if (Array.isArray(value.prompt)) return extractLatestUserText(value.prompt);
  if (typeof value.prompt === 'string') return value.prompt.trim();
  if (typeof value.input === 'string') return value.input.trim();
  if (Array.isArray(value.input)) return extractLatestUserText(value.input);
  if (value.context && typeof value.context === 'object')
    return taskFromInput(value.context);
  return '';
}

async function prepareDealContext<TInput>(
  input: TInput,
  options: DealIntegrationOptions<TInput>,
): Promise<PreparedDealContext> {
  const request = options.request
    ? await options.request(input)
    : ({
        ...options.context,
        task: options.context?.task?.trim() || taskFromInput(input),
      } as ContextRequest);
  if (!request.task?.trim())
    throw new Error(
      'DEAL integration requires a task, a context.task default, or a user message',
    );
  return options.runtime.prepare(request);
}

function resolveBase<TInput>(
  base: DealIntegrationOptions<TInput>['baseInstructions'],
  prepared: PreparedDealContext,
): string | undefined {
  return typeof base === 'function' ? base(prepared) : base;
}

export type LangChainModelRequest<TContext = unknown> = {
  messages: readonly unknown[];
  systemPrompt?: string;
  systemMessage?: unknown;
  runtime?: { context?: TContext };
  state?: Record<string, unknown>;
  [key: string]: unknown;
};

export type LangChainModelHandler = (request: LangChainModelRequest) => any;

/**
 * LangChain v1 middleware. It changes only the transient model request, so
 * DEAL context is not persisted into LangGraph conversation state.
 */
export function createDealLangChainMiddleware<TContext = unknown>(
  options: DealIntegrationOptions<LangChainModelRequest<TContext>>,
) {
  return {
    name: 'DEALHumanContext',
    wrapModelCall: async (
      request: LangChainModelRequest<TContext>,
      handler: LangChainModelHandler,
    ) => {
      const prepared = await prepareDealContext(request, options);
      const base = resolveBase(options.baseInstructions, prepared);
      const existingSystemMessage =
        request.systemMessage && typeof request.systemMessage === 'object'
          ? textFromContent(
              (request.systemMessage as { content?: unknown }).content,
            )
          : typeof request.systemMessage === 'string'
            ? request.systemMessage
            : undefined;
      return handler({
        ...request,
        systemPrompt: combineInstructions(
          request.systemPrompt,
          existingSystemMessage,
          base,
          prepared.systemInstruction,
        ),
      });
    },
  };
}

export type OpenAIRunContext<TContext = unknown> = {
  context: TContext;
  [key: string]: unknown;
};

export type OpenAIDynamicInstructionOptions<TContext = unknown> = {
  runtime: DealAgentRuntime;
  request: DealRequestBuilder<OpenAIRunContext<TContext>>;
  baseInstructions?: string | ((prepared: PreparedDealContext) => string);
};

/**
 * Use as the OpenAI Agents SDK `Agent.instructions` callback. The SDK keeps
 * local RunContext out of the prompt; DEAL adds only the scoped, signed packet
 * projection that the model is meant to see.
 */
export function createDealOpenAIInstructions<TContext = unknown>(
  options: OpenAIDynamicInstructionOptions<TContext>,
): (runContext: OpenAIRunContext<TContext>, agent: unknown) => Promise<string> {
  return async (runContext) => {
    const prepared = await prepareDealContext(runContext, options);
    return combineInstructions(
      resolveBase(options.baseInstructions, prepared),
      prepared.systemInstruction,
    );
  };
}

export type OpenAIChatMessage = {
  role: string;
  content?: unknown;
  [key: string]: unknown;
};

export type OpenAIChatRequest = {
  messages: readonly OpenAIChatMessage[];
  [key: string]: unknown;
};

async function prepareOpenAIChatRequest<TRequest extends OpenAIChatRequest>(
  request: TRequest,
  options: DealIntegrationOptions<TRequest>,
): Promise<OpenAIChatRequest> {
  const prepared = await prepareDealContext(request, options);
  const base = resolveBase(options.baseInstructions, prepared);
  const system = combineInstructions(base, prepared.systemInstruction);
  const existing = request.messages.find(
    (message) => message.role === 'system',
  );
  const messages = existing
    ? request.messages.map((message) =>
        message === existing
          ? {
              ...message,
              content: `${textFromContent(message.content)}\n\n${system}`,
            }
          : message,
      )
    : [{ role: 'system', content: system }, ...request.messages];
  return { ...request, messages };
}

/** Wrap an OpenAI Chat Completions request with DEAL context. */
export function withDealOpenAIChatRequest<TRequest extends OpenAIChatRequest>(
  request: TRequest,
  options: DealIntegrationOptions<TRequest>,
): Promise<TRequest> {
  return prepareOpenAIChatRequest(request, options) as Promise<TRequest>;
}

/** OpenRouter's OpenAI-compatible chat surface uses the same adapter. */
export function withDealOpenRouterRequest<TRequest extends OpenAIChatRequest>(
  request: TRequest,
  options: DealIntegrationOptions<TRequest>,
): Promise<TRequest> {
  return prepareOpenAIChatRequest(request, options) as Promise<TRequest>;
}

export type OpenAIResponsesRequest = {
  model: string;
  input?: unknown;
  instructions?: string;
  [key: string]: unknown;
};

/** Wrap an OpenAI Responses API request with DEAL instructions. */
export async function withDealOpenAIResponsesRequest<
  TRequest extends OpenAIResponsesRequest,
>(
  request: TRequest,
  options: DealIntegrationOptions<TRequest>,
): Promise<TRequest> {
  const prepared = await prepareDealContext(request, options);
  const base = resolveBase(options.baseInstructions, prepared);
  return {
    ...request,
    instructions: combineInstructions(
      request.instructions,
      base,
      prepared.systemInstruction,
    ),
  } as TRequest;
}

export type ClaudeSystemBlock = {
  type: 'text';
  text: string;
  [key: string]: unknown;
};

export type ClaudeMessagesRequest = {
  system?: string | readonly ClaudeSystemBlock[];
  messages: readonly unknown[];
  [key: string]: unknown;
};

function claudeSystemText(
  system: ClaudeMessagesRequest['system'],
): string | undefined {
  if (typeof system === 'string') return system;
  if (Array.isArray(system))
    return system.map((block) => block.text).join('\n');
  return undefined;
}

/** Wrap an Anthropic Claude Messages API request with a top-level system prompt. */
export async function withDealClaudeMessagesRequest<
  TRequest extends ClaudeMessagesRequest,
>(
  request: TRequest,
  options: DealIntegrationOptions<TRequest>,
): Promise<TRequest> {
  const prepared = await prepareDealContext(request, options);
  const base = resolveBase(options.baseInstructions, prepared);
  const system = combineInstructions(
    claudeSystemText(request.system),
    base,
    prepared.systemInstruction,
  );
  return { ...request, system } as TRequest;
}

/**
 * Prepare Claude Agent SDK options before calling `query()`. The SDK's
 * `systemPrompt` option is intentionally populated per run, not globally.
 */
export async function createDealClaudeAgentOptions<
  TOptions extends Record<string, unknown>,
>(
  baseOptions: TOptions,
  options: DealIntegrationOptions<TOptions>,
): Promise<TOptions & { systemPrompt: string }> {
  const prepared = await prepareDealContext(baseOptions, options);
  const base = resolveBase(options.baseInstructions, prepared);
  const existingSystemPrompt = (baseOptions as Record<string, unknown>)
    .systemPrompt;
  const existing =
    typeof existingSystemPrompt === 'string' ? existingSystemPrompt : undefined;
  return {
    ...baseOptions,
    systemPrompt: combineInstructions(
      existing,
      base,
      prepared.systemInstruction,
    ),
  };
}

export type AISDKModelMessage = {
  role: string;
  content: unknown;
  [key: string]: unknown;
};

export type AISDKModelParams = {
  prompt: readonly AISDKModelMessage[] | string;
  [key: string]: unknown;
};

export type AISDKMiddleware = {
  specificationVersion: 'v4';
  transformParams: (input: { params: any }) => Promise<any>;
};

function injectAISDKSystemMessage(
  prompt: AISDKModelParams['prompt'],
  instruction: string,
): AISDKModelMessage[] {
  const messages =
    typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : [...prompt];
  const existing = messages.find((message) => message.role === 'system');
  if (existing) {
    return messages.map((message) =>
      message === existing
        ? {
            ...message,
            content: `${textFromContent(message.content)}\n\n${instruction}`,
          }
        : message,
    );
  }
  return [{ role: 'system', content: instruction }, ...messages];
}

/**
 * AI SDK v6 / Language Model Specification v4 middleware. Use it with
 * `wrapLanguageModel` for OpenAI, Anthropic, OpenRouter, or AI Gateway models.
 */
export function createDealAISDKMiddleware(
  options: DealIntegrationOptions<AISDKModelParams>,
): AISDKMiddleware {
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const prepared = await prepareDealContext(params, options);
      const base = resolveBase(options.baseInstructions, prepared);
      return {
        ...params,
        prompt: injectAISDKSystemMessage(
          params.prompt,
          combineInstructions(base, prepared.systemInstruction),
        ),
      };
    },
  };
}

/** Default task resolver for adapters that receive model messages. */
export function taskFromMessages(input: {
  messages?: readonly unknown[];
  prompt?: readonly unknown[] | string;
}): string {
  if (input.messages) return extractLatestUserText(input.messages);
  if (typeof input.prompt === 'string') return input.prompt;
  return extractLatestUserText(input.prompt ?? []);
}
