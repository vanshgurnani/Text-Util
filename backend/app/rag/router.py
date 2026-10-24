from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..auth import get_current_user_id
from ..database import note_chunks_collection, notes_collection
from .cache import get_cached_rag_response, set_cached_rag_response
from .providers import generate_chat_completion, get_available_models, stream_chat_completion
from .retriever import (
    RetrievedChunk,
    index_all_user_notes,
    index_note,
    retrieve_relevant_chunks,
)

router = APIRouter(prefix="/rag", tags=["RAG"])


class RagQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    model: Optional[str] = None
    stream: bool = False
    top_k: int = Field(5, ge=1, le=20)
    category_filter: Optional[str] = None
    note_id_filter: Optional[list[str]] = None


class RagCitation(BaseModel):
    chunk_id: str
    note_id: str
    note_title: str
    heading_path: list[str]
    snippet: str
    score: float


class RagQueryResponse(BaseModel):
    answer: str
    citations: list[RagCitation]
    model: str
    from_cache: bool = False


class RagIndexRequest(BaseModel):
    note_id: Optional[str] = None


@router.post("/query", response_model=None)
async def query_rag(
    payload: RagQueryRequest,
    user_id: str = Depends(get_current_user_id),
):
    from ..settings_router import get_user_ai_config
    user_ai = get_user_ai_config(user_id)
    model = payload.model or user_ai.get("default_model") or "gemini-2.0-flash"

    # Check cache first (for non-streaming or initial check)
    cached = get_cached_rag_response(user_id, payload.query, model)
    if cached and not payload.stream:
        return cached

    # Retrieve relevant workspace chunks
    chunks: list[RetrievedChunk] = retrieve_relevant_chunks(
        query=payload.query,
        owner_id=user_id,
        top_k=payload.top_k,
        category_filter=payload.category_filter,
        note_id_filter=payload.note_id_filter,
    )

    citations = [
        {
            "chunk_id": c.chunk_id,
            "note_id": c.note_id,
            "note_title": c.note_title,
            "heading_path": c.heading_path,
            "snippet": c.text[:240].strip() + ("..." if len(c.text) > 240 else ""),
            "score": c.score,
        }
        for c in chunks
    ]

    # Construct context prompt
    context_blocks = []
    for idx, c in enumerate(chunks, 1):
        context_blocks.append(f"--- Note Reference [{idx}]: \"{c.note_title}\" ---\n{c.text}")
    context_str = "\n\n".join(context_blocks)

    system_instruction = (
        "You are Noteform AI, an intelligent workspace copilot. "
        "Answer the user's question accurately using ONLY the retrieved workspace notes below. "
        "Cite the relevant note titles in brackets like [Title] whenever stating facts from them. "
        "If the notes do not contain sufficient information to answer the question, state that clearly.\n\n"
        f"Retrieved Workspace Context:\n{context_str or 'No relevant notes found in workspace.'}"
    )

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": payload.query},
    ]

    if payload.stream:
        def event_generator():
            accumulated_answer = []
            # First send citations event
            yield f"event: citations\ndata: {json.dumps(citations)}\n\n"

            try:
                for token in stream_chat_completion(messages, model=model, user_ai_config=user_ai):
                    accumulated_answer.append(token)
                    yield f"event: delta\ndata: {json.dumps({'content': token})}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

            full_answer = "".join(accumulated_answer)
            if full_answer:
                set_cached_rag_response(user_id, payload.query, model, full_answer, citations)

            yield "event: done\ndata: [DONE]\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    # Non-streaming
    answer = generate_chat_completion(messages, model=model, user_ai_config=user_ai)
    set_cached_rag_response(user_id, payload.query, model, answer, citations)

    return {
        "answer": answer,
        "citations": citations,
        "model": model,
        "from_cache": False,
    }


@router.post("/index")
async def index_workspace(
    payload: RagIndexRequest,
    user_id: str = Depends(get_current_user_id),
):
    if payload.note_id:
        from bson import ObjectId

        try:
            note = notes_collection().find_one({"_id": ObjectId(payload.note_id), "owner_id": user_id})
        except Exception:
            note = None

        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

        count = index_note(
            note_id=str(note["_id"]),
            owner_id=user_id,
            title=note.get("title", ""),
            content=note.get("content", ""),
            category=note.get("category", "general"),
            tags=note.get("tags", []),
        )
        return {"notes_indexed": 1, "chunks_indexed": count}

    stats = index_all_user_notes(user_id)
    return stats


@router.get("/status")
async def get_rag_status(user_id: str = Depends(get_current_user_id)):
    total_notes = notes_collection().count_documents({"owner_id": user_id})
    total_chunks = note_chunks_collection().count_documents({"owner_id": user_id})
    models = get_available_models()

    return {
        "status": "active",
        "notes_count": total_notes,
        "chunks_count": total_chunks,
        "available_models": models,
    }
