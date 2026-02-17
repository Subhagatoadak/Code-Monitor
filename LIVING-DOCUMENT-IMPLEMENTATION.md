# 🎯 Living Technical Document System - Implementation Plan

## Overview

Transform Code Monitor into a comprehensive project intelligence system that maintains an evolving technical document, automatically updated with each code change.

---

## Features to Implement

### 1. **Project Configuration Management** ⚙️

**Current Issue:** Can't view or edit configuration of existing projects

**Solution:**
- Add `/projects/:id/config` GET endpoint - Get current configuration
- Add `/projects/:id/config` PUT endpoint - Update configuration
- Frontend: Add "Settings" icon on each project
- Settings modal shows:
  - Ignore patterns (editable)
  - Feature document path (editable)
  - Technical document status

### 2. **Enhanced Ignore Patterns** 🚫

**Current Issue:** Patterns are stored but events still show ignored files

**Solution:**
- Already in FileHandler but need to verify it's working
- Add visual indicator in UI for ignored files (grayed out?)
- Or completely filter them out from the list

### 3. **Pagination for Events** 📄

**Current Issue:** Only shows first 100 events

**Solution:**
- Update `/events` endpoint to support `page` and `per_page` parameters
- Return pagination metadata: `{ items, total, page, per_page, total_pages }`
- Frontend: Add pagination controls at bottom of event list
- Show "Page X of Y" with Previous/Next buttons

### 4. **Feature Mapping Document** 📋

**When Adding Project:**
1. Ask for feature document path (optional but recommended)
2. If not provided, ask user to provide it
3. Document should be in project folder (e.g., `/projects/myapp/ARCHITECTURE.md`)

**Document Structure (Expected):**
```markdown
# Technical Architecture

## Overview
High-level system architecture...

## Feature Mapping
### Feature: User Authentication
- **Classes**: AuthService, UserController, TokenManager
- **Files**: auth/service.py, controllers/user.py, utils/token.py
- **Dependencies**: bcrypt, jwt, redis

### Feature: Data Processing
- **Classes**: DataProcessor, ValidationService
- **Files**: processing/processor.py, validators/service.py
- **Dependencies**: pandas, numpy

## Class Registry
- AuthService: Handles authentication logic
- UserController: HTTP endpoint handlers
- TokenManager: JWT token operations
...

## Dependencies
- Production: flask, sqlalchemy, redis
- Development: pytest, black, mypy
```

### 5. **Parse Feature Document** 📖

**On Project Creation:**
1. Read the feature document from `feature_doc_path`
2. Parse markdown to extract:
   - Architecture overview
   - Feature-to-class mappings
   - Class list
   - Dependencies
3. Store in `projects.technical_doc` as JSON:
```json
{
  "source_path": "/projects/myapp/ARCHITECTURE.md",
  "last_updated": "2026-02-16T10:00:00Z",
  "architecture": {
    "overview": "...",
    "features": [
      {
        "name": "User Authentication",
        "classes": ["AuthService", "UserController"],
        "files": ["auth/service.py", "controllers/user.py"],
        "dependencies": ["bcrypt", "jwt"]
      }
    ],
    "classes": {
      "AuthService": "Handles authentication logic",
      "UserController": "HTTP endpoint handlers"
    },
    "dependencies": {
      "production": ["flask", "sqlalchemy"],
      "development": ["pytest", "black"]
    }
  },
  "changes_log": []
}
```

### 6. **Living Document Updates** 🔄

**On Every Code Change:**
1. Detect which files changed
2. Map files to features (from feature mapping)
3. Call GPT-4 to analyze impact:
   ```
   File changed: auth/service.py
   Feature affected: User Authentication
   Classes involved: AuthService

   Analyze this change and update the technical understanding:
   - Does this change the architecture?
   - Are new classes/methods added?
   - Are dependencies changed?
   - What's the impact on the feature?
   ```
4. Update `technical_doc.changes_log`:
```json
{
  "changes_log": [
    {
      "timestamp": "2026-02-16T10:30:00Z",
      "file": "auth/service.py",
      "feature": "User Authentication",
      "summary": "Added OAuth2 support to AuthService",
      "impact": "Extended authentication to support social login",
      "architectural_change": true,
      "new_classes": ["OAuth2Provider"],
      "new_dependencies": ["authlib"]
    }
  ]
}
```

### 7. **Technical Document Export** 📥

**Endpoint:** `GET /projects/:id/technical-doc/export`

**Generates PDF with:**
1. **Cover Page**
   - Project name
   - Generated date
   - Version/snapshot info

2. **Current Architecture**
   - Overview
   - Feature mapping
   - Class registry
   - Dependencies

