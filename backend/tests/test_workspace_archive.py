import io
import json
import unittest
import zipfile

from app.workspace_archive import create_workspace_archive, parse_workspace_archive


class WorkspaceArchiveTests(unittest.TestCase):
    def setUp(self):
        self.notes = [
            {
                "id": "root-1",
                "title": " Research\n Notes ",
                "content": "  # Keep this exact\n![diagram](https://example.test/image.png)\n\n",
                "category": "Reading",
                "icon": "◈",
                "parent_id": None,
                "bookmarked": True,
                "inbox": False,
                "source_url": "https://example.test/page?a=1&b=two",
                "created_at": "2025-01-02T03:04:05+00:00",
                "updated_at": "2025-01-03T04:05:06+00:00",
            },
            {
                "id": "child-2",
                "title": "Nested page",
                "content": "Child content",
                "category": "Work",
                "icon": "□",
                "parent_id": "root-1",
                "bookmarked": False,
                "inbox": False,
                "source_url": None,
                "created_at": "2025-01-04T00:00:00+00:00",
                "updated_at": "2025-01-04T00:00:00+00:00",
            },
            {
                "id": "inbox-3",
                "title": "Captured link",
                "content": "Read this later",
                "category": "General",
                "icon": "⌁",
                "parent_id": None,
                "bookmarked": False,
                "inbox": True,
                "source_url": "https://example.test/capture",
                "created_at": "2025-01-05T00:00:00+00:00",
                "updated_at": "2025-01-05T00:00:00+00:00",
            },
        ]

    def test_round_trip_preserves_page_content_metadata_and_hierarchy(self):
        imported = parse_workspace_archive(create_workspace_archive(self.notes))
        by_id = {note["id"]: note for note in imported}

        self.assertEqual(by_id["root-1"]["content"], self.notes[0]["content"])
        self.assertEqual(by_id["root-1"]["title"], self.notes[0]["title"])
        self.assertEqual(by_id["root-1"]["parent_id"], None)
        self.assertEqual(by_id["child-2"]["parent_id"], "root-1")
        self.assertEqual(by_id["root-1"]["source_url"], self.notes[0]["source_url"])
        self.assertTrue(by_id["root-1"]["bookmarked"])
        self.assertTrue(by_id["inbox-3"]["inbox"])
        self.assertEqual(by_id["root-1"]["category"], "Reading")
        self.assertEqual(by_id["root-1"]["icon"], "◈")
        self.assertEqual(by_id["root-1"]["created_at"].isoformat(), self.notes[0]["created_at"])

    def test_rejects_invalid_zip_and_unsafe_paths(self):
        with self.assertRaisesRegex(ValueError, "valid Noteform Markdown ZIP"):
            parse_workspace_archive(b"not a zip")

        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("../outside.md", "# outside")
        with self.assertRaisesRegex(ValueError, "unsafe file path"):
            parse_workspace_archive(output.getvalue())

    def test_rejects_extra_binary_files(self):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(create_workspace_archive(self.notes))) as source:
            manifest = source.read("manifest.json")
            files = {name: source.read(name) for name in source.namelist() if name != "manifest.json"}
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", manifest)
            for name, contents in files.items():
                archive.writestr(name, contents)
            archive.writestr("assets/image.png", b"binary")
        with self.assertRaisesRegex(ValueError, "outside its Noteform Markdown export"):
            parse_workspace_archive(output.getvalue())

    def test_rejects_more_than_500_pages(self):
        output = io.BytesIO()
        manifest = {
            "format": "noteform-workspace",
            "version": 1,
            "notes": [{} for _ in range(501)],
        }
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "more than 500 pages"):
            parse_workspace_archive(output.getvalue())

    def test_rejects_circular_parent_relationships(self):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(create_workspace_archive(self.notes))) as source:
            manifest = json.loads(source.read("manifest.json"))
            files = {name: source.read(name) for name in source.namelist() if name != "manifest.json"}
        manifest["notes"][0]["parent_id"] = "child-2"
        manifest["notes"][1]["parent_id"] = "root-1"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
            for name, contents in files.items():
                archive.writestr(name, contents)
        with self.assertRaisesRegex(ValueError, "circular page hierarchy"):
            parse_workspace_archive(output.getvalue())


if __name__ == "__main__":
    unittest.main()
