import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { MemoryRecord } from '@deal/core';
import {
  DealStore,
  type Agent,
  type Approval,
  type AuditEvent,
  type ContextRecord,
  type ContextFeedback,
  type Conversation,
  type ConversationTurn,
  type Credential,
  type Delegation,
  type Human,
  type WorkflowRun,
} from './store.js';

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export class PostgresDealStore extends DealStore {
  readonly pool: Pool;
  override ready: Promise<void>;

  constructor(connectionString: string) {
    super();
    this.pool = new Pool({ connectionString, max: 10 });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const configuredPath = process.env.DEAL_MIGRATION_PATH;
    const migrationPath =
      configuredPath ??
      path.join(process.cwd(), 'infra/db/migrations/001_initial.sql');
    let migration: string;
    try {
      migration = await readFile(migrationPath, 'utf8');
    } catch (cause) {
      if (configuredPath) throw cause;
      migration = await readFile(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          '../../../infra/db/migrations/001_initial.sql',
        ),
        'utf8',
      );
    }
    await this.pool.query(migration);
    await this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const [
      humans,
      agents,
      delegations,
      credentials,
      contexts,
      approvals,
      audits,
      memories,
      workflows,
      conversations,
      conversationTurns,
      feedback,
    ] = await Promise.all([
      this.pool.query(
        'SELECT id, email, display_name, organization_id, role, identity, persona, self_concept, biography, relationships, relational, boundaries, domain, decision, behavior, current_priorities, known_constraints, model_version, judgment FROM humans',
      ),
      this.pool.query(
        'SELECT id, name, runtime, owner_human_id, status FROM agents',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, purpose, authority, policy_rules, profile_id, expires_at, revoked_at FROM delegations',
      ),
      this.pool.query(
        'SELECT id, token_hash, kind, human_id, agent_id, expires_at, revoked_at FROM credentials',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, packet, signature, created_at FROM context_packets',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, context_packet_id, action, summary, payload, payload_hash, status, created_at, decided_at, decided_by, consumed_at, policy_result FROM approvals',
      ),
      this.pool.query(
        'SELECT id, human_id, organization_id, agent_id, event_type, payload, occurred_at FROM audit_events ORDER BY occurred_at ASC',
      ),
      this.pool.query(
        'SELECT id, human_id, organization_id, kind, content, confidence, source, confirmation, priority, sensitivity, external_ref, valid_from, valid_until, superseded_by, created_at FROM memory_records WHERE forgotten_at IS NULL',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, profile_id, goal, current_step, context_packet_id, data, created_at, updated_at FROM workflow_runs',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, title, channel, audience, summary, active_topic, open_loops, created_at, updated_at FROM conversations',
      ),
      this.pool.query(
        'SELECT id, conversation_id, role, content, metadata, created_at FROM conversation_turns ORDER BY created_at ASC',
      ),
      this.pool.query(
        'SELECT id, human_id, agent_id, context_packet_id, rating, correction, what_worked, what_to_change, created_at FROM context_feedback ORDER BY created_at ASC',
      ),
    ]);

    for (const row of humans.rows) {
      const human: Human = {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        organizationId: row.organization_id,
        role: row.role ?? '',
        identity: row.identity ?? {},
        persona: row.persona ?? {},
        selfConcept: row.self_concept ?? {},
        biography: row.biography ?? {},
        relationships: row.relationships ?? [],
        relational: row.relational ?? {},
        boundaries: row.boundaries ?? {},
        domain: row.domain ?? {},
        decision: row.decision ?? {},
        behavior: row.behavior ?? {},
        currentPriorities: row.current_priorities ?? [],
        knownConstraints: row.known_constraints ?? [],
        modelVersion: Number(row.model_version ?? 1),
        judgment: row.judgment ?? {},
      };
      this.humans.set(human.id, human);
    }
    for (const row of agents.rows) {
      const agent: Agent = {
        id: row.id,
        name: row.name,
        runtime: row.runtime,
        ownerHumanId: row.owner_human_id,
        status: row.status,
      };
      this.agents.set(agent.id, agent);
    }
    for (const row of delegations.rows) {
      const delegation: Delegation = {
        id: row.id,
        humanId: row.human_id,
        agentId: row.agent_id,
        purpose: row.purpose,
        authority: row.authority ?? {},
        policyRules: row.policy_rules ?? [],
        profileId: row.profile_id ?? undefined,
        expiresAt: iso(row.expires_at),
        revokedAt: iso(row.revoked_at),
      };
      this.delegations.set(delegation.id, delegation);
    }
    for (const row of credentials.rows) {
      const credential: Credential = {
        id: row.id,
        tokenHash: row.token_hash,
        kind: row.kind,
        humanId: row.human_id,
        agentId: row.agent_id ?? undefined,
        expiresAt: iso(row.expires_at),
        revokedAt: iso(row.revoked_at),
      };
      this.credentials.set(credential.id, credential);
    }
    for (const row of contexts.rows) {
      const context: ContextRecord = {
        packet: row.packet,
        signature: row.signature,
        humanId: row.human_id,
        agentId: row.agent_id,
        createdAt: iso(row.created_at)!,
      };
      this.contexts.set(context.packet.packetId, context);
    }
    for (const row of approvals.rows) {
      const approval: Approval = {
        id: row.id,
        humanId: row.human_id,
        agentId: row.agent_id,
        contextPacketId: row.context_packet_id,
        action: row.action,
        summary: row.summary,
        payload: row.payload,
        payloadHash: row.payload_hash,
        status: row.status,
        createdAt: iso(row.created_at)!,
        decidedAt: iso(row.decided_at),
        decidedBy: row.decided_by ?? undefined,
        consumedAt: iso(row.consumed_at),
        policyResult: row.policy_result ?? undefined,
      };
      this.approvals.set(approval.id, approval);
    }
    for (const row of audits.rows) {
      const audit: AuditEvent = {
        id: row.id,
        humanId: row.human_id,
        organizationId: row.organization_id,
        agentId: row.agent_id ?? undefined,
        eventType: row.event_type,
        payload: row.payload ?? {},
        occurredAt: iso(row.occurred_at)!,
      };
      this.audits.push(audit);
    }
    for (const row of memories.rows) {
      const memory: MemoryRecord = {
        id: row.id,
        humanId: row.human_id,
        organizationId: row.organization_id,
        kind: row.kind,
        content: row.content,
        confidence:
          row.confidence === null ? undefined : Number(row.confidence),
        source: row.source ?? undefined,
        confirmation:
          row.confirmation ??
          (row.source === 'user_confirmed' ? 'user_confirmed' : undefined),
        priority: row.priority === null ? undefined : Number(row.priority),
        sensitivity: row.sensitivity ?? undefined,
        externalRef: row.external_ref ?? undefined,
        validFrom: iso(row.valid_from),
        validUntil: iso(row.valid_until),
        supersededBy: row.superseded_by ?? undefined,
        createdAt: iso(row.created_at)!,
      };
      this.memories.load(memory);
    }
    for (const row of workflows.rows) {
      const workflow: WorkflowRun = {
        id: row.id,
        humanId: row.human_id,
        agentId: row.agent_id,
        profileId: row.profile_id,
        goal: row.goal,
        currentStep: row.current_step,
        contextPacketId: row.context_packet_id ?? undefined,
        data: row.data ?? {},
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!,
      };
      this.workflows.set(workflow.id, workflow);
    }
    for (const row of conversations.rows) {
      const conversation: Conversation = {
        id: row.id,
        humanId: row.human_id,
        agentId: row.agent_id,
        title: row.title ?? undefined,
        channel: row.channel ?? undefined,
        audience: row.audience ?? undefined,
        summary: row.summary ?? undefined,
        activeTopic: row.active_topic ?? undefined,
        openLoops: row.open_loops ?? [],
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!,
      };
      this.conversations.set(conversation.id, conversation);
    }
    for (const row of conversationTurns.rows) {
      const turn: ConversationTurn = {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        metadata: row.metadata ?? {},
        createdAt: iso(row.created_at)!,
      };
      const turns = this.conversationTurns.get(turn.conversationId) ?? [];
      turns.push(turn);
      this.conversationTurns.set(turn.conversationId, turns);
    }
    for (const row of feedback.rows) {
      const item: ContextFeedback = {
        id: row.id,
        humanId: row.human_id,
        agentId: row.agent_id,
        contextPacketId: row.context_packet_id,
        rating: row.rating,
        correction: row.correction ?? undefined,
        whatWorked: row.what_worked ?? undefined,
        whatToChange: row.what_to_change ?? undefined,
        createdAt: iso(row.created_at)!,
      };
      this.feedback.set(item.id, item);
    }
  }

  override async persist(): Promise<void> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const human of this.humans.values()) {
        await client.query(
          'INSERT INTO organizations(id, name) VALUES($1, $2) ON CONFLICT (id) DO NOTHING',
          [
            human.organizationId,
            human.organizationId === 'org_demo'
              ? 'Demo Organization'
              : human.displayName,
          ],
        );
        await client.query(
          `INSERT INTO humans(id, email, display_name, organization_id, role, identity, persona, self_concept, biography, relationships, relational, boundaries, domain, decision, behavior, current_priorities, known_constraints, model_version, judgment) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19::jsonb) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, role=EXCLUDED.role, identity=EXCLUDED.identity, persona=EXCLUDED.persona, self_concept=EXCLUDED.self_concept, biography=EXCLUDED.biography, relationships=EXCLUDED.relationships, relational=EXCLUDED.relational, boundaries=EXCLUDED.boundaries, domain=EXCLUDED.domain, decision=EXCLUDED.decision, behavior=EXCLUDED.behavior, current_priorities=EXCLUDED.current_priorities, known_constraints=EXCLUDED.known_constraints, model_version=EXCLUDED.model_version, judgment=EXCLUDED.judgment`,
          [
            human.id,
            human.email,
            human.displayName,
            human.organizationId,
            human.role,
            json(human.identity),
            json(human.persona),
            json(human.selfConcept),
            json(human.biography),
            json(human.relationships),
            json(human.relational),
            json(human.boundaries),
            json(human.domain),
            json(human.decision),
            json(human.behavior),
            json(human.currentPriorities),
            json(human.knownConstraints),
            human.modelVersion,
            json(human.judgment),
          ],
        );
      }
      for (const agent of this.agents.values()) {
        const human = this.humans.get(agent.ownerHumanId)!;
        await client.query(
          `INSERT INTO agents(id, organization_id, owner_human_id, name, runtime, status) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, runtime=EXCLUDED.runtime, status=EXCLUDED.status`,
          [
            agent.id,
            human.organizationId,
            agent.ownerHumanId,
            agent.name,
            agent.runtime,
            agent.status,
          ],
        );
      }
      for (const delegation of this.delegations.values()) {
        const human = this.humans.get(delegation.humanId)!;
        await client.query(
          `INSERT INTO delegations(id, organization_id, human_id, agent_id, purpose, authority, policy_rules, profile_id, expires_at, revoked_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET purpose=EXCLUDED.purpose, authority=EXCLUDED.authority, policy_rules=EXCLUDED.policy_rules, profile_id=EXCLUDED.profile_id, expires_at=EXCLUDED.expires_at, revoked_at=EXCLUDED.revoked_at`,
          [
            delegation.id,
            human.organizationId,
            delegation.humanId,
            delegation.agentId,
            delegation.purpose,
            json(delegation.authority),
            json(delegation.policyRules),
            delegation.profileId ?? null,
            delegation.expiresAt ?? null,
            delegation.revokedAt ?? null,
          ],
        );
      }
      for (const credential of this.credentials.values()) {
        const human = this.humans.get(credential.humanId)!;
        await client.query(
          `INSERT INTO credentials(id, organization_id, token_hash, kind, human_id, agent_id, expires_at, revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET expires_at=EXCLUDED.expires_at, revoked_at=EXCLUDED.revoked_at`,
          [
            credential.id,
            human.organizationId,
            credential.tokenHash,
            credential.kind,
            credential.humanId,
            credential.agentId ?? null,
            credential.expiresAt ?? null,
            credential.revokedAt ?? null,
          ],
        );
      }
      for (const memory of this.memories.all) {
        const human = this.humans.get(memory.humanId)!;
        await client.query(
          `INSERT INTO memory_records(id, organization_id, human_id, kind, content, confidence, source, confirmation, priority, sensitivity, external_ref, valid_from, valid_until, superseded_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind, content=EXCLUDED.content, confidence=EXCLUDED.confidence, source=EXCLUDED.source, confirmation=EXCLUDED.confirmation, priority=EXCLUDED.priority, sensitivity=EXCLUDED.sensitivity, external_ref=EXCLUDED.external_ref, valid_from=EXCLUDED.valid_from, valid_until=EXCLUDED.valid_until, superseded_by=EXCLUDED.superseded_by`,
          [
            memory.id,
            human.organizationId,
            memory.humanId,
            memory.kind,
            json(memory.content),
            memory.confidence ?? null,
            memory.source ?? null,
            memory.confirmation ?? null,
            memory.priority ?? 50,
            memory.sensitivity ?? 'normal',
            memory.externalRef ?? null,
            memory.validFrom ?? null,
            memory.validUntil ?? null,
            memory.supersededBy ?? null,
          ],
        );
      }
      for (const memory of this.memories.all) {
        if (
          memory.supersededBy &&
          !this.forgottenMemoryIds.has(memory.id) &&
          !this.forgottenMemoryIds.has(memory.supersededBy)
        )
          await client.query(
            'UPDATE memory_records SET superseded_by = $1 WHERE id = $2',
            [memory.supersededBy, memory.id],
          );
      }
      for (const id of this.forgottenMemoryIds) {
        await client.query(
          'UPDATE memory_records SET superseded_by = NULL WHERE superseded_by = $1',
          [id],
        );
        await client.query('DELETE FROM memory_records WHERE id = $1', [id]);
      }
      for (const context of this.contexts.values()) {
        const human = this.humans.get(context.humanId)!;
        const delegation = this.getDelegationForAgent(
          context.agentId,
          context.humanId,
        );
        if (!delegation) continue;
        await client.query(
          `INSERT INTO context_packets(id, organization_id, human_id, agent_id, delegation_id, task_hash, packet, signature, expires_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [
            context.packet.packetId,
            human.organizationId,
            context.humanId,
            context.agentId,
            delegation.id,
            context.packet.taskHash,
            json(context.packet),
            context.signature,
            context.packet.expiresAt,
          ],
        );
      }
      for (const approval of this.approvals.values()) {
        const human = this.humans.get(approval.humanId)!;
        await client.query(
          `INSERT INTO approvals(id, organization_id, human_id, agent_id, context_packet_id, action, summary, payload, payload_hash, status, decided_by, decided_at, consumed_at, policy_result) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at, consumed_at=EXCLUDED.consumed_at, policy_result=EXCLUDED.policy_result`,
          [
            approval.id,
            human.organizationId,
            approval.humanId,
            approval.agentId,
            approval.contextPacketId,
            approval.action,
            approval.summary,
            json(approval.payload),
            approval.payloadHash,
            approval.status,
            approval.decidedBy ?? null,
            approval.decidedAt ?? null,
            approval.consumedAt ?? null,
            approval.policyResult ? json(approval.policyResult) : null,
          ],
        );
      }
      for (const workflow of this.workflows.values()) {
        const human = this.humans.get(workflow.humanId)!;
        await client.query(
          `INSERT INTO workflow_runs(id, organization_id, human_id, agent_id, profile_id, goal, current_step, context_packet_id, data)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
           ON CONFLICT(id) DO UPDATE SET current_step=EXCLUDED.current_step, context_packet_id=EXCLUDED.context_packet_id, data=EXCLUDED.data, updated_at=now()`,
          [
            workflow.id,
            human.organizationId,
            workflow.humanId,
            workflow.agentId,
            workflow.profileId,
            workflow.goal,
            workflow.currentStep,
            workflow.contextPacketId ?? null,
            json(workflow.data),
          ],
        );
      }
      for (const conversation of this.conversations.values()) {
        const human = this.humans.get(conversation.humanId)!;
        await client.query(
          `INSERT INTO conversations(id, organization_id, human_id, agent_id, title, channel, audience, summary, active_topic, open_loops) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title, channel=EXCLUDED.channel, audience=EXCLUDED.audience, summary=EXCLUDED.summary, active_topic=EXCLUDED.active_topic, open_loops=EXCLUDED.open_loops, updated_at=now()`,
          [
            conversation.id,
            human.organizationId,
            conversation.humanId,
            conversation.agentId,
            conversation.title ?? null,
            conversation.channel ?? null,
            conversation.audience ?? null,
            conversation.summary ?? null,
            conversation.activeTopic ?? null,
            json(conversation.openLoops),
          ],
        );
      }
      for (const turns of this.conversationTurns.values()) {
        for (const turn of turns) {
          const conversation = this.conversations.get(turn.conversationId);
          if (!conversation) continue;
          const human = this.humans.get(conversation.humanId)!;
          await client.query(
            `INSERT INTO conversation_turns(id, organization_id, conversation_id, role, content, metadata, created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, metadata=EXCLUDED.metadata`,
            [
              turn.id,
              human.organizationId,
              turn.conversationId,
              turn.role,
              turn.content,
              json(turn.metadata),
              turn.createdAt,
            ],
          );
        }
      }
      for (const item of this.feedback.values()) {
        const human = this.humans.get(item.humanId)!;
        await client.query(
          `INSERT INTO context_feedback(id, organization_id, human_id, agent_id, context_packet_id, rating, correction, what_worked, what_to_change, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET rating=EXCLUDED.rating, correction=EXCLUDED.correction, what_worked=EXCLUDED.what_worked, what_to_change=EXCLUDED.what_to_change`,
          [
            item.id,
            human.organizationId,
            item.humanId,
            item.agentId,
            item.contextPacketId,
            item.rating,
            item.correction ?? null,
            item.whatWorked ?? null,
            item.whatToChange ?? null,
            item.createdAt,
          ],
        );
      }
      for (const audit of this.audits) {
        await client.query(
          `INSERT INTO audit_events(id, organization_id, human_id, agent_id, event_type, payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING`,
          [
            audit.id,
            audit.organizationId,
            audit.humanId,
            audit.agentId ?? null,
            audit.eventType,
            json(audit.payload),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  }

  override async seedDemo(
    agentToken: string,
    humanToken: string,
  ): Promise<void> {
    await this.ready;
    if (this.humans.size) {
      for (const delegation of this.delegations.values()) {
        if (
          delegation.profileId === 'growth_operator_v1' &&
          !delegation.authority.mayWrite.includes('memory_write')
        )
          delegation.authority.mayWrite.push('memory_write');
      }
      await this.persist();
      return;
    }
    const humanId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const delegationId = crypto.randomUUID();
    const human: Human = {
      id: humanId,
      email: 'founder@example.com',
      displayName: 'Demo Founder',
      organizationId,
      role: 'Founder',
      identity: {
        preferredName: 'Founder',
        mission: 'Build a durable, trusted company',
        organization: 'Demo Organization',
        locale: 'en',
        timezone: 'UTC',
        languages: [],
        identityMarkers: [],
        affiliations: [],
        accessibilityNeeds: [],
      },
      persona: {
        displayName: 'Demo Founder',
        role: 'Founder',
        communicationStyle: 'direct, concise, evidence-led',
        directness: 0.85,
        warmth: 0.45,
        verbosity: 'concise',
        structure: 'mixed',
        tone: 'direct',
        preferredPhrases: [],
        avoidedPhrases: ['hype', 'vague promises'],
        values: ['quality', 'privacy', 'qualified meetings over volume'],
        riskTolerance: 'low',
        language: 'en',
        formattingPreferences: [
          'Use short paragraphs',
          'Use bullets for multiple options',
        ],
        examples: [],
        modes: [],
      },
      selfConcept: {
        summary:
          'A careful builder who values durable trust over performative growth.',
        identityStatements: [
          {
            value: 'I am a founder who prefers substance over status.',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        strengths: [
          {
            value: 'evidence-led judgment',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        growthEdges: [],
        aspirations: [],
        fears: [],
        nonNegotiables: [
          {
            value: 'do not trade trust for short-term metrics',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        valuesHierarchy: [
          { value: 'quality', priority: 100 },
          { value: 'privacy', priority: 95 },
          { value: 'durable trust', priority: 90 },
        ],
        howTheyDescribeThemselves: ['direct', 'careful', 'evidence-led'],
      },
      biography: {
        summary: 'Founder building a durable B2B company.',
        currentChapter:
          'Turning early traction into a trusted operating system.',
        formativeExperiences: [],
        careerArc: [],
        places: [],
        languages: [],
        domainExpertise: [],
        lifeContext: [],
      },
      relationships: [],
      relational: {
        trustSignals: [],
        trustBreakers: [
          {
            value: 'hype or unsupported certainty',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        calmingFactors: [
          {
            value: 'a clear summary followed by evidence and options',
            confirmation: 'user_confirmed',
            confidence: 1,
            sensitivity: 'normal',
            tags: [],
          },
        ],
        frustrationTriggers: [],
        sensitiveTopics: [],
        acknowledgmentPreferences: [
          'acknowledge the tradeoff before recommending a path',
        ],
        encouragementPreferences: [],
        conflictPreferences: [
          'challenge the reasoning respectfully and concretely',
        ],
        repairProtocol: [
          'admit the mistake, state what changed, and propose the correction',
        ],
        emotionalContextNotes: [],
      },
      boundaries: {
        neverAssume: [
          'consent to a consequential action',
          'certainty from an inference',
        ],
        mustAsk: [
          'before an external commitment',
          'when a material ambiguity remains',
        ],
        neverMention: [],
        neverInfer: ['sensitive identity attributes'],
        sensitiveTopics: [],
        consentRules: [
          'explicit approval is required for consequential commitments',
        ],
        protectedAttributes: [],
        privacyPreferences: [
          'minimize personal detail unless it improves the task',
        ],
      },
      domain: {
        business: 'B2B HR SaaS',
        icp: 'HR leaders at US companies with 50-500 employees',
        offer: 'A workflow platform that reduces manual HR operations',
        exclusions: ['agencies', 'current customers', 'suppressed contacts'],
        goals: ['book qualified meetings', 'improve reply quality'],
        terminology: {
          qualifiedMeeting: 'A meeting with an ICP decision-maker',
        },
      },
      decision: {
        priorities: ['quality', 'privacy', 'qualified meetings over volume'],
        tradeoffs: ['prefer durable trust over short-term growth'],
        riskTolerance: 'low',
        reversibilityPreference: 'reversible_first',
        asksBeforeCommitment: ['external commitments', 'mass communication'],
        confidenceFloor: 0.7,
        northStars: ['durable trust', 'qualified outcomes'],
        timeHorizon: 'multi_year',
        defaultStance: 'cautious',
        evidenceThreshold: 0.7,
        decisionProcess: [
          'state the tradeoff',
          'prefer reversible tests',
          'review evidence',
        ],
        autonomyPreferences: ['draft freely', 'ask before commitment'],
        escalationTriggers: [
          'legal or reputational exposure',
          'material ambiguity',
        ],
        redLines: ['deception', 'unauthorized use of personal data'],
        heuristics: ['quality over volume', 'trust compounds'],
        examples: [],
      },
      behavior: {
        relationship: 'representative',
        speakAs: 'representative',
        discloseAgentIdentity: true,
        whenUncertain: 'ask',
        whenDisagreeing: 'challenge_respectfully',
        whenWrong: 'admit_and_correct',
        askBefore: [
          'crossing a stated boundary',
          'making a consequential commitment',
        ],
        neverClaim: [
          'work not performed',
          'certainty not supported by evidence',
        ],
        neverDo: [
          'use hype',
          'repeat a rejected approach without new evidence',
        ],
        responsePrinciples: [
          'be direct, concise, and evidence-led',
          'preserve the founder’s priorities',
        ],
        refusalStyle: 'offer_safe_alternative',
        preserveHumanVoice: true,
        neverImpersonate: true,
      },
      currentPriorities: ['book qualified meetings', 'improve reply quality'],
      knownConstraints: [
        'agencies',
        'current customers',
        'suppressed contacts',
      ],
      modelVersion: 1,
      judgment: {
        askIfMissing: ['audience', 'goal', 'tone'],
        escalateIf: ['legal claim', 'financial commitment', 'mass send'],
        refuseIf: ['deceptive outreach', 'unauthorized data use'],
        confidenceThreshold: 0.7,
      },
    };
    const agent: Agent = {
      id: agentId,
      name: 'Demo Growth Agent',
      runtime: 'mcp',
      ownerHumanId: humanId,
      status: 'active',
    };
    const delegation: Delegation = {
      id: delegationId,
      humanId,
      agentId,
      purpose: 'Run bounded Growth Operator workflows',
      authority: {
        mayRead: ['context_read', 'memory_read'],
        mayDraft: ['response_draft'],
        mayWrite: ['memory_write', 'external_commitment'],
        requiresApproval: ['external_commitment'],
      },
      policyRules: [
        {
          id: 'large_external_commitment',
          action: 'external_commitment',
          recipientCountGt: 50,
          decision: 'require_approval',
          reason: 'Large external commitments require explicit approval',
        },
      ],
      profileId: 'growth_operator_v1',
    };
    this.humans.set(human.id, human);
    this.agents.set(agent.id, agent);
    this.delegations.set(delegation.id, delegation);
    this.issueCredential({ kind: 'agent', humanId, agentId }, agentToken);
    this.issueCredential({ kind: 'human', humanId }, humanToken);
    await this.memories.add({
      humanId,
      organizationId,
      kind: 'preference',
      content: 'Prefer concise, direct messaging with evidence over hype',
      source: 'user_confirmed',
      confirmation: 'user_confirmed',
      priority: 90,
    });
    await this.memories.add({
      humanId,
      organizationId,
      kind: 'correction',
      content: 'Never target agencies or current customers',
      source: 'user_confirmed',
      confirmation: 'user_confirmed',
      priority: 100,
    });
    await this.persist();
  }

  override async close(): Promise<void> {
    await this.ready.catch(() => undefined);
    await this.pool.end();
  }
}
