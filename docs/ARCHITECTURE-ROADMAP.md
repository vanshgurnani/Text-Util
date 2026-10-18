# Noteform Architecture Roadmap

This document describes how to evolve Noteform from a working Dockerized MVP into a reliable, secure, extensible personal knowledge platform with first-class MCP integrations.

## 1. Current baseline

### Runtime

- Next.js App Router frontend in frontend/.
- FastAPI backend in backend/app/.
- MongoDB 7 for users, notes, summaries, and OAuth records.
- Docker Compose for local orchestration.
- Cloudflare Tunnel for public HTTPS MCP access.
- MCP JSON-RPC endpoint at POST /mcp.
- OAuth 2.1 discovery, dynamic registration, PKCE authorization code flow, and refresh tokens.
- Long-lived per-user MCP API tokens for generic clients.

### Strengths

- Clear frontend/backend separation.
- User ownership is applied to note queries.
- Secrets are environment-backed instead of hard-coded.
- MCP access is available through both OAuth and permanent token flows.
- The system can be run locally with one command.

### Current constraints

- The API is a single module with route, domain, and persistence logic mixed in main.py.
- PyMongo is synchronous inside FastAPI request handlers.
- Access tokens and OAuth records need stronger lifecycle and audit controls.
- Mongo indexes and schema migration checks are not yet managed as a formal process.
- There is no background job system for embeddings, imports, exports, or AI enrichment.
- There are no automated integration tests running in CI.
- The frontend stores web credentials in browser storage and needs a stronger production session boundary.
- Cloudflare Tunnel configuration is operationally documented but not validated automatically.
- The MCP tool catalog is hard-coded instead of being versioned and capability-driven.

## 2. Target architecture

~~~mermaid
flowchart LR
    Browser[Next.js web app] -->|HTTPS REST| Edge[Cloudflare / reverse proxy]
    ChatGPT[ChatGPT or MCP client] -->|HTTPS MCP + OAuth 2.1| Edge
    Edge --> API[FastAPI API]
    Edge --> MCP[MCP adapter]
    API --> Domain[Application services]
    MCP --> Domain
    Domain --> Mongo[(MongoDB replica set)]
    Domain --> Queue[Job queue]
    Queue --> Worker[Background workers]
    Worker --> Mongo
    Worker --> Vector[(Vector index)]
    API --> Metrics[Metrics and tracing]
    MCP --> Audit[Audit log]
    Domain --> ObjectStore[Object storage]
~~~

The important boundary is the application-service layer. REST and MCP should call the same note, search, authorization, and audit services instead of implementing separate business rules.

## 3. Architectural principles

1. User ownership is a hard boundary. Every note, search result, job, token, and export must be scoped to a workspace or user.
2. One domain, multiple interfaces. REST, the web UI, MCP, imports, and background workers should reuse the same application services.
3. Explicit capability security. Read, write, export, and administrative permissions should be separate scopes.
4. Short-lived access, revocable long-lived credentials. OAuth access tokens should expire quickly; refresh tokens and permanent API tokens must be hashed, rotatable, and revocable.
5. Asynchronous work is explicit. Embeddings, imports, exports, AI summaries, and indexing should not block API requests.
6. Observable by default. Every external request and AI/MCP action should have a request ID, latency, outcome, and actor.
7. Backward-compatible evolution. Version API and MCP contracts before changing note semantics or tool names.
8. Secure defaults. Production configuration should fail closed when secrets, HTTPS, or required origins are missing.

## 4. Recommended backend structure

Refactor the current backend gradually; do not perform a large rewrite in one release.

~~~text
backend/app/
├── main.py
├── config.py
├── database.py
├── api/
│   ├── auth.py
│   ├── notes.py
│   ├── workspaces.py
│   ├── insights.py
│   └── health.py
├── mcp/
│   ├── router.py
│   ├── auth.py
│   ├── tools.py
│   └── schemas.py
├── domain/
│   ├── notes.py
│   ├── workspaces.py
│   ├── permissions.py
│   └── search.py
├── repositories/
│   ├── users.py
│   ├── notes.py
│   ├── oauth.py
│   └── audit.py
├── workers/
│   ├── tasks.py
│   └── queue.py
└── observability/
    ├── logging.py
    └── tracing.py
~~~

### Migration rule

Move one route group at a time:

1. Extract repository calls.
2. Add a domain service with tests.
3. Make the REST route call the service.
4. Make the MCP tool call the same service.
5. Delete duplicate logic only after integration tests pass.

## 5. Data model evolution

### Workspace and membership

Introduce workspaces even if the first release creates one personal workspace per user.

~~~text
workspaces
  _id
  name
  owner_id
  created_at
  updated_at

workspace_members
  workspace_id
  user_id
  role: owner | editor | viewer
  created_at
~~~

Then change notes from only owner_id to:

