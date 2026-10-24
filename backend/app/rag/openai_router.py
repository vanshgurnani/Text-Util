from __future__ import annotations

import json
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..auth import get_current_user_id
from .providers import generate_chat_completion, get_available_models, stream_chat_completion
from .retriever import retrieve_relevant_chunks

router = APIRouter(prefix="/v1", tags=["OpenAI Compatible API"])


class ChatCompletionMessage(BaseModel):
    role: str
    content: str
    name: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model: str = "noteform-workspace-rag"
    messages: list[ChatCompletionMessage]
    stream: bool = False
    temperature: Optional[float] = 0.2
    max_tokens: Optional[int] = 2048


@router.get("/models")
async def list_models():
    """Return OpenAI-compatible models list."""
    base_models = get_available_models()
    created_time = int(time.time())
    data = [
        {
            "id": "noteform-workspace-rag",
            "object": "model",
            "created": created_time,
            "owned_by": "noteform",
            "permission": [],
            "root": "noteform-workspace-rag",
        }
    ]
    for m in base_models:
        data.append(
            {
                "id": m["id"],
                "object": "model",
                "created": created_time,
                "owned_by": m["provider"],
                "permission": [],
                "root": m["id"],
            }
        )
    return {"object": "list", "data": data}


@router.post("/chat/completions")
async def create_chat_completion(
    payload: ChatCompletionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """OpenAI-compatible chat completion endpoint with automatic RAG injection."""
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created_time = int(time.time())

    # Extract last user message to retrieve relevant context
    last_user_msg = next((m.content for m in reversed(payload.messages) if m.role == "user"), "")

    active_messages = [m.dict() for m in payload.messages]

    # If workspace model or user query present, augment with workspace RAG
    if payload.model == "noteform-workspace-rag" and last_user_msg:
        chunks = retrieve_relevant_chunks(query=last_user_msg, owner_id=user_id, top_k=4)
        if chunks:
            context_blocks = [f"--- [{c.note_title}] ---\n{c.text}" for c in chunks]
            context_str = "\n\n".join(context_blocks)
            rag_sys_prompt = (
                f"You have direct access to the user's workspace notes:\n{context_str}\n\n"
                "Use the notes above to answer the user accurately. Cite note titles when applicable."
            )
            # Prepend or append context instruction
            active_messages.insert(0, {"role": "system", "content": rag_sys_prompt})

    target_model = payload.model if payload.model != "noteform-workspace-rag" else "gemini-2.0-flash"

    if payload.stream:
        def stream_generator():
            try:
                for token in stream_chat_completion(active_messages, model=target_model):
                    chunk_payload = {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created_time,
                        "model": payload.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": token},
                                "finish_reason": None,
                            }
                        ],
                    }
                    yield f"data: {json.dumps(chunk_payload)}\n\n"

                final_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": payload.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop",
                        }
                    ],
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                err_payload = {"error": {"message": str(e), "type": "server_error"}}
                yield f"data: {json.dumps(err_payload)}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(stream_generator(), media_type="text/event-stream")

    # Non-streaming response
    content = generate_chat_completion(active_messages, model=target_model)
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created_time,
        "model": payload.model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": len(str(active_messages)) // 4,
            "completion_tokens": len(content) // 4,
            "total_tokens": (len(str(active_messages)) + len(content)) // 4,
        },
    }
