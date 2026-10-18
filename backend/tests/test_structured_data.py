import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from app.structured_data import normalize_columns, validate_record_values
from app.structured_schemas import DataTableCreate


class StructuredDataTests(unittest.TestCase):
    def test_table_schema_generates_stable_column_ids_and_normalizes_names(self):
        table = DataTableCreate(
            name="  Reading list ",
            columns=[
                {"name": " Title ", "type": "text"},
                {"name": "Status", "type": "select", "options": ["Unread", "Read"]},
            ],
        )

        self.assertEqual(table.name, "Reading list")
        self.assertEqual([column.name for column in table.columns], ["Title", "Status"])
        self.assertTrue(all(column.id for column in table.columns))

    def test_duplicate_column_names_and_select_options_are_rejected(self):
        with self.assertRaises(HTTPException):
            DataTableCreate(columns=[
                {"name": "Name", "type": "text"},
                {"name": " name ", "type": "text"},
            ])
        with self.assertRaises(HTTPException):
            DataTableCreate(columns=[{"name": "Status", "type": "select", "options": []}])
        with self.assertRaises(ValidationError):
            DataTableCreate(name="  ")

    def test_column_normalization_rejects_duplicate_ids(self):
        with self.assertRaises(HTTPException):
            normalize_columns([
                {"id": "same", "name": "One", "type": "text"},
                {"id": "same", "name": "Two", "type": "text"},
            ])

    def test_record_values_are_type_checked_and_missing_values_are_empty(self):
        columns = [
            {"id": "title", "name": "Title", "type": "text", "options": []},
            {"id": "score", "name": "Score", "type": "number", "options": []},
            {"id": "due", "name": "Due", "type": "date", "options": []},
            {"id": "done", "name": "Done", "type": "checkbox", "options": []},
            {"id": "status", "name": "Status", "type": "select", "options": ["Todo", "Done"]},
        ]
        values = validate_record_values(columns, {
            "title": "Read a book",
            "score": 3,
            "due": "2026-10-18",
            "done": False,
            "status": "Todo",
        })
        self.assertEqual(values["title"], "Read a book")
        self.assertIsNone(values.get("missing"))
        self.assertIsNone(validate_record_values(columns, {})["score"])

    def test_record_rejects_unknown_or_wrongly_typed_values(self):
        columns = [{"id": "count", "name": "Count", "type": "number", "options": []}]
        for values in ({"other": 1}, {"count": True}, {"count": float("inf")}):
            with self.subTest(values=values), self.assertRaises(HTTPException):
                validate_record_values(columns, values)

    def test_record_rejects_invalid_date_and_select_values(self):
        columns = [
            {"id": "due", "name": "Due", "type": "date", "options": []},
            {"id": "status", "name": "Status", "type": "select", "options": ["Todo", "Done"]},
        ]
        for values in ({"due": "not a date"}, {"status": "Unknown"}):
            with self.subTest(values=values), self.assertRaises(HTTPException):
                validate_record_values(columns, values)


if __name__ == "__main__":
    unittest.main()
