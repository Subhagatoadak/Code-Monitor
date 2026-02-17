# Code Monitor - Technical Architecture

## System Overview

Code Monitor is a sophisticated multi-project development intelligence system that combines real-time file monitoring, AI-powered code analysis, and living technical documentation. Built as a localhost-only development tool, it tracks code changes across multiple projects, provides impact analysis, and maintains evolving architecture documentation.

**Architecture Pattern**: Event-driven microservices with real-time streaming
**Primary Stack**: FastAPI + React + SQLite + OpenAI GPT-4
**Deployment**: Docker Compose multi-container orchestration
**Data Flow**: SSE (Server-Sent Events) for real-time updates

---

## Core Design Principles

1. **Localhost-Only**: No authentication required, designed for single developer use
2. **Real-Time**: SSE streaming for instant UI updates
3. **AI-Powered**: GPT-4 integration for code analysis and impact assessment
4. **Multi-Project**: Support for monitoring multiple repositories simultaneously
5. **Living Documentation**: Self-updating technical documents with AI insights

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Project  │  │  Event   │  │   AI     │  │  Tech    │   │
│  │   List   │  │ Timeline │  │ Analysis │  │   Doc    │   │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘   │
│        │             │              │              │         │
│        └─────────────┴──────────────┴──────────────┘         │
│                          │                                   │
│                   REST API + SSE                             │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Project    │  │   Event     │  │   AI        │         │
│  │  Manager    │  │   Manager   │  │   Engine    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                 │                 │
│         │        ┌───────┴───────┐         │                 │
│         │        │   File        │         │                 │
│         │        │   Watcher     │         │                 │
│         │        │  (Watchdog)   │         │                 │
│         │        └───────┬───────┘         │                 │
│         │                │                 │                 │
│         └────────────────┴─────────────────┘                 │
│                          │                                   │
│                   ┌──────┴──────┐                            │
│                   │   SQLite    │                            │
│                   │   Database  │                            │
│                   └─────────────┘                            │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                   External Services                          │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │   OpenAI    │  │    Git      │                           │
│  │    API      │  │  Repository │                           │
│  │  (GPT-4)    │  │   (GitPython)│                          │
│  └─────────────┘  └─────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Feature Mapping

### Feature: Multi-Project Management
**Purpose**: Monitor and manage multiple code repositories simultaneously

- **Classes**: ProjectManager, ProjectCreate, ProjectUpdate, ProjectConfigUpdate
- **Files**: .agent/agent.py (lines 87-95, 628-810)
- **Database**: projects table (id, name, path, description, created_at, active, ignore_patterns, feature_doc_path, technical_doc)
- **API Endpoints**:
  - POST /projects
  - GET /projects
  - GET /projects/{id}
  - PATCH /projects/{id}
  - DELETE /projects/{id}
  - GET /projects/{id}/config
  - PUT /projects/{id}/config
- **Dependencies**: sqlite3, pathlib, fastapi, pydantic
- **Frontend Components**: AddProjectModal, ProjectSettingsModal, Project list sidebar
- **State Management**: React Query (useQuery, useMutation)

### Feature: Real-Time File Monitoring
**Purpose**: Detect and track file changes in monitored projects using OS-level file watching

- **Classes**: FileHandler, Observer
- **Files**: .agent/agent.py (lines 261-397)
- **Key Methods**:
  - _should_ignore(path): Filter files based on patterns
  - _log_diff(path, content, event): Generate and log file diffs
  - on_modified(event): Handle file modifications
  - on_created(event): Handle file/folder creation
  - on_deleted(event): Handle file/folder deletion
- **Dependencies**: watchdog, difflib, hashlib
- **Event Types**: file_change, folder_created, folder_deleted
- **Ignore Patterns**: Global (IGNORE_PARTS) + Project-specific (fnmatch patterns)
- **Integration**: Git repository integration via GitPython for baseline diffs

### Feature: Server-Sent Events (SSE) Streaming
**Purpose**: Push real-time events to frontend without polling

- **Classes**: EventSourceResponse, sse_queues (list)
- **Files**: .agent/agent.py (lines 62-85, 789-810)
- **Key Functions**:
  - broadcast_event(event_data): Broadcast to all connected clients
  - log_event_with_broadcast(): Log event and trigger SSE broadcast
  - create_event_stream(): Frontend SSE connection handler
