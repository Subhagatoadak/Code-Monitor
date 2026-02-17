# 🎯 Multi-Project Code Monitor Guide

## 🌟 What's New

The Code Monitor has been completely redesigned to support multiple projects with an enhanced user experience!

### ✨ Key Features

1. **Multi-Project Management** 📁
   - Add unlimited projects by providing folder paths
   - Switch between projects instantly
   - Each project gets its own monitoring instance
   - Persistent project storage

2. **List-Based Change View** 📋
   - Clean, scannable list of all changes
   - Expandable details on click
   - Color-coded by change type
   - Relative timestamps (e.g., "5m ago")

3. **Expandable Details** 🔍
   - Click any change to see full details
   - View complete diffs for file changes
   - See full prompts and chat conversations
   - Timestamps with date/time

4. **AI Project Analysis** 🤖
   - Click "AI Analysis" to understand recent changes
   - GPT-4 powered insights about your code
   - Identifies features, impacts, and recommendations
   - Adjustable time range (1 hour to 1 week)

## 🚀 Getting Started

### 1. Start the Application

```bash
# Using the startup script
./start.sh

# Or manually with Docker Compose
docker compose up --build
```

### 2. Add Your First Project

1. Click the **"Add Project"** button in the top-right
2. Fill in the form:
   - **Project Name**: A friendly name (e.g., "My Web App")
   - **Folder Path**: Absolute path to your project folder
     - Example: `/Users/username/projects/myapp`
     - Example (Windows): `C:\Users\username\projects\myapp`
   - **Description**: Optional description
3. Click **"Add Project"**

The system will immediately start monitoring that folder for changes!

### 3. View Project Changes

1. Select a project from the sidebar
2. See all file changes, modifications, and deletions
3. Click on any change to expand and see details
4. Use the search box to filter changes

### 4. Get AI Insights

1. Select a project
2. Click the **"AI Analysis"** button
3. Wait for GPT-4 to analyze recent changes
4. Read insights about:
   - What features were added/modified
   - Potential impacts on the project
   - Code quality observations
   - Recommended next steps

## 📊 Understanding the Interface

### Sidebar (Projects List)

Shows all your projects with:
- **Project Name** - The name you gave it
- **Path** - Where the project is located
- **Event Count** - Number of tracked changes
- **Monitoring Status** - Green dot = actively monitoring
- **Delete Button** - Hover over a project to see delete option

### Main Area (Changes List)

Each change shows:
- **Icon & Label** - Type of change (Modified, Deleted, Prompt, Chat, Error)
- **File Path** - What file was changed
- **Time** - When it happened (relative time)
- **Preview** - Brief summary of the change

Click to expand and see:
- **Full Timestamp** - Exact date and time
- **Complete Diff** - All code changes
- **File Size** - Size in bytes
- **Baseline** - Whether compared to cache or git HEAD

### Change Types

| Icon | Type | Color | Description |
|------|------|-------|-------------|
| 📄 | Modified | Blue | File was changed |
| 🗑️ | Deleted | Red | File was removed |
| ✨ | Prompt | Purple | AI prompt logged |
| 💬 | Chat | Pink | Chat conversation |
| ⚠️ | Error | Red | Error occurred |
| 🧠 | AI Match | Fuchsia | AI correlation found |

## 🎨 UI Features

### List View Benefits

- **Scannable** - Quickly see what changed
- **Compact** - More changes visible at once
- **Organized** - Chronological order
- **Expandable** - Details on demand

### Search & Filter

Use the search box to find:
- File names
- File paths
- Code content
- Prompt text
- Any text in changes

### Expandable Details

Click any change to:
- See full diff with syntax highlighting
- View complete timestamps
- Read full prompts/chats
- Examine error details

## 🤖 AI Analysis Features

### What It Analyzes

The AI looks at:
- File changes and diffs
- Added/modified code
- Deleted files
- Prompts and chats
- Time patterns

### Insights Provided

1. **Feature Analysis**
   - What was added
   - What was modified
   - New functionality

2. **Impact Assessment**
   - Breaking changes
   - New dependencies
   - Affected components

3. **Code Quality**
   - Patterns observed
   - Potential issues
   - Best practices

4. **Recommendations**
   - Next steps
   - Things to watch
   - Testing suggestions

### Time Range Options

- **Last hour** - Very recent changes
- **Last 6 hours** - Half-day activity
- **Last 24 hours** - Full day (default)
- **Last week** - Weekly summary

## 🔧 Technical Details

### Backend API

New endpoints:

