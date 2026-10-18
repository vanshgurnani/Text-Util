# Noteform

Noteform is a calm, Notion-inspired notes workspace with a FastAPI backend, Next.js frontend, MongoDB persistence, and an MCP endpoint that lets a connected GPT search and write notes.

## What changed

- `frontend/` is a Next.js 14 app using the App Router and a responsive workspace UI.
- `backend/` is a FastAPI service with JWT authentication, user-scoped notes, categories, bookmarks, summaries, and insights.
- `POST /mcp` implements the MCP JSON-RPC flow (`initialize`, `tools/list`, and `tools/call`) with `search_notes`, `get_note`, `create_note`, and `list_bookmarks` tools.
- `docker-compose.yml` runs MongoDB, FastAPI, and Next.js together.
- The old Express server used a hard-coded MongoDB credential. The new backend reads all secrets from environment variables.

## Run with Docker

```bash
cp .env.example .env
npm run docker:up
```

Open [http://localhost:3000](http://localhost:3000). The FastAPI Swagger UI is at [http://localhost:8000/docs](http://localhost:8000/docs).

To stop the stack:

```bash
npm run docker:down
```

Mongo data is kept in the `mongo_data` Docker volume.

## Run locally

Start MongoDB, then run the API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Connecting a GPT through MCP

1. Create a Noteform account and sign in.
2. Open **Connect GPT** in the left sidebar. The MCP endpoint is `http://localhost:8000/mcp` for local development.
3. Configure the MCP client with that URL and send the Noteform JWT as `Authorization: Bearer <token>`.
4. The available tools are `search_notes`, `get_note`, `create_note`, and `list_bookmarks`.

The endpoint is user-scoped: a token can only read and modify that user’s notes. For a server-to-server connection, set `MCP_API_KEY` and `MCP_USER_ID` in `.env` and send the key as `X-MCP-API-Key`.

## Main API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a user and return a JWT |
| POST | `/auth/login` | Authenticate a user |
| GET | `/notes` | Search/filter the current user’s notes |
| POST | `/notes` | Create a note |
| PATCH | `/notes/{id}` | Update a note |
| POST | `/notes/{id}/bookmark` | Toggle a bookmark |
| DELETE | `/notes/{id}` | Delete a note |
| POST | `/mcp` | MCP JSON-RPC endpoint for GPT clients |

The repository now contains only the migrated Next.js and FastAPI application runtimes.
