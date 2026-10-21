import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono.js';
import Anthropic from '@lobehub/icons/es/Anthropic/components/Mono.js';
import Claude from '@lobehub/icons/es/Claude/components/Mono.js';
import Google from '@lobehub/icons/es/Google/components/Mono.js';
import Gemini from '@lobehub/icons/es/Gemini/components/Mono.js';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono.js';
import Meta from '@lobehub/icons/es/Meta/components/Mono.js';
import Mistral from '@lobehub/icons/es/Mistral/components/Mono.js';
import Qwen from '@lobehub/icons/es/Qwen/components/Mono.js';
import Grok from '@lobehub/icons/es/Grok/components/Mono.js';
import Vercel from '@lobehub/icons/es/Vercel/components/Mono.js';
import LangChain from '@lobehub/icons/es/LangChain/components/Mono.js';
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono.js';
import Cursor from '@lobehub/icons/es/Cursor/components/Mono.js';
import Codex from '@lobehub/icons/es/Codex/components/Mono.js';
import Azure from '@lobehub/icons/es/Azure/components/Mono.js';
import Groq from '@lobehub/icons/es/Groq/components/Mono.js';
import Cohere from '@lobehub/icons/es/Cohere/components/Mono.js';
import Perplexity from '@lobehub/icons/es/Perplexity/components/Mono.js';
import Ollama from '@lobehub/icons/es/Ollama/components/Mono.js';
import { Cpu } from 'lucide-react';

const brands = [
  ['openrouter', OpenRouter],
  ['langchain', LangChain],
  ['vercel', Vercel],
  ['cursor', Cursor],
  ['codex', Codex],
  ['openai', OpenAI],
  ['anthropic', Anthropic],
  ['claude', Claude],
  ['gemini', Gemini],
  ['google', Google],
  ['deepseek', DeepSeek],
  ['meta', Meta],
  ['mistral', Mistral],
  ['qwen', Qwen],
  ['grok', Grok],
  ['xai', Grok],
  ['azure', Azure],
  ['groq', Groq],
  ['cohere', Cohere],
  ['perplexity', Perplexity],
  ['ollama', Ollama],
] as const;

/** Official LobeHub SVGs; unknown integrations receive a neutral UI icon. */
export function BrandIcon({
  name,
  size = 22,
}: {
  name: string;
  size?: number;
}) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const Icon = brands.find(([key]) => normalized.startsWith(key))?.[1];
  return (
    <span className="brand-icon" aria-hidden="true">
      {Icon ? <Icon size={size} /> : <Cpu size={size} strokeWidth={1.6} />}
    </span>
  );
}
