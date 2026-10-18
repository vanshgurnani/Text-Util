# Structured data and spreadsheet roadmap

## Product goal

Let people keep both prose and structured information in Noteform. A user
should be able to make a spreadsheet-like table, choose what each column
means, sort and filter rows, and bring existing CSV or Excel data in without
having to rebuild it by hand.

This roadmap describes a product direction, not features that are already
implemented. It complements the [product roadmap](./PRODUCT-ROADMAP.md) and
the [frontend UI redesign plan](./FRONTEND-UI-REDESIGN.md).

## Product principles

- **Tables and pages work together:** a table can live inside a page, and a
  record can open as a full page when it needs more context.
- **Start with familiar spreadsheet behavior:** rows, columns, cell editing,
  sorting, filtering, and import should be understandable without setup.
- **Make structure optional:** users can keep writing notes as Markdown; a
  database is an additional way to organize information, not a replacement for
  notes.
- **Respect the source data:** show import mapping and validation problems
  before writing records; never silently discard columns or rows.
- **Be explicit about spreadsheet compatibility:** CSV/XLSX data import and
  export do not imply support for Excel macros, pivot tables, formatting,
  external connections, or formula recalculation.
- **Keep user data portable:** provide export and test import/export round trips
  as structured capabilities grow.

## Intended users and first jobs

- Researchers tracking sources, observations, or experiments.
- Students organizing readings, assignments, or study plans.
- Solo builders tracking projects, contacts, inventories, and lightweight
  workflows.
- Existing spreadsheet users who want records connected to notes and pages.

Initial jobs to support:

1. Create a table and define useful columns.
2. Add and edit records quickly without opening each page.
3. Import an existing spreadsheet and continue working with its rows.
4. Find, sort, filter, and export the records later.
5. Open an important record as a Noteform page to add long-form context.

## Information model

### Table

A table is a named collection of records with a stable identity, an owner, and
an optional parent page. It has ordered property definitions and one or more
views. Deleting a view must not delete table data.

### Property types

Ship the types in a practical sequence:

1. **Text** — names, labels, and general values.
2. **Number** — numeric values, with optional display precision.
3. **Date** — a date, with time/timezone behavior added only when needed.
4. **Checkbox** — true/false.
5. **Select** — one option from a user-defined set, optionally colored.
6. **URL** — validated links.
7. **Relation** — a link to another record or Noteform page.
8. **Multi-select** — more than one user-defined option.
9. **Formula** — calculated values after expression behavior, dependency
   tracking, and error display are specified.

Each property needs a stable ID, display name, type, ordering, and type-checked
configuration. Renaming a property must not lose its values. Type conversion
must preview incompatible values and require an explicit choice to convert,
clear, or cancel.

### Records and pages

- Every record has a stable ID and values keyed by property ID, not by the
  visible column name.
- A record can have an optional long-form page body and parent-page context.
- Tables may be embedded in a page or opened as a full workspace surface.
- A record's displayed row values and its detail page must stay in sync.
- Existing Markdown pages remain unchanged and do not need to become records.

## Roadmap

### Release 1 — Useful table basics

- [ ] Create, rename, and delete a table; optionally locate it under a page.
- [ ] Start with a useful name/text column and let the user add, rename,
  reorder, and delete properties.
- [ ] Support Text, Number, Date, Checkbox, and Select columns.
- [ ] Add, edit, duplicate, and delete records with clear confirmation for
  destructive actions.
- [ ] Edit common cell values inline; expose a row detail panel for longer
  content.
- [ ] Sort by one property and filter by text, select, checkbox, and date.
- [ ] Save a default table view and preserve a stable ordering of rows.
- [ ] Show empty, loading, validation, save, and error states.

**Release 1 acceptance:** a user can create a table, enter at least 100 records,
edit and reload them without data loss, and find a record using sort and filter.
Existing page editing, navigation, and autosave continue to work.

### Release 2 — Bring spreadsheet data in and out

- [ ] Import CSV and `.xlsx` workbooks from the workspace.
- [ ] For workbooks, let the user choose a sheet; do not silently merge sheets.
- [ ] Preview detected headers, sample rows, inferred property types, and
  invalid values before import.
- [ ] Let the user rename columns and override detected types in the preview.
- [ ] Detect empty header names and duplicate headers; propose safe unique names
  while allowing the user to correct them.
- [ ] Report skipped/invalid rows and cell conversion problems. Provide a
  downloadable error report rather than silently dropping data.
