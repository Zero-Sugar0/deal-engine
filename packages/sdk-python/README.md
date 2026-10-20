# deal python sdk

Dependency-free Python client for the deal control plane. The client defaults
to the hosted API, so hosted agents only need an API key. The existing
`DEALClient(base_url, api_key)` form remains supported for self-hosted
deployments.

```python
from deal_sdk import DEALClient

client = DEALClient(api_key="deal_agent_key")
context = client.get_context(
    "Help me decide what to prioritize",
    conversation_id="conversation_123",
    skills=[
        {
            "name": "decision-review",
            "description": "Review decisions using the person's operating principles.",
            "source": "project",
        }
    ],
)
profile = client.get_profile()
client.update_profile({
    "selfConcept": {
        "summary": "A careful builder who prefers durable trust.",
        "valuesHierarchy": [{"value": "trust", "priority": 100}],
    },
    "persona": {"askStyle": "one_question_at_a_time"},
})
decision = client.check_permission(
    context["packetId"],
    "external_commitment",
    recipientCount=10,
)
```

The skill remains owned by the host agent. DEAL receives its descriptor for
provenance and context composition; it does not execute skill scripts or let a
skill change authority, boundaries, or approval rules.
