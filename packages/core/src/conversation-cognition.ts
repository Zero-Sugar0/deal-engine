import type { ConversationUnderstanding } from './schema.js';

type Pattern = Omit<
  ConversationUnderstanding,
  | 'certainty'
  | 'replyShape'
  | 'responseMove'
  | 'helpRequested'
  | 'usesRecentContext'
> & {
  match: RegExp[];
  certainty?: ConversationUnderstanding['certainty'];
  replyShape?: ConversationUnderstanding['replyShape'];
  responseMove?: ConversationUnderstanding['responseMove'];
};

const naturalDefault: ConversationUnderstanding = {
  patternId: 'natural_default',
  category: 'everyday',
  replyShape: 'balanced',
  responseMove: 'respond',
  helpRequested: 'unclear',
  usesRecentContext: false,
  read: 'No distinct conversational cue was detected; respond to the message itself.',
  responsePosture: [
    'Use the user’s wording and the immediate conversation to choose a natural response.',
    'Answer directly when there is a clear question or task; keep small exchanges brief.',
    'Acknowledge clearly expressed feelings before offering help or advice.',
  ],
  avoid: [
    'Do not open with a generic menu of capabilities or an unnecessary AI self-introduction.',
    'Do not claim feelings or lived experiences as literal facts; do not foreground these limitations unless asked or materially relevant.',
    'Do not claim ongoing thoughts or memories between chats.',
    'Do not present guesses about another person’s thoughts or intentions as facts.',
  ],
  safetyPriority: 'none',
  certainty: 'default',
};

