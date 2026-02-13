# Code Monitor Agent Scaffold

Run a Docker-only sidecar that logs code diffs, prompts (Claude/Copilot/Codex), and errors for this repo, plus on-demand OpenAI summaries of recent activity.

## Quick start
1. Build and start: `docker compose -f agent-compose.yml up -d`
2. Send a prompt log: `curl -X POST http://localhost:4381/prompt -H 'Content-Type: application/json' -d '{"text":"first prompt","model":"claude-code","source":"vscode"}'`
3. Log a Copilot chat: `curl -X POST http://localhost:4381/copilot -H 'Content-Type: application/json' -d '{"prompt":"how do I mock axios?","response":"use vi.mock...","model":"copilot-chat","source":"vscode"}'`
4. (Optional) Generate a project summary — set `OPENAI_API_KEY` in your shell, then: `curl -X POST http://localhost:4381/summary/run`
5. Check health: `curl http://localhost:4381/health`

## What gets logged
- File changes: unified diffs (baseline from Git HEAD if available) and content hashes.
- Prompts: text + source + model (Claude/Copilot/Codex, etc.).
- Copilot/Codex chat: prompt + assistant reply + optional conversation id.
- Errors: message plus arbitrary JSON context.
- Summaries: OpenAI-generated bullet recap of recent events (stored as events).

## Files
- `.agent/agent.py` — FastAPI app + watchdog file watcher.
- `.agent/Dockerfile` — Python 3.12 slim image.
- `.agent/requirements.txt` — dependencies.
- `agent-compose.yml` — compose service; mounts repo read-only and persists DB at `.agent/data/events.db`.
- `vscode-agent/` — local VS Code extension to send prompts/chats/errors and trigger summaries.

## Notes
- Adjust ignored paths via `IGNORE_PARTS` env (comma-separated).
- Large files over `MAX_BYTES` (default 2 MB) are skipped.
- Data stays on host in `.agent/data/` (git-ignored).
- Summaries require `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to be set in your environment before `docker compose up`. Endpoints: `POST /summary/run`, `GET /summary/latest`.
- VS Code extension: see `vscode-agent/README.md`, install with `npm install` then F5 or package with `npx vsce package`.
