import asyncio
import difflib
import json
import os
import sqlite3
import time
import uuid
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from git import InvalidGitRepositoryError, Repo
from openai import OpenAI
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

APP_TITLE = "Code Activity Agent"
REPO_PATH = Path(os.environ.get("REPO_PATH", "/workspace")).resolve()
DB_PATH = Path(os.environ.get("DB_PATH", "/data/events.db")).resolve()
PORT = int(os.environ.get("PORT", "4381"))
MAX_BYTES = int(os.environ.get("MAX_BYTES", 2_000_000))  # skip very large files
IGNORE_PARTS = set(
    os.environ.get(
        "IGNORE_PARTS",
        ".git,.agent,node_modules,.venv,.idea,.vscode,__pycache__"
    ).split(",")
)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MATCHING_MODEL = os.environ.get("OPENAI_MATCHING_MODEL", "gpt-4o")
SUMMARY_EVENT_LIMIT = int(os.environ.get("SUMMARY_EVENT_LIMIT", 50))
SUMMARY_CHAR_LIMIT = int(os.environ.get("SUMMARY_CHAR_LIMIT", 6000))
CORS_ENABLED = os.environ.get("CORS_ENABLED", "false").lower() == "true"
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app = FastAPI(title=APP_TITLE)

# CORS middleware
if CORS_ENABLED:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# SSE event queues for real-time streaming
sse_queues: List[asyncio.Queue] = []
_event_loop: Optional[asyncio.AbstractEventLoop] = None

# Try to attach to git repo if present.
try:
    repo: Optional[Repo] = Repo(REPO_PATH)
except InvalidGitRepositoryError:
    repo = None


@app.on_event("startup")
async def startup_event():
    global _event_loop
    _event_loop = asyncio.get_event_loop()


async def broadcast_event(event_data: dict):
    """Broadcast event to all connected SSE clients."""
    dead_queues = []
    for queue in sse_queues:
        try:
            await asyncio.wait_for(queue.put(event_data), timeout=1.0)
        except Exception:
            dead_queues.append(queue)
    for queue in dead_queues:
        try:
            sse_queues.remove(queue)
        except ValueError:
            pass


def broadcast_event_threadsafe(event_data: dict):
    """Thread-safe broadcast from watchdog thread."""
    if _event_loop and not _event_loop.is_closed():
        asyncio.run_coroutine_threadsafe(broadcast_event(event_data), _event_loop)


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            create table if not exists events (
              id integer primary key,
              ts integer,
              kind text,
              path text,
              payload text,
              project_id integer
            )
            """
        )
        conn.execute("create index if not exists idx_events_ts on events(ts)")
        conn.execute("create index if not exists idx_events_project on events(project_id)")

        conn.execute(
            """
            create table if not exists projects (
              id integer primary key,
              name text not null,
              path text not null,
              description text,
              created_at integer,
              ignore_patterns text
            )
            """
        )

        conn.execute(
            """
            create table if not exists ai_conversations (
              id integer primary key,
              project_id integer,
              session_id text,
              ai_provider text,
              ai_model text,
              timestamp integer,
              conversation_type text,
              user_prompt text,
              ai_response text,
              context_files text,
              code_snippets text,
              metadata text,
              matched_to_events text,
              confidence_score real
            )
            """
        )

        conn.execute(
            """
            create table if not exists ai_code_matches (
              id integer primary key,
              conversation_id integer,
              event_id integer,
              confidence real,
              reasoning text,
              match_type text,
              time_delta integer,
              created_at integer
            )
            """
        )


def log_event(kind: str, path: str, payload: Dict, project_id: Optional[int] = None) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "insert into events(ts, kind, path, payload, project_id) values (?, ?, ?, ?, ?)",
            (int(time.time()), kind, path, json.dumps(payload), project_id),
        )
        event_id = cursor.lastrowid

    event_data = {
        "id": event_id,
        "ts": ts_to_iso(int(time.time())),
        "kind": kind,
        "path": path,
        "payload": payload,
        "project_id": project_id,
    }
    broadcast_event_threadsafe(event_data)
    return event_id


def ts_to_iso(ts: int) -> str:
    from datetime import timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def safe_trim(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"... [truncated {len(text) - limit} chars]"


def get_project_for_path(file_path: str) -> Optional[int]:
    """Find which project a file belongs to."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            rows = conn.execute("select id, path from projects").fetchall()
        for project_id, project_path in rows:
            if file_path.startswith(project_path.rstrip("/") + "/") or file_path == project_path:
                return project_id
    except Exception:
        pass
    return None


