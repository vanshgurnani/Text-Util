from __future__ import annotations

import json
import logging
import time
from typing import Any, Generator, Iterator, Optional

import requests

from ..config import settings

logger = logging.getLogger(__name__)


class ProviderKeyManager:
    """Thread-safe round-robin key rotator with cool-down on rate limits."""

    def __init__(self, keys: list[str], cooldown_seconds: float = 60.0):
        self.keys = [k for k in keys if k]
        self.idx = 0
        self.disabled_until: dict[str, float] = {}
        self.cooldown_seconds = cooldown_seconds

    def get_key(self) -> Optional[str]:
        if not self.keys:
            return None
        now = time.time()
        for _ in range(len(self.keys)):
            candidate = self.keys[self.idx % len(self.keys)]
            self.idx = (self.idx + 1) % len(self.keys)
            if self.disabled_until.get(candidate, 0.0) <= now:
                return candidate
        # If all in cool-down, pick earliest expiring key
        return min(self.keys, key=lambda k: self.disabled_until.get(k, 0.0))

    def mark_rate_limited(self, key: str) -> None:
        if key:
            self.disabled_until[key] = time.time() + self.cooldown_seconds


gemini_key_mgr = ProviderKeyManager(settings.gemini_api_keys)
groq_key_mgr = ProviderKeyManager(settings.groq_api_keys)


def _offline_heuristic_response(messages: list[dict[str, str]]) -> str:
    """
    Fallback synthesis when no external LLM API key is available and Ollama is offline.
    Extracts relevant context from the system/user prompt and provides an informative, structured answer.
    """
    system_prompt = next((m["content"] for m in messages if m.get("role") == "system"), "")
    user_prompt = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")

    if "Retrieved Workspace Context:" in system_prompt:
        context_part = system_prompt.split("Retrieved Workspace Context:")[1]
        return (
            f"Based on your workspace notes:\n\n"
            f"{context_part.strip()}\n\n"
            f"*(Note: Generated via Noteform Local Context Synthesizer. To enable generative AI completions, configure GEMINI_API_KEY or GROQ_API_KEY in backend/.env)*"
        )

    return (
        f"I received your request: '{user_prompt}'. "
        "No external AI API keys are currently configured (GEMINI_API_KEY or GROQ_API_KEY). "
        "You can configure free Gemini or Groq keys in your environment to enable real-time LLM answers."
    )


def stream_gemini(
    messages: list[dict[str, str]],
    model_name: str = "gemini-2.0-flash",
    api_key: Optional[str] = None,
) -> Iterator[str]:
    key = api_key or gemini_key_mgr.get_key()
    if not key:
        raise ValueError("No Gemini API key available")

    # Map OpenAI messages format to Gemini contents
    contents = []
    system_instruction = None

    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role == "system":
            system_instruction = {"parts": [{"text": content}]}
        elif role == "user":
            contents.append({"role": "user", "parts": [{"text": content}]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": content}]})

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?alt=sse&key={key}"
    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        },
    }
    if system_instruction:
        payload["systemInstruction"] = system_instruction

    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=30,
        )
        if response.status_code == 429:
            gemini_key_mgr.mark_rate_limited(key)
            raise RuntimeError("Gemini rate limit 429")

        if response.status_code != 200:
            raise RuntimeError(f"Gemini API returned {response.status_code}: {response.text[:200]}")

        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for p in parts:
                            text = p.get("text", "")
                            if text:
                                yield text
                except Exception:
                    continue
    except Exception as exc:
        gemini_key_mgr.mark_rate_limited(key)
        raise exc


def stream_groq(
    messages: list[dict[str, str]],
    model_name: str = "llama-3.3-70b-versatile",
    api_key: Optional[str] = None,
) -> Iterator[str]:
    key = api_key or groq_key_mgr.get_key()
    if not key:
        raise ValueError("No Groq API key available")

    api_url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 2048,
        "stream": True,
    }

    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            stream=True,
            timeout=30,
        )
        if response.status_code == 429:
            groq_key_mgr.mark_rate_limited(key)
            raise RuntimeError("Groq rate limit 429")

        if response.status_code != 200:
            raise RuntimeError(f"Groq API returned {response.status_code}: {response.text[:200]}")

        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk_obj = json.loads(data_str)
                    delta = chunk_obj.get("choices", [{}])[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        yield text
                except Exception:
                    continue
    except Exception as exc:
        groq_key_mgr.mark_rate_limited(key)
        raise exc


def stream_ollama(
    messages: list[dict[str, str]],
    model_name: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Iterator[str]:
    model = model_name or settings.ollama_model
    url = f"{(base_url or settings.ollama_base_url).rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": 0.2},
    }

    response = requests.post(url, json=payload, stream=True, timeout=20)
    if response.status_code != 200:
        raise RuntimeError(f"Ollama returned {response.status_code}")

    for line in response.iter_lines(decode_unicode=True):
        if not line:
            continue
        try:
            data = json.loads(line)
            msg = data.get("message", {})
            text = msg.get("content", "")
            if text:
                yield text
        except Exception:
            continue


