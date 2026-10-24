from __future__ import annotations

import datetime
import re
from typing import Any, Optional

from ..database import note_chunks_collection, notes_collection
from .chunker import MarkdownChunker
from .embedder import cosine_similarity, get_embedding, get_embeddings


class RetrievedChunk:
    def __init__(
        self,
        chunk_id: str,
        note_id: str,
        note_title: str,
        chunk_index: int,
        heading_path: list[str],
        text: str,
        token_count: int,
        score: float,
        source: str = "hybrid",
    ):
        self.chunk_id = chunk_id
        self.note_id = note_id
        self.note_title = note_title
        self.chunk_index = chunk_index
        self.heading_path = heading_path
        self.text = text
        self.token_count = token_count
        self.score = score
        self.source = source

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "note_id": self.note_id,
            "note_title": self.note_title,
            "chunk_index": self.chunk_index,
            "heading_path": self.heading_path,
            "text": self.text,
            "token_count": self.token_count,
            "score": round(self.score, 4),
            "source": self.source,
        }


def index_note(
    note_id: str,
    owner_id: str,
    title: str,
    content: str,
    category: str = "general",
    tags: Optional[list[str]] = None,
) -> int:
    """
    Chunk, embed, and store chunks for a given note.
    Performs delta hashing to avoid redundant re-embedding.
    """
    col = note_chunks_collection()
    tags = tags or []
    chunker = MarkdownChunker()
    chunks = chunker.chunk_markdown(title=title, content=content)

    if not chunks:
        col.delete_many({"owner_id": owner_id, "note_id": note_id})
        return 0

    # Fetch existing chunks to perform delta hash comparison
    existing_docs = list(col.find({"owner_id": owner_id, "note_id": note_id}))
    existing_by_hash = {doc.get("content_hash"): doc for doc in existing_docs if "content_hash" in doc}

    docs_to_insert = []
    chunks_needing_embedding = []
    chunk_meta = []

    for c in chunks:
        # Check if identical chunk already had an embedding
        existing = existing_by_hash.get(c.content_hash)
        if existing and "embedding" in existing and existing["embedding"]:
            docs_to_insert.append(
                {
                    "owner_id": owner_id,
                    "note_id": note_id,
                    "note_title": title,
                    "chunk_index": c.chunk_index,
                    "heading_path": c.heading_path,
                    "text": c.text,
                    "token_count": c.token_count,
                    "content_hash": c.content_hash,
                    "category": category,
                    "tags": tags,
                    "embedding": existing["embedding"],
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            )
        else:
            chunks_needing_embedding.append(c.text)
            chunk_meta.append(c)

    if chunks_needing_embedding:
        new_embeddings = get_embeddings(chunks_needing_embedding)
        for c, emb in zip(chunk_meta, new_embeddings):
            docs_to_insert.append(
                {
                    "owner_id": owner_id,
                    "note_id": note_id,
                    "note_title": title,
                    "chunk_index": c.chunk_index,
                    "heading_path": c.heading_path,
                    "text": c.text,
                    "token_count": c.token_count,
                    "content_hash": c.content_hash,
                    "category": category,
                    "tags": tags,
                    "embedding": emb,
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            )

    # Atomically replace chunks for this note
    col.delete_many({"owner_id": owner_id, "note_id": note_id})
    if docs_to_insert:
        col.insert_many(docs_to_insert)

    return len(docs_to_insert)


def delete_note_chunks(note_id: str, owner_id: str) -> int:
    """Delete all indexed chunks for a deleted note."""
    res = note_chunks_collection().delete_many({"owner_id": owner_id, "note_id": note_id})
    return res.deleted_count


def index_all_user_notes(owner_id: str) -> dict[str, Any]:
    """Index or re-index all notes belonging to the user."""
    notes_cur = notes_collection().find({"owner_id": owner_id})
    total_notes = 0
    total_chunks = 0

    for note in notes_cur:
        note_id = str(note["_id"])
        title = note.get("title", "")
        content = note.get("content", "")
        category = note.get("category", "general")
        tags = note.get("tags", [])
        indexed = index_note(
            note_id=note_id,
            owner_id=owner_id,
            title=title,
            content=content,
            category=category,
            tags=tags,
        )
        total_notes += 1
        total_chunks += indexed

    return {"notes_indexed": total_notes, "chunks_indexed": total_chunks}


def retrieve_relevant_chunks(
    query: str,
    owner_id: str,
    top_k: int = 5,
    max_tokens: int = 1500,
    category_filter: Optional[str] = None,
    note_id_filter: Optional[list[str]] = None,
) -> list[RetrievedChunk]:
    """
    Hybrid RAG retrieval with Reciprocal Rank Fusion (RRF).
    Combines dense semantic vector similarity and sparse keyword search.
    """
    col = note_chunks_collection()

    base_query: dict[str, Any] = {"owner_id": owner_id}
    if category_filter:
        base_query["category"] = category_filter
    if note_id_filter:
        base_query["note_id"] = {"$in": note_id_filter}

    all_docs = list(col.find(base_query))
    if not all_docs:
        # If no chunks indexed yet, attempt auto-indexing user notes
        index_all_user_notes(owner_id)
        all_docs = list(col.find(base_query))
        if not all_docs:
            return []

    # 1. Dense Semantic Retrieval
    query_vec = get_embedding(query)
    dense_scores: list[tuple[dict[str, Any], float]] = []

    for doc in all_docs:
        emb = doc.get("embedding")
        if emb:
            sim = cosine_similarity(query_vec, emb)
            dense_scores.append((doc, sim))

    dense_scores.sort(key=lambda x: x[1], reverse=True)

    # 2. Sparse Keyword Matching
    query_words = set(re.findall(r"\b\w{3,}\b", query.lower()))
    sparse_scores: list[tuple[dict[str, Any], float]] = []

    for doc in all_docs:
        text_lower = doc.get("text", "").lower()
        title_lower = doc.get("note_title", "").lower()
        hits = 0
        for w in query_words:
            if w in title_lower:
                hits += 3
            if w in text_lower:
                hits += 1
        sparse_scores.append((doc, float(hits)))

    sparse_scores.sort(key=lambda x: x[1], reverse=True)

    # 3. Reciprocal Rank Fusion (RRF)
    # score = (0.5 * 1 / (60 + rank_dense)) + (0.5 * 1 / (60 + rank_sparse))
    K_RRF = 60
    rrf_scores: dict[str, float] = {}
    doc_map: dict[str, dict[str, Any]] = {}

    for rank, (doc, _) in enumerate(dense_scores):
        doc_id = str(doc["_id"])
        doc_map[doc_id] = doc
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 0.5 * (1.0 / (K_RRF + rank + 1))

    for rank, (doc, score) in enumerate(sparse_scores):
        if score > 0:
            doc_id = str(doc["_id"])
            doc_map[doc_id] = doc
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 0.5 * (1.0 / (K_RRF + rank + 1))

    # Sort merged results by RRF score
    sorted_doc_ids = sorted(rrf_scores.keys(), key=lambda d_id: rrf_scores[d_id], reverse=True)

    results: list[RetrievedChunk] = []
    total_tokens = 0

    for doc_id in sorted_doc_ids:
        doc = doc_map[doc_id]
        chunk_tokens = doc.get("token_count", len(doc.get("text", "")) // 4)
        if total_tokens + chunk_tokens > max_tokens and results:
            break

        results.append(
            RetrievedChunk(
                chunk_id=doc_id,
                note_id=doc.get("note_id", ""),
                note_title=doc.get("note_title", "Untitled"),
                chunk_index=doc.get("chunk_index", 0),
                heading_path=doc.get("heading_path", []),
                text=doc.get("text", ""),
                token_count=chunk_tokens,
                score=rrf_scores[doc_id],
                source="hybrid",
            )
        )
        total_tokens += chunk_tokens
        if len(results) >= top_k:
            break

    return results