```bash
# Projects
POST   /projects          # Create new project
GET    /projects          # List all projects
GET    /projects/:id      # Get project details
PATCH  /projects/:id      # Update project
DELETE /projects/:id      # Delete project

# Events (enhanced)
GET    /events?project_id=1   # Get events for project

# AI Analysis
POST   /implications      # Analyze project changes
```

### Database Schema

**Projects Table:**
- `id` - Unique identifier
- `name` - Project name
- `path` - Folder path
- `description` - Optional description
- `created_at` - When added
- `active` - Is monitoring enabled

**Events Table (Enhanced):**
- `id` - Event identifier
- `project_id` - Which project (FK)
- `ts` - Timestamp
- `kind` - Event type
- `path` - File path
- `payload` - Event data (JSON)

### Monitoring Behavior

- **Automatic Start** - Active projects start monitoring on app start
- **Real-time** - Changes detected immediately
- **Isolated** - Each project monitored independently
- **Persistent** - Monitoring state survives restarts

## 📝 Best Practices

### Project Organization

1. **Use Descriptive Names**
   - Good: "E-commerce Frontend"
   - Bad: "Project 1"

2. **Add Descriptions**
   - Helps remember project purpose
   - Useful when managing many projects

3. **Clean Up Old Projects**
   - Delete inactive projects
   - Keeps list manageable

### Using AI Analysis

1. **Run After Major Changes**
   - After feature implementation
   - After bug fixes
   - Before commits

2. **Adjust Time Range**
   - Use short ranges for focused analysis
   - Use long ranges for overview

3. **Act on Recommendations**
   - Follow suggested next steps
   - Address identified issues
   - Implement improvements

### Searching Effectively

- **File Names**: Just type the filename
- **Paths**: Use partial paths (e.g., "src/components")
- **Code**: Search for function names, variables
- **Prompts**: Find what you asked the AI

## 🐛 Troubleshooting

### Project Won't Add

**Problem**: "Project with this path already exists"
- **Solution**: This path is already monitored. Use a different path or delete the existing project.

**Problem**: "Project path does not exist"
- **Solution**: Make sure the path is:
  - Absolute (starts with / or C:\)
  - Correct (no typos)
  - Accessible (permissions)

### No Changes Showing

**Problem**: Selected project but no changes visible
- **Solution**:
  1. Make sure project is monitoring (green dot)
  2. Make a change in the project folder
  3. Wait a few seconds
  4. Refresh if needed

### AI Analysis Not Working

**Problem**: "OPENAI_API_KEY required"
- **Solution**: Add your OpenAI API key to `.env`:
  ```
  OPENAI_API_KEY=sk-your-key-here
  ```

**Problem**: Analysis seems inaccurate
- **Solution**:
  - Adjust time range
  - Ensure you have recent changes
  - Try re-analyzing

## 🎓 Example Workflow

### Daily Development

1. **Morning**
   - Start Code Monitor
   - Select your current project
   - Review yesterday's changes

2. **During Development**
   - Code as normal
   - Changes appear automatically
   - Expand to see diffs
   - Search for specific changes

3. **Before Committing**
   - Click "AI Analysis"
   - Review insights
   - Check for issues
   - Read recommendations

4. **End of Day**
   - Run AI Analysis on 24h range
   - Review all changes
   - Plan tomorrow's work

### Multiple Projects

1. **Add all active projects**
2. **Switch between them** as you work
3. **Each gets tracked separately**
4. **Compare activity** across projects

## 🚀 Advanced Tips

### Keyboard Navigation

- Click project = Select and view
- Click change = Expand/collapse
- Search focuses on typing

### Performance Tips

- Delete old projects you're not using
- Clear browser cache if slow
- Limit time ranges for AI analysis

### Integration Ideas

- Run before git commits
- Use AI analysis for PR descriptions
- Track feature development progress
- Monitor refactoring impact

## 📊 Understanding Project Statistics

In the sidebar, each project shows:

**Event Count**: Total changes tracked
- Higher = more active development
- Use to identify busy projects

**Monitoring Status**: Is it watching?
- Green dot = Yes, actively monitoring
- No dot = Monitoring stopped

## 🎉 You're Ready!

You now have a powerful multi-project development tracker with AI-powered insights. Start adding projects and watch your development activity come to life!

### Quick Links

- **Add Project**: Click button in top-right
- **Switch Project**: Click in sidebar
- **View Details**: Click any change
- **AI Analysis**: Click "AI Analysis" button
- **Search**: Type in search box

Happy coding! 🚀
