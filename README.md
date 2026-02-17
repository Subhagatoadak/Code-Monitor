# Code Monitor

A **beautiful, interactive development activity tracker** that monitors multiple projects simultaneously, logs all code changes with full diffs, and provides AI-powered insights into your development workflow.

Built for individual developers who want to understand *what changed*, *when it changed*, and *why* — by correlating AI prompts/chats with the code that followed.

---

## Features

- **Multi-Project Monitoring** — Watch unlimited projects simultaneously; switch between them in one click
- **Real-time Event Streaming** — Server-Sent Events (SSE) push new activity to the UI the moment it happens
- **Git-aware Diffs** — File changes include unified diffs computed against Git HEAD (falls back to empty baseline)
- **AI Implications Analysis** — GPT-4 reads recent changes and explains what they mean for the project
- **Prompt/Chat Logging** — Log AI prompts (Claude, Copilot, GPT, etc.) and copilot chats via API or VS Code extension
- **Semantic Matching** — GPT-4 correlates logged prompts/chats with code changes by timestamp and content
- **AI Chat Timeline** — Browse full AI conversation history with matched file-change events side-by-side
- **Search & Filters** — Filter events by kind, date range, path pattern, or free-text search
- **Export** — Download events as Markdown or JSON
- **Colorful UI** — React + Tailwind with gradients, glassmorphism, and Framer Motion animations
- **VS Code Extension** — Optional sidebar for logging prompts directly from your editor
- **Localhost Only** — No auth, no cloud, no telemetry; all data stays on your machine

---

## Architecture

```text
Code-Monitor/
├── .agent/                   # Python backend
│   ├── agent.py              # FastAPI app — file watcher, SSE, AI, REST API
│   ├── Dockerfile            # Python 3.12 slim image
│   ├── requirements.txt      # Python dependencies
│   └── data/                 # SQLite database (git-ignored)
│       └── events.db
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── App.tsx           # Main application shell, routing, modals
│   │   ├── components/       # EventCard, DiffViewer, AIMatchPanel, modals…
│   │   ├── hooks/            # useEventStream, useEvents, useMatching
│   │   ├── lib/              # api.ts, eventStream.ts, utils.ts
│   │   ├── store/            # Zustand event store
│   │   └── types/            # TypeScript interfaces (Event, Match, AIConversation…)
│   ├── Dockerfile.dev        # Vite dev server container
│   ├── vite.config.ts
│   └── tailwind.config.js
├── vscode-agent/             # VS Code extension (optional)
├── docker-compose.yml        # Development: backend + hot-reload frontend
├── docker-compose.prod.yml   # Production: single built container
├── agent-compose.yml         # Minimal: backend only
├── .env.example              # Environment variable template
├── start.sh / start.bat      # Interactive startup scripts
└── scripts/                  # Helper scripts
```

### Data Model

All events are stored in a single SQLite database at `.agent/data/events.db`.

**`events` table**

| Column    | Type    | Description                                |
|-----------|---------|--------------------------------------------|
| `id`      | integer | Auto-increment primary key                 |
| `ts`      | integer | Unix timestamp (seconds)                   |
| `kind`    | text    | Event type (see table below)               |
| `path`    | text    | File path or project path                  |
| `payload` | text    | JSON blob with event-specific fields       |

**`projects` table** — registered project roots

**`ai_conversations` table** — full AI chat history

**`ai_code_matches` table** — GPT-generated correlations between conversations and code changes

---

## Event Kinds