- **Dependencies**: sse-starlette, asyncio
- **Thread Safety**: Uses asyncio.run_coroutine_threadsafe for thread-safe broadcasting
- **Event Loop**: Captured on startup for cross-thread access
- **Frontend**: EventSource API in eventStream.ts

### Feature: Event Management & Pagination
**Purpose**: Store, query, and paginate code change events

- **Classes**: Event model (TypeScript interface)
- **Files**:
  - Backend: .agent/agent.py (lines 928-991)
  - Frontend: frontend/src/types/events.ts
- **Database**: events table (id, project_id, ts, kind, path, payload)
- **API Endpoints**:
  - GET /events (with limit, offset, kind, project_id filters)
  - GET /events/export
  - GET /events/export-pdf
- **Pagination**: Offset-based with total count, page calculation
- **Dependencies**: sqlite3, reportlab (PDF export), markdown2
- **Event Kinds**: file_change, folder_created, folder_deleted, prompt, copilot_chat, error, summary, ai_match

### Feature: AI-Powered Code Analysis
**Purpose**: Use GPT-4 to analyze code changes and provide insights

- **Classes**: AnalyzeChangeRequest, AnalyzeRequest
- **Files**: .agent/agent.py (lines 1050-1120, 1122-1228)
- **API Endpoints**:
  - POST /analyze-change (per-event analysis)
  - POST /implications (project-level impact analysis)
- **Key Functions**:
  - analyze_change(event_id): Single event analysis
  - analyze_implications(project_id, hours): Aggregate analysis
- **Dependencies**: openai (GPT-4), json
- **Models Used**:
  - OPENAI_MODEL (gpt-4o-mini) for general analysis
  - Configurable via environment variables
- **Analysis Output**: Markdown-formatted insights
- **Frontend**: AIAnalysisModal, ChangeAnalysisModal with ReactMarkdown rendering

### Feature: Living Technical Documentation
**Purpose**: Parse, maintain, and evolve technical architecture documents with AI

- **Classes**: None (functional implementation)
- **Files**: .agent/agent.py (lines 401-624)
- **Key Functions**:
  - parse_feature_document(doc_path): Parse markdown architecture docs
  - analyze_code_change_impact(event_id, technical_doc): AI impact analysis
  - FileHandler._log_diff (enhanced): Automatic impact analysis on changes
- **Database**:
  - projects.feature_doc_path: Path to source document
  - projects.technical_doc: JSON structure with architecture + changes_log
- **API Endpoints**:
  - GET /projects/{id}/technical-doc
  - POST /projects/{id}/technical-doc/refresh
  - GET /projects/{id}/technical-doc/export (PDF)
- **Dependencies**: openai, reportlab, threading
- **Document Structure**:
  - source_path: Original markdown file location
  - last_updated: Timestamp
  - architecture: {overview, features[], classes{}, dependencies{}}
  - changes_log: [impact analysis entries]
- **Background Processing**: Threading for non-blocking AI analysis
- **Change Tracking**: Up to 100 recent changes with impact levels

### Feature: Professional PDF Export
**Purpose**: Generate formatted PDF reports for events and technical documentation

- **Classes**: SimpleDocTemplate, Paragraph, Table (ReportLab)
- **Files**: .agent/agent.py (lines 993-1048, 1002-1250)
- **Key Functions**:
  - export_events_pdf(): Event log PDF with diffs
  - export_technical_doc_pdf(): Architecture document PDF