~~~text
notes
  _id
  workspace_id
  created_by
  title
  content
  content_format
  category_id
  bookmarked
  version
  created_at
  updated_at
  deleted_at
~~~

Keep owner_id during migration, backfill workspace_id, then remove it only after all clients use workspace authorization.

### Note history

Add append-only revisions:

~~~text
note_revisions
  _id
  note_id
  workspace_id
  version
  title
  content
  changed_by
  change_source: web | mcp | import | ai
  created_at
~~~

Use optimistic concurrency with a version field so two tabs or an MCP client cannot silently overwrite each other.

### Token and audit records

Store only hashes for bearer tokens. Add:

~~~text
api_tokens
  _id
  user_id
  workspace_id
  token_hash
  label
  scopes
  last_used_at
  expires_at
  revoked_at
  created_at

audit_events
  _id
  actor_type: user | mcp_client | system
  actor_id
  workspace_id
  action
  resource_type
  resource_id
  request_id
  metadata
  created_at
~~~

Never put raw tokens, passwords, or full note content into logs.

## 6. Search and knowledge features

### Phase 1: reliable text search

- Add a normalized search field and MongoDB text indexes.
- Return highlighted matches and stable sort behavior.
- Add pagination using a cursor rather than unbounded result sets.
- Escape user-supplied regular expressions or replace regex search with indexed search.
- Add filters for workspace, category, bookmark, created date, and updated date.

### Phase 2: semantic search

- Create a background embedding job after note writes.
- Store embedding metadata with model version and content hash.
- Use a vector database or MongoDB vector search.
- Combine lexical and semantic results with a documented ranking formula.
- Do not send private note content to an external model without explicit workspace consent.

### Phase 3: knowledge graph and AI actions

- Extract links, tags, entities, and references asynchronously.
- Add an AI action preview before destructive or bulk changes.
- Require explicit confirmation for delete, export, and mass-update tools.
- Record model name, prompt version, source note IDs, and output status in an audit event.

## 7. MCP evolution

### Tool contract

Version tools without breaking existing clients:

- Keep existing names stable.
- Add optional fields before introducing required fields.
- Return structured content with stable IDs and concise human-readable text.
- Cap result count and content size.
- Include pagination cursors for search results.
- Add a get_capabilities or version endpoint before expanding the tool catalog.

### Proposed tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| search_notes | notes:read | Search notes with filters and pagination |
| get_note | notes:read | Read a single note |
| create_note | notes:write | Create a note with validation |
| update_note | notes:write | Update a note with version checking |
| list_bookmarks | notes:read | List bookmarked notes |
| summarize_notes | ai:use | Queue a summary job and return a job ID |
| export_notes | notes:export | Create a time-limited export |
| list_workspaces | workspace:read | Select an authorized workspace |

### MCP safety controls

- Enforce OAuth scopes in the tool dispatcher, not only in tool metadata.
- Add per-client and per-user rate limits.
- Add request size and output size limits.
- Return Retry-After for throttled requests.
- Require confirmation for destructive actions.
- Make idempotency keys available for create and update operations.
- Include audit event IDs in tool responses where useful.

## 8. Authentication and authorization plan

### Web application

1. Move from browser-stored JWTs to an HTTP-only, Secure, SameSite cookie session.
2. Add CSRF protection for cookie-authenticated mutations.
3. Add password reset and email verification.
4. Add login throttling and account lockout thresholds.
5. Add optional passkeys or TOTP.
6. Separate web sessions from MCP credentials.

### OAuth and MCP

1. Keep OAuth access tokens short-lived.
2. Hash refresh tokens and rotate them on every refresh.
3. Detect refresh-token reuse and revoke the token family.
4. Bind authorization codes to client, redirect URI, resource, and PKCE verifier.
5. Validate exact redirect URIs and allowed resource audiences.
6. Add token revocation and introspection endpoints where the client ecosystem benefits from them.
7. Add scope enforcement to every REST and MCP action.
8. Add token labels, last-used timestamps, and a user-facing revoke screen.

## 9. Frontend product improvements

### Editor

- Replace the plain textarea with a structured editor based on a documented content model.
- Store Markdown or ProseMirror/Tiptap JSON consistently; do not mix formats.
- Add slash commands, headings, lists, code blocks, links, and keyboard shortcuts.
- Add autosave with debounce, save state, retry, and conflict handling.
- Add revision history and restore.

### Workspace

- Add workspace switcher and shared workspace membership.
- Add drag-and-drop ordering and pinned notes.
- Add category management instead of a hard-coded category list.
- Add command palette, keyboard navigation, and accessible focus states.
- Add mobile navigation and a dedicated editor view.
- Add import/export for Markdown and JSON.

### Client state

- Introduce a query/cache layer for notes and optimistic mutations.
- Keep server state separate from UI state.
- Centralize error handling and session expiry.
- Add telemetry only after documenting the privacy policy and data retention.

