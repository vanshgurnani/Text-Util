from __future__ import annotations

import datetime
import json
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from ..auth import get_current_user_id
from ..database import chat_messages_collection, conversations_collection, notes_collection
from ..rag.providers import generate_chat_completion, stream_chat_completion
from ..rag.retriever import retrieve_relevant_chunks
from .memory import compress_conversation_history
from .models import (
    ChatMessageOut,
    ConversationDetail,
    ConversationSummary,
    CreateConversationRequest,
    ExportToNoteRequest,
    SendMessageRequest,
    UpdateConversationRequest,
)

router = APIRouter(prefix="/chat", tags=["Chat"])


def _doc_id(doc: dict[str, Any]) -> str:
    return str(doc["_id"])


def _format_message(doc: dict[str, Any]) -> ChatMessageOut:
    return ChatMessageOut(
        id=_doc_id(doc),
        conversation_id=str(doc.get("conversation_id")),
        role=doc.get("role", "user"),
        content=doc.get("content", ""),
        citations=doc.get("citations", []),
        created_at=doc.get("created_at", ""),
    )


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(user_id: str = Depends(get_current_user_id)):
    col = conversations_collection()
    cursor = col.find({"owner_id": user_id}).sort([("is_pinned", -1), ("updated_at", -1)])
    results = []
    for doc in cursor:
        conv_id = str(doc["_id"])
        msg_count = chat_messages_collection().count_documents({"conversation_id": conv_id})
        results.append(
            ConversationSummary(
                id=conv_id,
                title=doc.get("title", "New Chat"),
                model=doc.get("model", "gemini-2.0-flash"),
                is_pinned=doc.get("is_pinned", False),
                message_count=msg_count,
                created_at=doc.get("created_at", ""),
                updated_at=doc.get("updated_at", ""),
            )
        )
    return results


@router.post("/conversations", response_model=ConversationDetail)
async def create_conversation(
    payload: CreateConversationRequest,
    user_id: str = Depends(get_current_user_id),
):
    now = datetime.datetime.utcnow().isoformat()
    doc = {
        "owner_id": user_id,
        "title": payload.title.strip() if payload.title else "New Chat",
        "model": payload.model or "gemini-2.0-flash",
        "is_pinned": False,
        "created_at": now,
        "updated_at": now,
    }
    res = conversations_collection().insert_one(doc)
    doc["_id"] = res.inserted_id

    return ConversationDetail(
        id=str(res.inserted_id),
        title=doc["title"],
        model=doc["model"],
        is_pinned=False,
        messages=[],
        created_at=now,
        updated_at=now,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        conv = conversations_collection().find_one({"_id": ObjectId(conversation_id), "owner_id": user_id})
    except Exception:
        conv = None

    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msg_cursor = chat_messages_collection().find({"conversation_id": conversation_id}).sort("created_at", 1)
    messages = [_format_message(m) for m in msg_cursor]

    return ConversationDetail(
        id=str(conv["_id"]),
        title=conv.get("title", "New Chat"),
        model=conv.get("model", "gemini-2.0-flash"),
        is_pinned=conv.get("is_pinned", False),
        messages=messages,
        created_at=conv.get("created_at", ""),
        updated_at=conv.get("updated_at", ""),
    )


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    payload: UpdateConversationRequest,
    user_id: str = Depends(get_current_user_id),
):
    update_data: dict[str, Any] = {"updated_at": datetime.datetime.utcnow().isoformat()}
    if payload.title is not None:
        update_data["title"] = payload.title.strip()
    if payload.is_pinned is not None:
        update_data["is_pinned"] = payload.is_pinned
    if payload.model is not None:
        update_data["model"] = payload.model

    try:
        res = conversations_collection().update_one(
            {"_id": ObjectId(conversation_id), "owner_id": user_id},
            {"$set": update_data},
        )
    except Exception:
        res = None

    if not res or res.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return {"status": "ok"}


