# Noteform Product Roadmap

This roadmap focuses on making Noteform a daily-use personal workspace: fast to
capture in, flexible enough to organize work, and useful as a trusted home for
long-term knowledge. It complements the
[architecture roadmap](./ARCHITECTURE-ROADMAP.md), which covers technical
foundations and operations.

## Product direction

Make Noteform feel like a personal home for notes, plans, and projects—not just
a list of documents. Users should be able to capture something in seconds,
shape it into a useful page, connect it to related work, and find it again
without needing to remember exactly where they put it.

### Product principles

- Capture before categorizing: never make organization a prerequisite for
  writing something down.
- Start simple and reveal power progressively.
- Keep pages quick to open, edit, search, and move.
- Make keyboard use first-class while keeping every action discoverable.
- Give users control over reminders, collaboration, and AI processing.
- Support import and export so users can trust that their work remains theirs.

## Market snapshot and differentiation

### Competitor snapshot

Reviewed on **2026-10-18** from the vendors' public product pages. This is a
directional feature snapshot, not an exhaustive feature, pricing, or quality
comparison; product plans change frequently.

| Product | Publicly emphasized strengths | Product lesson for Noteform |
| --- | --- | --- |
| [Notion](https://www.notion.com/product) | Connected docs, wikis, projects, enterprise search, meeting notes, and agents that can run on schedules or triggers. | Users value one connected place, but an individual note app should not inherit team-admin complexity just to feel capable. |
| [Obsidian](https://obsidian.md/about) | Local Markdown files, privacy and data ownership, customization, plus a visual [Canvas](https://obsidian.md/canvas) for arranging notes and media. | Portability and user trust can be product features. Make powerful organization useful without requiring plugin research and setup. |
| [Capacities](https://capacities.io/product) | Typed objects and properties, templates, multiple views, bidirectional links, backlinks, graph, daily notes, capture integrations, and media-aware workflows. | Capture and connections should happen in the natural flow of writing, not as a separate filing chore. |
| [Craft](https://www.craft.do) | A polished space combining docs, tasks, calendar, whiteboards, and daily notes across devices. | Speed, visual quality, and an approachable experience matter as much as feature breadth. |

The feature descriptions above summarize the linked vendor pages; they do not
imply that every feature is available on every plan or platform. Recheck these
sources before making roadmap or pricing decisions.

### Where Noteform should compete

Do not try to win by accumulating the longest feature checklist. Pick a clear
audience and make a few connected workflows dramatically easier.

**Proposed position:** a calm, private-by-default, portable personal knowledge
workspace where captured information becomes useful notes—and where users can
bring their own AI tools instead of being locked into one assistant.

**Initial audience to validate:** students, independent researchers, and solo
builders who collect information from many places, need to retrieve it later,
and do not want to choose between a rigid all-in-one suite and a do-it-yourself
plugin setup.

### Three signature product bets

1. **Capture anything, keep its source.** Save a thought, web page, PDF, image,
   or voice memo into one Inbox from desktop and mobile. Preserve the original
   URL/file and let the user add context later. Start with one high-quality
   capture path, then add integrations based on usage.
2. **Make knowledge portable by default.** Import Markdown and attachments with
   folder structure and links intact. Export the whole workspace at any time
   into readable Markdown plus assets. Document exactly what round-trips and
   test it; do not promise local-first or end-to-end encryption until the
   architecture actually guarantees it.
3. **AI that works across the user's tools and shows its sources.** Provide
   optional, source-linked answers over the user's own pages and captured
   material. Keep MCP as a first-class interface, support narrowly scoped
   read/write permissions, and require approval for destructive or bulk
   actions. Explain which provider receives data and never turn on external
   processing silently.

### Differentiation guardrails

- **Useful before setup:** the default workspace, Inbox, templates, and search
  should work without custom schema design, plug-ins, or onboarding projects.
- **Capture first, organize later:** every capture gets a reliable destination;
  tags, page links, and AI suggestions remain optional.
- **Open exit, not lock-in:** visible export controls and a tested import/export
  format are part of the core experience, not a late enterprise feature.
- **AI is an interface, not the product's owner:** users can write and find
  notes without AI; AI suggestions are labeled, reviewable, and attributable to
  source pages.
- **Opinionated defaults, user control:** ship a coherent workflow first, then
  expose customization where real users ask for it.
- **Trust is observable:** show save state, source links, access scopes, and
  export status clearly.

### How to validate that this is genuinely different

Before investing in a signature bet:

1. Interview target users about their last real capture and retrieval task;
   observe their current workaround rather than asking which feature they want.
2. Recruit users of at least two different alternatives, including a
   portability-focused tool and an all-in-one workspace.
3. Prototype the same task in Noteform and the user's current tool. Measure
   time-to-capture, time-to-find, successful source recovery, and setup effort.
4. Test willingness to switch by asking users to import a real, non-sensitive
   sample workspace and complete a weekly workflow.
5. Ship only when the workflow is meaningfully easier for the target audience
   and data export remains reliable.

Treat these as comparative tests, not claims that Noteform is already faster
or better. Establish baselines before setting numeric targets.

## Current foundation

Noteform already has accounts, notes/pages, nested page navigation, categories,
bookmarks, Markdown editing and preview, search, MCP access, and a quick-capture
Inbox that can preserve a source URL. Treat these as the starting point, not as
roadmap deliverables. Before layering on features, make the core create, edit,
save, navigate, and delete flows reliable on desktop and mobile. Richer capture
sources such as browser/mobile share, PDFs, and voice remain future work.

## Roadmap at a glance

| Stage | User outcome | Main capabilities |
| --- | --- | --- |
| 1. Daily driver | Capture and edit without friction | Autosave, inbox, block editor, keyboard shortcuts, mobile layout |
| 2. Personal knowledge base | Organize and reconnect information | Tags, backlinks, command search, templates, import/export |
| 3. Work management | Turn pages into trackable work | Tasks, dates, reminders, tables, board and calendar views |
| 4. Shared workspace | Work with other people safely | Sharing, comments, presence, permissions, collaboration history |
| 5. Personal intelligence | Get useful help across your workspace | Optional AI search, summaries, actions, and richer MCP tools |

Build each stage on user feedback and measured reliability; do not start every
stage at once.

## Stage 1 — Make it a daily driver

### 1. Fast capture inbox

- Add a persistent **Quick capture** action from every screen.
- Save a short note immediately to a personal Inbox, without asking for a page,
  category, or template first.
- Let users turn an inbox item into a page, task, or archived item later.
- Support capture from a keyboard shortcut and a small mobile-friendly form.

**Done when:** a signed-in user can capture a thought and return to their prior
page without losing context; new captures appear in Inbox across refreshes.

### 2. Reliable autosave and editing

- Autosave after a short pause and when leaving a page.
- Show clear Saving, Saved, and Save failed states with a retry action.
- Prevent a slow save from overwriting newer edits; detect concurrent changes.
- Add Markdown shortcuts and a slash menu for headings, lists, quotes, code,
  images, dividers, and links.
- Provide a mobile editing layout that does not require the two-column desktop
  workspace.

**Done when:** edits survive navigation, reload, and transient network failure,
and users can tell whether the latest change has been persisted.

### 3. Make navigation feel immediate

- Add a command palette for opening pages, creating a page, and common actions.
- Add keyboard navigation for the page tree and note results.
- Add recent pages and a clearly visible Inbox entry.
- Add breadcrumbs and quick parent/child navigation on nested pages.

**Done when:** users can open a known page from the keyboard and navigate back
to its parent without scanning the full page tree.

## Stage 2 — Build a personal knowledge base

### 4. Tags and flexible organization

- Allow multiple user-created tags per page, with autocomplete and tag colors.
- Keep categories as broad folders/contexts; use tags for cross-cutting topics.
- Add pinned pages and favorites, plus sort options such as recently edited,
  created date, and title.
- Add archive and restore before considering permanent deletion workflows.

**Done when:** a page can be found through its parent, category, tag, favorite,
or search without creating duplicate copies.

### 5. Search that finds the right thing

- Search page titles and content with highlighted matching excerpts.
- Filter by page, tag, category, favorite, and updated date.
- Offer recent searches and useful empty states.
- Add a global search shortcut that works from the editor and page tree.

**Done when:** search results are relevant, fast, permission-safe, and link
directly to the matching page.

### 6. Links, backlinks, and templates

- Link one page to another from the editor.
- Show backlinks so users can see which pages refer to the current page.
- Provide editable templates for meeting notes, project plans, journals, and
  reading notes.
- Let users create, rename, and duplicate their own templates.

**Done when:** users can move between related pages and start a repeatable
workflow from a template without copying old notes manually.

### 7. Keep user data portable

- Import Markdown files and folders while preserving folder relationships.
- Export a page or workspace as Markdown and attachments.
- Include a readable JSON export for backup and migration.
- Preview import counts and conflicts before writing imported data.

**Done when:** a user can export their workspace and re-import it into a fresh
account without losing page hierarchy or content.

## Stage 3 — Turn pages into useful work

### 8. Lightweight tasks and reminders

- Add task blocks with completion state, due date, and optional assignee.
- Collect tasks into a focused **My tasks** view across pages.
- Add opt-in reminders with timezone-aware delivery settings.
- Let completed tasks be hidden or reviewed, not silently discarded.

**Done when:** completing or changing a task is reflected consistently in its
source page and task views.

### 9. Structured databases and multiple views

- Let users create a simple table with typed properties: text, status, date,
  checkbox, select, and page relation.
- Provide table and board views first; add calendar view when date properties
  are reliable.
- Support sorting, filtering, and saved views.
- Allow rows to open as full pages.

**Done when:** the same underlying records can be edited from a table or board
without creating conflicting copies of data.

### 10. Useful page building blocks

- Add reusable blocks for callouts, toggles, quotes, code, files, and embeds.
- Add drag-to-reorder with accessible keyboard alternatives.
- Add undo/redo and duplicate block/page actions.
- Support image upload with previews and clear storage limits.

**Done when:** common project, study, and planning pages can be built without
hand-writing Markdown or losing content when blocks are rearranged.

## Stage 4 — Collaborate safely

Ship collaboration only after personal page ownership and sharing boundaries
are clear.

- Share a page with a specific person using viewer or editor permission.
- Show who has access and provide immediate revoke controls.
- Add comments and mentions before live co-editing.
- Add workspace membership and shared page trees as an explicit opt-in.
- Add version history and restore before enabling simultaneous editing.

**Done when:** access tests prove that private pages stay private, revoked
members lose access promptly, and users can inspect or restore important edits.

## Stage 5 — Personal intelligence and integrations

AI and external integrations must be optional, explain what data is processed,
and never silently make destructive changes.

- Add natural-language search that links answers to the source pages.
- Generate summaries, action items, and page outlines on request.
- Suggest related pages and possible backlinks, with user approval to apply.
- Preview bulk edits and require confirmation before deleting or changing many
  pages.
- Expand MCP with page hierarchy, tags, tasks, and search filters; keep scopes,
  ownership checks, and clear tool descriptions.
- Add a privacy control for each AI-powered capability and show which pages
  were used to create a result.

**Done when:** AI results are traceable to source pages, private content is not
sent to an external provider without consent, and every write action is
reviewable and reversible where practical.

## Quality bar for every release

- Core flows work with keyboard, pointer, and touch.
- The interface communicates loading, empty, success, and error states.
- Mutations are recoverable or clearly confirmed before they become permanent.
- Page data is scoped to the authenticated user or explicitly shared workspace.
- Search and page-tree actions remain usable with large workspaces.
- Add automated tests for the changed workflow and verify production builds.
- Provide data export before expanding dependency on Noteform-specific content.

## Product metrics

Use a small set of privacy-respecting, aggregated metrics to decide what to
build next. Do not collect note contents for product analytics.

- **Activation:** percentage of new users who create a page and return to it.
- **Time to capture:** time from opening the app to a saved first thought.
- **Weekly value:** users who create or meaningfully update pages in a week.
- **Retrieval success:** searches that lead to opening a result rather than an
  immediate repeat search.
- **Reliability:** save failure rate, data-loss reports, and time to recover.
- **Portability:** successful export and import completion rates.

Set numeric targets only after collecting a trustworthy baseline and explaining
analytics choices to users.

## Recommended first four releases

1. **Trust the editor:** autosave, explicit save/error states, conflict
   protection, and mobile editing.
2. **Capture and find:** Inbox, one excellent capture path, global
   command/search palette, search excerpts, and keyboard navigation.
3. **Make switching safe:** Markdown and attachment import/export with
   preserved hierarchy, links, and a documented round-trip test.
4. **Connect knowledge:** user-created tags, backlinks, and templates, guided
   by the capture and retrieval patterns users actually adopt.

These releases establish trust, a distinctive capture/retrieval loop, and a
credible no-lock-in story before the larger investment in databases,
collaboration, and AI. Revisit the competitor snapshot regularly; compete on
validated user outcomes, not feature-count parity.

## Market research sources

- [Notion product overview](https://www.notion.com/product) and
  [Notion AI](https://www.notion.com/product/ai)
- [Obsidian principles](https://obsidian.md/about),
  [Canvas](https://obsidian.md/canvas), and
  [Sync](https://obsidian.md/sync)
- [Capacities product and features](https://capacities.io/product)
- [Craft product overview](https://www.craft.do)

Public pages reviewed 2026-10-18. Revisit quarterly and before major roadmap
decisions. Feature availability and packaging may change by region, platform,
and plan.
