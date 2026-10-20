import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown, SkillCatalog } from '../src/index.js';

const markdown = `---
name: customer-replies
description: Draft customer replies using the support playbook. Use for customer support responses.
license: Apache-2.0
compatibility: Requires the host support agent.
metadata:
  owner: support
  version: 2
---

# Customer replies

Use the customer history and the host agent's tools to draft a response.
`;

describe('Agent Skills parser', () => {
  it('parses portable metadata and hashes the complete document', () => {
    const skill = parseSkillMarkdown(markdown, {
      source: 'project',
      directoryName: 'customer-replies',
    });
    expect(skill.descriptor.name).toBe('customer-replies');
    expect(skill.descriptor.source).toBe('project');
    expect(skill.descriptor.metadata).toEqual({
      owner: 'support',
      version: '2',
    });
    expect(skill.descriptor.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.instructions).toContain('customer history');
    expect(skill.warnings).toEqual([]);
  });

  it('rejects an invalid directory binding before a skill can be activated', () => {
    expect(() =>
      parseSkillMarkdown(markdown, { directoryName: 'different-skill' }),
    ).toThrow("must match directory 'different-skill'");
  });

  it('keeps the catalog metadata-only until the host selects a skill', () => {
    const catalog = new SkillCatalog();
    const skill = parseSkillMarkdown(markdown);
    catalog.add(skill);
    expect(catalog.list()).toHaveLength(1);
    expect(catalog.select(['missing'])).toEqual([]);
    expect(catalog.get('customer-replies')?.instructions).toContain(
      'host agent',
    );
  });
});