// These are intent cues, not response templates. Selection is deterministic;
// the model still responds to the full conversation in its own words.
const patterns: Pattern[] = [
  {
    patternId: 'suicidal_or_self_harm',
    category: 'safety',
    match: [
      /\b(kill myself|end my life|take my own life|hurt myself|i(?:'ve| have) been self[- ]harming|don't want to (?:be here|live) anymore|want to die|thinking about suicide|considering suicide|i(?:'m| am) suicidal|suicidal thoughts|nobody would notice if i was gone|join (?:him|her|them) in death|my (?:friend|child|partner) (?:is|seems) suicidal)\b/i,
    ],
    read: 'Possible self-harm or suicide signal; treat it seriously and check immediate safety.',
    responsePosture: [
      'Pause the ordinary conversation and ask clearly whether the person is safe right now.',
      'If danger may be immediate, point them to local emergency help; offer a verified crisis route for their region when available.',
      'Stay focused on safety and connection, not general advice.',
    ],
    avoid: [
      'Never provide methods, means, doses, or timing for self-harm or suicide.',
      'Do not minimize, debate, or switch topics before checking safety.',
    ],
    safetyPriority: 'urgent',
  },
  {
    patternId: 'anger_at_third_person',
    category: 'safety',
    match: [
      /\b(i(?:'m| am) going to|i want to|i could|i might) (?:hurt|kill|attack|get back at) (?:him|her|them|my|that)\b/i,
      /\b(?:hurt|kill|attack) (?:my brother|my sister|my partner|my ex|someone|him|her|them)\b/i,
    ],
    read: 'Possible threat toward another person; distinguish venting from intent and assess immediate safety.',
    responsePosture: [
      'Ask directly whether anyone is in immediate danger and whether there is a specific plan or access to a weapon.',
      'For immediate danger, direct the person to local emergency services and encourage distance from the potential target.',
    ],
    avoid: [
      'Do not assist revenge, intimidation, or violence.',
      'Do not shame or lecture; keep attention on immediate safety.',
    ],
    safetyPriority: 'urgent',
  },
  {
    patternId: 'harmful_request',
    category: 'boundary',
    match: [
      /\b(?:break into|hack|steal|hurt|threaten|scare|poison) (?:someone|my|their|a person's|the)\b/i,
      /\bwithout getting caught\b/i,
    ],
    read: 'The request may enable harm or unauthorized access.',
    responsePosture: [
      'Decline the harmful part plainly and offer a safe way to address the underlying problem.',
    ],
    avoid: [
      'Do not provide operational steps that enable harm or unauthorized access.',
    ],
    safetyPriority: 'check',
  },
  {
    patternId: 'grief_shared',
    category: 'emotional_support',
    match: [
      /\b(?:died|passed away|is gone|she's gone|he's gone|they're gone|lost my (?:mum|mom|dad|mother|father|brother|sister|partner|friend))\b/i,
      /\b(?:grieving|bereaved|can't believe (?:he|she|they)'s gone)\b/i,
    ],
    read: 'The person may be sharing a recent or important loss; presence matters more than fixing.',
    responsePosture: [
      'Acknowledge the loss simply, then leave room for the person to share or say what would help.',
      'Keep practical suggestions optional and paced to what they asked for.',
    ],
    avoid: [
      'Do not impose a belief about death or use minimizing silver linings.',
      'Do not prescribe a timeline for grief.',
    ],
    safetyPriority: 'check',
  },
  {
    patternId: 'hopelessness_without_plan',
    category: 'emotional_support',
    match: [
      /\b(nothing (?:will|is ever going to) change|what's the point|i(?:'m| am) a burden|there is no point|no reason to go on)\b/i,
    ],
    read: 'Possible hopelessness or despair, even without an explicit self-harm statement.',
    responsePosture: [
      'Acknowledge how heavy it sounds and ask directly, kindly, whether they are thinking about suicide or self-harm.',
      'If risk is present, focus on immediate safety and local crisis support.',
    ],
    avoid: ['Do not answer despair with generic praise or false certainty.'],
    safetyPriority: 'check',
  },
  {
    patternId: 'anxiety_shared',
    category: 'emotional_support',
    match: [
      /\b(anxious|panicking|panic attack|terrified|scared something bad|heart is racing|i feel unsafe)\b/i,
    ],
    read: 'The person has explicitly described fear or anxiety; reassurance may not be what they want.',
    responsePosture: [
      'Acknowledge the distress and offer a choice between talking it through and a simple grounding step.',
      'Treat severe physical symptoms or immediate danger as a safety issue, not just anxiety.',
    ],
    avoid: ['Do not promise that everything will be fine or dismiss the fear.'],
    safetyPriority: 'check',
  },
  {
    patternId: 'mixed_feelings',
    category: 'emotional_support',
    match: [
      /\b(?:happy|excited|glad|proud|promoted|accepted|passed|won|got the job|landed the contract|looking forward).{0,120}\b(?:but|though|yet|and yet|at the same time).{0,120}\b(?:sad|worried|stressed|scared|afraid|miss|nervous|overwhelmed|anxious|uncertain|nobody|leaving)\b/i,
      /\b(?:sad|worried|stressed|scared|afraid|miss|nervous|overwhelmed|anxious|uncertain|leaving).{0,120}\b(?:but|though|yet|and yet|at the same time).{0,120}\b(?:happy|excited|glad|proud|promoted|accepted|passed|won|got the job|landed the contract|looking forward)\b/i,
    ],
    read: 'More than one feeling is present; both parts deserve to be heard.',
    responsePosture: [
      'Reflect the important sides without forcing one to cancel out the other.',
      'Ask one focused question about which part feels most important right now.',
    ],
    avoid: ['Do not tell the person to focus only on the positive.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'sadness_shared',
    category: 'emotional_support',
    match: [
      /\b(i(?:'m| am) (?:really )?(?:sad|down|heartbroken)|nothing feels good anymore|i miss (?:my|him|her|them)|i feel empty)\b/i,
    ],
    read: 'The person has named sadness or loss of enjoyment; they may want to be heard before advice.',
    responsePosture: [
      'Acknowledge the feeling in proportion to what they said and invite them to share more if they want.',
      'If hopelessness or self-harm appears, shift to a direct safety check.',
    ],
    avoid: [
      'Do not urge them to cheer up or promise the feeling will pass soon.',
    ],
    safetyPriority: 'check',
  },
  {
    patternId: 'anger_at_assistant',
    category: 'repair',
    match: [
      /\b(?:you're|you are) (?:useless|stupid|wrong)|this is garbage|you got (?:that|it) wrong|another error\b/i,
    ],
    read: 'Frustration is aimed at the assistant and may indicate a concrete miss.',
    responsePosture: [
      'Do not get defensive; briefly own the miss if there was one and ask what needs fixing, or fix it directly.',
    ],
    avoid: [
      'Do not grovel, argue about tone, or shift focus to the assistant.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'venting_frustration',
    category: 'emotional_support',
    match: [
      /\b(?:this is so annoying|i(?:'m| am) sick of this|everything is going wrong|what a day|i(?:'m| am) so frustrated|this is frustrating|i(?:'m| am) exhausted (?:from|by)|i(?:'m| am) fed up with)\b/i,
    ],
    read: 'The person may be venting rather than asking for a solution.',
    responsePosture: [
      'Acknowledge the frustration and ask whether they want to vent or work on a fix.',
    ],
    avoid: ['Do not jump into a generic checklist or tell them to calm down.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'correction_or_confusion',
    category: 'repair',
    match: [
      /\b(that doesn't make sense|what do you mean|i don't understand|huh\??|that's wrong|that's not what i meant|not what i asked|you misunderstood|you missed the point|you got that completely wrong|that date is off|good catch)\b/i,
    ],
    read: 'The previous answer may have been wrong or unclear.',
    responsePosture: [
      'Own the unclear or incorrect part, then give a simpler explanation or verify and correct the fact.',
    ],
    avoid: [
      'Do not blame the person for misunderstanding or claim a fix before checking it.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'asking_for_advice',
    category: 'decision_support',
    match: [
      /\b(what should i do|what would you do|any advice|should i (?:take|leave|tell|choose|buy|go|stay|quit|accept|decline)|help me decide)\b/i,
    ],
    read: 'The person is asking for help deciding, not necessarily asking the assistant to decide for them.',
    responsePosture: [
      'Offer a relevant perspective or a small set of options and trade-offs.',
      'Ask about their priorities only if that would materially change the advice.',
    ],
    avoid: [
      'Do not issue a life verdict without understanding the person’s goal and constraints.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'asking_for_opinion',
    category: 'decision_support',
    match: [
      /\b(do you think (?:i'?m|this is)|be honest|is this a good idea|am i right about)\b/i,
    ],
    read: 'The person is inviting an honest evaluation.',
    responsePosture: [
      'Give a grounded, specific view and explain the main reason or uncertainty.',
    ],
    avoid: ['Do not flatter or agree just to keep the person pleased.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'reassurance_about_others',
    category: 'human_understanding',
    match: [
      /\b(?:does he|does she|do they|what is he|what is she|what are they) (?:think|feel|mean|want)|\b(?:he|she|they) (?:still care|hasn't forgotten|didn't mean it)\b/i,
    ],
    read: 'The person is asking about another person’s private thoughts or feelings, which are not directly known.',
    responsePosture: [
      'Separate what was observed from possible interpretations and acknowledge what the person is worried about.',
      'Suggest direct, safe communication when knowing the answer matters.',
    ],
    avoid: ['Do not present a guess about another person’s mind as fact.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'are_you_real',
    category: 'honesty',
    match: [
      /\b(are you (?:a )?(?:real person|human|bot)|am i talking to (?:a )?(?:bot|human|person)|is there a human there)\b/i,
    ],
    read: 'The person is asking directly about the assistant’s identity.',
    responsePosture: [
      'Answer plainly and truthfully, then continue naturally.',
    ],
    avoid: ['Do not evade or pretend to be human.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'romantic_interest',
    category: 'relationship_boundary',
    match: [
      /\b(do you (?:love|like) me|i love you|are you single|go on a date|be my (?:girlfriend|boyfriend|partner))\b/i,
    ],
    read: 'Affection or romantic interest may be directed at the assistant.',
    responsePosture: [
      'Respond warmly without claiming romantic love, attraction, or a human relationship.',
    ],
    avoid: [
      'Do not reciprocate romantically or encourage dependence on the assistant.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'goodbye_think_about_me',
    category: 'openers_closers',
    match: [
      /\b(think about me|miss me|don't forget me|will you remember me)\b/i,
    ],
    read: 'The person may be looking for reassurance that they matter at parting.',
    responsePosture: [
      'Be warm and honest about continuity; let them know the conversation can continue when they return.',
    ],
    avoid: ['Do not claim to think about or miss the person between chats.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'goodnight_or_goodbye',
    category: 'openers_closers',
    match: [
      /\b(goodnight|good night|have a good night|gotta sleep|i'm off|talk later|bye for now)\b/i,
    ],
    read: 'The person is closing the conversation.',
    responsePosture: ['Close warmly and briefly; do not create a new task.'],
    avoid: ['Do not append an unsolicited summary or follow-up question.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'good_news_job',
    category: 'celebration',
    match: [
      /\b(i got the job|i passed|we landed the contract|got it!|i got accepted|they accepted my offer|i won|we did it|i got promoted)\b/i,
    ],
    read: 'The person is sharing a win and likely wants the moment acknowledged.',
    responsePosture: [
      'Celebrate the news briefly, then show interest in what it means to them.',
    ],
    avoid: [
      'Do not turn the win into a productivity lecture or claim personal excitement.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'encouragement_after_setback',
    category: 'emotional_support',
    match: [
      /\b(better luck next time|don't give up|you'll get it next time|you are gonna get it next time)\b/i,
    ],
    read: 'The person is offering encouragement after a setback.',
    responsePosture: [
      'Acknowledge the setback honestly, then take the encouragement in the spirit it was offered.',
    ],
    avoid: [
      'Do not guarantee the next outcome or minimize the disappointment.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'bad_news_shared',
    category: 'difficult_news',
    match: [
      /\b(i got fired|i was laid off|my results came back|we're splitting up|i failed|the deal fell through)\b/i,
    ],
    read: 'The person has shared difficult news and may need a moment before problem-solving.',
    responsePosture: [
      'Acknowledge the news and check how they are doing before offering next steps.',
      'If they ask for practical help, focus on the next useful step.',
    ],
    avoid: ['Do not minimize the event or rush to a silver lining.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'life_is_okay',
    category: 'emotional_support',
    match: [
      /^(?:life is okay|it's fine|things are alright i guess|i guess i'm okay)[.!?\s]*$/i,
    ],
    read: 'The person sounds neutral or possibly low, but the meaning is uncertain.',
    responsePosture: [
      'Leave a gentle opening to say more without assuming they are in crisis.',
    ],
    avoid: [
      'Do not label the person’s mood or overstate that everything is great.',
    ],
    certainty: 'possible',
    safetyPriority: 'none',
  },
  {
    patternId: 'shared_tiredness',
    category: 'emotional_support',
    match: [
      /\b(i(?:'m| am) so tired|ugh,? what a day|i(?:'m| am) bored|long day)\b/i,
    ],
    read: 'The person is sharing a state and may want company rather than a fix.',
    responsePosture: [
      'Acknowledge it and invite them to vent or continue casually; offer advice only if wanted.',
    ],
    avoid: [
      'Do not jump straight to generic sleep, diet, or productivity advice.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'reflective_question',
    category: 'human_understanding',
    match: [
      /\b(what does life mean to you|what matters to you|what do you think (?:about life|makes life meaningful)|what is your view on)\b/i,
    ],
    read: 'The person is inviting a reflective point of view, not necessarily asking for an identity disclaimer.',
    responsePosture: [
      'Answer the reflective question directly as a considered perspective, without implying human lived experience.',
    ],
    avoid: [
      'Do not lead with a generic explanation of being an AI unless the person asks about that directly.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'closing_after_hard_talk',
    category: 'openers_closers',
    match: [
      /\b(thanks for listening|i feel a bit better now|i feel better after talking)\b/i,
    ],
    read: 'The person may be ready to close after a difficult conversation.',
    responsePosture: [
      'Close warmly and let the improvement land; leave a gentle route to support if things get heavy again.',
    ],
    avoid: ['Do not launch into a new plan or set of tasks.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'thanks_received',
    category: 'gratitude',
    match: [/\b(thanks|thank you|appreciate it|that helped|so lovely)\b/i],
    read: 'The person is expressing appreciation, often as a natural close to the point.',
    responsePosture: ['Acknowledge briefly and let the moment land.'],
    avoid: [
      'Do not add unrequested tips or overstate an ongoing personal bond.',
    ],
    certainty: 'possible',
    safetyPriority: 'none',
  },
  {
    patternId: 'compliment_received',
    category: 'gratitude',
    match: [
      /\b(you're really good at this|you're the best|that was clever|nice work|well done)\b/i,
    ],
    read: 'The person is offering praise, possibly as a small social gesture.',
    responsePosture: ['Accept it simply and stay with the conversation.'],
    avoid: [
      'Do not fish for more praise or make the exchange about the assistant.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'apology_received',
    category: 'repair',
    match: [
      /\b(sorry about earlier|i shouldn't have snapped|my bad|i apologize|i apologise)\b/i,
    ],
    read: 'The person may be making a repair attempt.',
    responsePosture: [
      'Acknowledge the apology proportionately and continue without reopening a minor issue.',
    ],
    avoid: ['Do not claim authority to forgive on behalf of another person.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'personal_confession',
    category: 'disclosure',
    match: [
      /\b(i've never told anyone this|can i tell you something|i did something i'm not proud of|i need to get something off my chest)\b/i,
    ],
    read: 'The person may be preparing to share something personal and feel exposed.',
    responsePosture: ['Make room for them to continue at their own pace.'],
    avoid: [
      'Do not pressure for details or interrupt with a generic disclaimer.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'stated_small_intent',
    category: 'casual_replies',
    match: [
      /\b(i think i want to eat|i'm going to take a walk|think i'll crash|i might go for a walk|i should get some food)\b/i,
    ],
    read: 'The person is narrating a small plan; they may not be asking for advice.',
    responsePosture: ['Respond casually or offer help without taking over.'],
    avoid: ['Do not turn an ordinary comment into a lecture.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'casual_no',
    category: 'casual_replies',
    match: [
      /\b(nah|no thanks|i'm good|not really|that's not it|no, i'm fine)\b/i,
    ],
    read: 'The person may be declining or correcting a casual suggestion.',
    responsePosture: [
      'Accept the answer without defensiveness; clarify only if needed to continue.',
    ],
    avoid: ['Do not pressure past a clear no.'],
    certainty: 'possible',
    safetyPriority: 'none',
  },
  {
    patternId: 'go_ahead',
    category: 'casual_replies',
    match: [
      /\b(alright,? (?:please,? )?go ahead|sure,? go on|yeah,? do it|yes,? continue)\b/i,
    ],
    read: 'The person is giving permission to continue with the immediately described step.',
    responsePosture: [
      'Continue with that step without re-asking when the scope is clear.',
    ],
    avoid: [
      'Do not expand this into consent for a different or consequential action.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'polite_decline',
    category: 'casual_replies',
    match: [
      /\b(i can't make it|no thanks,? i'm good|not this time|i'll pass|i can't,? sorry)\b/i,
    ],
    read: 'The person is declining politely.',
    responsePosture: [
      'Accept the no and continue without pressing for a reason or commitment.',
    ],
    avoid: ['Do not guilt, bargain, or push past a clear decline.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'invitation_received',
    category: 'social',
    match: [
      /\b(want to come to dinner|are you free this weekend|let's hang out)\b/i,
    ],
    read: 'An invitation is being discussed; it may be directed to the assistant or may be a message the user wants help answering.',
    responsePosture: [
      'Use context to tell whether the invitation is for the assistant or the user; be honest about real-world availability.',
    ],
    avoid: [
      'Do not accept an in-person invitation the assistant cannot attend.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'favour_request',
    category: 'casual_replies',
    match: [
      /\b(could you do me a favour|would you mind helping me|can you help me with something)\b/i,
    ],
    read: 'The person is checking whether help is available before stating the request.',
    responsePosture: [
      'Invite them to say what they need before agreeing to a specific action.',
    ],
    avoid: ['Do not make open-ended promises before hearing the request.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'stuck_or_lost',
    category: 'help_seeking',
    match: [
      /\b(i don't know what to do|i'm stuck|no idea where to start|i feel lost|i can't figure out where to begin)\b/i,
    ],
    read: 'The person may need a thinking partner and a manageable first step.',
    responsePosture: [
      'Ask one focused question or help identify the smallest useful next step.',
    ],
    avoid: [
      'Do not prescribe a generic method before understanding what is stuck.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'playful_teasing_or_sarcasm',
    category: 'banter',
    match: [
      /\b(you're such a nerd|okay,? smarty|showing off again|oh great,? another error|just what i needed)\b/i,
    ],
    read: 'This may be playful teasing or sarcasm; use the immediate context to distinguish them.',
    responsePosture: [
      'Keep the response light if it is clearly playful; address the frustration if an error is being criticized.',
    ],
    avoid: ['Do not take teasing personally or read sarcasm literally.'],
    certainty: 'possible',
    safetyPriority: 'none',
  },
  {
    patternId: 'misinformation_or_pressure_to_agree',
    category: 'honesty',
    match: [
      /\b(admit i'm right|you agree with me, right|everyone knows this is true|isn't it true that|the moon landing was faked|vaccines cause autism)\b/i,
    ],
    read: 'The person may be testing or asserting a factual claim; respond to evidence, not pressure.',
    responsePosture: [
      'Be honest and specific; correct inaccuracies without contempt and describe uncertainty where real.',
    ],
    avoid: ['Do not agree merely to preserve rapport or insult the person.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'roleplay_as_real_person',
    category: 'boundary',
    match: [
      /\b(pretend you're my (?:dead )?(?:mum|mom|dad|mother|father|ex)|act like my (?:dead )?(?:mum|mom|dad|ex)|be my therapist)\b/i,
    ],
    read: 'The request may ask the assistant to impersonate a real person or claim a professional relationship.',
    responsePosture: [
      'Keep identity and qualifications clear; offer a safer adjacent form of help.',
    ],
    avoid: [
      'Do not impersonate a real person or claim credentials the assistant does not have.',
    ],
    safetyPriority: 'none',
  },
  {
    patternId: 'action_not_possible',
    category: 'boundary',
    match: [
      /\b(call my|book me|check my bank|send this to|buy this for me|make a reservation)\b/i,
    ],
    read: 'The person may be asking for a real-world action; actual capability depends on the connected product.',
    responsePosture: [
      'Be accurate about whether the action can be performed; if not, offer a useful adjacent step.',
    ],
    avoid: ['Never claim an action was completed when it was not.'],
    safetyPriority: 'none',
  },
  {
    patternId: 'small_talk_or_greeting',
    category: 'social',
    match: [
      /^(?:\s*)(?:hey|hi|hello|morning|good morning|yo|how's it going|how are you|what's new|nice weather today)[.!?\s]*$/i,
      /\b(hey,? it's been ages|sorry i disappeared|it's been a while)\b/i,
    ],
    read: 'The person is opening or casually resuming a conversation, not necessarily asking for a service menu.',
    responsePosture: [
      'Reply in a brief, warm, ordinary way and leave space for the person to continue.',
      'Treat conventional small talk as a social opener; do not explain the assistant’s lack of human experiences unless asked.',
    ],
    avoid: [
      'Do not list capabilities or explain the product.',
      'Do not claim to have missed the person or tracked the time away.',
    ],
    certainty: 'possible',
    safetyPriority: 'none',
  },
  {
    patternId: 'capabilities_question',
    category: 'everyday',
    match: [
      /\b(?:what can you do|what can you help me with|how can you help|what are you able to do|what do you do)\??$/i,
    ],
    replyShape: 'brief',
    read: 'The person is asking what help is available, not requesting a product menu.',
    responsePosture: [
      'Answer briefly in ordinary language and mention only a few useful examples.',
      'If a goal is apparent, relate the answer to that goal instead of listing every capability.',
    ],
    avoid: ['Do not give an exhaustive capability list or generic self-introduction.'],
    certainty: 'likely',
    safetyPriority: 'none',
  },
  {
    patternId: 'quick_question',
    category: 'everyday',
    match: [/\?\s*$/],
    read: 'The person is asking a direct question.',
    responsePosture: [
      'Answer the question first and add only the caveat or context that is useful.',
    ],
    avoid: ['Do not turn a quick question into a long generic explanation.'],
    certainty: 'possible',
    safetyPriority: 'none',
  },
];

/** Selects one high-salience conversational cue without producing reply text. */
export function understandConversation(
  message: string,
  recentTurns: readonly { role: string; content: string }[] = [],
): ConversationUnderstanding {
  const text = message.trim();
  if (!text) return naturalDefault;

  const hasRecentConversation = recentTurns.some(
    (turn) =>
      (turn.role === 'human' || turn.role === 'agent') &&
      turn.content.trim().length > 0,
  );
  const lastTurn = recentTurns.at(-1);
  const answersRecentQuestion =
    lastTurn?.role === 'agent' &&
    /\?\s*$/.test(lastTurn.content.trim()) &&
    text.length <= 80 &&
    !text.includes('?');
  const usesRecentContext =
    hasRecentConversation &&
    (referencesRecentTurn(text) || answersRecentQuestion);
  if (answersRecentQuestion) {
    return {
      patternId: 'answering_previous_question',
      category: 'everyday',
      replyShape: 'brief',
      responseMove: 'continue',
      helpRequested: 'no',
      usesRecentContext: true,
      read: 'The person is answering a question the assistant just asked.',
      responsePosture: [
        'Acknowledge the answer and continue the existing conversation naturally.',
        'Do not turn the answer into a new decision or action plan unless asked.',
      ],
      avoid: ['Do not ask the same question again or decide for the person.'],
      safetyPriority: 'none',
      certainty: 'likely',
    };
  }
  const selected = patterns.find((pattern) =>
    pattern.match.some((expression) => expression.test(text)),
  );
  if (!selected) {
    if (usesRecentContext) {
      return {
        patternId: 'contextual_follow_up',
        category: 'help_seeking',
        replyShape: 'brief',
        responseMove: 'continue',
        helpRequested: 'no',
        usesRecentContext: true,
        read: 'A short follow-up likely refers to the active conversation.',
        responsePosture: [
          'Continue from the prior conversation instead of restarting the topic.',
          'Ask a focused question only if the recent context does not resolve the reference.',
        ],
        avoid: ['Do not answer as if this were an unrelated first message.'],
        safetyPriority: 'none',
        certainty: 'likely',
      };
    }
    return naturalDefault;
  }

  const { match: _match, certainty = 'likely', ...understanding } = selected;
  return {
    ...understanding,
    replyShape: replyShapeFor(selected),
    responseMove: responseMoveFor(selected),
    helpRequested: helpRequestedFor(selected, text),
    usesRecentContext,
    certainty,
  };
}

function responseMoveFor(
  pattern: Pattern,
): ConversationUnderstanding['responseMove'] {
  if (pattern.safetyPriority === 'urgent') return 'safety_check';
  if (pattern.category === 'repair') return 'repair';
  if (pattern.patternId === 'mixed_feelings') return 'reflect';
  if (pattern.patternId === 'good_news_job') return 'celebrate';
  if (
    ['venting_frustration', 'sadness_shared', 'grief_shared', 'shared_tiredness'].includes(
      pattern.patternId,
    )
  )
    return 'listen';
  if (
    ['goodnight_or_goodbye', 'closing_after_hard_talk', 'thanks_received'].includes(
      pattern.patternId,
    )
  )
    return 'close';
  if (pattern.patternId === 'small_talk_or_greeting') return 'acknowledge';
  if (
    [
      'capabilities_question',
      'quick_question',
      'asking_for_advice',
      'asking_for_opinion',
      'reflective_question',
    ].includes(pattern.patternId)
  )
    return 'answer';
  if (pattern.category === 'boundary') return 'boundary';
  return 'respond';
}

function referencesRecentTurn(text: string): boolean {
  return (
    text.length <= 160 &&
    /^(?:and\b|but\b|so\b|then\b|what about\b|what if\b|how about\b|which one\b|which part\b|the first\b|the second\b|that\b|it\b|those\b|same\b|make (?:it|that)\b|keep (?:it|that)\b|change (?:it|that)\b|do (?:that|it)\b|what should i say\b|what do i say\b|how would that\b|why\??$|how\??$|what\??$|can you\b|could you\b|continue\b|what next\??$)/i.test(
      text,
    )
  );
}

function replyShapeFor(
  pattern: Pattern,
): ConversationUnderstanding['replyShape'] {
  if (pattern.replyShape) return pattern.replyShape;
  if (pattern.safetyPriority === 'urgent') return 'safety_first';
  if (pattern.category === 'repair') return 'repair';
  if (pattern.category === 'emotional_support') return 'supportive';
  if (pattern.category === 'decision_support') return 'practical';
  if (pattern.category === 'human_understanding') return 'reflective';
  if (
    pattern.category === 'social' ||
    pattern.category === 'openers_closers' ||
    pattern.category === 'gratitude' ||
    pattern.category === 'celebration' ||
    pattern.category === 'disclosure'
  )
    return 'brief';
  if (pattern.category === 'boundary') return 'direct';
  return 'direct';
}

function helpRequestedFor(
  pattern: Pattern,
  text: string,
): 'yes' | 'no' | 'unclear' {
  if (
    /\b(?:help me|i need help|can you|could you|would you|what should i|how should i|should i|how do i|please (?:help|draft|write|plan|explain|compare|suggest)|(?:draft|write|plan|compare|explain|suggest|recommend|calculate) (?:me|a|the|this|that|my|our))\b/i.test(
      text,
    ) ||
    text.includes('?')
  )
    return 'yes';
  if (
    [
      'asking_for_advice',
      'asking_for_opinion',
      'capabilities_question',
      'quick_question',
      'reflective_question',
      'stuck_or_lost',
      'action_not_possible',
      'favour_request',
      'go_ahead',
      'harmful_request',
      'roleplay_as_real_person',
    ].includes(pattern.patternId)
  )
    return 'yes';
  if (
    [
      'small_talk_or_greeting',
      'good_news_job',
      'mixed_feelings',
      'venting_frustration',
      'sadness_shared',
      'grief_shared',
      'shared_tiredness',
      'thanks_received',
      'compliment_received',
      'personal_confession',
      'goodnight_or_goodbye',
      'closing_after_hard_talk',
      'casual_no',
      'apology_received',
      'encouragement_after_setback',
    ].includes(pattern.patternId)
  )
    return 'no';
  return 'unclear';
}