- [ ] Enforce file size, sheet, row, column, and cell-length limits; show these
  limits before import.
- [ ] Export the current view or entire table to CSV and `.xlsx`.
- [ ] Document round-trip behavior for dates, numbers, Unicode, empty cells,
  and formulas.

**Release 2 acceptance:** a user can import a representative CSV or one chosen
sheet from an `.xlsx`, inspect the mapping before commit, correct errors, and
export the resulting records to a usable spreadsheet without losing supported
values.

**Compatibility boundary:** import formulas as their displayed/cached values
where available; do not execute workbook formulas. Preserve formatting and
formulas only if a later, tested compatibility scope explicitly adds them.
Macros, VBA, pivot tables, charts, external data connections, and workbook
automation are not part of initial support.

### Release 3 — Views for different work

- [ ] Add saved Table views with independent sort, filter, and visible-column
  settings.
- [ ] Add a Board view grouped by a Select property.
- [ ] Add a Calendar view for Date properties after timezone/date-only behavior
  is stable.
- [ ] Make view switching operate on the same underlying records.
- [ ] Add group totals/counts only after row-level filtering and empty states
  are reliable.

**Release 3 acceptance:** edits in one view appear consistently in every other
view, and deleting a view leaves all records untouched.

### Release 4 — Connect tables to Noteform pages

- [ ] Open a record as a full page with structured properties above its
  Markdown body.
- [ ] Link table records to existing pages and other records.
- [ ] Add reciprocal relation display and filters across related records.
- [ ] Provide a page link to its source table and a reliable return path.
- [ ] Extend workspace search to include table names, property values, and
  record content with clear result types.

**Release 4 acceptance:** users can move between a table row, its record page,
related pages, and the source table without duplicate or stale data.

### Release 5 — Calculations and advanced spreadsheet workflows

- [ ] Define a small, safe formula language with documented functions and
  operators; never evaluate arbitrary code.
- [ ] Show formula errors at the affected cell and make dependency changes
  predictable.
- [ ] Add multi-property sorts, advanced filters, and optional grouping.
- [ ] Consider bulk edit, paste-from-spreadsheet, and fill behavior based on
  observed use.
- [ ] Consider formula-preserving workbook export only after compatibility
  tests and clear warnings exist.

**Release 5 acceptance:** formulas recalculate deterministically, surface
invalid references, and never overwrite source values without an explicit user
action.

## Import and data safety requirements

- Never execute formulas, macros, scripts, or embedded workbook content.
- Treat file names, sheet names, headers, and cell values as untrusted input.
- Keep imported tables and records scoped to the authenticated owner.
- Preview before committing; an import should either complete as reported or
  clearly explain partial results and how to recover.
- Do not coerce text into a number/date without showing the detected mapping.
- Make duplicate import behavior explicit: create a new table by default;
  merging into an existing table requires a user-selected matching key and
  conflict preview.
- Validate export and import limits server-side as well as in the UI.
- Avoid sending workbook contents to external services for type inference.

## Technical discovery before implementation

The current application stores notes in MongoDB and does not yet have a
structured table/record model. Before Release 1, decide and document:

- MongoDB document boundaries and ownership indexes for tables, properties,
  records, and views.
- Whether records are embedded in table documents or stored separately; avoid
  unbounded table documents and preserve atomic row-level updates.
- Property-ID migration behavior for rename, reorder, and type conversion.
- Version/conflict semantics for simultaneous record edits.
- Limits and paging strategy for large tables.
- CSV/XLSX parser and writer choices, licensing, maintenance, and server-side
  resource limits.
- Backup/export behavior for tables and records.

Do not start with formula engines, real-time collaboration, or a full Excel
clone. First make basic structured records reliable and validate that users
actually want tables connected to their Noteform pages.

## Product metrics

- Table creation completion rate.
- Spreadsheet import completion and correction rates.
- Percentage of imported rows and columns retained after preview.
- Time to find a record compared with the user's prior spreadsheet workflow.
- Record edit failure and conflict rates.
- Export success rate and repeat export/import round-trip consistency.

Collect only privacy-respecting aggregate metrics; never collect table cell
contents for product analytics.

## Suggested first implementation slice

Build Release 1's core: create a table, manage five basic property types,
inline-edit rows, and sort/filter. Then add CSV/XLSX import/export as a separate
release with explicit preview and validation. This gives users a usable
spreadsheet-like workflow early without promising unsupported Excel behavior.