def build_event_digest(limit: int = SUMMARY_EVENT_LIMIT, char_limit: int = SUMMARY_CHAR_LIMIT, project_id: Optional[int] = None) -> str:
    with sqlite3.connect(DB_PATH) as conn:
        if project_id:
            rows = conn.execute(
                "select ts, kind, path, payload from events where project_id=? order by ts desc limit ?",
                (project_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "select ts, kind, path, payload from events order by ts desc limit ?",
                (limit,),
            ).fetchall()

    lines = []
    for ts, kind, path, payload in rows:
        try:
            data: Dict[str, Any] = json.loads(payload or "{}")
        except json.JSONDecodeError:
            data = {}

        snippet = ""
        if kind == "file_change":
            snippet = f"{data.get('event', '')}; diff={safe_trim(data.get('diff', ''), 400)}"
        elif kind == "file_deleted":
            snippet = "deleted"
        elif kind == "folder_created":
            snippet = "folder created"
        elif kind == "folder_deleted":
            snippet = "folder deleted"
        elif kind == "prompt":
            snippet = safe_trim(data.get("text", ""), 300)
        elif kind == "copilot_chat":
            snippet = f"prompt={safe_trim(data.get('prompt', ''), 200)} | reply={safe_trim(data.get('response', ''), 200)}"
        elif kind == "error":
            snippet = safe_trim(data.get("message", ""), 200)
        elif kind == "summary":
            snippet = safe_trim(data.get("content", ""), 200)

        lines.append(f"{ts_to_iso(int(ts))} | {kind} | {path or '-'} | {snippet}")

        if sum(len(l) for l in lines) > char_limit:
            lines.append("...[truncated digest]")
            break

    commit_line = ""
    if repo and repo.head.is_valid():
        commit = repo.head.commit
        commit_line = f"Latest commit: {commit.hexsha[:7]} {commit.summary}"

    header = [
        f"Repo: {REPO_PATH}",
        commit_line,
        f"Recent events (limit {limit}):",
    ]
    digest = "\n".join([line for line in header if line] + lines)
    return safe_trim(digest, char_limit)


def generate_summary(project_id: Optional[int] = None) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required for summaries")

    digest = build_event_digest(project_id=project_id)
    client = OpenAI(api_key=OPENAI_API_KEY)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a diligent software project journaler. "
                "Given recent repository events, produce a concise, bullet-style summary "
                "covering changed areas, notable diffs, prompts/conversations, and errors. "
                "Keep it under 200 words. If information is missing, state that briefly."
            ),
        },
        {"role": "user", "content": digest},
    ]
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.2,
        max_tokens=400,
    )
    summary = response.choices[0].message.content.strip()
    log_event("summary", "", {"content": summary, "model": OPENAI_MODEL}, project_id=project_id)
    return summary


class FileHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        self.cache: Dict[str, str] = {}

    def _should_ignore(self, path: Path) -> bool:
        return any(part in IGNORE_PARTS for part in path.parts)

    def _read_text(self, path: Path) -> str:
        try:
            if path.stat().st_size > MAX_BYTES:
                return ""
            return path.read_text(errors="ignore")
        except (OSError, UnicodeDecodeError):
            return ""

    def _baseline_from_git(self, path: Path) -> str:
        if repo is None:
            return ""
        try:
            rel = path.relative_to(REPO_PATH)
            return repo.git.show(f"HEAD:{rel}")
        except Exception:
            return ""

    def _get_project_id(self, path: Path) -> Optional[int]:
        try:
            rel = str(path.relative_to(REPO_PATH))
        except ValueError:
            rel = str(path)
        return get_project_for_path(rel)

    def _log_diff(self, path: Path, new_content: str, event: str) -> None:
        key = str(path)
        old_content = self.cache.get(key)
        if old_content is None:
            old_content = self._baseline_from_git(path)

        diff = "\n".join(
            difflib.unified_diff(
                (old_content or "").splitlines(),
                (new_content or "").splitlines(),
                fromfile="old",
                tofile="new",
                lineterm="",
            )
        )

        self.cache[key] = new_content
        try:
            rel_path = str(path.relative_to(REPO_PATH)) if path.exists() else str(path)
        except ValueError:
            rel_path = str(path)

        project_id = self._get_project_id(path)
        log_event(
            kind="file_change",
            path=rel_path,
            payload={
                "event": event,
                "diff": diff,
                "sha": sha256(new_content.encode("utf-8", "ignore")).hexdigest(),
                "size": len(new_content.encode("utf-8", "ignore")),
            },
            project_id=project_id,
        )

    def on_modified(self, event):  # type: ignore[override]
        if event.is_directory:
            return
        path = Path(event.src_path)
        if self._should_ignore(path):
            return
        content = self._read_text(path)
        self._log_diff(path, content, "modified")

    def on_created(self, event):  # type: ignore[override]
        path = Path(event.src_path)
        if self._should_ignore(path):
            return
        if event.is_directory:
            try:
                rel_path = str(path.relative_to(REPO_PATH))
            except ValueError:
                rel_path = str(path)
            project_id = self._get_project_id(path)
            log_event(kind="folder_created", path=rel_path, payload={"event": "created"}, project_id=project_id)
            return
        content = self._read_text(path)
        self._log_diff(path, content, "created")

    def on_deleted(self, event):  # type: ignore[override]
        path = Path(event.src_path)
        if self._should_ignore(path):
            return
        if event.is_directory:
            try:
                rel_path = str(path.relative_to(REPO_PATH))
            except ValueError:
                rel_path = str(path)
            project_id = self._get_project_id(path)
            log_event(kind="folder_deleted", path=rel_path, payload={"event": "deleted"}, project_id=project_id)
            return
        try:
            rel_path = str(path.relative_to(REPO_PATH))
        except ValueError:
            rel_path = str(path)
        project_id = self._get_project_id(path)
        log_event(
            kind="file_deleted",
            path=rel_path,
            payload={"event": "deleted"},
            project_id=project_id,
        )
        self.cache.pop(str(path), None)


# --- Pydantic models -------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str
    path: str
    description: Optional[str] = None
    ignore_patterns: Optional[str] = None


class AIConversationCreate(BaseModel):
    project_id: Optional[int] = None
    session_id: Optional[str] = None
    ai_provider: str
    ai_model: Optional[str] = None
    conversation_type: Optional[str] = "chat"
    user_prompt: str
    ai_response: str
    context_files: Optional[List[str]] = None
    code_snippets: Optional[List[Dict]] = None
    metadata: Optional[Dict] = None


# --- API endpoints --------------------------------------------------------

@app.get("/health")
def health():
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("select count(*) from events")
        total = cur.fetchone()[0]
    return {"status": "up", "events": total}


# --- Projects ---

@app.get("/projects")
def list_projects():
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "select id, name, path, description, created_at, ignore_patterns from projects order by created_at desc"
        ).fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "path": r[2],
            "description": r[3],
            "created_at": ts_to_iso(r[4]) if r[4] else None,
            "ignore_patterns": r[5],
        }
        for r in rows
    ]


@app.post("/projects")
def create_project(project: ProjectCreate):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "insert into projects(name, path, description, created_at, ignore_patterns) values (?, ?, ?, ?, ?)",
            (project.name, project.path, project.description, int(time.time()), project.ignore_patterns),
        )
        project_id = cursor.lastrowid
    return {"id": project_id, "status": "created"}


