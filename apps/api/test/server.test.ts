import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { DealStore } from '../src/store.js';
import { InMemoryRateLimiter } from '../src/rate-limit.js';

const agentToken = 'test-agent-token';
const humanToken = 'test-human-token';
const store = new DealStore();
await store.seedDemo(agentToken, humanToken);
const app = buildServer({
  store,
  jwtSecret: 'test-secret-that-is-long-enough',
  contextTtlMinutes: 15,
});
const limitedApp = buildServer({
  store,
  jwtSecret: 'test-secret-that-is-long-enough',
  rateLimiter: new InMemoryRateLimiter(),
  rateLimitPerMinute: 1,
});
const externalStore = new DealStore();
await externalStore.seedDemo('external-agent', 'external-human');
const externalApp = buildServer({
  store: externalStore,
  jwtSecret: 'test-secret-that-is-long-enough',
  externalAuth: {
    async verify(token) {
      if (token !== 'idp-token') throw new Error('invalid token');
      return {
        issuer: 'https://issuer.example.test',
        subject: 'subject-123',
        email: 'founder@example.com',
        claims: { sub: 'subject-123' },
      };
    },
  },
});

afterAll(async () => {
  await app.close();
  await limitedApp.close();
  await externalApp.close();
});

describe('DEAL control plane', () => {
  it('exposes readiness and correlated Prometheus metrics', async () => {
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe('ready');
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('deal_http_requests_total');
    expect(metrics.headers['x-request-id']).toBeTypeOf('string');
  });

  it('enforces a shared rate-limit contract at the API boundary', async () => {
    const first = await limitedApp.inject({
      method: 'GET',
      url: '/v1/profiles',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    const second = await limitedApp.inject({
      method: 'GET',
      url: '/v1/profiles',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeTypeOf('string');
  });

  it('links and then accepts an explicitly verified external human identity', async () => {
    const link = await externalApp.inject({
      method: 'POST',
      url: '/v1/auth/external/link',
      headers: { authorization: 'Bearer external-human' },
      payload: { token: 'idp-token' },
    });
    expect(link.statusCode).toBe(200);
    const profile = await externalApp.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: { authorization: 'Bearer idp-token' },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().human.id).toBe('human_demo');
  });

  it('issues a signed context packet and gates external commitments', async () => {
    const contextResponse = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        task: 'Find qualified HR leaders and draft outreach',
        requestedCapabilities: ['context_read', 'response_draft'],
      },
    });
    expect(contextResponse.statusCode).toBe(200);
    const context = contextResponse.json();
    expect(context.signature).toBeTypeOf('string');
    expect(context.packet.memory.corrections).toContain(
      'Never target agencies or current customers',
    );

    const policyResponse = await app.inject({
      method: 'POST',
      url: '/v1/policy/evaluate',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        contextPacketId: context.packetId,
        action: 'external_commitment',
        recipientCount: 10,
      },
    });
    expect(policyResponse.json().decision).toBe('require_approval');
  });

  it('supports an approval decision and audit trail', async () => {
    const contextResponse = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Send the approved campaign' },
    });
    const context = contextResponse.json();
    const approvalResponse = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        contextPacketId: context.packetId,
        action: 'external_commitment',
        summary: 'Send five approved messages',
        payload: { recipients: ['a@example.com'] },
      },
    });
    expect(approvalResponse.statusCode).toBe(200);
    const approval = approvalResponse.json();
    const decision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approval.id}/decision`,
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { decision: 'approved' },
    });
    expect(decision.json().status).toBe('approved');
    const consume = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approval.id}/consume`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { payload: { recipients: ['a@example.com'] } },
    });
    expect(consume.statusCode).toBe(200);
    expect(consume.json().executionToken).toBeTypeOf('string');
    const verified = await app.inject({
      method: 'POST',
      url: '/v1/actions/verify',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        executionToken: consume.json().executionToken,
        action: 'external_commitment',
        payload: { recipients: ['a@example.com'] },
      },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().authorized).toBe(true);
    const replay = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approval.id}/consume`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { payload: { recipients: ['a@example.com'] } },
    });
    expect(replay.statusCode).toBe(409);
    const audit = await app.inject({
      method: 'GET',
      url: '/v1/audit',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    expect(
      audit
        .json()
        .some(
          (event: { eventType: string }) =>
            event.eventType === 'approval.approved',
        ),
    ).toBe(true);
  });

  it('binds approvals to policy and canonicalizes payload order', async () => {
    const contextResponse = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Send a qualified campaign' },
    });
    const context = contextResponse.json();
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        contextPacketId: context.packetId,
        action: 'host_system_write',
        summary: 'Write to a host system',
        payload: { company: 'Example' },
      },
    });
    expect(rejected.statusCode).toBe(409);

    const approvalResponse = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        contextPacketId: context.packetId,
        action: 'external_commitment',
        summary: 'Send one approved message',
        payload: { z: 1, a: { second: true, first: true } },
      },
    });
    const approval = approvalResponse.json();
    await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approval.id}/decision`,
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { decision: 'approved' },
    });
    const consumed = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approval.id}/consume`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { payload: { a: { first: true, second: true }, z: 1 } },
    });
    expect(consumed.statusCode).toBe(200);
  });

  it('rejects context requests outside delegated capability', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Deploy code', requestedCapabilities: ['code_deploy'] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('supports agent credential rotation and revocation', async () => {
    const agentResponse = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { name: 'Rotation Test Agent', runtime: 'test' },
    });
    expect(agentResponse.statusCode).toBe(200);
    const created = agentResponse.json();
    const delegation = await app.inject({
      method: 'POST',
      url: '/v1/delegations',
      headers: { authorization: `Bearer ${humanToken}` },
      payload: {
        agentId: created.agent.id,
        purpose: 'Test credential rotation',
        authority: {
          mayRead: ['context_read'],
          mayDraft: ['response_draft'],
          mayWrite: [],
          requiresApproval: [],
        },
      },
    });
    expect(delegation.statusCode).toBe(200);
    const rotated = await app.inject({
      method: 'POST',
      url: `/v1/agents/${created.agent.id}/credentials/rotate`,
      headers: { authorization: `Bearer ${humanToken}` },
      payload: {},
    });
    expect(rotated.statusCode).toBe(200);
    const oldContext = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${created.apiKey}` },
      payload: { task: 'This credential should be revoked' },
    });
    expect(oldContext.statusCode).toBe(401);
    const newContext = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${rotated.json().apiKey}` },
      payload: { task: 'This credential should work' },
    });
    expect(newContext.statusCode).toBe(200);
  });

  it('exposes profile, onboarding, memory, and workflow surfaces', async () => {
    const agentProfile = await app.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(agentProfile.statusCode).toBe(403);

    const profiles = await app.inject({
      method: 'GET',
      url: '/v1/profiles',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    expect(profiles.statusCode).toBe(200);
    expect(profiles.json()[0].id).toBe('growth_operator_v1');
    expect(profiles.json()).toHaveLength(15);

    const onboarding = await app.inject({
      method: 'POST',
      url: '/v1/onboarding',
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { communicationStyle: 'short and direct' },
    });
    expect(onboarding.json().persona.communicationStyle).toBe(
      'short and direct',
    );

    const contextResponse = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Run the growth workflow' },
    });
    const workflowResponse = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        goal: 'Find and qualify ten HR leaders',
        contextPacketId: contextResponse.json().packetId,
      },
    });
    expect(workflowResponse.statusCode).toBe(200);
    const workflow = workflowResponse.json();
    expect(workflow.currentStep).toBe('intake');

    const plannedWorkflow = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        profileId: 'research_analyst_v1',
        goal: 'Prepare a market brief',
      },
    });
    expect(plannedWorkflow.statusCode).toBe(501);

    const transition = await app.inject({
      method: 'POST',
      url: `/v1/workflows/${workflow.id}/transition`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { step: 'research', data: { source: 'host_agent' } },
    });
    expect(transition.json().currentStep).toBe('research');

    const memories = await app.inject({
      method: 'GET',
      url: '/v1/memory?kinds=correction',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    expect(memories.json()[0].kind).toBe('correction');
  });

  it('supersedes corrections and persists forget intent', async () => {
    const memoryResponse = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { kind: 'episode', content: 'Use short subject lines' },
    });
    const memory = memoryResponse.json();
    const correction = await app.inject({
      method: 'POST',
      url: `/v1/memory/${memory.id}/correct`,
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { replacement: 'Use concise subject lines with evidence' },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().replacementId).not.toBe(memory.id);
    const search = await app.inject({
      method: 'GET',
      url: '/v1/memory?q=subject',
      headers: { authorization: `Bearer ${humanToken}` },
    });
    expect(search.json().map((item: { id: string }) => item.id)).toContain(
      correction.json().replacementId,
    );
    expect(search.json().map((item: { id: string }) => item.id)).not.toContain(
      memory.id,
    );
  });

  it('compiles a human model and explicit response guidance', async () => {
    const onboarding = await app.inject({
      method: 'POST',
      url: '/v1/onboarding',
      headers: { authorization: `Bearer ${humanToken}` },
      payload: {
        preferredName: 'Alex',
        mission: 'Build a calm, durable company',
        identity: {
          selfDescription: 'A patient builder who prefers honest progress.',
          languages: [{ value: 'English', category: 'working' }],
          identityMarkers: [
            {
              value: 'sensitive identity fact',
              sensitivity: 'sensitive',
            },
          ],
        },
        selfConcept: {
          summary: 'A patient builder learning to scale without losing care.',
          strengths: [{ value: 'making tradeoffs explicit', confidence: 0.95 }],
          nonNegotiables: [
            { value: 'never sacrifice trust for vanity metrics' },
          ],
          valuesHierarchy: [
            { value: 'trust', priority: 100 },
            { value: 'speed', priority: 40 },
          ],
          howTheyDescribeThemselves: ['careful', 'ambitious'],
        },
        biography: {
          summary: 'Founder with a product and operations background.',
          currentChapter: 'Finding repeatable distribution.',
          careerArc: [
            {
              title: 'Product builder',
              summary: 'Learned to turn messy workflows into simple systems.',
              lessons: ['clarity compounds'],
            },
          ],
          domainExpertise: [{ value: 'workflow design' }],
        },
        relationships: [
          {
            id: 'investor-a',
            label: 'Investor A',
            role: 'trusted sounding board',
            audience: 'investors',
            trustLevel: 'trusted',
            communicationPreferences: ['lead with the decision and evidence'],
          },
        ],
        relational: {
          trustSignals: [{ value: 'show the actual evidence' }],
          trustBreakers: [{ value: 'performative certainty' }],
          calmingFactors: [{ value: 'name what is known and unknown' }],
          repairProtocol: ['acknowledge the miss, then state the correction'],
        },
        boundaries: {
          mustAsk: ['before making a public commitment'],
          neverInfer: ['private health or family information'],
          consentRules: ['do not turn a draft into a commitment'],
        },
        persona: {
          greetingStyle: 'contextual',
          signoffStyle: 'brief',
          sentenceRhythm: 'conversational',
          useContractions: true,
          askStyle: 'one_question_at_a_time',
          explainWith: 'evidence',
          formattingPreferences: ['Use a short recommendation before detail'],
          modes: [
            {
              id: 'investor-mode',
              audience: 'investors',
              tone: 'formal',
              directness: 0.95,
              leadWith: 'recommendation',
              preferredPhrases: ['Here is the evidence'],
            },
          ],
        },
        decision: {
          northStars: ['durable trust'],
          defaultStance: 'cautious',
          heuristics: ['prefer reversible experiments'],
          decisionProcess: [
            'state the tradeoff',
            'choose the smallest useful test',
          ],
          redLines: ['misleading claims'],
        },
        behavior: {
          refusalStyle: 'offer_safe_alternative',
          preserveHumanVoice: true,
        },
        tone: 'calm',
        directness: 0.9,
        verbosity: 'concise',
        whenUncertain: 'state_uncertainty',
        whenDisagreeing: 'surface_tradeoff',
        whenWrong: 'explain_correction',
        responsePrinciples: ['Be useful before being impressive'],
        neverClaim: ['certainty without evidence'],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.json().modelVersion).toBeGreaterThan(1);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        task: 'Help me decide what to prioritize this week',
        audience: 'investors',
      },
    });
    const packet = response.json().packet;
    expect(packet.schemaVersion).toBe('3');
    expect(packet.humanModel.version).toBe(onboarding.json().modelVersion);
    expect(packet.humanModel.identity.preferredName).toBe('Alex');
    expect(packet.humanModel.identity.selfDescription).toContain(
      'patient builder',
    );
    expect(packet.humanModel.identity.identityMarkers).toHaveLength(0);
    expect(packet.redactions).toContain('humanModel.identity.identityMarkers');
    expect(packet.grounding.instructions).toContain(
      'Sensitive profile facts were withheld because this delegation does not include sensitive_context_read',
    );
    expect(packet.humanModel.selfConcept.valuesHierarchy[0].value).toBe(
      'trust',
    );
    expect(packet.humanModel.biography.currentChapter).toBe(
      'Finding repeatable distribution.',
    );
    expect(packet.humanModel.relationships[0].trustLevel).toBe('trusted');
    expect(packet.humanModel.boundaries.neverInfer).toContain(
      'private health or family information',
    );
    expect(packet.responseGuidance.audienceMode).toBe('investor-mode');
    expect(packet.responseGuidance.relationshipId).toBe('investor-a');
    expect(packet.responseGuidance.relationshipGuidance).toContain(
      'Relationship role: trusted sounding board',
    );
    expect(packet.responseGuidance.style).toContain('Use a formal tone');
    expect(packet.responseGuidance.relationshipGuidance).toContain(
      'Build trust through: show the actual evidence',
    );
    expect(packet.responseGuidance.emotionalGuidance).toContain(
      'When tension is high, use: name what is known and unknown',
    );
    expect(packet.responseGuidance.decisionGuidance).toContain(
      'prefer reversible experiments',
    );
    expect(packet.responseGuidance.refusalStyle).toBe('offer_safe_alternative');
    expect(packet.responseGuidance.preserveHumanVoice).toBe(true);
    expect(packet.responseGuidance.style).toContain(
      'Lead with the point and avoid unnecessary hedging',
    );
    expect(packet.responseGuidance.prioritize).toContain(
      'Be useful before being impressive',
    );
    expect(packet.responseGuidance.avoid).toContain(
      'Never claim: certainty without evidence',
    );
    expect(packet.responseGuidance.whenUncertain).toBe('state_uncertainty');
    expect(packet.grounding.instructions).toContain(
      'Do not present inferred memories as facts',
    );
  });

  it('preserves conversation continuity and exposes signed packets', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        title: 'Positioning thread',
        summary: 'We are narrowing the message for HR leaders.',
        activeTopic: 'positioning',
        openLoops: ['Choose the strongest proof point'],
      },
    });
    expect(created.statusCode).toBe(200);
    const conversation = created.json();

    await app.inject({
      method: 'POST',
      url: `/v1/conversations/${conversation.id}/turns`,
      headers: { authorization: `Bearer ${humanToken}` },
      payload: { content: 'I want a sharper and calmer message.' },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/conversations/${conversation.id}/turns`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { content: 'I will compare the strongest proof points.' },
    });

    const context = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: {
        task: 'Continue the positioning discussion',
        conversationId: conversation.id,
        taskMetadata: { source: 'host-agent', urgency: 'normal' },
      },
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().packet.interaction.summary).toContain(
      'narrowing the message',
    );
    expect(context.json().packet.interaction.recentTurns).toHaveLength(2);
    expect(context.json().packet.interaction.openLoops).toContain(
      'Choose the strongest proof point',
    );
    expect(context.json().packet.interaction.taskMetadata).toEqual({
      source: 'host-agent',
      urgency: 'normal',
    });

    const inspected = await app.inject({
      method: 'GET',
      url: `/v1/context/${context.json().packetId}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(inspected.statusCode).toBe(200);
    expect(inspected.json().expired).toBe(false);
    expect(inspected.json().signature).toBe(context.json().signature);
  });

  it('turns human context feedback into confirmed correction memory', async () => {
    const context = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Draft a response to a partner' },
    });
    const packet = context.json();
    const feedback = await app.inject({
      method: 'POST',
      url: '/v1/context/feedback',
      headers: { authorization: `Bearer ${humanToken}` },
      payload: {
        contextPacketId: packet.packetId,
        rating: 'mixed',
        correction: 'Never use the phrase strategic partnership.',
        whatToChange: 'Use plain language instead of corporate language.',
      },
    });
    expect(feedback.statusCode).toBe(200);
    expect(feedback.json().memoryId).toBeTypeOf('string');

    const next = await app.inject({
      method: 'POST',
      url: '/v1/context',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { task: 'Draft a response to a partner' },
    });
    expect(next.json().packet.memory.corrections).toContain(
      'Never use the phrase strategic partnership.',
    );
    expect(next.json().packet.memory.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confirmation: 'user_confirmed',
          priority: 100,
        }),
      ]),
    );
  });
});
