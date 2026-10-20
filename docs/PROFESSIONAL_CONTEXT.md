# Professional context

DEAL does not try to make an agent “know every profession” by putting a giant
prompt in front of a model. It composes a reusable professional operating
model with the person’s own verified experience, preferences, boundaries, and
current situation.

```text
human core
  + selected profession profile
  + organization and jurisdiction
  + verified professional facts
  + relevant memories and corrections
  + current relationship and conversation
  + delegation authority
  = signed professional context packet
```

The catalog currently covers 17 occupational families and a broad seed set of
roles including founders, chiefs of staff, product and operations leaders,
finance professionals, healthcare roles, legal and compliance roles,
engineering and security roles, researchers, educators, people operations,
sales, marketing, creative work, public service, social services, construction,
logistics, hospitality, and agriculture/environmental work.

The catalog is a baseline. It is not proof that a person holds a credential,
has a license, or behaves exactly like a generic professional in that role.
Human-confirmed facts and explicit corrections always outrank the catalog.

## Select a professional operating model

The human or organization selects a `profileId` on a delegation. The same
person may have several agents with different professional scopes:

```http
POST /v1/delegations
Authorization: Bearer <human-token>
Content-Type: application/json

{
  "agentId": "agent_123",
  "purpose": "Organize personal finances",
  "profileId": "personal_finance_organizer_v1",
  "authority": {
    "mayRead": ["context_read", "memory_read"],
    "mayDraft": ["response_draft"],
    "mayWrite": ["memory_write"],
    "requiresApproval": []
  }
}
```

The context compiler then adds the selected profile’s responsibilities,
knowledge areas, operating patterns, failure modes, escalation triggers,
sensitive data classes, safety boundaries, restricted actions, and approval
actions to the packet. A delegation
profile takes precedence over a general `domain.profession` field.

## Person-specific facts

The human profile supplies the facts that make the professional context real:

```http
PATCH /v1/profile
Authorization: Bearer <human-token>
Content-Type: application/json

{
  "role": "Founder and finance lead",
  "domain": {
    "profession": "personal_finance_organizer_v1",
    "industry": "B2B software",
    "specialization": "cash-flow planning",
    "seniority": "owner",
    "jurisdictions": ["US-CA"]
  },
  "biography": {
    "domainExpertise": [
      {
        "value": "Prefers conservative assumptions and a six-month cash buffer",
        "category": "financial_decision_style",
        "confirmation": "user_confirmed",
        "confidence": 1,
        "sensitivity": "sensitive"
      }
    ]
  }
}
```

Unconfirmed facts remain labelled as uncertain. Sensitive facts are withheld
unless the delegation includes `sensitive_context_read`.

## Behavior patterns and “tricks”

DEAL models ethical operating patterns rather than covert manipulation. Examples
include evidence-first reasoning, structured fairness, teach-back, service
recovery, root-cause analysis, safe handoff, consent and confidentiality,
scenario ranges, and de-escalation with dignity.

Each pattern has:

- when it is useful;
- when it should be avoided;
- failure modes;
- escalation triggers; and
- explicit safety boundaries.

Patterns are not instructions to deceive, impersonate, exploit, or bypass
consent. The individual’s confirmed preferences and boundaries override generic
patterns.

## Regulated professions

Finance, healthcare, legal, compliance, public service, and other regulated
profiles are marked accordingly. The profile adds guardrails; it does not grant
licensure or permission. For example:

- a finance organizer can explain and organize information but must not choose
  investments or move money;
- a clinical intake coordinator can collect consented intake information but
  must not diagnose or prescribe;
- a legal intake assistant can organize chronology but must not claim to be an
  attorney or provide unauthorized legal advice.

The host agent and organization remain responsible for credentials, regulated
workflows, emergency procedures, and domain-specific compliance.

Restricted and approval actions are also enforced by the deterministic policy
engine, not only described to the model. For example, a personal-finance
profile can deny `investment_recommendation` even if a host agent accidentally
declares that action in its delegated write scope.

## Discovery API

```http
GET /v1/professions?search=healthcare
GET /v1/professions/clinical_intake_coordinator_v1
```

Every context packet includes a `professional` section so an attached agent can
understand which operating model it is using and what remains unknown:

```json
{
  "profileId": "clinical_intake_coordinator_v1",
  "category": "healthcare",
  "regulated": true,
  "missingContext": ["clinicPolicy", "consentRules"],
  "safetyBoundaries": ["Never present intake routing as medical advice"]
}
```
