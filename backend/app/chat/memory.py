from __future__ import annotations

from typing import Any


def compress_conversation_history(
    messages: list[dict[str, Any]],
    system_prompt: str,
    max_history_turns: int = 4,
    max_tokens_budget: int = 1800,
) -> list[dict[str, str]]:
    """
    Sliding window conversation compressor:
    - Retains system prompt with active workspace RAG context
    - Summarizes or truncates distant message turns
    - Retains recent turns up to max_tokens_budget
    """
    formatted: list[dict[str, str]] = []

    # Always include system prompt
    formatted.append({"role": "system", "content": system_prompt})

    if not messages:
        return formatted

    # Filter out any old system messages from history
    user_assistant_msgs = [m for m in messages if m.get("role") in ("user", "assistant")]

    # Take the most recent messages (up to max_history_turns * 2)
    recent = user_assistant_msgs[-(max_history_turns * 2) :]
    older = user_assistant_msgs[: -(max_history_turns * 2)]

    # If there are older messages, create a brief continuity reminder
    if older:
        summary_snippets = []
        for m in older[-4:]:
            snippet = m.get("content", "")[:80].strip()
            summary_snippets.append(f"{m.get('role')}: {snippet}...")
        continuity_note = "Previous context summary:\n" + "\n".join(summary_snippets)
        formatted.append({"role": "system", "content": continuity_note})

    # Add recent messages while monitoring approximate token length
    total_tokens = sum(len(m.get("content", "")) // 4 for m in formatted)

    for m in recent:
        tokens = len(m.get("content", "")) // 4
        if total_tokens + tokens > max_tokens_budget:
            # Truncate if single message is huge
            content = m.get("content", "")[: (max_tokens_budget - total_tokens) * 4]
            formatted.append({"role": m["role"], "content": content})
            break
        formatted.append({"role": m["role"], "content": m.get("content", "")})
        total_tokens += tokens

    return formatted