| Kind                    | Trigger                | Payload fields                                      |
|-------------------------|------------------------|-----------------------------------------------------|
| `file_change`           | File modified          | `event`, `diff`, `sha`, `size`, `baseline`          |
| `file_deleted`          | File removed           | `event`                                             |
| `folder_created`        | Directory created      | `event`                                             |
| `folder_deleted`        | Directory removed      | `event`                                             |
| `prompt`                | POST /prompt           | `text`, `source`, `model`                           |
| `copilot_chat`          | POST /copilot          | `prompt`, `response`, `conversation_id`             |
| `error`                 | POST /error            | `message`, `context`                                |
| `summary`               | POST /summary/run      | `content`                                           |
| `ai_match`              | POST /match            | `prompt_count`, `code_change_count`, `match_count`  |
| `implications_analysis` | POST /implications     | `analysis`, `project_id`                            |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Docker Compose)
- An [OpenAI API key](https://platform.openai.com/api-keys) (required for AI features; optional for basic monitoring)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/Code-Monitor
cd Code-Monitor

# Copy and fill in environment variables
cp .env.example .env
```

Edit `.env`:

```bash
OPENAI_API_KEY=sk-...       # Paste your key here
OPENAI_MODEL=gpt-4o-mini    # Model for summaries (cost-effective)
OPENAI_MATCHING_MODEL=gpt-4o # Model for semantic matching (most accurate)
```

### 2. Configure which projects to monitor

Open `docker-compose.yml` and update the projects volume mount to point to the parent directory containing your projects:

```yaml
volumes:
  - .:/workspace
  - ./.agent/data:/data
  - /your/projects/parent:/projects:ro  # <- change this path
```

For example, if your projects are at `~/code/myapp` and `~/code/website`, mount `~/code`:

```yaml
- ~/code:/projects:ro
```

### 3. Start the services

**Recommended — interactive startup script:**

```bash
# Linux / Mac
./start.sh

# Windows
start.bat
```

**Or start manually:**

```bash
# Development mode (hot-reload frontend + backend)
docker compose up --build

# Production mode (single optimized container)
docker compose -f docker-compose.prod.yml up --build
```

### 4. Open the dashboard

- **Development mode:** [http://localhost:5173](http://localhost:5173)
- **Production mode:** [http://localhost:4381](http://localhost:4381)
- **API / Swagger docs:** [http://localhost:4381/docs](http://localhost:4381/docs)

### 5. Add your first project

1. Click **"Add Project"** in the sidebar
2. Enter the **container path** (not your local path):

   | Local path                        | Container path to use  |
   |-----------------------------------|------------------------|
   | `~/code/myapp`                    | `/projects/myapp`      |
   | `~/Documents/github/website`      | `/projects/website`    |

3. Click **"Add Project"** — the watcher starts immediately

---

## Usage

### Dashboard Overview

The main dashboard has three panes:

- **Left sidebar** — project list; click to switch active project
- **Center** — event timeline for the selected project
- **Top bar** — search, filter, export, and AI action buttons

### Viewing Events

- **Click any event** to expand it and see the full diff, payload, and metadata
- **Search** the timeline with free text (matches path and payload content)
- **Filter by kind** using the kind pills (file_change, prompt, copilot_chat…)
- **Filter by date** using the date range picker
- **Export** events as Markdown or JSON via the export button

### Logging Prompts and Chats

There are three ways to log AI activity:

#### 1. Via the web UI

Click **"Log Prompt"** in the top bar to open a modal where you can paste a prompt along with source, model, and an optional response.

#### 2. Via the REST API

```bash
# Log a prompt
curl -X POST http://localhost:4381/prompt \
  -H 'Content-Type: application/json' \
  -d '{"text": "Refactor the auth module", "source": "claude", "model": "claude-sonnet-4-5"}'

# Log a chat exchange
curl -X POST http://localhost:4381/copilot \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "How do I debounce a function?", "response": "Use setTimeout...", "model": "gpt-4o"}'
```

#### 3. Via the VS Code extension

See [vscode-agent/README.md](vscode-agent/README.md) for installation and usage.

### AI Features

All AI features require `OPENAI_API_KEY` to be set.

#### AI Implications Analysis

Analyses recent file changes in a project and explains what they mean:

```bash
curl -X POST "http://localhost:4381/implications?project_id=1&hours=24"
```

In the UI, click **"AI Analysis"** in the top bar.

#### Semantic Matching

Uses GPT-4 to find which prompts led to which code changes:

```bash
curl -X POST http://localhost:4381/match \
  -H 'Content-Type: application/json' \
  -d '{"include_kinds": ["prompt", "copilot_chat", "file_change"]}'
```

In the UI, click **"Find Related Code"**.

#### AI Chat History

The `/ai-chat` endpoints store full conversations with structured code-snippet extraction and file-overlap matching.

---

## API Reference

All endpoints return JSON. The base URL is `http://localhost:4381`.

### Health

| Method | Path      | Description                           |
|--------|-----------|---------------------------------------|
| GET    | `/health` | Returns `{status, events, projects}`  |

### Projects

| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| GET    | `/projects`                   | List all projects                    |
| POST   | `/projects`                   | Register a new project               |
| DELETE | `/projects/{id}`              | Remove a project                     |
| GET    | `/projects/{id}/config`       | Get project config (ignore patterns) |
| PUT    | `/projects/{id}/config`       | Update project config                |

**POST /projects body:**

```json
{
  "name": "my-app",
  "path": "/projects/my-app",
  "description": "Optional description",
  "ignore_patterns": [".next", "dist"]
}
```

### Events

| Method | Path              | Description                                             |
|--------|-------------------|---------------------------------------------------------|
| GET    | `/events`         | Paginated event list                                    |
| GET    | `/events/stream`  | SSE stream — push new events to connected clients       |
| GET    | `/events/export`  | Download events (`?format=markdown` or `?format=json`)  |

**GET /events query params:**

| Param        | Type    | Default | Description                           |
|--------------|---------|---------|---------------------------------------|
| `limit`      | int     | 50      | Results per page                      |
| `offset`     | int     | 0       | Pagination offset                     |
| `kind`       | string  |         | Filter by event kind                  |
| `project_id` | int     |         | Filter by project                     |
| `search`     | string  |         | Free-text search on path and payload  |
| `start_date` | string  |         | ISO 8601 start datetime               |
| `end_date`   | string  |         | ISO 8601 end datetime                 |

**Response:**

```json
{
  "items": [...],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

### Logging

| Method | Path       | Description          |
|--------|------------|----------------------|
| POST   | `/prompt`  | Log an AI prompt     |
| POST   | `/copilot` | Log a chat exchange  |
| POST   | `/error`   | Log an error event   |

### AI

| Method | Path              | Description                                          |
|--------|-------------------|------------------------------------------------------|
| POST   | `/match`          | GPT-4 semantic matching of prompts to code changes   |
| POST   | `/summary/run`    | Generate a GPT summary of recent events              |
| GET    | `/summary/latest` | Retrieve the most recent summary                     |
| POST   | `/analyze-change` | Analyze a single file-change event                   |
| POST   | `/implications`   | Analyze recent project changes for implications      |

**POST /analyze-change body:**

```json
{ "event_id": 42 }
```

**POST /implications query params:** `project_id` (optional), `hours` (default: 24)

### AI Chat

| Method | Path                              | Description                                     |
|--------|-----------------------------------|-------------------------------------------------|
| GET    | `/ai-chat`                        | List stored AI conversations                    |
| POST   | `/ai-chat`                        | Store a new AI conversation                     |
| GET    | `/ai-chat/stats`                  | Aggregated stats (counts by provider)           |
| GET    | `/ai-chat/{id}`                   | Get single conversation                         |
| GET    | `/ai-chat/{id}/timeline`          | Get conversation with matched file changes      |
| POST   | `/ai-chat/{id}/match`             | Run GPT matching for a single conversation      |

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and edit as needed.

### Environment Variables

| Variable               | Default                  | Description                                      |
|------------------------|--------------------------|--------------------------------------------------|
| `OPENAI_API_KEY`       | *(required for AI)*      | OpenAI API key                                   |
| `OPENAI_MODEL`         | `gpt-4o-mini`            | Model used for summaries and analysis            |
| `OPENAI_MATCHING_MODEL`| `gpt-4o`                 | Model used for semantic matching                 |
| `PORT`                 | `4381`                   | Port the FastAPI server listens on               |
| `REPO_PATH`            | `/workspace`             | Primary repository path inside the container     |
| `DB_PATH`              | `/data/events.db`        | SQLite database file path                        |
| `MAX_BYTES`            | `2000000` (2 MB)         | Skip files larger than this                      |
| `IGNORE_PARTS`         | see below                | Comma-separated path segments to ignore          |
| `SUMMARY_EVENT_LIMIT`  | `50`                     | Max events included in a summary                 |
| `SUMMARY_CHAR_LIMIT`   | `6000`                   | Max characters of event content per summary      |
| `CORS_ENABLED`         | `true`                   | Enable CORS (needed for dev mode)                |
| `CORS_ORIGINS`         | `http://localhost:5173`  | Comma-separated allowed origins                  |

**Default `IGNORE_PARTS`:**

```text
.git,node_modules,.venv,.idea,.vscode,__pycache__
```

Add project-specific directories (e.g., `.next`, `dist`, `build`) if you want to exclude them.

---

## Docker Compose Files

Three compose files are provided for different use cases:

### `docker-compose.yml` — Development (recommended)

Runs two containers:

- **backend** — FastAPI with hot-reload via volume mount
- **frontend** — Vite dev server with HMR

```bash
docker compose up --build
```

Access:

- Dashboard: <http://localhost:5173>
- API: <http://localhost:4381>
- Docs: <http://localhost:4381/docs>

### `docker-compose.prod.yml` — Production

Single container with the React app built into the FastAPI static folder.

```bash
docker compose -f docker-compose.prod.yml up --build
```

Access: <http://localhost:4381>

### `agent-compose.yml` — Minimal / Legacy

Backend only. Useful if you run the frontend locally.

```bash
docker compose -f agent-compose.yml up --build
# Then: cd frontend && npm install && npm run dev
```

---

## Local Development (Without Docker)

### Backend

```bash
cd .agent
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export REPO_PATH=../            # path to monitor
export DB_PATH=./data/events.db
export CORS_ENABLED=true
export OPENAI_API_KEY=sk-...

python agent.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Testing

### Backend smoke tests

```bash
# Health check
curl http://localhost:4381/health

# Log a prompt
curl -X POST http://localhost:4381/prompt \
  -H 'Content-Type: application/json' \
  -d '{"text":"Write a function to parse JSON","source":"claude","model":"claude-3-5-sonnet"}'

# List events
curl "http://localhost:4381/events?limit=5"

# Subscribe to SSE stream (Ctrl+C to stop)
curl -N http://localhost:4381/events/stream

# AI matching (requires OPENAI_API_KEY)
curl -X POST http://localhost:4381/match \
  -H 'Content-Type: application/json' \
  -d '{"include_kinds": ["prompt", "file_change"]}'

# Implications analysis
curl -X POST "http://localhost:4381/implications?hours=24"
```

### Frontend build

```bash
cd frontend
npm run build          # type-check + compile
npm run preview        # serve production build locally
```

---

## VS Code Extension

The `vscode-agent/` directory contains a VS Code extension that adds a sidebar panel for logging prompts directly from the editor.

**Install from VSIX:**

1. Open VS Code
2. Go to **Extensions** → **...** menu → **Install from VSIX**
3. Select `vscode-agent/code-agent-logger-0.1.0.vsix`

**Features:**

- Log a prompt with one click from the command palette
- Automatically captures active file context
- Sends logs to the running Code Monitor backend

See [vscode-agent/README.md](vscode-agent/README.md) for full documentation.

---

## Troubleshooting

#### File changes not appearing in the dashboard

- Confirm the project path inside the container is correct (`/projects/my-app`, not the local path)
- Check that the path segment is not in `IGNORE_PARTS`
- Verify the file is under `MAX_BYTES` (default 2 MB)
- Check backend logs: `docker compose logs -f backend`

#### 404 errors from the frontend

- Ensure the backend container is running: `curl http://localhost:4381/health`
- In dev mode, confirm CORS is enabled: `CORS_ENABLED=true` in `.env`
- Check that the frontend is pointing to the right API base URL

#### AI features return errors

- Verify `OPENAI_API_KEY` is set and valid: `echo $OPENAI_API_KEY`
- Confirm you have OpenAI credits
- Matching requires at least one `prompt`/`copilot_chat` event **and** one `file_change` event

#### Docker build fails

```bash
# Clean rebuild with no cache
docker compose build --no-cache

# Check disk space (Node.js build can be large)
docker system df
docker system prune   # removes unused images/volumes
```

#### Container exits immediately

```bash
# Check logs for the error
docker compose logs backend
```

#### Port already in use

```bash
# Find what is using port 4381
lsof -i :4381      # Mac/Linux
netstat -ano | findstr :4381  # Windows
```

---

## Project Structure Reference

```text
.agent/
  agent.py              FastAPI app (file watcher, SSE, AI, REST)
  Dockerfile            Python 3.12 production image
  requirements.txt      fastapi, uvicorn, watchdog, gitpython,
                        openai, python-dotenv, sse-starlette
  data/
    events.db           SQLite database (git-ignored)

frontend/
  src/
    App.tsx             Root component — layout, modals, query setup
    components/         UI components
    hooks/              useEventStream (SSE), useEvents, useMatching
    lib/
      api.ts            REST API client functions
      eventStream.ts    SSE EventSource wrapper
    store/
      eventStore.ts     Zustand store for live events
    types/
      events.ts         TypeScript types for Event, Match, AIConversation…
  Dockerfile.dev        Vite dev server image
  vite.config.ts        Proxy /events, /prompt, /match → localhost:4381
  tailwind.config.js    Custom color palette and animations

vscode-agent/
  code-agent-logger-*.vsix   Pre-built extension package
  src/                       Extension source

docker-compose.yml          Dev: backend (4381) + frontend (5173)
docker-compose.prod.yml     Prod: single container (4381)
agent-compose.yml           Minimal: backend only
.env.example                Environment variable template
start.sh / start.bat        Interactive startup scripts
```

---

## Notes

- **Data persists** in `.agent/data/events.db` on the host machine, surviving container restarts
- **Git-aware diffs** — if the monitored directory is a Git repo, diffs are computed against HEAD; otherwise an empty baseline is used
- **SSE keeps connections open** — the `/events/stream` endpoint holds long-lived HTTP connections; increase timeout settings if behind a proxy
- **OpenAI costs** — the matching endpoint sends up to 100 events to GPT-4 per call; use `gpt-4o-mini` for `OPENAI_MATCHING_MODEL` if you want lower cost with slightly reduced accuracy

---

## License

MIT
