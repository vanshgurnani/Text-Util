import unittest
from datetime import datetime

from app.schemas import Note, NoteUpdate, PublicNote
from app.serializers import serialize_note, serialize_public_note


class PublicShareTests(unittest.TestCase):
    def test_note_update_allows_is_public(self):
        self.assertIsNone(NoteUpdate().is_public)
        self.assertTrue(NoteUpdate(is_public=True).is_public)
        self.assertFalse(NoteUpdate(is_public=False).is_public)

    def test_serialize_note_includes_public_fields(self):
        raw = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Public Guide",
            "content": "Hello world",
            "category": "Docs",
            "icon": "📖",
            "is_public": True,
            "public_id": "pub_abc123xyz",
            "created_at": datetime(2026, 1, 1),
            "updated_at": datetime(2026, 1, 2),
        }
        serialized = serialize_note(raw)
        self.assertTrue(serialized["is_public"])
        self.assertEqual(serialized["public_id"], "pub_abc123xyz")

    def test_serialize_note_defaults_to_not_public(self):
        raw = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Private Note",
            "created_at": datetime(2026, 1, 1),
            "updated_at": datetime(2026, 1, 2),
        }
        serialized = serialize_note(raw)
        self.assertFalse(serialized["is_public"])
        self.assertIsNone(serialized["public_id"])

    def test_serialize_public_note_excludes_private_fields(self):
        raw = {
            "_id": "507f1f77bcf86cd799439011",
            "owner_id": "user_12345",
            "version": 4,
            "title": "My Public Manifesto",
            "content": "# Heading\n\nContent to share",
            "category": "Ideas",
            "icon": "💡",
            "tags": ["strategy", "open"],
            "is_public": True,
            "public_id": "pub_test123",
            "created_at": datetime(2026, 2, 1),
            "updated_at": datetime(2026, 2, 2),
        }
        public = serialize_public_note(raw)
        self.assertEqual(public["title"], "My Public Manifesto")
        self.assertEqual(public["content"], "# Heading\n\nContent to share")
        self.assertEqual(public["category"], "Ideas")
        self.assertEqual(public["icon"], "💡")
        self.assertEqual(public["tags"], ["strategy", "open"])
        # Ensure private fields are NOT present
        self.assertNotIn("owner_id", public)
        self.assertNotIn("_id", public)
        self.assertNotIn("id", public)
        self.assertNotIn("version", public)
        self.assertNotIn("is_public", public)
        self.assertNotIn("public_id", public)


if __name__ == "__main__":
    unittest.main()
