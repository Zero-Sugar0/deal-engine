import { describe, expect, it } from 'vitest';
import {
  conversationBenchmarkCases,
  measureReply,
} from '../lib/conversation-benchmark.js';

describe('multi-turn conversation benchmark', () => {
  it('covers greeting, emotional listening, continuity, and reflection', () => {
    expect(conversationBenchmarkCases.map((item) => item.id)).toEqual([
      'casual_greeting',
      'vent_without_advice',
      'decision_context_carryover',
      'reflective_question',
    ]);
    expect(
      conversationBenchmarkCases.find(
        (item) => item.id === 'decision_context_carryover',
      )?.turns,
    ).toHaveLength(3);
  });

  it('flags irrelevant identity boilerplate and explicit feature menus', () => {
    expect(
      measureReply("I'm an AI agent working with your context. What can I do?")
        .unpromptedIdentityDisclosure,
    ).toBe(true);
    expect(
      measureReply(
        'I can help with writing, research, coding, planning, and analysis.',
      ).featureMenuPreambleOnNonMenuTurn,
    ).toBe(true);
    const reflectiveList = measureReply(
      'A few things can matter:\n- connection\n- purpose\n- curiosity',
    );
    expect(reflectiveList.featureMenuPreambleOnNonMenuTurn).toBe(false);
    expect(reflectiveList.bulletCount).toBe(3);
  });

  it('keeps the signals descriptive and does not flag a natural short reply', () => {
    expect(measureReply("Hey! What's up?")).toEqual({
      empty: false,
      wordCount: 3,
      questionCount: 1,
      bulletCount: 0,
      unpromptedIdentityDisclosure: false,
      featureMenuPreambleOnNonMenuTurn: false,
    });
    expect(measureReply('')).toMatchObject({ empty: true, wordCount: 0 });
  });
});
