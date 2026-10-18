# Frontend UI redesign plan

## Goal

Make Noteform feel like a polished personal workspace inspired by the clarity
and navigation patterns of modern document apps, while keeping Noteform's calm
visual identity and Markdown-first data model.

## Product principles

- Use familiar workspace conventions without copying another product's exact
  screen composition, branding, or visual design.
- Keep page content and navigation visually distinct.
- Let users focus on one page without losing quick access to the workspace.
- Keep common navigation, search, and save actions discoverable.
- Prefer readable content and predictable scrolling over dense controls.
- Preserve keyboard access, mobile usability, autosave, and conflict recovery.
- Improve the existing editor incrementally; do not replace it with a new editor
engine until the workflows and data model are ready.

## Release 1 — Workspace shell and page canvas

- [x] Bound the workspace to the viewport and give navigation, note results,
  and page content predictable internal scrolling.
- [x] Add a collapsible desktop sidebar and a mobile navigation drawer.
- [x] Keep workspace actions and editor save controls visible while content
  scrolls.
- [x] Center page content in a readable-width document canvas with improved
  spacing and typography.
- [x] Keep Markdown preview, images, and wide tables inside the page canvas.

**Outcome:** users can navigate and read long pages without losing the workspace
context or scrolling the entire browser page.

## Release 2 — Page presentation

- [x] Give pages a refined title area, icon affordance, and breadcrumbs.
- [ ] Add a consistent page-action menu.
- [x] Improve heading, list, quote, code, image, and table typography in both
  preview and editor-related surfaces.
- [x] Establish a neutral light palette with a muted green Noteform accent.
- [ ] Add optional page covers only after image upload and storage behavior is
  defined.

## Release 3 — Navigation and organization

- [ ] Improve page-tree affordances, expansion state, and large-tree behavior.
- [ ] Add consistent move, duplicate, favorite, and delete actions.
- [ ] Show child pages and related-page links in a compact, scannable layout.
- [ ] Add backlinks after internal page linking is implemented.

## Release 4 — Editing interactions

- [ ] Add common Markdown keyboard shortcuts and contextual insert actions.
- [ ] Improve Write/Preview transitions and preserve the reader's scroll
  position when practical.
- [ ] Prototype block editing as a progressive enhancement, with Markdown
  import/export and autosave regression tests before broad rollout.

## Release 5 — Accessibility and polish

- [ ] Review keyboard focus, screen-reader labels, color contrast, and touch
  targets across navigation, editor, and dialogs.
- [ ] Add reduced-motion support and polish loading, empty, success, and error
  states.
- [ ] Validate responsive behavior with long notes, wide tables, images, and
  small-screen layouts.

## Verification checklist

- Existing page creation, editing, autosave, conflict handling, delete, Inbox,
  and navigation behavior remain intact.
- Long page and preview content scroll inside the intended workspace pane.
- Sidebar can be collapsed and reopened on desktop; mobile drawer closes after
  navigation and on backdrop click.
- Wide tables scroll horizontally without widening the entire app.
- Production build and whitespace checks pass.