@app.delete("/projects/{project_id}")
def delete_project(project_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("delete from projects where id=?", (project_id,))
    return {"status": "deleted"}


@app.get("/projects/{project_id}/config")
def get_project_config(project_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "select id, name, path, description, ignore_patterns from projects where id=?",
            (project_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    proj_id, name, path, description, ignore_patterns_str = row
    try:
        ignore_patterns = json.loads(ignore_patterns_str) if ignore_patterns_str else []
    except (json.JSONDecodeError, TypeError):
        ignore_patterns = [p.strip() for p in (ignore_patterns_str or "").split("\n") if p.strip()]
    return {"id": proj_id, "name": name, "path": path, "description": description, "ignore_patterns": ignore_patterns}


class ProjectConfigUpdate(BaseModel):
    ignore_patterns: Optional[List[str]] = None
    feature_doc_path: Optional[str] = None


@app.put("/projects/{project_id}/config")
def update_project_config(project_id: int, config: ProjectConfigUpdate):
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("select id from projects where id=?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        if config.ignore_patterns is not None:
            conn.execute(
                "update projects set ignore_patterns=? where id=?",
                (json.dumps(config.ignore_patterns), project_id),
            )
    return {"status": "updated"}


# --- Events ---

@app.get("/events")
def list_events(
    project_id: Optional[int] = Query(None),
    kind: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    with sqlite3.connect(DB_PATH) as conn:
        conditions = []
        params: List[Any] = []

        if project_id is not None:
            conditions.append("project_id=?")
            params.append(project_id)
        if kind:
            conditions.append("kind=?")
            params.append(kind)

        where = ("where " + " and ".join(conditions)) if conditions else ""

        total = conn.execute(f"select count(*) from events {where}", params).fetchone()[0]
        rows = conn.execute(
            f"select id, ts, kind, path, payload, project_id from events {where} order by ts desc limit ? offset ?",
            params + [limit, offset],
        ).fetchall()

    items = []
    for row in rows:
        event_id, ts, kind_val, path, payload_str, proj_id = row
        try:
            payload = json.loads(payload_str or "{}")
        except json.JSONDecodeError:
            payload = {}
        items.append({
            "id": event_id,
            "ts": ts_to_iso(int(ts)),
            "kind": kind_val,
            "path": path,
            "payload": payload,
            "project_id": proj_id,
        })

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/events/stream")
async def stream_events(project_id: Optional[int] = Query(None)):
    """Server-Sent Events endpoint for real-time streaming."""
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        sse_queues.append(queue)
        try:
            # Send a heartbeat immediately
            yield {"event": "connected", "data": json.dumps({"status": "connected"})}
            while True:
                try:
                    event_data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    # Filter by project if specified
                    if project_id is None or event_data.get("project_id") == project_id:
                        yield {"event": "message", "data": json.dumps(event_data)}
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield {"event": "heartbeat", "data": json.dumps({"ts": ts_to_iso(int(time.time()))})}
        except asyncio.CancelledError:
            pass
        finally:
            try:
                sse_queues.remove(queue)
            except ValueError:
                pass

    return EventSourceResponse(event_generator())


@app.get("/events/export")
def export_events(
    project_id: Optional[int] = Query(None),
    format: str = Query("markdown", pattern="^(markdown|json)$"),
):
    """Export events as markdown or JSON."""
    with sqlite3.connect(DB_PATH) as conn:
        conditions = []
        params: List[Any] = []
        if project_id is not None:
            conditions.append("project_id=?")
            params.append(project_id)
        where = ("where " + " and ".join(conditions)) if conditions else ""
        rows = conn.execute(
            f"select id, ts, kind, path, payload from events {where} order by ts asc",
            params,
        ).fetchall()

    if format == "json":
        items = []
        for row in rows:
            event_id, ts, kind_val, path, payload_str = row
            try:
                payload = json.loads(payload_str or "{}")
            except json.JSONDecodeError:
                payload = {}
            items.append({"id": event_id, "ts": ts_to_iso(int(ts)), "kind": kind_val, "path": path, "payload": payload})
        return JSONResponse(
            content=items,
            headers={"Content-Disposition": "attachment; filename=code-monitor-log.json"},
        )

    # Markdown format
    lines = ["# Code Monitor Log\n", f"Exported: {ts_to_iso(int(time.time()))}\n\n"]
    for event_id, ts, kind_val, path, payload_str in rows:
        try:
            payload = json.loads(payload_str or "{}")
        except json.JSONDecodeError:
            payload = {}
        lines.append(f"## [{ts_to_iso(int(ts))}] {kind_val}: {path or '-'}\n\n")
        if kind_val == "file_change":
            diff = payload.get("diff", "")
            if diff:
                lines.append(f"```diff\n{diff}\n```\n\n")
        elif kind_val in ("prompt", "summary"):
            text = payload.get("text") or payload.get("content", "")
            if text:
                lines.append(f"{text}\n\n")
        elif kind_val == "copilot_chat":
            lines.append(f"**Prompt:** {payload.get('prompt', '')}\n\n")
            lines.append(f"**Response:** {payload.get('response', '')}\n\n")

    content = "".join(lines)
    return StreamingResponse(
        iter([content]),
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=code-monitor-log.md"},
    )


# --- Prompt capture ---

@app.post("/prompt")
def capture_prompt(
    text: str = Body(...),
    source: str = "manual",
    model: str = "claude",
    project_id: Optional[int] = Body(None),
):
    log_event("prompt", "", {"text": text, "source": source, "model": model}, project_id=project_id)
    return {"status": "ok"}


@app.post("/copilot")
def capture_copilot(
    prompt: str = Body(...),
    response: str = Body(...),
    source: str = "copilot-chat",
    model: str = "copilot",
    conversation_id: str = "",
    project_id: Optional[int] = Body(None),
):
    log_event(
        "copilot_chat",
        "",
        {
            "prompt": prompt,
            "response": response,
            "source": source,
            "model": model,
            "conversation_id": conversation_id,
        },
        project_id=project_id,
    )
    return {"status": "ok"}


@app.post("/error")
def capture_error(
    message: str = Body(...),
    context: Dict = Body(default={}),  # type: ignore[assignment]
    project_id: Optional[int] = Body(None),
):
    log_event("error", "", {"message": message, "context": context}, project_id=project_id)
    return {"status": "ok"}


# --- Summary ---

@app.post("/summary/run")
def summary_run(project_id: Optional[int] = Query(None)):
    summary = generate_summary(project_id=project_id)
    return {"summary": summary}


@app.get("/summary/latest")
def summary_latest(project_id: Optional[int] = Query(None)):
    with sqlite3.connect(DB_PATH) as conn:
        if project_id:
            row = conn.execute(
                "select ts, payload from events where kind='summary' and project_id=? order by ts desc limit 1",
                (project_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "select ts, payload from events where kind='summary' order by ts desc limit 1"
            ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No summary available yet")
    ts, payload = row
    try:
        data: Dict[str, Any] = json.loads(payload or "{}")
    except json.JSONDecodeError:
        data = {}
    return {
        "ts": ts_to_iso(int(ts)),
        "content": data.get("content", ""),
        "model": data.get("model", OPENAI_MODEL),
    }


# --- Single change analysis ---

class AnalyzeChangeRequest(BaseModel):
    event_id: int


@app.post("/analyze-change")
def analyze_single_change(req: AnalyzeChangeRequest):
    """Analyze a single code change event with AI."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required")

    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "select id, ts, kind, path, payload from events where id=?",
            (req.event_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    _, _ts, _kind, path, payload_str = row
    try:
        payload = json.loads(payload_str or "{}")
    except json.JSONDecodeError:
        payload = {}

    diff = payload.get("diff", "")
    if not diff:
        return {"analysis": "No diff available for this event.", "event_id": req.event_id}

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior software engineer reviewing a code change. "
                    "Analyze the diff and explain:\n"
                    "1. What was changed and why\n"
                    "2. Potential impact and risks\n"
                    "3. Code quality observations\n"
                    "Keep it concise. Use markdown formatting."
                ),
            },
            {"role": "user", "content": f"File: {path}\n\n```diff\n{safe_trim(diff, 3000)}\n```"},
        ],
        temperature=0.3,
        max_tokens=500,
    )
    analysis = response.choices[0].message.content.strip()
    return {"analysis": analysis, "event_id": req.event_id, "path": path}


# --- Implications / AI analysis ---

@app.post("/implications")
def analyze_implications(
    project_id: Optional[int] = Query(None),
    hours: int = Query(24),
):
    """Generate AI analysis of recent code changes and their implications."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required")

    since_ts = int(time.time()) - hours * 3600
    with sqlite3.connect(DB_PATH) as conn:
        conditions = ["ts >= ?", "kind IN ('file_change', 'file_deleted', 'folder_created', 'folder_deleted')"]
        params: List[Any] = [since_ts]
        if project_id:
            conditions.append("project_id=?")
            params.append(project_id)
        rows = conn.execute(
            f"select ts, kind, path, payload from events where {' and '.join(conditions)} order by ts asc limit 100",
            params,
        ).fetchall()

    if not rows:
        return {"analysis": "No code changes found in the specified time range.", "event_count": 0}

    digest_lines = []
    for ts, kind_val, path, payload_str in rows:
        try:
            payload = json.loads(payload_str or "{}")
        except json.JSONDecodeError:
            payload = {}
        diff = payload.get("diff", "")[:500]
        digest_lines.append(f"[{ts_to_iso(int(ts))}] {kind_val}: {path}")
        if diff:
            digest_lines.append(f"```diff\n{diff}\n```")

    digest = "\n".join(digest_lines)
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior software engineer reviewing recent code changes. "
                    "Analyze the following changes and provide:\n"
                    "1. A summary of what changed\n"
                    "2. Potential implications and risks\n"
                    "3. Suggestions for improvement\n"
                    "Use markdown formatting with headers and bullet points."
                ),
            },
            {"role": "user", "content": f"Recent changes (last {hours}h):\n\n{digest}"},
        ],
        temperature=0.3,
        max_tokens=1000,
    )
    analysis = response.choices[0].message.content.strip()
    log_event(
        "implications_analysis",
        "",
        {"content": analysis, "model": OPENAI_MODEL, "hours": hours, "event_count": len(rows)},
        project_id=project_id,
    )
    return {"analysis": analysis, "event_count": len(rows)}


# --- AI Chat endpoints ---

@app.post("/ai-chat")
def log_ai_conversation(conv: AIConversationCreate):
    """Log an AI conversation."""
    session_id = conv.session_id or str(uuid.uuid4())
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            """
            insert into ai_conversations
              (project_id, session_id, ai_provider, ai_model, timestamp, conversation_type,
               user_prompt, ai_response, context_files, code_snippets, metadata)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conv.project_id,
                session_id,
                conv.ai_provider,
                conv.ai_model,
                int(time.time()),
                conv.conversation_type or "chat",
                conv.user_prompt,
                conv.ai_response,
                json.dumps(conv.context_files or []),
                json.dumps(conv.code_snippets or []),
                json.dumps(conv.metadata or {}),
            ),
        )
        conversation_id = cursor.lastrowid

    log_event(
        "ai_conversation",
        "",
        {
            "conversation_id": conversation_id,
            "ai_provider": conv.ai_provider,
            "ai_model": conv.ai_model,
            "prompt_preview": safe_trim(conv.user_prompt, 100),
        },
        project_id=conv.project_id,
    )
    return {"id": conversation_id, "status": "logged", "session_id": session_id}


@app.get("/ai-chat/stats")
def get_ai_stats(project_id: Optional[int] = Query(None)):
    """Get AI conversation statistics."""
    with sqlite3.connect(DB_PATH) as conn:
        conditions = []
        params: List[Any] = []
        if project_id is not None:
            conditions.append("project_id=?")
            params.append(project_id)
        where = ("where " + " and ".join(conditions)) if conditions else ""

        total = conn.execute(f"select count(*) from ai_conversations {where}", params).fetchone()[0]

        # Count matched vs unmatched
        match_conditions = list(conditions) + ["matched_to_events IS NOT NULL AND matched_to_events != '[]'"]
        match_where = "where " + " and ".join(match_conditions)
        matched = conn.execute(f"select count(*) from ai_conversations {match_where}", params).fetchone()[0]

        # Provider breakdown
        providers = conn.execute(
            f"select ai_provider, count(*) from ai_conversations {where} group by ai_provider",
            params,
        ).fetchall()

    return {
        "total_conversations": total,
        "matched_conversations": matched,
        "unmatched_conversations": total - matched,
        "by_provider": [{"provider": p[0], "count": p[1]} for p in providers],
    }


@app.get("/ai-chat")
def list_ai_conversations(
    project_id: Optional[int] = Query(None),
    ai_provider: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List AI conversations."""
    with sqlite3.connect(DB_PATH) as conn:
        conditions = []
        params: List[Any] = []
        if project_id is not None:
            conditions.append("project_id=?")
            params.append(project_id)
        if ai_provider:
            conditions.append("ai_provider=?")
            params.append(ai_provider)
        where = ("where " + " and ".join(conditions)) if conditions else ""

        total = conn.execute(f"select count(*) from ai_conversations {where}", params).fetchone()[0]
        rows = conn.execute(
            f"""
            select id, project_id, session_id, ai_provider, ai_model, timestamp,
                   conversation_type, user_prompt, ai_response, context_files,
                   code_snippets, metadata, matched_to_events, confidence_score
            from ai_conversations {where}
            order by timestamp desc limit ? offset ?
            """,
            params + [limit, offset],
        ).fetchall()

    conversations = []
    for row in rows:
        (conv_id, proj_id, session_id, provider, model, ts, conv_type,
         user_prompt, ai_response, context_files, code_snippets, metadata,
         matched_to_events, confidence_score) = row
        conversations.append({
            "id": conv_id,
            "project_id": proj_id,
            "session_id": session_id,
            "ai_provider": provider,
            "ai_model": model,
            "timestamp": ts_to_iso(int(ts)) if ts else None,
            "conversation_type": conv_type,
            "user_prompt": user_prompt,
            "ai_response": ai_response,
            "context_files": json.loads(context_files or "[]"),
            "code_snippets": json.loads(code_snippets or "[]"),
            "metadata": json.loads(metadata or "{}"),
            "matched_to_events": json.loads(matched_to_events or "[]"),
            "confidence_score": confidence_score,
        })

    return {"conversations": conversations, "total": total, "limit": limit, "offset": offset}


@app.get("/ai-chat/{conversation_id}")
def get_ai_conversation(conversation_id: int):
    """Get a specific AI conversation."""
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            """
            select id, project_id, session_id, ai_provider, ai_model, timestamp,
                   conversation_type, user_prompt, ai_response, context_files,
                   code_snippets, metadata, matched_to_events, confidence_score
            from ai_conversations where id=?
            """,
            (conversation_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    (conv_id, proj_id, session_id, provider, model, ts, conv_type,
     user_prompt, ai_response, context_files, code_snippets, metadata,
     matched_to_events, confidence_score) = row

    return {
        "id": conv_id,
        "project_id": proj_id,
        "session_id": session_id,
        "ai_provider": provider,
        "ai_model": model,
        "timestamp": ts_to_iso(int(ts)) if ts else None,
        "conversation_type": conv_type,
        "user_prompt": user_prompt,
        "ai_response": ai_response,
        "context_files": json.loads(context_files or "[]"),
        "code_snippets": json.loads(code_snippets or "[]"),
        "metadata": json.loads(metadata or "{}"),
        "matched_to_events": json.loads(matched_to_events or "[]"),
        "confidence_score": confidence_score,
    }


@app.get("/ai-chat/{conversation_id}/timeline")
def get_ai_conversation_timeline(conversation_id: int):
    """Get a conversation with its matched code changes."""
    with sqlite3.connect(DB_PATH) as conn:
        conv_row = conn.execute(
            """
            select id, project_id, session_id, ai_provider, ai_model, timestamp,
                   conversation_type, user_prompt, ai_response, context_files,
                   code_snippets, metadata, matched_to_events, confidence_score
            from ai_conversations where id=?
            """,
            (conversation_id,),
        ).fetchone()

        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversation not found")

        match_rows = conn.execute(
            """
            select m.id, m.event_id, m.confidence, m.reasoning, m.match_type, m.time_delta,
                   e.path, e.payload
            from ai_code_matches m
            left join events e on e.id = m.event_id
            where m.conversation_id=?
            order by m.confidence desc
            """,
            (conversation_id,),
        ).fetchall()

    (conv_id, proj_id, session_id, provider, model, ts, conv_type,
     user_prompt, ai_response, context_files, code_snippets, metadata,
     matched_to_events, confidence_score) = conv_row

    conversation = {
        "id": conv_id,
        "project_id": proj_id,
        "session_id": session_id,
        "ai_provider": provider,
        "ai_model": model,
        "timestamp": ts_to_iso(int(ts)) if ts else None,
        "conversation_type": conv_type,
        "user_prompt": user_prompt,
        "ai_response": ai_response,
        "context_files": json.loads(context_files or "[]"),
        "code_snippets": json.loads(code_snippets or "[]"),
        "metadata": json.loads(metadata or "{}"),
        "matched_to_events": json.loads(matched_to_events or "[]"),
        "confidence_score": confidence_score,
    }

    matched_changes = []
    for mrow in match_rows:
        match_id, event_id, confidence, reasoning, match_type, time_delta, path, payload_str = mrow
        try:
            payload = json.loads(payload_str or "{}")
        except json.JSONDecodeError:
            payload = {}
        matched_changes.append({
            "event_id": event_id,
            "path": path,
            "confidence": confidence,
            "reasoning": reasoning,
            "match_type": match_type,
            "time_delta": time_delta,
            "diff": payload.get("diff"),
        })

    return {"conversation": conversation, "matched_changes": matched_changes}


@app.post("/ai-chat/{conversation_id}/match")
def match_ai_conversation(conversation_id: int):
    """Use GPT to match an AI conversation to recent code changes."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required")

    with sqlite3.connect(DB_PATH) as conn:
        conv_row = conn.execute(
            "select id, project_id, timestamp, user_prompt, ai_response from ai_conversations where id=?",
            (conversation_id,),
        ).fetchone()

        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversation not found")

        conv_id, proj_id, conv_ts, user_prompt, ai_response = conv_row

        # Look for file changes within 2 hours after the conversation
        window = 2 * 3600
        conditions = ["kind='file_change'", "ts >= ?", "ts <= ?"]
        params: List[Any] = [conv_ts, conv_ts + window]
        if proj_id:
            conditions.append("project_id=?")
            params.append(proj_id)

        event_rows = conn.execute(
            f"select id, ts, path, payload from events where {' and '.join(conditions)} order by ts asc limit 50",
            params,
        ).fetchall()

    if not event_rows:
        return {"status": "no_changes", "matched_events": 0}

    # Build matching prompt
    prompt_text = safe_trim(user_prompt, 500)
    response_text = safe_trim(ai_response, 500)

    changes_text = []
    for event_id, event_ts, path, payload_str in event_rows:
        try:
            payload = json.loads(payload_str or "{}")
        except json.JSONDecodeError:
            payload = {}
        diff = safe_trim(payload.get("diff", ""), 300)
        changes_text.append(f"[Event {event_id}] {path}\n{diff}")

    matching_prompt = f"""
AI Conversation:
User: {prompt_text}
AI: {response_text}

Code changes that happened after this conversation:
{chr(10).join(changes_text)}

For each code change, determine if it was likely influenced by the AI conversation.
Return JSON: {{"matches": [{{"event_id": 123, "confidence": 0.85, "reasoning": "brief", "match_type": "direct"}}]}}
Only include matches with confidence >= 0.6.
"""

    client = OpenAI(api_key=OPENAI_API_KEY)
    gpt_response = client.chat.completions.create(
        model=OPENAI_MATCHING_MODEL,
        messages=[
            {"role": "system", "content": "You are an expert code analyst matching AI conversations to code changes. Return valid JSON only."},
            {"role": "user", "content": matching_prompt},
        ],
        temperature=0.1,
        max_tokens=1000,
        response_format={"type": "json_object"},
    )

    try:
        result = json.loads(gpt_response.choices[0].message.content)
        matches = result.get("matches", [])
    except (json.JSONDecodeError, KeyError):
        matches = []

    # Save matches to database
    matched_event_ids = []
    with sqlite3.connect(DB_PATH) as conn:
        # Clear existing matches
        conn.execute("delete from ai_code_matches where conversation_id=?", (conversation_id,))

        for match in matches:
            event_id = match.get("event_id")
            confidence = match.get("confidence", 0)
            if event_id and confidence >= 0.6:
                # Find time delta
                event_ts_row = conn.execute("select ts from events where id=?", (event_id,)).fetchone()
                time_delta = (event_ts_row[0] - conv_ts) if event_ts_row else 0

                conn.execute(
                    "insert into ai_code_matches (conversation_id, event_id, confidence, reasoning, match_type, time_delta, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                    (
                        conversation_id,
                        event_id,
                        confidence,
                        match.get("reasoning", ""),
                        match.get("match_type", "inferred"),
                        time_delta,
                        int(time.time()),
                    ),
                )
                matched_event_ids.append(event_id)

        # Update conversation with matched events
        conn.execute(
            "update ai_conversations set matched_to_events=?, confidence_score=? where id=?",
            (
                json.dumps(matched_event_ids),
                max([m.get("confidence", 0) for m in matches], default=0) if matches else 0,
                conversation_id,
            ),
        )

    return {"status": "matched", "matched_events": len(matched_event_ids)}


# --- bootstrap -----------------------------------------------------------

def main() -> None:
    init_db()
    handler = FileHandler()
    observer = Observer()
    observer.schedule(handler, str(REPO_PATH), recursive=True)
    observer.start()

    try:
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
