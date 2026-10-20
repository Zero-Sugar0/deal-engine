// DEAL canonical schema types (TypeScript)

export type PolicyDecision =
  | "allow"
  | "allow_with_redaction"
  | "require_approval"
  | "escalate"
  | "deny";

export interface HumanIdentity {
  humanId: string;
  organizationId?: string;
  displayName?: string;
  role?: string;
}

export interface Persona {
  communicationStyle?: string;
  values?: string[];
  riskTolerance?: "low" | "medium" | "high";
  workingHours?: string;
  language?: string;
}

export interface DomainContext {
  business?: string;
  icp?: string;
  exclusions?: string[];
  goals?: string[];
  terminology?: Record<string, string>;
}

export interface MemoryContext {
  preferences?: string[];
  corrections?: string[];
  episodes?: string[];
  outcomes?: Record<string, unknown>[];
}

export interface Authority {
  mayRead?: string[];
  mayWrite?: string[];
  mayDraft?: string[];
  requiresApproval?: string[];
  spendLimitUsd?: number;
  expiresAt?: string;
}

export interface JudgmentRules {
  askIfMissing?: string[];
  escalateIf?: string[];
  refuseIf?: string[];
  confidenceThreshold?: number;
}

export interface HumanContextPacket {
  packetId: string;
  issuedAt: string;
  expiresAt: string;
  principal: HumanIdentity;
  agent: {
    agentId: string;
    runtime: string;
    delegationId: string;
  };
  persona: Persona;
  domain: DomainContext;
  memory: MemoryContext;
  authority: Authority;
  judgment: JudgmentRules;
}