## 10. Reliability and operations

### Service health

Add separate endpoints:

- /health/live: process is alive.
- /health/ready: MongoDB and required dependencies are reachable.
- /metrics: Prometheus-compatible metrics, protected from public access.

### Observability

Track:

- Request count, latency, and error rate by route.
- MongoDB query latency and failures.
- MCP tool calls by tool, client, scope, and outcome.
- OAuth authorization and token exchange failures.
- Background queue depth and job age.
- Cloudflare Tunnel connection status.

Use structured JSON logs with:

- timestamp
- level
- service
- request_id
- user_id or hashed actor ID
- route
- status_code
- duration_ms

### Backups and recovery

- Use managed MongoDB or a replica set for production.
- Schedule encrypted backups.
- Test restore procedures monthly.
- Define RPO and RTO before production launch.
- Keep object-storage exports separate from the primary database.

## 11. Testing strategy

### Backend

- Unit tests for password, JWT, token hashing, PKCE, scope checks, and serializers.
- Repository tests against an ephemeral MongoDB.
- API tests for auth, note ownership, pagination, optimistic concurrency, and errors.
- MCP contract tests for initialize, discovery, tools, authentication, and tool failures.
- Security tests for redirect URI validation, replayed codes, expired tokens, and cross-user access.

### Frontend

- Component tests for editor, note list, modal, and auth states.
- Playwright flows for register, login, create, edit, bookmark, delete, and logout.
- Accessibility checks for keyboard navigation and color contrast.
- Visual regression tests for the workspace layout.

### Delivery gates

Every pull request should run:

1. Formatting and lint checks.
2. Type checking.
3. Backend unit and API tests.
4. Frontend build.
5. Docker image build.
6. MCP contract tests.
7. Dependency and secret scans.

## 12. Delivery phases

### Phase 0 — Stabilize the MVP

- [x] Separate Next.js, FastAPI, MongoDB, and Docker services.
- [x] Add Cloudflare Tunnel Compose service.
- [x] Add OAuth metadata and PKCE flow.
- [x] Add permanent user-scoped MCP tokens.
- [ ] Add automated CI build and test workflow.
- [ ] Add health/readiness checks and Compose health dependencies.
- [ ] Add API request IDs and structured logs.

### Phase 1 — Secure production foundations

- [ ] Move web authentication to HTTP-only cookie sessions.
- [ ] Add rate limiting and account protection.
- [ ] Add refresh-token rotation and revocation.
- [ ] Add audit events for auth and MCP actions.
- [ ] Add production MongoDB backup and restore process.
- [ ] Add secret rotation runbook.

### Phase 2 — Domain and collaboration model

- [ ] Introduce workspaces and membership roles.
- [ ] Add category collection and user-managed categories.
- [ ] Add note revisions and optimistic concurrency.
- [ ] Extract repositories and application services from main.py.
- [ ] Add cursor pagination.

### Phase 3 — Editor and knowledge experience

- [ ] Add structured rich-text editor.
- [ ] Add autosave, conflict resolution, and revision history.
- [ ] Add Markdown/JSON import and export.
- [ ] Add full-text search improvements.
- [ ] Add background embeddings and semantic search.

### Phase 4 — MCP platform

- [ ] Add scope enforcement in the dispatcher.
- [ ] Add paginated search and structured tool outputs.
- [ ] Add update, export, and summarization tools.
- [ ] Add confirmation workflows for destructive actions.
- [ ] Add MCP client registration management and per-client limits.

### Phase 5 — Scale and operate

- [ ] Move long-running jobs to a queue and worker service.
- [ ] Add tracing, metrics, dashboards, and alerts.
- [ ] Run multiple API replicas behind a managed edge.
- [ ] Use managed MongoDB with replica set and backups.
- [ ] Add load tests for REST, MCP, and search.
- [ ] Document incident response and disaster recovery.

## 13. Architecture decision records to create

Create short ADRs before these changes:

- ADR-001: Note content model and editor format.
- ADR-002: Workspace membership and authorization model.
- ADR-003: Web session and MCP token separation.
- ADR-004: Search strategy: MongoDB text, vector search, or external service.
- ADR-005: Background job and retry strategy.
- ADR-006: MCP versioning and destructive-action confirmation.
- ADR-007: Production MongoDB, backup, and restore architecture.

## 14. Definition of production readiness

Noteform is ready for a first production beta when:

- All critical flows have automated tests.
- No secret is hard-coded or stored in logs.
- Web sessions, OAuth tokens, and MCP tokens are revocable.
- Cross-user access tests pass.
- MCP tools enforce scopes and rate limits.
- MongoDB backups have been restored successfully in a test environment.
- Health checks, metrics, and alerts exist.
- The public MCP hostname uses HTTPS and a stable domain.
- The privacy policy explains note storage, MCP access, and AI processing.
- An incident response owner and rollback procedure are documented.

