from __future__ import annotations

import io
import json
import re
import unicodedata
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

from pydantic import ValidationError

from .schemas import NoteCreate


ARCHIVE_FORMAT = "noteform-workspace"
ARCHIVE_VERSION = 1
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

    manifest_notes = []
    for note in notes:
        path = note_path(note["id"])
        manifest_notes.append({
            "id": note["id"],
            "parent_id": None if note.get("inbox") else note.get("parent_id"),
            "path": path,
            "title": note.get("title", "Untitled"),
            "category": note.get("category", "General"),
            "icon": note.get("icon", "✦"),
            "bookmarked": bool(note.get("bookmarked", False)),
            "inbox": bool(note.get("inbox", False)),
            "source_url": note.get("source_url"),
            "created_at": note.get("created_at"),
            "updated_at": note.get("updated_at"),
        })

    markdown_files = [(note_path(note["id"]), _markdown_for(note)) for note in notes]
    total_size = sum(len(markdown.encode("utf-8")) for _, markdown in markdown_files)
    if total_size > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("Workspace Markdown exceeds the 20 MB export limit")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(
                {"format": ARCHIVE_FORMAT, "version": ARCHIVE_VERSION, "notes": manifest_notes},
                ensure_ascii=False,
                indent=2,
            ),
        )
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

        manifest_info = files.get("manifest.json")
        if not manifest_info:
            raise ValueError("Archive is missing manifest.json; import a Noteform Markdown ZIP export")
        if manifest_info.file_size > 5 * 1024 * 1024:
            raise ValueError("Archive manifest is too large")
        try:
            manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, RuntimeError, EOFError, RecursionError, zlib.error, NotImplementedError) as exc:
            raise ValueError("Archive manifest must be valid UTF-8 JSON") from exc
        if (
            not isinstance(manifest, dict)
            or manifest.get("format") != ARCHIVE_FORMAT
            or manifest.get("version") != ARCHIVE_VERSION
            or not isinstance(manifest.get("notes"), list)
        ):
            raise ValueError("Unsupported Noteform archive format or version")

        records = manifest["notes"]
        if len(records) > MAX_ARCHIVE_NOTES:
            raise ValueError("Archive contains more than 500 pages")
        ids: set[str] = set()
        paths: set[str] = set()
        normalized: list[dict[str, Any]] = []
        expected_files = {"manifest.json"}

        for record in records:
            if not isinstance(record, dict):
                raise ValueError("Archive contains an invalid page record")
            note_id = record.get("id")
            path_value = record.get("path")
            if not isinstance(note_id, str) or not note_id or len(note_id) > 128 or note_id in ids:
                raise ValueError("Archive contains an invalid or duplicate page id")
            if not isinstance(path_value, str):
                raise ValueError("Archive page is missing its Markdown file path")
            path = PurePosixPath(path_value)
            if (
                path.is_absolute()
                or "\\" in path_value
                or path.suffix.lower() != ".md"
                or any(part in {"", ".", ".."} for part in path.parts)
                or path_value not in files
                or path_value in paths
            ):
                raise ValueError("Archive contains an invalid or duplicate Markdown path")
            ids.add(note_id)
            paths.add(path_value)
            expected_files.add(path_value)

            try:
                markdown = archive.read(files[path_value]).decode("utf-8")
            except (UnicodeDecodeError, RuntimeError, EOFError, zipfile.BadZipFile, zlib.error, NotImplementedError) as exc:
                raise ValueError(f"{path_value} is not a readable UTF-8 Markdown file") from exc
            manifest_title = str(record.get("title", "Untitled"))
            title = manifest_title
            first_line, separator, remaining = markdown.partition("\n")
            if first_line.startswith("# "):
                heading = first_line[2:]
                title = manifest_title if heading == _markdown_title(manifest_title) else heading.strip()
                content = remaining[1:] if separator and remaining.startswith("\n") else remaining
            else:
                content = markdown
            source_url = record.get("source_url")
            if isinstance(source_url, str) and source_url:
                safe_url = quote(source_url, safe=MARKDOWN_URL_SAFE)
                source_marker = f"\n\n[Original source](<{safe_url}>)."
                if content.endswith(source_marker):
                    content = content[:-len(source_marker)]

            try:
                validated = NoteCreate(
                    title=title,
                    content=content,
                    category=record.get("category", "General"),
                    icon=record.get("icon", "✦"),
                    source_url=source_url,
                    inbox=record.get("inbox", False),
                )
            except ValidationError as exc:
                raise ValueError(f"Page '{title[:80]}' has invalid or oversized fields") from exc
            bookmarked = record.get("bookmarked", False)
            if not isinstance(bookmarked, bool):
                raise ValueError(f"Page '{title[:80]}' has an invalid bookmark value")
            normalized.append({
                "id": note_id,
                "path": path_value,
                "parent_id": record.get("parent_id"),
                "title": validated.title,
                "content": validated.content,
                "category": validated.category,
                "icon": validated.icon,
                "source_url": validated.source_url,
                "inbox": validated.inbox,
                "bookmarked": bookmarked,
                "created_at": _parse_datetime(record.get("created_at")),
                "updated_at": _parse_datetime(record.get("updated_at")),
            })

        if files.keys() != expected_files:
            raise ValueError("Archive contains files outside its Noteform Markdown export")

        by_id = {note["id"]: note for note in normalized}
        for note in normalized:
            parent_id = note["parent_id"]
            if parent_id is not None and (not isinstance(parent_id, str) or parent_id not in by_id):
                raise ValueError("Archive refers to a missing parent page")
            if note["inbox"] and parent_id is not None:
                raise ValueError("Inbox captures cannot be nested under another page")

        for note in normalized:
            seen: set[str] = set()
            parent_id = note["id"]
            while parent_id is not None:
                if parent_id in seen:
                    raise ValueError("Archive contains a circular page hierarchy")
                seen.add(parent_id)
                parent_id = by_id[parent_id]["parent_id"]
    return normalized


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError("Archive contains an invalid page timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Archive contains an invalid page timestamp") from exc
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
