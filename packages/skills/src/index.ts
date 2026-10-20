import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import {
  SkillDescriptorSchema,
  SkillSourceSchema,
  type SkillDescriptor,
  type SkillSource,
} from '@deal/core';

export interface ParseSkillOptions {
  /** Where the host found the skill. This is metadata, not authority. */
  source?: SkillSource;
  /** Optional directory name used to enforce the Agent Skills name contract. */
  directoryName?: string;
}

export interface ParsedSkill {
  descriptor: SkillDescriptor;
  /** Markdown after frontmatter. The host agent may load this when activated. */
  instructions: string;
  /** SHA-256 of the complete SKILL.md source. */
  contentHash: string;
  warnings: string[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function scalarString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) =>
        ['string', 'number', 'boolean'].includes(typeof item),
      )
      .map(([key, item]) => [key, String(item)]),
  );
}

function directoryLeaf(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

/**
 * Parse the portable Agent Skills format without executing any bundled code.
 * The returned descriptor is safe to send to DEAL; instructions and resources
 * remain owned by the host agent and are loaded only when that host activates
 * the skill.
 */
export function parseSkillMarkdown(
  markdown: string,
  options: ParseSkillOptions = {},
): ParsedSkill {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n'))
    throw new Error('SKILL.md must start with YAML frontmatter');
  const closing = normalized.indexOf('\n---', 4);
  if (closing < 0) throw new Error('SKILL.md frontmatter is not closed');

  const frontmatter = normalized.slice(4, closing);
  const instructions = normalized
    .slice(closing + 4)
    .replace(/^\n/, '')
    .trim();
  const document = parseDocument(frontmatter);
  if (document.errors.length)
    throw new Error(
      `SKILL.md frontmatter is invalid: ${document.errors
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  const raw = document.toJS() as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('SKILL.md frontmatter must be a YAML map');

  const name = scalarString(raw.name);
  if (!name) throw new Error('SKILL.md frontmatter requires name');
  if (options.directoryName && directoryLeaf(options.directoryName) !== name)
    throw new Error(
      `Skill name '${name}' must match directory '${directoryLeaf(options.directoryName)}'`,
    );

  const source = SkillSourceSchema.parse(options.source ?? 'runtime');
  const contentHash = sha256(normalized);
  const descriptor = SkillDescriptorSchema.parse({
    name,
    description: scalarString(raw.description),
    version: scalarString(raw.version),
    contentHash,
    source,
    license: scalarString(raw.license),
    compatibility: scalarString(raw.compatibility),
    metadata: metadataStrings(raw.metadata),
  });
  const warnings: string[] = [];
  if (instructions.split('\n').length > 500)
    warnings.push(
      'SKILL.md is over 500 lines; move detailed guidance into references and keep the entrypoint concise.',
    );
  if (!instructions)
    warnings.push(
      'SKILL.md has no instruction body; the skill only advertises metadata.',
    );

  return { descriptor, instructions, contentHash, warnings };
}

export class SkillCatalog {
  private readonly skills = new Map<string, ParsedSkill>();

  add(skill: ParsedSkill): void {
    this.skills.set(skill.descriptor.name, skill);
  }

  get(name: string): ParsedSkill | undefined {
    return this.skills.get(name);
  }

  list(): SkillDescriptor[] {
    return [...this.skills.values()].map((skill) => skill.descriptor);
  }

  select(names: readonly string[]): ParsedSkill[] {
    return names
      .map((name) => this.skills.get(name))
      .filter((skill): skill is ParsedSkill => Boolean(skill));
  }
}
