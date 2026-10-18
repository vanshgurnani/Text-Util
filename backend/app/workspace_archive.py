from __future__ import annotations

import io
import re
import unicodedata
import zipfile
import zlib
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

from pydantic import ValidationError

from .schemas import NoteCreate


MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
MAX_ARCHIVE_NOTES = 500
MAX_ARCHIVE_ENTRIES = MAX_ARCHIVE_NOTES * 2 + 1
MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
MARKDOWN_URL_SAFE = ":/?#[]@!$&'()*+,;=%"


def _slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "-", normalized).strip("-").lower()
    return slug[:80] or "untitled"


def _markdown_title(value: str) -> str:
    return value.replace("\r", " ").replace("\n", " ")


def _markdown_for(note: dict[str, Any]) -> str:
    title = _markdown_title(note.get("title", "Untitled"))
    content = note.get("content", "")
    body = f"# {title}\n\n{content}"
    source_url = note.get("source_url")
    if source_url:
        safe_url = quote(source_url, safe=MARKDOWN_URL_SAFE)
        body += f"\n\n[Original source](<{safe_url}>)."
    return body


def create_workspace_archive(notes: list[dict[str, Any]]) -> bytes:
    notes_by_id = {note["id"]: note for note in notes}
    paths: dict[str, str] = {}

    def note_path(note_id: str, trail: frozenset[str] = frozenset()) -> str:
        if note_id in paths:
            return paths[note_id]
        note = notes_by_id[note_id]
        parent_id = note.get("parent_id")
        parent_note = notes_by_id.get(parent_id)
        if (
            parent_note is None
            or parent_note.get("inbox")
            or parent_id in trail
            or note.get("inbox")
        ):
            parent_path = "Inbox" if note.get("inbox") else "Pages"
        else:
            parent_path = note_path(parent_id, trail | {note_id}).removesuffix(".md")
        filename = f"{_slug(note.get('title', 'Untitled'))}--{note_id}.md"
        paths[note_id] = f"{parent_path}/{filename}"
        return paths[note_id]

    markdown_files = [(note_path(note["id"]), _markdown_for(note)) for note in notes]
    total_size = sum(len(markdown.encode("utf-8")) for _, markdown in markdown_files)
    if total_size > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("Workspace Markdown exceeds the 20 MB export limit")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, markdown in markdown_files:
            archive.writestr(path, markdown)
    result = output.getvalue()
    if len(result) > MAX_ARCHIVE_BYTES:
        raise ValueError("Workspace archive exceeds the 20 MB export limit")
    return result


def parse_workspace_archive(data: bytes) -> list[dict[str, Any]]:
    if not data or len(data) > MAX_ARCHIVE_BYTES:
        raise ValueError("Archive must be between 1 byte and 20 MB")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("Upload a valid Noteform Markdown ZIP export") from exc

    with archive:
        entries = archive.infolist()
        if len(entries) > MAX_ARCHIVE_ENTRIES:
            raise ValueError("Archive contains too many files")
        total_size = 0
        files: dict[str, zipfile.ZipInfo] = {}
        for entry in entries:
            is_directory = entry.is_dir()
            path_name = entry.filename[:-1] if is_directory and entry.filename.endswith("/") else entry.filename
            path = PurePosixPath(path_name)
            if (
                not path_name
                or path.is_absolute()
                or "\\" in path_name
                or any(part in {"", ".", ".."} for part in path_name.split("/"))
                or (path.parts and path.parts[0].endswith(":"))
            ):
                raise ValueError("Archive contains an unsafe file path")
            if is_directory:
                continue
            if entry.filename in files:
                raise ValueError("Archive contains duplicate file paths")
            file_type = (entry.external_attr >> 16) & 0o170000
            if entry.flag_bits & 0x1:
                raise ValueError("Encrypted ZIP entries are not supported")
            if file_type not in {0, 0o100000}:
                raise ValueError("Archive may contain only regular files and directories")
            if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                raise ValueError("Archive uses an unsupported compression method")
            total_size += entry.file_size
            if total_size > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("Archive expands beyond the 20 MB import limit")
            files[entry.filename] = entry

        if len(files) > MAX_ARCHIVE_NOTES:
            raise ValueError("Archive contains more than 500 Markdown pages")
        if any(PurePosixPath(name).suffix.lower() != ".md" for name in files):
            raise ValueError("Archive may contain Markdown files only")

        page_paths = set(files)
        pages: list[dict[str, Any]] = []
        for path_name, info in files.items():
            try:
                markdown = archive.read(info).decode("utf-8-sig")
            except (UnicodeDecodeError, RuntimeError, EOFError, zipfile.BadZipFile, zlib.error, NotImplementedError) as exc:
                raise ValueError(f"{path_name} is not a readable UTF-8 Markdown file") from exc

            path = PurePosixPath(path_name)
            first_line, separator, remaining = markdown.partition("\n")
            if first_line.startswith("# "):
                title = first_line[2:].strip() or "Untitled"
                content = remaining[1:] if separator and remaining.startswith("\n") else remaining
            else:
                title = path.stem.replace("_", " ").strip() or "Untitled"
                content = markdown

            parent_id = None
            for index in range(len(path.parts) - 2, -1, -1):
                folder_parts = path.parts[:index]
                folder_name = path.parts[index]
                candidate = PurePosixPath(*folder_parts, f"{folder_name}.md").as_posix()
                if candidate in page_paths:
                    parent_id = candidate
                    break

            inbox = bool(path.parts and path.parts[0].casefold() == "inbox")
            if inbox:
                parent_id = None

            try:
                validated = _validate_markdown_page(title, content, inbox)
            except ValidationError as exc:
                raise ValueError(f"Page '{title[:80]}' has invalid or oversized fields") from exc

            pages.append({
                "id": path_name,
                "path": path_name,
                "parent_id": parent_id,
                "title": validated.title,
                "content": validated.content,
                "category": validated.category,
                "icon": validated.icon,
                "source_url": None,
                "inbox": validated.inbox,
                "bookmarked": False,
                "created_at": None,
                "updated_at": None,
            })
    return pages


def _validate_markdown_page(title: str, content: str, inbox: bool) -> NoteCreate:
    return NoteCreate(title=title, content=content, inbox=inbox)
