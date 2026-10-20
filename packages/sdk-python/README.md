# DEAL Python SDK

Dependency-free Python client for the DEAL control plane.

```python
from deal_sdk import DEALClient

deal = DEALClient("http://localhost:3000", "local-agent-key")
context = deal.get_context(
    "Help me decide what to prioritize",
    conversation_id="conversation_123",
)
profile = deal.get_profile()
deal.update_profile({
    "selfConcept": {
        "summary": "A careful builder who prefers durable trust.",
        "valuesHierarchy": [{"value": "trust", "priority": 100}],
    },
    "persona": {"askStyle": "one_question_at_a_time"},
})
decision = deal.check_permission(
    context["packetId"],
    "external_commitment",
    recipientCount=10,
)
```