3. **Change History**
   - Chronological list of changes
   - Impact analysis for each
   - Architectural evolution

4. **Current State**
   - Summary of project status
   - Known issues/concerns
   - Recommendations

**Format:** Professional PDF with table of contents, syntax highlighting

### 8. **Changes Export as JSON** 💾

**Endpoint:** `GET /projects/:id/changes/export`

**Returns:**
```json
{
  "project": {
    "id": 1,
    "name": "My App",
    "path": "/projects/myapp"
  },
  "exported_at": "2026-02-16T10:00:00Z",
  "total_changes": 150,
  "changes": [
    {
      "id": 100,
      "timestamp": "2026-02-16T09:00:00Z",
      "type": "file_change",
      "file": "auth/service.py",
      "diff": "...",
      "feature_affected": "User Authentication",
      "classes_modified": ["AuthService"],
      "impact_summary": "..."
    }
  ]
}
```

---

## Implementation Steps

### Phase 1: Database & Backend (30 min)
- [x] Add feature_doc_path, technical_doc columns
- [ ] Add pagination to `/events` endpoint
- [ ] Add `/projects/:id/config` GET/PUT endpoints
- [ ] Add feature document parser function
- [ ] Add living document update function
- [ ] Add `/projects/:id/technical-doc` GET endpoint
- [ ] Add `/projects/:id/technical-doc/export` PDF endpoint
- [ ] Add `/projects/:id/changes/export` JSON endpoint

### Phase 2: Frontend Updates (20 min)
- [ ] Add Settings button to each project
- [ ] Create Project Settings modal
- [ ] Add feature_doc_path field to Add Project form
- [ ] Add pagination controls to event list
- [ ] Add "View Technical Doc" button
- [ ] Add "Export Tech Doc" button
- [ ] Add "Export Changes JSON" button

### Phase 3: Integration & Testing (10 min)
- [ ] Test feature document parsing
- [ ] Test living document updates
- [ ] Test PDF generation
- [ ] Test pagination
- [ ] Test configuration updates

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | GET | Now supports `page`, `per_page` params |
| `/projects/:id/config` | GET | Get project configuration |
| `/projects/:id/config` | PUT | Update project configuration |
| `/projects/:id/technical-doc` | GET | Get current technical document |
| `/projects/:id/technical-doc/export` | GET | Export as PDF |
| `/projects/:id/technical-doc/refresh` | POST | Re-parse feature document |
| `/projects/:id/changes/export` | GET | Export changes as JSON |

---

## Frontend UI Changes

### Project List Item
```
┌─────────────────────────────────────────────┐
│ My Project              [⚙️] [🗑️]            │
│ /projects/myapp                             │
│ 150 events  •  Tech Doc: ✅  •  [View Doc]  │
└─────────────────────────────────────────────┘
```

### Add Project Modal
```
Project Name: _________________
Path: /projects/_______________
Description: __________________

Feature Document (Optional):
[📄] /projects/myapp/ARCHITECTURE.md  [Browse]

⚠️ Feature document enables living technical documentation
   and impact analysis. Recommended for production projects.

Ignore Patterns: ______________
                  ______________

[Cancel]  [Add Project]
```

### Event List Footer
```
─────────────────────────────────────────────
Showing 1-50 of 150 events

[◀ Previous]  Page 1 of 3  [Next ▶]
```

### Project Settings Modal
```
Project Settings: My Project

General:
  Name: My Project
  Path: /projects/myapp

Configuration:
  Ignore Patterns:  [Edit]
    *.log
    node_modules/*

  Feature Document: [Edit]
    📄 /projects/myapp/ARCHITECTURE.md
    ✅ Loaded successfully
    Last updated: 2 hours ago

    [Re-parse Document]  [View Current Doc]

[Save Changes]  [Close]
```

---

## Benefits

1. **Living Documentation** - Always up-to-date technical docs
2. **Impact Analysis** - Understand how changes affect architecture
3. **Knowledge Retention** - Capture architectural decisions over time
4. **Onboarding** - New team members get current, accurate docs
5. **Compliance** - Maintain detailed change history
6. **Intelligence** - AI understands your project structure

---

## Next Steps

Once implemented, you'll be able to:

1. ✅ Add project with feature document
2. ✅ Code normally - AI tracks everything
3. ✅ View living technical document anytime
4. ✅ Export professional PDF report
5. ✅ Download complete change history as JSON
6. ✅ See impact analysis on every change
7. ✅ Configure ignore patterns per project

**This transforms Code Monitor from a simple tracker to a comprehensive project intelligence system!**
