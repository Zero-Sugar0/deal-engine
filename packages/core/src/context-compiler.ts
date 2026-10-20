import type {
  HumanContextPacket,
  Persona,
  DomainContext,
  MemoryContext,
  Authority,
  JudgmentRules
} from "./schema";

export interface CompileContextInput {
  human: { id: string; organizationId?: string };
  agent: { id: string; runtime: string; delegationId: string };
  task: string;
  persona: Persona;
  domain: DomainContext;
  memory: MemoryContext;
  authority: Authority;
  judgment: JudgmentRules;
}

export function compileHumanContextPacket(
  input: CompileContextInput
): HumanContextPacket {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  return {
    packetId: crypto.randomUUID(),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    principal: {
      humanId: input.human.id,
      organizationId: input.human.organizationId
    },
    agent: {
      agentId: input.agent.id,
      runtime: input.agent.runtime,
      delegationId: input.agent.delegationId
    },
    persona: input.persona,
    domain: input.domain,
    memory: input.memory,
    authority: input.authority,
    judgment: input.judgment
  };
}
