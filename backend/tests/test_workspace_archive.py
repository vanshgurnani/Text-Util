import io
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
        by_title = {note["title"]: note for note in imported}
        archive = zipfile.ZipFile(io.BytesIO(create_workspace_archive(self.notes)))

        self.assertNotIn("manifest.json", archive.namelist())
        self.assertEqual(by_title["Research  Notes"]["parent_id"], None)
        self.assertEqual(by_title["Nested page"]["parent_id"], by_title["Research  Notes"]["id"])
        self.assertIn(self.notes[0]["content"], by_title["Research  Notes"]["content"])
        self.assertIn("https://example.test/page?a=1&b=two", by_title["Research  Notes"]["content"])
        self.assertTrue(by_title["Captured link"]["inbox"])
        self.assertEqual(by_title["Research  Notes"]["category"], "General")
        self.assertFalse(by_title["Research  Notes"]["bookmarked"])

    def test_rejects_invalid_zip_and_unsafe_paths(self):
        with self.assertRaisesRegex(ValueError, "valid Noteform Markdown ZIP"):
            parse_workspace_archive(b"not a zip")

        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("../outside.md", "# outside")
        with self.assertRaisesRegex(ValueError, "unsafe file path"):
            parse_workspace_archive(output.getvalue())

    def test_accepts_normal_directory_entries(self):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(create_workspace_archive(self.notes))) as source:
            files = {name: source.read(name) for name in source.namelist()}
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Pages/", b"")
            archive.writestr("Pages/research--root-1/", b"")
            for name, contents in files.items():
                archive.writestr(name, contents)

        imported = parse_workspace_archive(output.getvalue())
        self.assertEqual(len(imported), len(self.notes))

    def test_rejects_extra_binary_files(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("page.md", "# Page\n\nBody")
            archive.writestr("assets/image.png", b"binary")
        with self.assertRaisesRegex(ValueError, "Markdown files only"):
            parse_workspace_archive(output.getvalue())

    def test_rejects_more_than_500_pages(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for index in range(501):
                archive.writestr(f"page-{index}.md", "# Page")
        with self.assertRaisesRegex(ValueError, "more than 500 Markdown pages"):
            parse_workspace_archive(output.getvalue())

    def test_imports_a_markdown_only_zip_with_folder_hierarchy(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Research.md", "# Research\n\nParent page")
            archive.writestr("Research/Child.md", "# Child\n\nChild page")
        imported = parse_workspace_archive(output.getvalue())
        parent = next(note for note in imported if note["title"] == "Research")
        child = next(note for note in imported if note["title"] == "Child")
        self.assertEqual(child["parent_id"], parent["id"])


if __name__ == "__main__":
    unittest.main()
