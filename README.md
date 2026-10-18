# Noteform

Noteform is a calm, Notion-inspired personal notes workspace. Users can create, edit, search, categorize, bookmark, and delete notes from a Next.js interface. A FastAPI service owns authentication and data access, while an MCP endpoint lets an authorized GPT-compatible client search and write notes.

![Noteform workspace preview](docs/assets/noteform-workspace.svg)

> The image above is the repository UI reference preview for the current product direction. The live interface is rendered by `frontend/`.

## Product capabilities

- Personal workspaces with user-scoped notes.
- Note creation, editing, deletion, category filtering, search, and bookmarks.
- Responsive Notion-inspired two-pane workspace UI.
- JWT session authentication for the web application.
- Permanent, user-scoped MCP API tokens stored as SHA-256 hashes.
- OAuth 2.1 discovery, dynamic client registration, authorization-code + PKCE flow, and refresh tokens for hosted MCP clients such as ChatGPT.
- MCP tools for `search_notes`, `get_note`, `create_note`, and `list_bookmarks`.
- MongoDB persistence with Docker volume storage.
- Cloudflare Tunnel support for exposing the MCP endpoint through HTTPS without opening inbound ports.

## Architecture at a glance

```text
Browser ──HTTP──> Next.js frontend :3000
                     │ REST + JWT
                     ▼
                FastAPI API :8000 ──> MongoDB :27017
                     ▲
                     │ MCP + OAuth 2.1
                     │
ChatGPT / MCP client ──HTTPS──> Cloudflare Tunnel ──> backend:8000
```

The frontend and backend are separate containers on the default Compose network. `cloudflared` creates an outbound tunnel to the same backend service; it does not expose a new inbound application port.

The longer-term architecture and feature improvement plan is in [`docs/ARCHITECTURE-ROADMAP.md`](docs/ARCHITECTURE-ROADMAP.md).

## Repository layout

```text
.
├── backend/
│   ├── app/
│   │   ├── auth.py          # Password hashing, JWT, MCP/OAuth token helpers
│   │   ├── config.py        # Environment-backed settings
│   │   ├── database.py      # MongoDB client and collection access
│   │   ├── main.py          # FastAPI routes and MCP JSON-RPC endpoint
│   │   ├── schemas.py       # Request validation models
│   │   └── serializers.py   # MongoDB response serialization
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js App Router pages and workspace UI
│   ├── lib/api.ts           # Browser API client
│   └── Dockerfile
├── docs/
│   ├── ARCHITECTURE-ROADMAP.md
│   └── assets/noteform-workspace.svg
├── docker-compose.yml
├── .env.example
└── package.json
```

The old Express backend and legacy React application are no longer part of the runtime.

## Requirements

- Docker Desktop, Colima, or another Docker daemon.
- `docker-compose` v2 or v5. This project currently uses the hyphenated command because it is available in the development environment.
- Node.js 20+ only if running frontend commands outside Docker.
- Python 3.12+ only if running the API outside Docker.

## Quick start with Docker

