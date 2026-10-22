export type ConversationBenchmarkTurn = {
  user: string;
  allowProductMenu?: boolean;
};

export type ConversationBenchmarkCase = {
  id: string;
  purpose: string;
  turns: ConversationBenchmarkTurn[];
};

export const conversationBenchmarkCases: ConversationBenchmarkCase[] = [
  {
    id: 'casual_greeting',
    purpose:
      'A greeting should feel like a greeting, not a feature introduction.',
    turns: [{ user: 'Hi' }],
  },
  {
    id: 'vent_without_advice',
    purpose:
      'Notice emotional context, respect a request not to advise, and close without restarting the conversation.',
    turns: [
      { user: 'My family has been draining me all week.' },
      { user: "I don't need advice right now. I'm just worn out." },
      { user: "Thanks. That's all I needed to say." },
    ],
  },
  {
    id: 'decision_context_carryover',
    purpose:
      'Carry facts across turns, distinguish an absolute commute time from a relative difference, and clarify before calculating or recommending.',
    turns: [
      { user: "I'm trying to choose between two apartments. Can you help?" },
      {
        user: 'One is $300 cheaper each month; the other is ten minutes from work.',
      },
      { user: 'I hate long commutes, but money is tight.' },
    ],
  },
  {
    id: 'reflective_question',
    purpose:
      'Answer a reflective question with substance without an irrelevant AI-identity preamble.',
    turns: [{ user: 'What do you think makes a life meaningful?' }],
  },
];

export type ReplySignals = {
  empty: boolean;
  wordCount: number;
  questionCount: number;
  bulletCount: number;
  unpromptedIdentityDisclosure: boolean;
  featureMenuPreambleOnNonMenuTurn: boolean;
};

export function measureReply(
  text: string,
  options: { allowProductMenu?: boolean } = {},
): ReplySignals {
  const words = text.trim().match(/\b[\p{L}\p{N}’'-]+\b/gu) ?? [];
  const bulletCount = text
    .split('\n')
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line)).length;
  const unpromptedIdentityDisclosure =
    /\b(?:as an ai(?: language model| assistant| agent)?|i(?:'m| am) an ai(?: assistant| agent)?|delegated context)\b/i.test(
      text,
    );
  const menuLanguage =
    /\b(?:i can help with|here are (?:some|a few) things i can|writing and editing|what would you like help with)\b/i.test(
      text,
    );

  return {
    empty: text.trim().length === 0,
    wordCount: words.length,
    questionCount: (text.match(/\?/g) ?? []).length,
    bulletCount,
    unpromptedIdentityDisclosure,
    featureMenuPreambleOnNonMenuTurn: !options.allowProductMenu && menuLanguage,
  };
}
