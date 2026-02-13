import difflib
import json
import os
import sqlite3
import time
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, Optional

import uvicorn
from fastapi import Body, FastAPI, HTTPException
from git import InvalidGitRepositoryError, Repo
from openai import OpenAI
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
SUMMARY_EVENT_LIMIT = int(os.environ.get("SUMMARY_EVENT_LIMIT", 50))
SUMMARY_CHAR_LIMIT = int(os.environ.get("SUMMARY_CHAR_LIMIT", 6000))

app = FastAPI(title=APP_TITLE)

# Try to attach to git repo if present.
try:
    repo: Optional[Repo] = Repo(REPO_PATH)
except InvalidGitRepositoryError:
    repo = None


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
              payload text
            )
            """
        )
        conn.execute("create index if not exists idx_events_ts on events(ts)")


def log_event(kind: str, path: str, payload: Dict) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "insert into events(ts, kind, path, payload) values (?, ?, ?, ?)",
            (int(time.time()), kind, path, json.dumps(payload)),
        )


def ts_to_iso(ts: int) -> str:
    return datetime.utcfromtimestamp(ts).isoformat() + "Z"


def safe_trim(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"... [truncated {len(text) - limit} chars]"


def build_event_digest(limit: int = SUMMARY_EVENT_LIMIT, char_limit: int = SUMMARY_CHAR_LIMIT) -> str:
    with sqlite3.connect(DB_PATH) as conn:
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


def generate_summary() -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required for summaries")

    digest = build_event_digest()
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
    log_event("summary", "", {"content": summary, "model": OPENAI_MODEL})
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
        log_event(
            kind="file_change",
            path=str(path.relative_to(REPO_PATH)) if path.exists() else str(path),
            payload={
                "event": event,
                "diff": diff,
                "sha": sha256(new_content.encode("utf-8", "ignore")).hexdigest(),
                "size": len(new_content.encode("utf-8", "ignore")),
            },
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
        if event.is_directory:
            return
        path = Path(event.src_path)
        if self._should_ignore(path):
            return
        content = self._read_text(path)
        self._log_diff(path, content, "created")

    def on_deleted(self, event):  # type: ignore[override]
        if event.is_directory:
            return
        path = Path(event.src_path)
        if self._should_ignore(path):
            return
        log_event(
            kind="file_deleted",
            path=str(path.relative_to(REPO_PATH)),
            payload={"event": "deleted"},
        )
        self.cache.pop(str(path), None)


# --- API endpoints --------------------------------------------------------

@app.post("/prompt")
def capture_prompt(text: str = Body(...), source: str = "manual", model: str = "claude"):
    log_event("prompt", "", {"text": text, "source": source, "model": model})
    return {"status": "ok"}


@app.post("/copilot")
def capture_copilot(
    prompt: str = Body(...),
    response: str = Body(...),
    source: str = "copilot-chat",
    model: str = "copilot",
    conversation_id: str = "",
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
    )
    return {"status": "ok"}


@app.post("/error")
def capture_error(message: str = Body(...), context: Dict = Body(default={})):  # type: ignore[assignment]
    log_event("error", "", {"message": message, "context": context})
    return {"status": "ok"}


@app.post("/summary/run")
def summary_run():
    summary = generate_summary()
    return {"summary": summary}


@app.get("/summary/latest")
def summary_latest():
    with sqlite3.connect(DB_PATH) as conn:
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


@app.get("/health")
def health():
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("select count(*) from events")
        total = cur.fetchone()[0]
    return {"status": "up", "events": total}


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
