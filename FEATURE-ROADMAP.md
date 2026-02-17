# 🚀 Code Monitor - Feature Roadmap & AI Chat Integration

## Overview

Enhance Code Monitor to capture AI assistant interactions (Claude, Copilot, Codex, terminal-based AIs) and correlate them with code changes for comprehensive development intelligence.

---

## 🎯 Phase 4: AI Chat Integration (High Priority)

### Feature: Multi-AI Chat Logging

**Purpose**: Capture conversations with AI assistants and match them to resulting code changes

#### Supported AI Assistants

| AI Assistant | Type | Integration Method | Priority |
|--------------|------|-------------------|----------|
| **Claude Desktop** | GUI | Log file monitoring | High |
| **Claude CLI** | Terminal | Hook injection | High |
| **GitHub Copilot Chat** | VS Code | Extension API | High |
| **Cursor AI** | IDE | Log file monitoring | Medium |
| **Aider** | Terminal | Log file monitoring | Medium |
| **Codex (via CLI)** | Terminal | Hook injection | Medium |
| **ChatGPT (via API)** | Web/API | API logging | Low |
| **Continue.dev** | VS Code | Extension API | Medium |

---

## 📊 Implementation Plan

### 1. Database Schema Updates

**New Table: `ai_conversations`**
```sql
CREATE TABLE ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    session_id TEXT NOT NULL,           -- Group related exchanges
    ai_provider TEXT NOT NULL,          -- 'claude', 'copilot', 'cursor', etc.
    ai_model TEXT,                      -- 'claude-3.5-sonnet', 'gpt-4', etc.
    timestamp INTEGER NOT NULL,
    conversation_type TEXT,             -- 'chat', 'inline', 'command'
    user_prompt TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    context_files TEXT,                 -- JSON array of files mentioned
    code_snippets TEXT,                 -- JSON array of code blocks in response
    metadata TEXT,                      -- JSON: tokens, latency, etc.
    matched_to_events TEXT,             -- JSON array of event IDs
    confidence_score REAL,              -- 0-1 match confidence
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_conversations_project ON ai_conversations(project_id);
CREATE INDEX idx_ai_conversations_timestamp ON ai_conversations(timestamp);
CREATE INDEX idx_ai_conversations_session ON ai_conversations(session_id);
```

**New Table: `ai_code_matches`**
```sql
CREATE TABLE ai_code_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    match_type TEXT NOT NULL,           -- 'direct', 'related', 'suggested'
    confidence REAL NOT NULL,           -- 0-1
    reasoning TEXT,                     -- Why they were matched
    file_overlap INTEGER DEFAULT 0,     -- Number of overlapping files
    time_delta INTEGER,                 -- Seconds between chat and change
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_matches_conversation ON ai_code_matches(conversation_id);
CREATE INDEX idx_matches_event ON ai_code_matches(event_id);
```

---

### 2. AI Integration Methods

#### Method A: Log File Monitoring (Claude Desktop, Cursor, Aider)