- **Dependencies**: reportlab, io.BytesIO
- **PDF Features**:
  - Custom styling (colors, fonts, spacing)
  - Tables for structured data
  - Syntax highlighting placeholders
  - Professional color scheme (blue #1e40af)
- **Sections**:
  - Events PDF: Title, metadata, event list, diffs, summaries
  - Tech Doc PDF: Cover, overview, features, classes, dependencies, change history
- **Output**: StreamingResponse with PDF download

### Feature: Project Ignore Patterns
**Purpose**: Filter out unwanted files from monitoring (logs, dependencies, builds)

- **Classes**: FileHandler._should_ignore
- **Files**: .agent/agent.py (lines 270-288)
- **Pattern Types**:
  - Global: IGNORE_PARTS constant (.git, node_modules, __pycache__, etc.)
  - Project-specific: Stored in projects.ignore_patterns (JSON array)
- **Matching**: fnmatch for wildcard support (*.log, build/*, etc.)
- **UI**:
  - AddProjectModal: Textarea for patterns (one per line)
  - ProjectSettingsModal: Edit patterns after creation
- **Apply**: File watcher restart when patterns updated
- **Examples**: *.log, node_modules/*, *.pyc, .env, build/*

### Feature: File Categorization
**Purpose**: Automatically classify files by type for better organization

- **Classes**: categorizeFile() function
- **Files**: frontend/src/App.tsx (lines 104-140)
- **Categories**:
  - Frontend: .tsx, .jsx, .css, /frontend/, /ui/ (Blue, Layout icon)
  - Backend: .py, .go, .java, /backend/, /api/ (Green, Server icon)
  - Tests: .test., .spec., /test/ (Purple, TestTube icon)
  - Config: .json, .yaml, .env, /config/ (Amber, FileCog icon)
  - Dependencies: package.json, requirements.txt, etc. (Orange, Package icon)
  - Docs: .md, .txt, /docs/ (Cyan, FileText icon)
  - Other: Everything else (Slate, FileCode icon)
- **Visual**: Badge with icon and color on each event
- **Purpose**: Quick visual scanning of event types

### Feature: Search & Filtering
**Purpose**: Find specific events across projects

- **Classes**: None (inline filtering)
- **Files**: frontend/src/App.tsx (lines 807-815)
- **Filter Criteria**:
  - Event path (file path)
  - Event kind (file_change, etc.)
  - Payload content (JSON search)
- **Implementation**: Client-side filtering on fetched events
- **UI**: Search input in events header
- **Performance**: Filters on pre-fetched data (no API calls)

---

## Module Mapping

### Backend Module: Core API Server
**File**: `.agent/agent.py`
**Lines**: 1-1500
**Responsibilities**:
- FastAPI application initialization
- Database schema and migrations
- All API endpoint definitions
- File monitoring implementation
- AI integration
- SSE broadcasting

**Key Sections**:
- **Lines 1-85**: Imports, configuration, app initialization, SSE setup
- **Lines 86-260**: Pydantic models, database initialization
- **Lines 261-397**: FileHandler class (file monitoring)
- **Lines 398-624**: Living document functions (parser, impact analysis)
- **Lines 625-925**: Project management endpoints
- **Lines 926-1048**: Event endpoints and PDF export
- **Lines 1049-1500**: AI analysis endpoints

### Backend Module: Dependencies
**File**: `.agent/requirements.txt`
**Purpose**: Python package dependencies

**Production Dependencies**:
- fastapi==0.115.5: Web framework
- uvicorn==0.30.0: ASGI server
- watchdog==4.0.2: File system monitoring
- gitpython==3.1.43: Git integration
- sqlite-utils==3.37: Database utilities
- openai>=1.0.0,<2.0.0: GPT-4 API client
- python-dotenv==1.0.0: Environment configuration
- sse-starlette==2.0.0: Server-Sent Events
- reportlab==4.0.9: PDF generation
- markdown2==2.5.1: Markdown parsing

### Frontend Module: Main Application
**File**: `frontend/src/App.tsx`
**Lines**: 1-1100
**Responsibilities**:
- React application root
- Component composition
- State management
- API integration
- Real-time event handling

**Key Components**:
- **Lines 43-130**: API functions and TypeScript interfaces
- **Lines 131-349**: EventListItem component (event rendering)
- **Lines 350-473**: AddProjectModal component
- **Lines 474-584**: ProjectSettingsModal component
- **Lines 585-708**: AIAnalysisModal component
- **Lines 709-828**: ChangeAnalysisModal component
- **Lines 829-1100**: App component (main layout)

### Frontend Module: Event Stream
**File**: `frontend/src/lib/eventStream.ts`
**Purpose**: SSE client implementation

**Functionality**:
- Creates EventSource connection
- Handles real-time event streaming
- Provides cleanup callback
- Parses JSON event data

### Frontend Module: Event Store
**File**: `frontend/src/store/eventStore.ts`
**Purpose**: Zustand state management

**State**:
- events: Event[]
- addEvent: (event) => void
- setEvents: (events) => void
- clearEvents: () => void

### Frontend Module: Type Definitions
**File**: `frontend/src/types/events.ts`
**Purpose**: TypeScript interfaces

**Types**:
- Event: Main event structure
- EventKind: Union type for event types
- Project: Project structure
- Match: AI matching result

### Frontend Module: Utilities
**Files**:
- `frontend/src/lib/utils.ts`: Helper functions (formatRelativeTime, cn)
- `frontend/tailwind.config.js`: Tailwind CSS configuration
- `frontend/vite.config.ts`: Vite build configuration

### Docker Module: Backend Container
**File**: `.agent/Dockerfile`
**Purpose**: Backend container image

**Stages**:
- Base: Python 3.12-slim
- Install Git for repository integration
- Install Python dependencies
- Copy application code
- Expose port 4381
- Run uvicorn server

### Docker Module: Frontend Container
**File**: `frontend/Dockerfile`
**Purpose**: Frontend container image

**Stages**:
- Build: Node.js 20-alpine, build Vite app
- Runtime: Nginx to serve static files
- Expose port 5173
- Copy built assets

### Docker Module: Orchestration
**File**: `docker-compose.yml`
**Purpose**: Multi-container coordination

**Services**:
- backend: FastAPI server (port 4381)
- frontend: Nginx static server (port 5173)

**Volumes**:
- `.:/workspace:ro`: Code Monitor project (read-only)
- `./.agent/data:/data`: SQLite database persistence
- `/Users/subhagatoadak/Documents/github:/projects:ro`: User projects (read-only)

**Environment**:
- OPENAI_API_KEY: From .env file
- REPO_PATH, DB_PATH, PORT: Configuration

---

## Class Registry

### Backend Classes

**ProjectCreate** (Pydantic Model)
- Purpose: Validate project creation requests
- Fields: name, path, description, ignore_patterns[], feature_doc_path
- Location: .agent/agent.py:87-95
- Usage: POST /projects endpoint

**ProjectUpdate** (Pydantic Model)
- Purpose: Validate project update requests
- Fields: name (optional), description (optional), active (optional), ignore_patterns (optional)
- Location: .agent/agent.py
- Usage: PATCH /projects/{id} endpoint

**ProjectConfigUpdate** (Pydantic Model)
- Purpose: Validate project configuration updates
- Fields: ignore_patterns (optional), feature_doc_path (optional)
- Location: .agent/agent.py:855-857
- Usage: PUT /projects/{id}/config endpoint

**FileHandler** (FileSystemEventHandler)
- Purpose: Monitor file system changes and log events
- Key Methods:
  - `__init__(project_id, project_path, repo, ignore_patterns)`: Initialize handler
  - `_should_ignore(path)`: Check if file should be ignored
  - `_read_text(path)`: Safely read file contents
  - `_baseline_from_git(path)`: Get file content from git HEAD
  - `_log_diff(path, content, event)`: Generate diff and log event
  - `on_modified(event)`: Handle file modifications
  - `on_created(event)`: Handle file/folder creation
  - `on_deleted(event)`: Handle file/folder deletion
- Location: .agent/agent.py:261-397
- Dependencies: watchdog, pathlib, git, difflib

**AnalyzeChangeRequest** (Pydantic Model)
- Purpose: Request structure for per-event AI analysis
- Fields: event_id
- Location: .agent/agent.py
- Usage: POST /analyze-change endpoint

**AnalyzeRequest** (Pydantic Model)
- Purpose: Request structure for project-level AI analysis
- Fields: project_id (optional), time_range_hours (default 24)
- Location: .agent/agent.py
- Usage: POST /implications endpoint

### Frontend Components

**App** (React Component)
- Purpose: Root application component with main layout
- State: selectedProject, showAddProject, showAnalysis, showChangeAnalysis, showSettings, searchQuery, currentPage
- Hooks: useQuery (projects, events), useMutation (deleteProject)
- Location: frontend/src/App.tsx:829-1100

**EventListItem** (React Component)
- Purpose: Render individual event with expand/collapse functionality
- Props: event (Event), onAnalyze (function)
- Features: File categorization, diff display, AI analysis button
- Location: frontend/src/App.tsx:131-349

**AddProjectModal** (React Component)
- Purpose: Form modal for creating new projects
- State: name, path, description, ignorePatterns, featureDocPath
- Validation: Requires name and path
- Location: frontend/src/App.tsx:350-473

**ProjectSettingsModal** (React Component)
- Purpose: Edit project configuration (ignore patterns, feature doc)
- Props: projectId, projectName, onClose
- Features: Load current config, update via API, restart watcher
- Location: frontend/src/App.tsx:474-584

**AIAnalysisModal** (React Component)
- Purpose: Display project-level AI analysis results
- Props: projectId, onClose
- Features: Loading state, markdown rendering, error handling
- Location: frontend/src/App.tsx:585-708

**ChangeAnalysisModal** (React Component)
- Purpose: Display per-event AI analysis
- Props: eventId, onClose
- Features: Fetch analysis on mount, markdown rendering
- Location: frontend/src/App.tsx:709-828

---

## Data Models

### Database Schema

**projects** table:
```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    active INTEGER DEFAULT 1,
    ignore_patterns TEXT DEFAULT '[]',
    feature_doc_path TEXT,
    technical_doc TEXT
);
```

**events** table:
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    path TEXT,
    payload TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### Technical Document JSON Structure

```json
{
  "source_path": "/projects/myapp/ARCHITECTURE.md",
  "last_updated": "2026-02-16T22:30:00Z",
  "architecture": {
    "overview": "System architecture description",
    "features": [
      {
        "name": "Feature Name",
        "classes": ["Class1", "Class2"],
        "files": ["file1.py", "file2.py"],
        "dependencies": ["dep1", "dep2"]
      }
    ],
    "classes": {
      "ClassName": "Description of class"
    },
    "dependencies": {
      "production": ["package1", "package2"],
      "development": ["test-package1"]
    }
  },
  "changes_log": [
    {
      "event_id": 123,
      "timestamp": "2026-02-16T22:30:00Z",
      "file_path": "path/to/file.py",
      "change_type": "file_change",
      "affected_features": ["Feature Name"],
      "modified_classes": ["Class1"],
      "new_classes": ["NewClass"],
      "architectural_change": true,
      "impact_level": "moderate",
      "summary": "Brief description",
      "concerns": ["Concern 1"],
      "recommendations": ["Recommendation 1"]
    }
  ]
}
```

### Event Payload Structures

**file_change**:
```json
{
  "event": "modified|created",
  "diff": "unified diff output",
  "sha": "sha256 hash",
  "size": 1024,
  "baseline": "cache|head"
}
```

**folder_created**:
```json
{
  "event": "created",
  "type": "directory"
}
```

**folder_deleted**:
```json
{
  "event": "deleted",
  "type": "directory"
}
```

**prompt**:
```json
{
  "text": "User prompt text",
  "source": "vscode|cli",
  "model": "gpt-4o-mini"
}
```

---

## API Endpoints Reference

### Project Management

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/projects` | POST | Create project | ProjectCreate | {id, name, path, ...} |
| `/projects` | GET | List projects | active_only (bool) | {projects: [...]} |
| `/projects/{id}` | GET | Get project details | - | {id, name, statistics, ...} |
| `/projects/{id}` | PATCH | Update project | ProjectUpdate | {status: "updated"} |
| `/projects/{id}` | DELETE | Delete project | - | {status: "deleted", events_deleted} |
| `/projects/{id}/config` | GET | Get configuration | - | {ignore_patterns, feature_doc_path} |
| `/projects/{id}/config` | PUT | Update configuration | ProjectConfigUpdate | {status: "updated"} |

### Technical Documentation

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/projects/{id}/technical-doc` | GET | Get tech document | - | {status, technical_doc} |
| `/projects/{id}/technical-doc/refresh` | POST | Re-parse document | - | {status, technical_doc} |
| `/projects/{id}/technical-doc/export` | GET | Download PDF | - | PDF file stream |

### Events

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/events` | GET | List events | limit, offset, kind, project_id | {items, total, page, ...} |
| `/events/stream` | GET | SSE stream | - | EventSource stream |
| `/events/export` | GET | Export JSON | project_id, format | JSON download |
| `/events/export-pdf` | GET | Export PDF | project_id | PDF download |

### AI Analysis

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/analyze-change` | POST | Analyze single event | {event_id} | {analysis: markdown} |
| `/implications` | POST | Analyze project | {project_id, time_range_hours} | {implications: markdown} |

### Utility

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/health` | GET | Health check | - | {status: "healthy"} |
| `/prompt` | POST | Log prompt | {text, source, model} | {id, status} |

---

## Dependencies

### Production Dependencies

**Backend**:
- **fastapi** (0.115.5): Modern web framework for building APIs
- **uvicorn** (0.30.0): ASGI server implementation
- **watchdog** (4.0.2): Cross-platform file system monitoring
- **gitpython** (3.1.43): Git repository interaction
- **sqlite-utils** (3.37): SQLite database utilities
- **openai** (>=1.0.0,<2.0.0): OpenAI API client for GPT-4
- **python-dotenv** (1.0.0): Environment variable management
- **sse-starlette** (2.0.0): Server-Sent Events for FastAPI
- **reportlab** (4.0.9): PDF generation library
- **markdown2** (2.5.1): Markdown parsing

**Frontend**:
- **react** (18.3.1): UI library
- **react-dom** (18.3.1): React DOM rendering
- **@tanstack/react-query** (5.24.0): Data fetching and caching
- **framer-motion** (11.0.0): Animation library
- **lucide-react** (0.344.0): Icon library
- **react-markdown** (10.1.0): Markdown rendering
- **remark-gfm** (4.0.1): GitHub Flavored Markdown
- **sonner** (1.4.0): Toast notifications
- **zustand** (4.5.0): State management
- **tailwindcss** (3.4.1): CSS framework

### Development Dependencies

**Backend**: None (all dependencies are production)

**Frontend**:
- **typescript** (5.3.0): Type checking
- **vite** (5.1.0): Build tool
- **@vitejs/plugin-react** (4.2.0): React plugin for Vite
- **eslint** (8.56.0): Linting
- **@typescript-eslint/parser** (7.0.0): TypeScript ESLint parser
- **autoprefixer** (10.4.17): CSS vendor prefixes
- **postcss** (8.4.35): CSS processing

---

## Configuration

### Environment Variables

**Backend (.env)**:
```bash
OPENAI_API_KEY=sk-...           # Required for AI features
OPENAI_MODEL=gpt-4o-mini        # Model for general analysis
OPENAI_MATCHING_MODEL=gpt-4o    # Model for matching (unused currently)
PORT=4381                       # Backend server port
DB_PATH=/data/events.db         # SQLite database path
REPO_PATH=/workspace            # Code Monitor repo path
MAX_BYTES=2000000               # Max file size to read (2MB)
IGNORE_PARTS=.git,.agent,...    # Global ignore patterns
SUMMARY_EVENT_LIMIT=50          # Events to include in summaries
SUMMARY_CHAR_LIMIT=6000         # Character limit for summaries
CORS_ENABLED=false              # Enable CORS for development
CORS_ORIGINS=http://localhost:5173  # Allowed origins
```

**Frontend (vite.config.ts)**:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
```

### Docker Configuration

**docker-compose.yml**:
- backend: Port 4381, volumes for workspace and data
- frontend: Port 5173, serves built React app
- Shared network for inter-container communication
- Environment variables from .env file
- Volume mounts for:
  - Code Monitor project (read-only)
  - User projects directory (read-only)
  - Database persistence

---

## Security Considerations

### Authentication
- **None**: Localhost-only, single-user design
- No password protection
- No user management
- Assumes trusted local environment

### Data Protection
- **Local Only**: All data stored locally in SQLite
- **No External Storage**: No cloud backups
- **Read-Only Mounts**: User projects mounted read-only
- **Sandboxed**: Docker containers provide isolation

### API Security
- **CORS**: Disabled by default, configurable for development
- **Rate Limiting**: None (localhost only)
- **Input Validation**: Pydantic models for request validation
- **SQL Injection**: Protected via parameterized queries
- **File Access**: Limited to mounted volumes only

### API Key Management
- **Environment Variables**: OpenAI key in .env file
- **Not Committed**: .env in .gitignore
- **Docker Secrets**: Not used (localhost only)

---

## Performance Characteristics

### Backend Performance
- **File Monitoring**: Real-time via OS-level watchers (watchdog)
- **Database**: SQLite with indexes on project_id and ts
- **SSE Broadcasting**: Asyncio-based, non-blocking
- **AI Analysis**: Background threads, doesn't block file watching
- **PDF Generation**: In-memory buffers, fast generation

### Frontend Performance
- **Initial Load**: < 2s (Vite optimization)
- **Event Rendering**: Virtualization not implemented (handles ~1000 events)
- **Real-Time Updates**: SSE < 500ms latency
- **API Calls**: React Query caching (5s refetch interval)
- **Search**: Client-side filtering (instant)

### Scalability Limits
- **Projects**: Tested up to 10 concurrent projects
- **Events**: Database handles 100k+ events efficiently
- **File Watching**: Limited by OS (typically 5000-8000 watches)
- **SSE Connections**: Single user, multiple tabs supported
- **AI Analysis**: Rate limited by OpenAI API (500 req/min)

---

## Testing Strategy

### Backend Testing
- **Unit Tests**: Not implemented (recommend pytest)
- **Integration Tests**: Manual via Swagger UI
- **API Testing**: Postman/curl for endpoint validation
- **Database**: Manual SQLite inspection

### Frontend Testing
- **Unit Tests**: Not implemented (recommend Vitest)
- **Component Tests**: Manual browser testing
- **E2E Tests**: Not implemented (recommend Playwright)

### Deployment Testing
- **Docker Build**: Test both containers build successfully
- **Volume Mounts**: Verify paths accessible
- **API Connectivity**: Test backend/frontend communication
- **SSE Stream**: Verify real-time updates work

---

## Deployment

### Local Development
```bash
# Backend only (with hot reload)
cd .agent
pip install -r requirements.txt
python agent.py

# Frontend only (with hot reload)
cd frontend
npm install
npm run dev
```

### Docker Compose (Recommended)
```bash
# Build and start
docker compose up --build

# Stop
docker compose down

# Rebuild after changes
docker compose build
docker compose up
```

### Production Deployment
```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Start with auto-restart
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Future Enhancements

### Planned Features
1. **Dark/Light Mode Toggle**: UI theme switching
2. **Custom AI Models**: Support for local LLMs
3. **Batch Operations**: Bulk event processing
4. **Export Templates**: Customizable PDF layouts
5. **Webhook Integration**: External service notifications
6. **Plugin System**: Extensible architecture
7. **Test Coverage**: Comprehensive testing
8. **Performance Monitoring**: Built-in metrics

### Architecture Improvements
1. **Caching Layer**: Redis for faster queries
2. **Database Migration**: Alembic for schema versioning
3. **Background Jobs**: Celery for async tasks
4. **Message Queue**: RabbitMQ for event processing
5. **Search Engine**: Elasticsearch for full-text search

---

## Troubleshooting

### Common Issues

**Issue**: Projects not showing up
- **Cause**: Volume mount path incorrect
- **Fix**: Update docker-compose.yml with correct host path
- **Verify**: `docker exec code-monitor-backend ls /projects`

**Issue**: Events not appearing
- **Cause**: Ignore patterns too broad
- **Fix**: Check project settings, remove overly broad patterns
- **Verify**: Check backend logs for "Event loop captured"

**Issue**: AI analysis not working
- **Cause**: Missing OPENAI_API_KEY
- **Fix**: Add API key to .env file
- **Verify**: `docker exec code-monitor-backend env | grep OPENAI`

**Issue**: SSE connection drops
- **Cause**: Browser tab inactive for too long
- **Fix**: Refresh page to reconnect
- **Verify**: Check browser Network tab for EventSource

**Issue**: PDF export fails
- **Cause**: Missing reportlab dependency
- **Fix**: Rebuild backend container
- **Verify**: `docker exec code-monitor-backend pip list | grep reportlab`

---

## Contributing

### Code Style
- **Backend**: PEP 8, type hints encouraged
- **Frontend**: ESLint rules, TypeScript strict mode
- **Commits**: Conventional commits format

### Pull Request Process
1. Fork repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit PR with description

### Development Guidelines
- Keep functions small and focused
- Add docstrings to public APIs
- Use type annotations
- Update ARCHITECTURE.md for major changes
- Test locally before committing

---

## License

MIT License - See LICENSE file for details

---

## Maintenance

### Regular Tasks
- **Weekly**: Review backend logs for errors
- **Monthly**: Clean up old events (optional)
- **Quarterly**: Update dependencies
- **Annually**: Review and update architecture document

### Backup Strategy
- **Database**: `.agent/data/events.db` - Copy to safe location
- **Configuration**: `.env` file - Store securely
- **Code**: Git repository - Regular commits

### Monitoring
- **Health Check**: `curl http://localhost:4381/health`
- **Database Size**: `du -h .agent/data/events.db`
- **Container Status**: `docker compose ps`
- **Logs**: `docker compose logs -f backend`

---

*Document Version: 1.0*
*Last Updated: 2026-02-16*
*Maintained by: Code Monitor System*
