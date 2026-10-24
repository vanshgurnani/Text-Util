from __future__ import annotations

import hashlib
import re
from typing import Any, Optional


class DocumentChunk:
    def __init__(
        self,
        chunk_index: int,
        text: str,
        heading_path: list[str],
        token_count: int,
        content_hash: str,
    ):
        self.chunk_index = chunk_index
        self.text = text
        self.heading_path = heading_path
        self.token_count = token_count
        self.content_hash = content_hash

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_index": self.chunk_index,
            "text": self.text,
            "heading_path": self.heading_path,
            "token_count": self.token_count,
            "content_hash": self.content_hash,
        }


def estimate_token_count(text: str) -> int:
    """Rough estimation of token count (~4 characters per token)."""
    if not text:
        return 0
    # Words + punctuation heuristic
    words = len(text.split())
    chars = len(text)
    return max(words, chars // 4)


def compute_content_hash(text: str) -> str:
    """SHA-256 digest of clean text."""
    normalized = " ".join(text.strip().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class MarkdownChunker:
    """
    Header-aware markdown chunker that preserves table and code block integrity
    and prefixes chunks with breadcrumb context hierarchies.
    """

    def __init__(self, target_chunk_tokens: int = 300, chunk_overlap_tokens: int = 40):
        self.target_tokens = target_chunk_tokens
        self.overlap_tokens = chunk_overlap_tokens

    def chunk_markdown(self, title: str, content: str) -> list[DocumentChunk]:
        clean_title = (title or "Untitled").strip()
        lines = (content or "").splitlines()
        if not lines:
            if clean_title:
                text = f"# {clean_title}"
                return [
                    DocumentChunk(
                        chunk_index=0,
                        text=text,
                        heading_path=[clean_title],
                        token_count=estimate_token_count(text),
                        content_hash=compute_content_hash(text),
                    )
                ]
            return []

        sections: list[tuple[list[str], list[str]]] = []
        current_headings: list[str] = [clean_title]
        current_lines: list[str] = []

        in_code_block = False

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("```"):
                in_code_block = not in_code_block
                current_lines.append(line)
                continue

            if not in_code_block and stripped.startswith("#"):
                match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
                if match:
                    if current_lines:
                        sections.append((list(current_headings), current_lines))
                        current_lines = []
                    level = len(match.group(1))
                    header_text = match.group(2).strip()
                    # Adjust heading stack based on level
                    # Index 0 is always clean_title
                    target_index = min(level, len(current_headings))
                    current_headings = current_headings[:target_index]
                    current_headings.append(header_text)
                    continue

            current_lines.append(line)

        if current_lines or not sections:
            sections.append((list(current_headings), current_lines))

        chunks: list[DocumentChunk] = []
        chunk_idx = 0

        for heading_path, section_lines in sections:
            breadcrumb = " > ".join(heading_path)
            context_prefix = f"[Context: {breadcrumb}]\n"
            prefix_tokens = estimate_token_count(context_prefix)

            # Group paragraphs and atomic blocks (tables, code blocks)
            blocks: list[str] = []
            block_buffer: list[str] = []
            in_code = False

            for line in section_lines:
                s = line.strip()
                if s.startswith("```"):
                    in_code = not in_code
                    block_buffer.append(line)
                    if not in_code:
                        blocks.append("\n".join(block_buffer))
                        block_buffer = []
                    continue

                if in_code:
                    block_buffer.append(line)
                    continue

                if not s:
                    if block_buffer:
                        blocks.append("\n".join(block_buffer))
                        block_buffer = []
                else:
                    block_buffer.append(line)

            if block_buffer:
                blocks.append("\n".join(block_buffer))

            # Assemble blocks into target token chunks
            current_chunk_parts: list[str] = []
            current_tokens = prefix_tokens

            for block in blocks:
                block_tokens = estimate_token_count(block)
                if current_tokens + block_tokens > self.target_tokens and current_chunk_parts:
                    full_text = context_prefix + "\n\n".join(current_chunk_parts)
                    chunks.append(
                        DocumentChunk(
                            chunk_index=chunk_idx,
                            text=full_text,
                            heading_path=heading_path,
                            token_count=current_tokens,
                            content_hash=compute_content_hash(full_text),
                        )
                    )
                    chunk_idx += 1
                    # Keep overlap if possible
                    if len(current_chunk_parts) > 1:
                        current_chunk_parts = [current_chunk_parts[-1]]
                        current_tokens = prefix_tokens + estimate_token_count(current_chunk_parts[0])
                    else:
                        current_chunk_parts = []
                        current_tokens = prefix_tokens

                current_chunk_parts.append(block)
                current_tokens += block_tokens

            if current_chunk_parts:
                full_text = context_prefix + "\n\n".join(current_chunk_parts)
                chunks.append(
                    DocumentChunk(
                        chunk_index=chunk_idx,
                        text=full_text,
                        heading_path=heading_path,
                        token_count=current_tokens,
                        content_hash=compute_content_hash(full_text),
                    )
                )
                chunk_idx += 1

        return chunks