**Claude Desktop Log Locations:**
- macOS: `~/Library/Application Support/Claude/logs/`
- Windows: `%APPDATA%\Claude\logs\`
- Linux: `~/.config/Claude/logs/`

**Implementation:**
```python
class AILogMonitor:
    """Monitor AI assistant log files for conversations"""

    def __init__(self, ai_provider: str, log_path: Path):
        self.ai_provider = ai_provider
        self.log_path = log_path
        self.last_position = 0

    def parse_claude_log(self, line: str) -> Optional[Dict]:
        """Parse Claude Desktop log format"""
        # Example log format:
        # [2026-02-16 22:30:00] USER: How do I implement OAuth2?
        # [2026-02-16 22:30:05] ASSISTANT: Here's how to implement OAuth2...

        try:
            timestamp_match = re.match(r'\[([\d\-: ]+)\] (\w+): (.*)', line)
            if timestamp_match:
                timestamp_str, role, content = timestamp_match.groups()
                return {
                    'timestamp': datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S'),
                    'role': role.lower(),
                    'content': content
                }
        except Exception as e:
            print(f"Error parsing line: {e}")
        return None

    def extract_code_snippets(self, response: str) -> List[Dict]:
        """Extract code blocks from AI response"""
        # Match ```language\ncode\n``` patterns
        pattern = r'```(\w+)?\n(.*?)\n```'
        snippets = []
        for match in re.finditer(pattern, response, re.DOTALL):
            language = match.group(1) or 'unknown'
            code = match.group(2)
            snippets.append({
                'language': language,
                'code': code,
                'lines': len(code.split('\n'))
            })
        return snippets

    def extract_file_references(self, text: str) -> List[str]:
        """Extract file paths mentioned in conversation"""
        # Common patterns: "in file.py", "update auth/service.py", etc.
        patterns = [
            r'(?:in |file |update |modify |edit )?([\w/.-]+\.[\w]+)',
            r'`([^`]+\.\w+)`',
        ]
        files = set()
        for pattern in patterns:
            files.update(re.findall(pattern, text))
        return list(files)

    def monitor(self, callback):
        """Continuously monitor log file for new entries"""
        with open(self.log_path, 'r') as f:
            # Jump to last position
            f.seek(self.last_position)

            current_exchange = {'user': None, 'assistant': None}

            for line in f:
                parsed = self.parse_claude_log(line)
                if parsed:
                    if parsed['role'] == 'user':
                        current_exchange['user'] = parsed
                    elif parsed['role'] == 'assistant':
                        current_exchange['assistant'] = parsed

                        # Complete exchange - log it
                        if current_exchange['user']:
                            callback(self.create_conversation_entry(current_exchange))
                            current_exchange = {'user': None, 'assistant': None}

            self.last_position = f.tell()

    def create_conversation_entry(self, exchange: Dict) -> Dict:
        """Create database entry from exchange"""
        user_content = exchange['user']['content']
        ai_content = exchange['assistant']['content']

        return {
            'ai_provider': self.ai_provider,
            'timestamp': int(exchange['assistant']['timestamp'].timestamp()),
            'user_prompt': user_content,
            'ai_response': ai_content,
            'code_snippets': json.dumps(self.extract_code_snippets(ai_content)),
            'context_files': json.dumps(self.extract_file_references(user_content + ai_content)),
        }
```

#### Method B: VS Code Extension Hook (Copilot Chat, Continue.dev)

**VS Code Extension Implementation:**

```typescript
// extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Hook into Copilot Chat API
    const copilotChatHook = vscode.chat.registerChatParticipant(
        'code-monitor-logger',
        async (request, context, response, token) => {
            // Log the chat interaction
            await logCopilotChat({
                prompt: request.prompt,
                references: request.references,
                model: 'copilot',
                timestamp: Date.now()
            });

            // Collect response
            const responseText = await collectResponse(response);

            // Send to Code Monitor backend
            await sendToCodeMonitor({
                ai_provider: 'copilot',
                user_prompt: request.prompt,
                ai_response: responseText,
                context_files: extractFilesFromReferences(request.references)
            });
        }
    );

    context.subscriptions.push(copilotChatHook);
}

async function sendToCodeMonitor(data: any) {
    const response = await fetch('http://localhost:4381/ai-chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    return response.json();
}
```

**Package this as VS Code extension**: `code-monitor-ai-logger`

#### Method C: Terminal Hook (Claude CLI, Aider, Codex CLI)

**Shell Hook Implementation:**

```bash
# ~/.bashrc or ~/.zshrc

# Hook for Claude CLI
claude() {
    local session_id=$(uuidgen)
    local start_time=$(date +%s)

    # Capture user prompt
    local prompt="$*"

    # Run actual Claude CLI
    local response=$(command claude "$@" 2>&1)

    # Log to Code Monitor
    curl -X POST http://localhost:4381/ai-chat \
        -H "Content-Type: application/json" \
        -d "{
            \"ai_provider\": \"claude-cli\",
            \"session_id\": \"$session_id\",
            \"user_prompt\": \"$prompt\",
            \"ai_response\": \"$response\",
            \"timestamp\": $start_time
        }" &>/dev/null &

    # Show response to user
    echo "$response"
}

