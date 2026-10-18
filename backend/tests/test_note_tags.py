import unittest
from datetime import datetime

from pydantic import ValidationError

from app.schemas import NoteCreate, NoteUpdate
from app.serializers import serialize_note


class NoteTagTests(unittest.TestCase):
    def test_note_create_normalizes_and_deduplicates_tags(self):
        note = NoteCreate(tags=["  Research ", "RESEARCH", "reading"])

        self.assertEqual(note.tags, ["research", "reading"])

    def test_note_update_allows_clearing_tags(self):
        self.assertEqual(NoteUpdate(tags=[]).tags, [])
        self.assertIsNone(NoteUpdate().tags)

    def test_pin_state_is_optional_for_legacy_update_payloads(self):
        self.assertIsNone(NoteUpdate().pinned)
        self.assertTrue(NoteUpdate(pinned=True).pinned)

    def test_tag_count_and_length_are_limited(self):
        with self.assertRaises(ValidationError):
            NoteCreate(tags=[f"tag-{index}" for index in range(21)])
        with self.assertRaises(ValidationError):
            NoteCreate(tags=["x" * 33])

    def test_legacy_note_serializes_without_tags(self):
        serialized = serialize_note({
            "_id": "note-id",
            "created_at": datetime(2025, 1, 1),
            "updated_at": datetime(2025, 1, 1),
        })

        self.assertEqual(serialized["tags"], [])
        self.assertFalse(serialized["pinned"])


if __name__ == "__main__":
    unittest.main()
