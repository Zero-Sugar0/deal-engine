import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/engine.js';

const authority = {
  mayRead: ['context_read'],
  mayWrite: ['host_system_write', 'external_commitment'],
  mayDraft: ['response_draft'],
  requiresApproval: ['external_commitment'],
  spendLimitUsd: 25,
  maxRecipientCount: 50,
};
const judgment = {
  askIfMissing: [],
  escalateIf: [],
  refuseIf: [],
  confidenceThreshold: 0.7,
};

describe('policy engine', () => {
  it('denies actions outside delegated capability', () => {
    expect(
      evaluatePolicy(authority, judgment, {
        action: 'host_system_delete',
        irreversible: true,
      }).decision,
    ).toBe('deny');
  });

  it('requires approval for mass email', () => {
    const result = evaluatePolicy(authority, judgment, {
      action: 'external_commitment',
      recipientCount: 51,
    });
    expect(result.decision).toBe('require_approval');
    expect(result.risk).toBe('high');
  });

  it('escalates low-confidence drafts', () => {
    const result = evaluatePolicy(authority, judgment, {
      action: 'response_draft',
      confidence: 0.2,
    });
    expect(result.decision).toBe('escalate');
  });
});