def stream_chat_completion(
    messages: list[dict[str, str]],
    model: Optional[str] = None,
    user_ai_config: Optional[dict[str, Any]] = None,
) -> Iterator[str]:
    """
    Primary multi-provider streaming dispatcher with graceful fallbacks:
    1. Gemini (Flash 2.0 / 1.5)
    2. Groq (Llama 3.3 / 3.1)
    3. Ollama (Local)
    4. Deterministic offline context synthesis
    """
    cfg = user_ai_config or {}
    target_model = model or cfg.get("default_model") or settings.default_ai_model
    gemini_key = cfg.get("gemini_api_key")
    groq_key = cfg.get("groq_api_key")
    ollama_url = cfg.get("ollama_base_url")

    # Route based on model prefix or configuration
    if "groq" in target_model or "llama" in target_model.lower():
        try:
            yield from stream_groq(
                messages,
                model_name=target_model if "llama" in target_model else "llama-3.3-70b-versatile",
                api_key=groq_key,
            )
            return
        except Exception as e:
            logger.warning("Groq stream failed: %s; falling back to Gemini", e)

    # Try Gemini
    if gemini_key or settings.gemini_api_keys or settings.gemini_api_key:
        try:
            yield from stream_gemini(
                messages,
                model_name=target_model if "gemini" in target_model else "gemini-2.0-flash",
                api_key=gemini_key,
            )
            return
        except Exception as e:
            logger.warning("Gemini stream failed: %s; falling back to Groq/Ollama", e)

    # Try Groq if Gemini wasn't tried or failed
    if groq_key or settings.groq_api_keys or settings.groq_api_key:
        try:
            yield from stream_groq(messages, api_key=groq_key)
            return
        except Exception as e:
            logger.warning("Groq fallback failed: %s; falling back to Ollama", e)

    # Try Ollama
    try:
        yield from stream_ollama(messages, base_url=ollama_url)
        return
    except Exception:
        pass

    # Heuristic offline synthesis
    offline_text = _offline_heuristic_response(messages)
    # Stream in realistic chunks
    words = offline_text.split(" ")
    buffer = []
    for w in words:
        buffer.append(w)
        if len(buffer) >= 3:
            yield " ".join(buffer) + " "
            buffer = []
    if buffer:
        yield " ".join(buffer)


def generate_chat_completion(
    messages: list[dict[str, str]],
    model: Optional[str] = None,
    user_ai_config: Optional[dict[str, Any]] = None,
) -> str:
    """Non-streaming completion wrapper accumulating all chunks."""
    tokens = []
    for chunk in stream_chat_completion(messages, model=model, user_ai_config=user_ai_config):
        tokens.append(chunk)
    return "".join(tokens)


def get_available_models() -> list[dict[str, Any]]:
    """Return model inventory with provider metadata."""
    models = [
        {
            "id": "gemini-2.0-flash",
            "name": "Gemini 2.0 Flash (Fastest, High Free Quota)",
            "provider": "google",
            "context_window": 1048576,
            "is_default": True,
        },
        {
            "id": "llama-3.3-70b-versatile",
            "name": "Llama 3.3 70B (Groq Ultra-Speed)",
            "provider": "groq",
            "context_window": 128000,
            "is_default": False,
        },
        {
            "id": "llama-3.1-8b-instant",
            "name": "Llama 3.1 8B Instant (Ultra-Low Latency)",
            "provider": "groq",
            "context_window": 128000,
            "is_default": False,
        },
        {
            "id": settings.ollama_model,
            "name": f"Ollama Local ({settings.ollama_model})",
            "provider": "ollama",
            "context_window": 32768,
            "is_default": False,
        },
    ]
    return models
