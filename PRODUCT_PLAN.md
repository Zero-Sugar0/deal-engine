# DEAL Product Plan

## Vision

DEAL is the human-context engine for AI agents. It lets any agent understand who it is acting for, what that person values, what it is allowed to do, and how a competent human would handle the situation.

## Problem

Current agents receive a prompt and tools. They lack durable human context, identity, boundaries, professional judgment, and continuity across agent runtimes.

## Solution

DEAL exposes a Context API and MCP server. Agents request a scoped Human Context Packet before responding or acting. DEAL compiles identity, persona, memory provenance, decision style, behavioral contract, conversation continuity, and response guidance into that packet.

## Target users

1. Agent developers building personal or business agents
2. Non-technical users who want agents to act safely on their behalf
3. Teams deploying agents across internal tools
4. Agent platforms seeking portable human context

## Wedge

Start with one expert profile: **Growth Operator**.

A user defines their human model and the existing agent receives the context needed to understand, respond, decide, and maintain continuity. The agent’s own runtime remains responsible for tools and external systems.

## Product principles

1. The user owns their human context.
2. Agents receive the minimum context needed.
3. Consequential actions require explicit authority.
4. Every meaningful action is auditable.
5. Memory must be correctable and forgettable.
6. DEAL is agent-agnostic.
7. Judgment is explicit, testable, and versioned.
8. The host agent owns tools; DEAL owns human understanding.

## Roadmap

### Phase 0 — Foundations (Weeks 1–2)

- Define DEAL schema v0
- Build Postgres data model
- Implement authentication and namespaces
- Create Context Packet contract

### Phase 1 — Memory and Human Model (Weeks 3–5)

- Onboarding interview
- Persona Compiler v0
- Semantic memory adapter
- Structured preference and correction storage
- Behavioral contract and response guidance
- Conversation continuity and context feedback
- User dashboard for viewing/editing memory

### Phase 2 — Identity and Policy (Weeks 6–8)

- Agent registration
- Delegated identity and scoped tokens
- Policy engine: allow, approve, escalate, deny
- Approval inbox
- Audit trail

### Phase 3 — Agent Context Integration (Weeks 9–11)

- TypeScript SDK
- Python SDK
- MCP server
- Claude Code / Cursor / Codex context examples
- Context Packet signing

### Phase 4 — Expert Profiles (Weeks 12–16)

- Growth Operator profile
- Playbook templates
- Evaluation scenarios
- Outcome feedback loop
- Public SDK launch

## Success metrics

- Context Packet p95 latency under 300 ms
- Agent task completion rate
- Reduction in repeated clarification questions
- Percentage of consequential actions correctly gated
- User correction rate
- Cross-agent retention: same human context used by 2+ agent runtimes
- Developer time to first successful integration under 15 minutes
