import type { GenerationRecord, HumanizedRecord } from './experiment.js';

const enabled =
  !process.env.NO_COLOR &&
  (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));

function paint(code: string, value: string): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

const bold = (value: string) => paint('1', value);
const dim = (value: string) => paint('2', value);
const lavender = (value: string) => paint('38;5;183', value);
const green = (value: string) => paint('38;5;114', value);
const amber = (value: string) => paint('38;5;179', value);
const blue = (value: string) => paint('38;5;117', value);

export function jsonMode(): boolean {
  return process.argv.includes('--json');
}

function inlineMarkdown(value: string): string {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return bold(part.slice(2, -2));
      if (part.startsWith('`') && part.endsWith('`'))
        return lavender(part.slice(1, -1));
      if (part.startsWith('*') && part.endsWith('*'))
        return paint('3', part.slice(1, -1));
      return part;
    })
    .join('');
}

export function markdown(value: string): string {
  let codeBlock = false;
  return value
    .split('\n')
    .map((line) => {
      if (line.trim().startsWith('```')) {
        codeBlock = !codeBlock;
        return dim(line.trim());
      }
      if (codeBlock) return `  ${dim(line)}`;
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) return `\n${bold(lavender(heading[1]))}`;
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) return `  ${blue('•')} ${inlineMarkdown(bullet[1])}`;
      const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
      if (ordered)
        return `  ${blue(`${ordered[1]}.`)} ${inlineMarkdown(ordered[2])}`;
      return inlineMarkdown(line);
    })
    .join('\n')
    .trim();
}

function rule(): string {
  const width = Math.min(Math.max(process.stdout.columns ?? 88, 48), 96);
  return dim('─'.repeat(width));
}

function metadata(entries: Array<[string, string]>): string {
  return entries
    .map(([label, value]) => `${dim(`${label}:`)} ${value}`)
    .join(`  ${dim('·')}  `);
}

export async function withStatus<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!enabled || jsonMode()) return operation();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;
  process.stdout.write(`${lavender(frames[index])} ${label}`);
  const timer = setInterval(() => {
    index = (index + 1) % frames.length;
    process.stdout.write(`\r${lavender(frames[index])} ${label}`);
  }, 90);
  try {
    const result = await operation();
    process.stdout.write(`\r${green('✓')} ${label}\n`);
    return result;
  } catch (error) {
    process.stdout.write(`\r${paint('31', '×')} ${label}\n`);
    throw error;
  } finally {
    clearInterval(timer);
  }
}

export function printHeader(task: string, model: string, mode: string): void {
  console.log(`\n${bold(lavender('deal'))} ${dim('· context experiment')}`);
  console.log(rule());
  console.log(
    metadata([
      ['mode', bold(mode)],
      ['model', model],
    ]),
  );
  console.log(`${dim('task:')} ${task}`);
}

export function printResponse(
  title: string,
  result: GenerationRecord,
  context?: HumanizedRecord['context'],
): void {
  console.log(`\n${bold(title)}`);
  if (context) {
    console.log(
      metadata([
        ['packet', context.packetId],
        ['profile', context.professionalProfile ?? 'general'],
        ['policy', context.policyVersion],
        ['expires', context.expiresAt],
      ]),
    );
  }
  console.log(
    metadata([
      ['finish', result.finishReason],
      ['usage', JSON.stringify(result.usage)],
    ]),
  );
  console.log(rule());
  console.log(markdown(result.text));
}

export function printComparison(
  task: string,
  model: string,
  raw: GenerationRecord,
  humanized: HumanizedRecord,
): void {
  printHeader(task, model, 'comparison');
  printResponse('raw response · no DEAL context', raw);
  printResponse(
    'humanized response · DEAL context injected',
    humanized,
    humanized.context,
  );
  console.log(`\n${amber('What to inspect')}`);
  console.log(
    markdown(
      '- Does the humanized response preserve the person’s voice?\n' +
        '- Does it make different tradeoffs or ask better clarifying questions?\n' +
        '- Does it respect the context packet’s boundaries and uncertainty?',
    ),
  );
}