# Hook for Aider
aider() {
    # Start Aider with logging wrapper
    command aider "$@" 2>&1 | tee >(
        # Parse Aider output and send to Code Monitor
        python3 -c "
import sys, json, requests
from datetime import datetime

buffer = []
for line in sys.stdin:
    buffer.append(line)
    if '> ' in line or 'Aider' in line:
        # Detect user prompts and AI responses
        # Send to Code Monitor
        pass
"
    )
}
```

---

### 3. Backend API Endpoints

**New Endpoints:**

```python
# AI Chat Endpoints

@app.post("/ai-chat")
def log_ai_chat(chat: AIChatLog):
    """Log an AI conversation"""
    with sqlite3.connect(DB_PATH) as conn:
        # Insert conversation
        cursor = conn.execute(
            """INSERT INTO ai_conversations
               (project_id, session_id, ai_provider, ai_model, timestamp,
                conversation_type, user_prompt, ai_response, context_files,
                code_snippets, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                chat.project_id,
                chat.session_id or str(uuid.uuid4()),
                chat.ai_provider,
                chat.ai_model,
                int(time.time()),
                chat.conversation_type or 'chat',
                chat.user_prompt,
                chat.ai_response,
                json.dumps(chat.context_files or []),
                json.dumps(extract_code_snippets(chat.ai_response)),
                json.dumps(chat.metadata or {})
            )
        )
        conversation_id = cursor.lastrowid

    # Trigger async matching
    asyncio.create_task(match_chat_to_events(conversation_id))

    return {"id": conversation_id, "status": "logged"}


@app.post("/ai-chat/match")
async def match_chat_to_events_endpoint(request: MatchChatRequest):
    """Match AI conversations to code changes"""
    conversation_id = request.conversation_id

    # Get conversation details
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT user_prompt, ai_response, context_files, timestamp, project_id FROM ai_conversations WHERE id = ?",
            (conversation_id,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_prompt, ai_response, context_files_json, chat_timestamp, project_id = row
    context_files = json.loads(context_files_json or '[]')

    # Find events within time window (5 minutes before/after chat)
    time_window = 300  # 5 minutes
    with sqlite3.connect(DB_PATH) as conn:
        events = conn.execute(
            """SELECT id, ts, kind, path, payload
               FROM events
               WHERE project_id = ?
               AND ts BETWEEN ? AND ?
               AND kind = 'file_change'""",
            (project_id, chat_timestamp - time_window, chat_timestamp + time_window)
        ).fetchall()

    # Use GPT-4 to match
    matches = await ai_match_conversations_to_events(
        user_prompt, ai_response, context_files, events
    )

    # Store matches
    with sqlite3.connect(DB_PATH) as conn:
        for match in matches:
            conn.execute(
                """INSERT INTO ai_code_matches
                   (conversation_id, event_id, match_type, confidence, reasoning,
                    file_overlap, time_delta, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    conversation_id,
                    match['event_id'],
                    match['match_type'],
                    match['confidence'],
                    match['reasoning'],
                    match['file_overlap'],
                    match['time_delta'],
                    int(time.time())
                )
            )

    return {"matches": matches}


