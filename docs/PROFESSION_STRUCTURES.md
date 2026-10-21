# Profession structures

DEAL ships a reviewed profession structure pack for task-level cognition
routing. A structure describes how an agent should reason and communicate in a
domain; it does not grant a licence, authority, or permission to act.

The API exposes the catalog through `GET /v1/professions`. The selected
structure is copied into the signed `packet.cognition` field for the current
task. The person’s declared identity remains in `packet.professional`.

## Included structures

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

Routing is deterministic and inspectable. Specific profiles can outrank broad
profiles using `routingPriority`; this is important for cases such as a
medication interaction routing to a pharmacist rather than a general health
education profile. Organizations can add reviewed profiles later without
changing the host agent SDK.

The host agent must still use its own tools and current sources. Profession
structures provide bounded reasoning guidance, not factual authority or a
substitute for a licensed professional.
