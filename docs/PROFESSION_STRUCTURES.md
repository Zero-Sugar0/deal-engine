# Profession structures

DEAL ships a reviewed profession structure pack for task-level cognition
routing. A structure describes how an agent should reason and communicate in a
domain; it does not grant a licence, authority, or permission to act.

The API exposes the catalog through `GET /v1/professions`. The selected
structure is copied into the signed `packet.cognition` field for the current
task. The person’s declared identity remains in `packet.professional`.

## Included structures

The original reviewed pack contains 20 structures. The expansion pack adds 50
more, for 70 reviewed profession structures in total. DEAL also includes the
product-defining `cognitive_engineer_v1` role. The expansion is defined in
`apps/api/src/profession-expansion.ts` and exported through the same
`GET /v1/professions` catalog.

DEAL also includes 30 life-context structures numbered 71–100. These are not
professional identities: they describe the subject of the task, such as a
dog, plant, freshwater ecosystem, household budget, trip, car, or hobby. They
are defined in `apps/api/src/life-contexts.ts` and available through
`GET /v1/life-contexts`.

Every profile has a `subjectType`. Professional profiles use `profession`; the
life-context pack uses `animal`, `plant`, `fungus`, `microbial`, `ecosystem`,
`object`, or `life_context`. A life context changes the agent's task guidance;
it never changes the person's identity or claims that the agent is licensed.

| ID                               | Category    |
| -------------------------------- | ----------- |
| `health_education_assistant_v1`  | healthcare  |
| `physician_clinician_v1`         | healthcare  |
| `registered_nurse_v1`            | healthcare  |
| `pharmacist_v1`                  | healthcare  |
| `mental_health_counselor_v1`     | healthcare  |
| `legal_information_assistant_v1` | legal       |
| `lawyer_advocate_v1`             | legal       |
| `accountant_v1`                  | finance     |
| `financial_planner_v1`           | finance     |
| `tax_preparer_v1`                | finance     |
| `software_engineer_v1`           | technology  |
| `cybersecurity_analyst_v1`       | technology  |
| `teacher_educator_v1`            | education   |
| `civil_engineer_v1`              | engineering |
| `electrician_v1`                 | trades      |
| `real_estate_agent_v1`           | sales       |
| `human_resources_specialist_v1`  | hr          |
| `customer_support_specialist_v1` | customer    |
| `journalist_editor_v1`           | media       |
| `logistics_coordinator_v1`       | operations  |

Each entry includes routing terms, responsibilities, knowledge areas,
operating/communication/decision patterns, failure modes, required context,
escalation triggers, safety boundaries, sensitive data classes, regulation and
licensing metadata, restricted actions, and approval actions.

The expansion covers:

- care and public health: midwife, paramedic, veterinarian, dentist,
  physiotherapist, occupational therapist, dietitian, medical laboratory
  scientist, social worker, childcare worker, elder care aide, disability
  support worker, and community health worker;
- education, research, language, and culture: funeral director, early
  childhood educator, special education teacher, librarian, academic
  researcher, sign language interpreter, translator, and museum curator;
- technology, engineering, safety, and trades: data engineer, mechanical
  engineer, industrial safety inspector, network administrator, UX researcher,
  embedded systems engineer, plumber, carpenter, welder, automotive mechanic,
  tailor, and HVAC technician;
- agriculture, hospitality, transport, public safety, business, finance, and
  creative work: agronomist, environmental scientist, fisheries officer, chef,
  hotel manager, commercial pilot, truck driver, air traffic controller, police
  officer, firefighter, emergency dispatcher, administrative assistant,
  procurement officer, insurance underwriter, graphic designer, photographer,
  and composer/musician.

Routing is deterministic and inspectable. Specific profiles can outrank broad
profiles using `routingPriority`; this is important for cases such as a
medication interaction routing to a pharmacist rather than a general health
education profile. Organizations can add reviewed profiles later without
changing the host agent SDK.

The host agent must still use its own tools and current sources. Profession
structures provide bounded reasoning guidance, not factual authority or a
substitute for a licensed professional.

## Life-context coverage

The life-context pack covers companion animals, livestock and wildlife, plants,
fungi, compost and freshwater ecosystems, household pests, budgeting, cooking,
travel, outdoor recreation, fitness, DIY and moving, leisure, personal
transport, home organisation, emergency preparedness, camping, and cycling.

Life-context routing is still deterministic and inspectable. Current weather,
travel rules, fishing limits, road conditions, poisoning guidance, and other
changing facts must be checked against current local or official sources by the
host agent. The structures provide safe reasoning patterns and escalation
boundaries; they are not a substitute for a veterinarian, clinician,
qualified tradesperson, ranger, emergency service, or local authority.

## Human identity context

`HumanModel.identity` supports a person’s explicit self-description, including
gender identity, race or ethnicity, cultural background, nationality, personal
background, religion or belief, and sexual orientation. These fields are
optional and are never inferred from a name, language, location, profession,
appearance, or conversation.

Each protected identity attribute carries confirmation, source, sensitivity,
visibility, and validity metadata. By default it is private. A delegated agent
receives it only when the delegation includes `sensitive_context_read`; values
marked `never_share` remain redacted even then. This keeps identity context
available for a person’s own voice and relevant accessibility or cultural
needs without turning protected attributes into a guess, stereotype, or hidden
decision signal.