@app.get("/ai-chat")
def list_ai_chats(
    project_id: Optional[int] = None,
    ai_provider: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List AI conversations with optional filters"""
    with sqlite3.connect(DB_PATH) as conn:
        query = "SELECT * FROM ai_conversations WHERE 1=1"
        params = []

        if project_id:
            query += " AND project_id = ?"
            params.append(project_id)

        if ai_provider:
            query += " AND ai_provider = ?"
            params.append(ai_provider)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()

        conversations = []
        for row in rows:
            conversations.append({
                'id': row[0],
                'project_id': row[1],
                'session_id': row[2],
                'ai_provider': row[3],
                'ai_model': row[4],
                'timestamp': ts_to_iso(row[5]),
                'user_prompt': row[7],
                'ai_response': row[8],
                'matched_events': json.loads(row[12] or '[]')
            })

    return {"conversations": conversations}


@app.get("/ai-chat/{conversation_id}/timeline")
def get_conversation_timeline(conversation_id: int):
    """Get conversation with related code changes in timeline"""
    with sqlite3.connect(DB_PATH) as conn:
        # Get conversation
        conv = conn.execute(
            "SELECT * FROM ai_conversations WHERE id = ?",
            (conversation_id,)
        ).fetchone()

        if not conv:
            raise HTTPException(status_code=404, detail="Not found")

        # Get matched events
        matches = conn.execute(
            """SELECT e.*, m.confidence, m.reasoning
               FROM ai_code_matches m
               JOIN events e ON m.event_id = e.id
               WHERE m.conversation_id = ?
               ORDER BY m.confidence DESC""",
            (conversation_id,)
        ).fetchall()

        return {
            'conversation': format_conversation(conv),
            'matched_changes': [format_event_with_match(m) for m in matches]
        }
```

**Pydantic Models:**

```python
class AIChatLog(BaseModel):
    project_id: Optional[int] = None
    session_id: Optional[str] = None
    ai_provider: str  # 'claude', 'copilot', 'cursor', 'aider'
    ai_model: Optional[str] = None
    conversation_type: Optional[str] = 'chat'
    user_prompt: str
    ai_response: str
    context_files: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

class MatchChatRequest(BaseModel):
    conversation_id: int
    time_window_seconds: Optional[int] = 300
```

---

### 4. AI Matching Algorithm

**GPT-4 Powered Matching:**

```python
async def ai_match_conversations_to_events(
    user_prompt: str,
    ai_response: str,
    context_files: List[str],
    events: List[tuple]
) -> List[Dict]:
    """Use GPT-4 to match conversations to events"""

    # Build matching prompt
    prompt = f"""Match this AI conversation to code changes.

**User Question:**
{user_prompt[:500]}

**AI Response:**
{ai_response[:1000]}

**Files Mentioned:** {', '.join(context_files)}

**Code Changes (within 5 min):**
{format_events_for_matching(events)}

**Task:**
Determine which code changes were likely implemented as a result of this AI conversation.
For each match, provide:
1. event_id
2. match_type: 'direct' (clearly related), 'related' (possibly related), 'suggested' (AI suggested but not implemented)
3. confidence: 0.0-1.0
4. reasoning: Brief explanation
5. file_overlap: How many mentioned files were actually changed

Return JSON:
{{
  "matches": [
    {{
      "event_id": 123,
      "match_type": "direct",
      "confidence": 0.95,
      "reasoning": "User asked about OAuth2, AI suggested implementation in auth/service.py, file was modified",
      "file_overlap": 1,
      "time_delta": 45
    }}
  ]
}}
"""

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert at matching AI conversations to code changes."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        response_format={"type": "json_object"}
    )

    result = json.loads(response.choices[0].message.content)
    return result.get('matches', [])


def format_events_for_matching(events: List[tuple]) -> str:
    """Format events for GPT matching prompt"""
    lines = []
    for event_id, ts, kind, path, payload in events:
        payload_dict = json.loads(payload or '{}')
        diff = payload_dict.get('diff', '')[:200]
        lines.append(f"[Event {event_id}] {path} - {diff}")
    return '\n'.join(lines)
```

---

### 5. Frontend Implementation

**New Components:**

```typescript
// AIChatTimeline.tsx
interface AIChat {
  id: number
  ai_provider: string
  ai_model: string
  timestamp: string
  user_prompt: string
  ai_response: string
  matched_events: number[]
  confidence_score: number
}

function AIChatTimeline({ projectId }: { projectId: number }) {
  const { data } = useQuery({
    queryKey: ['ai-chats', projectId],
    queryFn: () => fetchAIChats(projectId)
  })

  return (
    <div className="space-y-4">
      {data?.conversations.map((chat: AIChat) => (
        <div key={chat.id} className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            {getProviderIcon(chat.ai_provider)}
            <span className="font-semibold">{chat.ai_provider}</span>
            <span className="text-sm text-gray-500">{chat.ai_model}</span>
            <span className="text-xs text-gray-400">{formatRelativeTime(chat.timestamp)}</span>
          </div>

          <div className="bg-blue-50 p-3 rounded mb-2">
            <div className="text-xs text-blue-600 mb-1">You asked:</div>
            <div className="text-sm">{chat.user_prompt}</div>
          </div>

          <div className="bg-green-50 p-3 rounded mb-2">
            <div className="text-xs text-green-600 mb-1">AI responded:</div>
            <ReactMarkdown className="text-sm prose">
              {chat.ai_response}
            </ReactMarkdown>
          </div>

          {chat.matched_events.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-xs text-gray-600 mb-2">
                🔗 Matched to {chat.matched_events.length} code changes
              </div>
              <button
                onClick={() => showMatchedEvents(chat.id)}
                className="text-sm text-blue-600 hover:underline"
              >
                View Timeline →
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// AI Provider Icons
function getProviderIcon(provider: string) {
  const icons = {
    'claude': '🤖',
    'copilot': '🧑‍✈️',
    'cursor': '⚡',
    'aider': '🛠️',
    'codex': '💻'
  }
  return <span className="text-2xl">{icons[provider] || '🤔'}</span>
}
```

**Timeline View:**

```typescript
// ConversationTimeline.tsx
function ConversationTimeline({ conversationId }: { conversationId: number }) {
  const { data } = useQuery({
    queryKey: ['conversation-timeline', conversationId],
    queryFn: () => fetch(`/api/ai-chat/${conversationId}/timeline`).then(r => r.json())
  })

  const timeline = useMemo(() => {
    if (!data) return []

    return [
      {
        type: 'conversation',
        timestamp: data.conversation.timestamp,
        data: data.conversation
      },
      ...data.matched_changes.map((change: any) => ({
        type: 'code_change',
        timestamp: change.ts,
        data: change,
        confidence: change.confidence
      }))
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [data])

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" />

      {timeline.map((item, index) => (
        <div key={index} className="relative pl-20 pb-8">
          {/* Timeline dot */}
          <div className={`absolute left-6 w-4 h-4 rounded-full ${
            item.type === 'conversation' ? 'bg-blue-500' : 'bg-green-500'
          }`} />

          {/* Content */}
          {item.type === 'conversation' ? (
            <ConversationCard conversation={item.data} />
          ) : (
            <CodeChangeCard
              change={item.data}
              confidence={item.confidence}
            />
          )}
        </div>
      ))}
    </div>
  )
}
```

---

## 🚀 Additional Feature Ideas

### 1. Session Recording & Replay

**Feature:** Record entire coding sessions with AI interactions

**Implementation:**
- Record all events + AI chats in time order
- Replay sessions with timeline scrubber
- See what was discussed vs what was implemented
- Identify patterns in developer workflow

**UI:**
```
┌─────────────────────────────────────────────────┐
│ Session: Feb 16, 2026 - 2 hours 30 minutes     │
│ [▶️] [⏸️] [⏹️]  ━━━━━━━━━○────────  1:30:00    │
├─────────────────────────────────────────────────┤
│ 14:00  💬 Asked Claude about authentication    │
│ 14:02  📝 Modified auth/service.py              │
│ 14:05  💬 Follow-up: "How to add JWT?"         │
│ 14:08  📝 Added token.py                        │
│ 14:10  🧪 Ran tests - 2 failed                 │
│ 14:12  💬 Asked about test failures             │
│ 14:15  📝 Fixed test/auth_test.py               │
│ 14:17  ✅ Tests passed                          │
└─────────────────────────────────────────────────┘
```

### 2. AI Suggestion Tracking

**Feature:** Track which AI suggestions were accepted vs rejected

**Database:**
```sql
CREATE TABLE ai_suggestions (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER,
    suggestion_text TEXT,
    code_snippet TEXT,
    suggested_file TEXT,
    status TEXT,  -- 'accepted', 'rejected', 'modified', 'pending'
    actual_implementation TEXT,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
```

**Metrics:**
- Acceptance rate per AI provider
- Which suggestions lead to bugs
- Time saved by accepting suggestions

### 3. Context Awareness

**Feature:** Track what files/code were visible during AI conversations

**Implementation:**
- VS Code extension sends open files
- Track cursor position, selection
- Send to Code Monitor with chat

**Benefits:**
- Better matching (AI was definitely discussing visible code)
- Understand context of questions
- Replay with exact code state

### 4. Diff Comparison

**Feature:** Compare AI-suggested code vs actual implementation

**UI:**
```
┌──────────────────────┬──────────────────────┐
│ AI Suggested         │ You Implemented      │
├──────────────────────┼──────────────────────┤
│ def authenticate():  │ def authenticate():  │
│   # Check password   │   # Validate input   │
│   if check_pwd():    │   if not user:       │
│     return True      │     raise Error      │
│                      │   return check_pwd() │
└──────────────────────┴──────────────────────┘

Similarity: 65% | Changes: Added validation
```

### 5. AI Provider Comparison

**Feature:** Compare effectiveness of different AI assistants

**Metrics:**
```
┌─────────────────────────────────────────────┐
│ AI Provider Performance (Last 30 Days)      │
├─────────────┬──────────┬───────────┬────────┤
│ Provider    │ Chats    │ Acceptance│ Bugs   │
├─────────────┼──────────┼───────────┼────────┤
│ Claude      │ 156      │ 87%       │ 3      │
│ Copilot     │ 243      │ 92%       │ 5      │
│ Cursor      │ 89       │ 79%       │ 2      │
│ Aider       │ 45       │ 95%       │ 0      │
└─────────────┴──────────┴───────────┴────────┘
```

### 6. Knowledge Graph

**Feature:** Build graph of concepts discussed with AI

**Implementation:**
- Extract topics from conversations
- Link to code files/classes
- Visualize knowledge network

**Visualization:**
```
    [Authentication] ──┬── auth/service.py
           │           ├── token.py
           │           └── [JWT]
           │
           ├─── [OAuth2] ── oauth_provider.py
           │
           └─── [Security] ─┬── encryption.py
                            └── [Hashing]
```

### 7. Team Analytics (Multi-User)

**Feature:** Track AI usage across team

**Metrics:**
- Who uses AI most
- Which features rely on AI
- AI-assisted vs manual code
- Knowledge sharing patterns

### 8. AI Cost Tracking

**Feature:** Track API costs for AI interactions

**Database:**
```sql
CREATE TABLE ai_usage_costs (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER,
    provider TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    timestamp INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
```

**Dashboard:**
```
┌─────────────────────────────────────────┐
│ AI Costs This Month: $47.32             │
├──────────────┬──────────┬───────────────┤
│ Provider     │ Usage    │ Cost          │
├──────────────┼──────────┼───────────────┤
│ Claude API   │ 1.2M tok │ $24.50        │
│ GPT-4        │ 850K tok │ $22.82        │
└──────────────┴──────────┴───────────────┘

Trend: ↑ 15% vs last month
```

### 9. Smart Notifications

**Feature:** Alert when AI suggestions aren't followed

**Examples:**
- "Claude suggested adding error handling, but it wasn't implemented"
- "Copilot recommended a test, no test was added"
- "You asked about performance 3 times - might need optimization"

### 10. Learning Path Tracker

**Feature:** Track learning journey through AI conversations

**Implementation:**
- Categorize questions by topic
- Track progression (beginner → advanced)
- Suggest areas to learn more

**UI:**
```
Your Learning Journey:

┌─ React Hooks ────────────────────────────┐
│ ●●●●●●●○○○ 70% Mastered                  │
│ Topics: useState, useEffect, custom hooks│
│ Questions: 23  |  Time: 8 hours          │
└──────────────────────────────────────────┘

┌─ Authentication ─────────────────────────┐
│ ●●●○○○○○○○ 30% Learning                  │
│ Topics: JWT, OAuth2, Sessions            │
│ Questions: 15  |  Time: 4 hours          │
└──────────────────────────────────────────┘
```

---

## 📋 Implementation Priority

### Phase 4A: Core AI Integration (2-3 days)
1. ✅ Database schema for ai_conversations
2. ✅ Basic log file monitor (Claude, Cursor)
3. ✅ API endpoints for logging chats
4. ✅ Simple matching algorithm
5. ✅ Frontend timeline view

### Phase 4B: Enhanced Matching (1-2 days)
1. ✅ GPT-4 powered matching
2. ✅ Confidence scoring
3. ✅ File overlap detection
4. ✅ Time-based correlation

### Phase 4C: VS Code Extension (2-3 days)
1. ✅ Copilot chat hook
2. ✅ Context file tracking
3. ✅ Auto-send to Code Monitor
4. ✅ Publish to marketplace

### Phase 4D: Terminal Hooks (1 day)
1. ✅ Bash/Zsh hooks
2. ✅ Aider integration
3. ✅ Claude CLI wrapper

### Phase 5: Advanced Features (1 week)
1. Session recording & replay
2. AI suggestion tracking
3. Diff comparison
4. Provider comparison metrics

### Phase 6: Analytics & Intelligence (1 week)
1. Knowledge graph
2. Learning path tracker
3. Cost tracking
4. Smart notifications

---

## 🔧 Quick Start Guide

### Enable AI Chat Logging

**1. For Claude Desktop:**
```bash
# Add to Code Monitor config
echo "AI_LOG_MONITORS=claude:/Users/$(whoami)/Library/Application Support/Claude/logs/" >> .env

# Restart Code Monitor
docker compose restart backend
```

**2. For VS Code Copilot:**
```bash
# Install Code Monitor VS Code extension
code --install-extension code-monitor-ai-logger

# Configure Code Monitor URL
# Settings → Extensions → Code Monitor → Backend URL: http://localhost:4381
```

**3. For Terminal AI (Claude CLI, Aider):**
```bash
# Add to ~/.zshrc or ~/.bashrc
cat >> ~/.zshrc << 'EOF'
# Code Monitor AI Hooks
source /path/to/Code-Monitor/scripts/ai-hooks.sh
EOF

source ~/.zshrc
```

---

## 📊 Expected Benefits

### For Individual Developers
- ⏱️ **Time Tracking**: See how long AI-assisted tasks take
- 📈 **Learning Analytics**: Track skill progression
- 🎯 **Productivity**: Measure AI assistance impact
- 🔍 **Code Quality**: Review AI suggestions vs implementations

### For Teams
- 📊 **Team Metrics**: AI usage patterns
- 💰 **Cost Management**: Track API spending
- 🤝 **Knowledge Sharing**: See what team members ask AI
- 📚 **Best Practices**: Identify effective AI usage patterns

### For Project Management
- 🎯 **Effort Estimation**: Better estimates with AI factor
- 📉 **Risk Identification**: Spot over-reliance on AI
- 📝 **Documentation**: Auto-generate from AI conversations
- 🔄 **Process Improvement**: Optimize AI-assisted workflows

---

## 🎯 Success Metrics

After implementation, track:

1. **Matching Accuracy**: >80% of AI chats correctly matched to code changes
2. **Coverage**: >90% of AI conversations captured
3. **Performance**: Matching completes in <5 seconds
4. **User Adoption**: >70% of developers use AI logging
5. **Cost Efficiency**: ROI on AI API costs

---

## 📝 Next Steps

1. Review and approve roadmap
2. Prioritize features for Phase 4
3. Set up development environment
4. Implement database schema
5. Build log monitors
6. Create frontend components
7. Test with real AI assistants
8. Deploy and iterate

---

*Ready to transform Code Monitor into the ultimate AI-assisted development intelligence system!* 🚀