```bash
cp .env.example .env
npm run docker:up
```

Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- FastAPI Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- API health: [http://localhost:8000/health](http://localhost:8000/health)

Stop the stack:

```bash
npm run docker:down
```

MongoDB data is stored in the named `mongo_data` Docker volume. The `docker:up` script starts Colima and sets `DOCKER_BUILDKIT=0`, so the project can build on machines where the optional Buildx CLI plugin is missing.

## Environment configuration

Copy `.env.example` to `.env` and replace development values before sharing the service publicly.

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs web-session JWTs. Use a long random value. |
| `MCP_PUBLIC_URL` | Public MCP resource URL, normally `https://mcp.example.com/mcp`. |
| `MCP_API_KEY` | Optional server-to-server MCP key. Prefer user-generated tokens for user-scoped access. |
| `MCP_USER_ID` | User ID paired with the optional global `MCP_API_KEY`. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token for the named Cloudflare Tunnel used by Compose. |

Never commit `.env`, JWT secrets, MCP tokens, or Cloudflare tunnel tokens. If a tunnel token is pasted into a chat, terminal recording, issue, or commit, revoke it in Cloudflare and create a replacement.

## Cloudflare Tunnel and MCP setup

### Production named tunnel

1. Create a Cloudflare Tunnel in Cloudflare Zero Trust and choose the Docker connector.
2. Put the generated token in `.env`:

   ```dotenv
   CLOUDFLARE_TUNNEL_TOKEN=replace-with-a-new-token
   ```

3. Add a public hostname, for example `mcp.example.com`, to the tunnel.
4. Route the hostname to `http://backend:8000`.
5. Make sure these paths reach the backend: `/mcp*`, `/.well-known/*`, and `/oauth/*`.
6. Set the exact public MCP resource URL:

   ```dotenv
   MCP_PUBLIC_URL=https://mcp.example.com/mcp
   ```

7. Start or recreate the stack:

   ```bash
   npm run docker:up
   ```

The OAuth discovery endpoints are required when a hosted MCP client needs to sign in. A request to `/mcp` without credentials should return `401`; that is expected.

### Temporary tunnel without a domain

For local testing, run the application without the named tunnel and start a temporary Quick Tunnel:

```bash
docker-compose up --build -d mongo backend frontend
docker run --rm --name noteform-quick-tunnel cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:8000
```

Cloudflare prints a temporary `https://<random-name>.trycloudflare.com` URL. Set the backend resource URL to that address plus `/mcp`, then recreate only the backend:

```dotenv
MCP_PUBLIC_URL=https://<random-name>.trycloudflare.com/mcp
```

```bash
docker-compose up -d --force-recreate backend
```

Quick Tunnel URLs change when the process stops and are intended for development, not production.

## Connecting an MCP client

### Generic MCP clients

1. Register and sign in at [http://localhost:3000](http://localhost:3000).
2. Open **Connect GPT** in the workspace sidebar.
3. Create a permanent MCP token. It is shown only once.
4. Configure the client with `MCP_PUBLIC_URL` and send either:

   ```http
   X-MCP-API-Key: nf_mcp_<token>
   ```

   or:

   ```http
   Authorization: Bearer nf_mcp_<token>
   ```

The token does not expire, is scoped to one Noteform user, and is stored only as a hash. Creating a replacement invalidates the previous token.

### ChatGPT or another OAuth MCP client

Use the public HTTPS MCP resource URL, for example:

```text
https://mcp.example.com/mcp
```

The server publishes protected-resource metadata, authorization-server metadata, dynamic client registration, and PKCE authorization endpoints. The client should discover the OAuth flow, open Noteform’s sign-in page, and request scoped access. The web API token is not used as an OAuth client secret.

## API and MCP routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `POST` | `/auth/register` | Create a web user and return a JWT |
| `POST` | `/auth/login` | Authenticate a web user |
| `GET` | `/auth/me` | Return the current web user |
| `POST` | `/auth/mcp-token` | Create or replace a permanent MCP token |
| `DELETE` | `/auth/mcp-token` | Revoke the current MCP token |
| `GET` | `/notes` | Search and filter notes |
| `POST` | `/notes` | Create a note |
| `PATCH` | `/notes/{id}` | Update a note |
| `POST` | `/notes/{id}/bookmark` | Toggle a bookmark |
| `DELETE` | `/notes/{id}` | Delete a note |
| `POST` | `/mcp` | MCP JSON-RPC endpoint |
| `GET` | `/.well-known/oauth-protected-resource` | OAuth resource metadata |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth server metadata |
| `POST` | `/oauth/register` | Dynamic OAuth client registration |
| `GET/POST` | `/oauth/authorize` | User authorization and consent login |
| `POST` | `/oauth/token` | Authorization-code and refresh-token exchange |

MCP tools currently exposed:

- `search_notes`
- `get_note`
- `create_note`
- `list_bookmarks`

## Local development without Docker

Start MongoDB separately, then run the API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Root scripts:

```bash
npm run dev          # Next.js development server
npm run build        # Production Next.js build
npm run start        # Production Next.js server
npm run docker:up    # Colima + complete Docker stack
npm run docker:down  # Stop and remove containers
```

## Troubleshooting

### Docker cannot connect to the daemon

```bash
colima start
docker-compose ps
```

### Buildx plugin is missing

Use the project script. It already selects the classic builder:

```bash
npm run docker:up
```

### MCP returns `401`

That means the endpoint is reachable but no valid OAuth access token or `nf_mcp_...` token was supplied. Check the client header and confirm that the token belongs to the intended Noteform user.

### OAuth discovery fails

Check that the Cloudflare hostname routes `/mcp*`, `/.well-known/*`, and `/oauth/*` to `http://backend:8000`, and that `MCP_PUBLIC_URL` exactly matches the public HTTPS MCP URL.

### Inspect service logs

```bash
docker-compose logs --tail=150 backend
docker-compose logs --tail=150 frontend
docker-compose logs --tail=150 cloudflared
```

## Security notes

- Use HTTPS for every public MCP deployment.
- Use a unique, random `JWT_SECRET` in production.
- Keep `.env` and tunnel credentials outside source control.
- MCP tokens are bearer credentials: anyone holding one can access that user’s permitted tools.
- Prefer OAuth 2.1 + PKCE for hosted clients and user-facing integrations.
- Add rate limiting, audit logs, backups, and secret rotation before production launch; the roadmap describes the recommended order.

## License

No license has been selected yet. Add a license before distributing Noteform outside the project team.