@router.delete("/chat/conversations/{conversation_id}", response_model=None)
@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        res = conversations_collection().delete_one({"_id": ObjectId(conversation_id), "owner_id": user_id})
    except Exception:
        res = None

    if not res or res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    chat_messages_collection().delete_many({"conversation_id": conversation_id})
    return {"status": "deleted"}


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        conv = conversations_collection().find_one({"_id": ObjectId(conversation_id), "owner_id": user_id})
    except Exception:
        conv = None

    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    from ..settings_router import get_user_ai_config
    user_ai = get_user_ai_config(user_id)
    model = payload.model or conv.get("model") or user_ai.get("default_model") or "gemini-2.0-flash"
    now = datetime.datetime.utcnow().isoformat()

    # Save user message
    user_msg_doc = {
        "conversation_id": conversation_id,
        "owner_id": user_id,
        "role": "user",
        "content": payload.content.strip(),
        "citations": [],
        "created_at": now,
    }
    chat_messages_collection().insert_one(user_msg_doc)

    # Auto-generate title if this is the first user message
    if conv.get("title") in ("New Chat", "Untitled", None):
        first_line = payload.content.strip().split("\n")[0][:40]
        conversations_collection().update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"title": first_line, "updated_at": now}},
        )
    else:
        conversations_collection().update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"updated_at": now}},
        )

    # Retrieve RAG context if enabled
    citations = []
    rag_context = ""
    if payload.use_rag:
        chunks = retrieve_relevant_chunks(
            query=payload.content,
            owner_id=user_id,
            top_k=4,
            category_filter=payload.category_filter,
            note_id_filter=payload.note_id_filter,
        )
        if chunks:
            citations = [
                {
                    "chunk_id": c.chunk_id,
                    "note_id": c.note_id,
                    "note_title": c.note_title,
                    "heading_path": c.heading_path,
                    "snippet": c.text[:220].strip() + ("..." if len(c.text) > 220 else ""),
                    "score": c.score,
                }
                for c in chunks
            ]
            context_blocks = [f"--- Note Reference: \"{c.note_title}\" ---\n{c.text}" for c in chunks]
            rag_context = "\n\n".join(context_blocks)

    system_prompt = (
        "You are Noteform Copilot, a helpful AI assistant for workspace notes. "
        "Answer the user's questions clearly in markdown. "
        "When referencing facts from the retrieved notes below, cite the note title like [Note Title]. "
        "If you do not know the answer or it is not in the notes, answer to the best of your ability or state so.\n\n"
        f"Retrieved Workspace Context:\n{rag_context or 'No specific notes retrieved for this query.'}"
    )

    # Get conversation history
    history_cursor = chat_messages_collection().find({"conversation_id": conversation_id}).sort("created_at", 1)
    history_list = list(history_cursor)
    compressed_messages = compress_conversation_history(
        messages=history_list,
        system_prompt=system_prompt,
        max_history_turns=4,
    )

    if payload.stream:
        def stream_events():
            accumulated: list[str] = []
            # 1. Send citations event
            yield f"event: citations\ndata: {json.dumps(citations)}\n\n"

            # 2. Stream tokens
            try:
                for token in stream_chat_completion(compressed_messages, model=model, user_ai_config=user_ai):
                    accumulated.append(token)
                    yield f"event: delta\ndata: {json.dumps({'content': token})}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

            # 3. Persist assistant message
            assistant_content = "".join(accumulated)
            ast_doc = {
                "conversation_id": conversation_id,
                "owner_id": user_id,
                "role": "assistant",
                "content": assistant_content,
                "citations": citations,
                "created_at": datetime.datetime.utcnow().isoformat(),
            }
            res_ast = chat_messages_collection().insert_one(ast_doc)
            yield f"event: done\ndata: {json.dumps({'message_id': str(res_ast.inserted_id), 'content': assistant_content})}\n\n"

        return StreamingResponse(stream_events(), media_type="text/event-stream")

    # Non-streaming
    assistant_content = generate_chat_completion(compressed_messages, model=model, user_ai_config=user_ai)
    ast_doc = {
        "conversation_id": conversation_id,
        "owner_id": user_id,
        "role": "assistant",
        "content": assistant_content,
        "citations": citations,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    res_ast = chat_messages_collection().insert_one(ast_doc)
    ast_doc["_id"] = res_ast.inserted_id

    return _format_message(ast_doc)


@router.post("/conversations/{conversation_id}/export-note")
async def export_conversation_to_note(
    conversation_id: str,
    payload: ExportToNoteRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        conv = conversations_collection().find_one({"_id": ObjectId(conversation_id), "owner_id": user_id})
    except Exception:
        conv = None

    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages = list(chat_messages_collection().find({"conversation_id": conversation_id}).sort("created_at", 1))
    if not messages:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Conversation has no messages to export")

    title = payload.title or f"Chat Summary: {conv.get('title', 'AI Discussion')}"
    note_lines = [
        f"# {title}",
        f"**Date**: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        f"**Model**: {conv.get('model', 'gemini-2.0-flash')}",
        "",
        "---",
        "",
    ]

    for m in messages:
        role_label = "👤 **User**" if m.get("role") == "user" else "🤖 **AI Copilot**"
        note_lines.append(f"### {role_label}")
        note_lines.append(m.get("content", "").strip())
        note_lines.append("")
        if m.get("citations"):
            note_lines.append("> **Referenced Sources:**")
            for cit in m.get("citations", []):
                note_lines.append(f"> - [{cit.get('note_title')}]: *\"{cit.get('snippet', '')[:120]}...\"*")
            note_lines.append("")

    content = "\n".join(note_lines)
    now = datetime.datetime.utcnow().isoformat()

    new_note = {
        "title": title,
        "content": content,
        "category": payload.category,
        "tags": payload.tags,
        "owner_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    res = notes_collection().insert_one(new_note)
    return {"note_id": str(res.inserted_id), "title": title}
