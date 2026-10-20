from __future__ import annotations

import json
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

DEFAULT_API_URL = "https://deal-engine.up.railway.app"


class DEALError(RuntimeError):
    """Raised when the DEAL API rejects a request or cannot be reached."""


class DEALClient:
    """Small dependency-free client for agent integrations."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        # Preserve DEALClient(base_url, api_key) while allowing the hosted
        # convenience form DEALClient(api_key="...") or DEALClient("...").
        if api_key is None:
            api_key = base_url
            base_url = None
        if not api_key or not api_key.strip():
            raise ValueError("deal API key is required")
        self.base_url = (base_url or DEFAULT_API_URL).rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _request(
        self,
        path: str,
        payload: Mapping[str, Any] | None = None,
        method: str = "POST",
    ) -> Any:
        body = json.dumps(dict(payload or {})).encode("utf-8") if method != "GET" else None
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError) as exc:
            detail = exc.read().decode("utf-8") if isinstance(exc, HTTPError) else str(exc)
            raise DEALError(detail) from exc
        return result

    def get_context(
        self,
        task: str,
        requested_capabilities: list[str] | None = None,
        task_metadata: Mapping[str, Any] | None = None,
        conversation_id: str | None = None,
        channel: str | None = None,
        audience: str | None = None,
        active_topic: str | None = None,
        user_intent: str | None = None,
        skills: list[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "task": task,
            "requestedCapabilities": requested_capabilities or [],
            "taskMetadata": dict(task_metadata or {}),
        }
        for key, value in {
            "conversationId": conversation_id,
            "channel": channel,
            "audience": audience,
            "activeTopic": active_topic,
            "userIntent": user_intent,
            "skills": skills,
        }.items():
            if value is not None:
                body[key] = value
        return self._request("/v1/context", body)

    def get_context_packet(self, packet_id: str) -> dict[str, Any]:
        return self._request(f"/v1/context/{packet_id}", method="GET")

    def list_skills(
        self, name: str | None = None, status: str | None = None
    ) -> list[dict[str, Any]]:
        query = urlencode(
            {key: value for key, value in {"name": name, "status": status}.items() if value}
        )
        return self._request(f"/v1/skills{'?' + query if query else ''}", method="GET")

    def get_skill(self, name: str, version: str) -> dict[str, Any]:
        return self._request(
            f"/v1/skills/{quote(name, safe='')}/{quote(version, safe='')}", method="GET"
        )

    def get_skill_signing_keys(self) -> dict[str, Any]:
        return self._request("/v1/skills/keys", method="GET")

    def register_skill(self, skill: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("/v1/skills", dict(skill))

    def submit_skill(self, skill_id: str) -> dict[str, Any]:
        return self._request(f"/v1/skills/{quote(skill_id, safe='')}/submit", {})

    def review_skill(
        self, skill_id: str, decision: str, note: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"decision": decision}
        if note is not None:
            body["note"] = note
        return self._request(
            f"/v1/skills/{quote(skill_id, safe='')}/review", body
        )

    def revoke_skill(self, skill_id: str, reason: str) -> dict[str, Any]:
        return self._request(
            f"/v1/skills/{quote(skill_id, safe='')}/revoke", {"reason": reason}
        )

    def get_profile(self) -> dict[str, Any]:
        """Return the complete human model and active agent delegations."""
        return self._request("/v1/profile", method="GET")

    def update_profile(self, profile: Mapping[str, Any]) -> dict[str, Any]:
        """Update identity, persona, relationships, boundaries, or judgment."""
        return self._request("/v1/profile", dict(profile), method="PATCH")

    def complete_onboarding(self, profile: Mapping[str, Any]) -> dict[str, Any]:
        """Apply initial human-context answers without requiring flat fields."""
        return self._request("/v1/onboarding", dict(profile))

    def start_conversation(self, **details: Any) -> dict[str, Any]:
        return self._request("/v1/conversations", details)

    def list_conversations(self) -> list[dict[str, Any]]:
        return self._request("/v1/conversations", method="GET")

    def add_conversation_turn(
        self,
        conversation_id: str,
        content: str,
        metadata: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._request(
            f"/v1/conversations/{conversation_id}/turns",
            {"content": content, "metadata": dict(metadata or {})},
        )

    def list_conversation_turns(self, conversation_id: str) -> list[dict[str, Any]]:
        return self._request(
            f"/v1/conversations/{conversation_id}/turns", method="GET"
        )

    def give_context_feedback(
        self,
        context_packet_id: str,
        rating: str,
        correction: str | None = None,
        what_worked: str | None = None,
        what_to_change: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "contextPacketId": context_packet_id,
            "rating": rating,
        }
        for key, value in {
            "correction": correction,
            "whatWorked": what_worked,
            "whatToChange": what_to_change,
        }.items():
            if value is not None:
                body[key] = value
        return self._request("/v1/context/feedback", body)

    def list_context_feedback(self) -> list[dict[str, Any]]:
        return self._request("/v1/context/feedback", method="GET")

    def check_permission(self, context_packet_id: str, action: str, **risk_signals: Any) -> dict[str, Any]:
        return self._request("/v1/policy/evaluate", {"contextPacketId": context_packet_id, "action": action, **risk_signals})

    def request_approval(self, context_packet_id: str, action: str, summary: str, payload: Any) -> dict[str, Any]:
        return self._request("/v1/approvals", {"contextPacketId": context_packet_id, "action": action, "summary": summary, "payload": payload})

    def consume_approval(self, approval_id: str, payload: Any) -> dict[str, Any]:
        return self._request(f"/v1/approvals/{approval_id}/consume", {"payload": payload})

    def verify_execution(self, execution_token: str, action: str, payload: Any) -> dict[str, Any]:
        return self._request("/v1/actions/verify", {"executionToken": execution_token, "action": action, "payload": payload})

    def remember(
        self,
        kind: str,
        content: Any,
        source: str | None = None,
        confidence: float | None = None,
        confirmation: str | None = None,
        priority: int | None = None,
        sensitivity: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"kind": kind, "content": content}
        if source is not None:
            body["source"] = source
        if confidence is not None:
            body["confidence"] = confidence
        if confirmation is not None:
            body["confirmation"] = confirmation
        if priority is not None:
            body["priority"] = priority
        if sensitivity is not None:
            body["sensitivity"] = sensitivity
        return self._request("/v1/memory", body)

    def report_outcome(self, context_packet_id: str, outcome: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("/v1/memory/outcomes", {"contextPacketId": context_packet_id, "outcome": dict(outcome)})

    def create_workflow(self, goal: str, context_packet_id: str | None = None, profile_id: str = "growth_operator_v1", data: Mapping[str, Any] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"goal": goal, "profileId": profile_id, "data": dict(data or {})}
        if context_packet_id is not None:
            body["contextPacketId"] = context_packet_id
        return self._request("/v1/workflows", body)

    def transition_workflow(self, workflow_id: str, step: str, data: Mapping[str, Any] | None = None) -> dict[str, Any]:
        return self._request(f"/v1/workflows/{workflow_id}/transition", {"step": step, "data": dict(data or {})})
