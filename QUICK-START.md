# 🚀 Quick Start Guide

## ✅ Fixed: Project Visibility Issue

The issue you encountered was that **Docker containers can't access your local filesystem unless it's mounted as a volume**.

### What Changed:

1. **Added volume mount** in `docker-compose.yml`:
   ```yaml
   volumes:
     - /Users/subhagatoadak/Documents/github:/projects:ro
   ```

2. **Updated UI** with helpful hints showing available paths

3. **Created sample project** - Code Monitor itself is now being monitored!

## 🎯 How to Use

### 1. Open the Application

Go to [http://localhost:5173](http://localhost:5173)

You should now see **"Code Monitor"** project in the left sidebar!

### 2. Add More Projects

Click **"Add Project"** and use these paths:

| Your Project Location | Path to Enter in UI |
|----------------------|---------------------|
| `~/Documents/github/myproject` | `/projects/myproject` |
| `~/Documents/github/another-app` | `/projects/another-app` |
| Code Monitor itself | `/workspace` (already added) |

### 3. Start Coding

1. Select a project from the sidebar
2. Make changes to files in that project
3. Watch events appear in real-time!
4. Click on events to expand and see diffs
5. Use the **"AI Analysis"** button to get insights

## 📝 Example: Add Your Own Project

Let's say you want to monitor a project at:
```
/Users/subhagatoadak/Documents/github/my-website
```

**In the UI, enter:**
- **Name**: `My Website`
- **Path**: `/projects/my-website` ✅
- **Description**: `My personal website`

**Why `/projects/my-website`?**
Because `/Users/subhagatoadak/Documents/github` is mounted as `/projects` in the container.

## 🔍 Verify Everything is Working

### Check Available Projects in Container:
```bash
docker exec code-monitor-backend ls -la /projects
```

### Check Database:
```bash
curl http://localhost:4381/projects | jq
```

### Check Events:
```bash
curl http://localhost:4381/events?project_id=1 | jq
```

### Make a Test Change:
1. Edit any file in Code-Monitor folder
2. Watch it appear in the UI instantly!

## 🎨 UI Features

- **Sidebar**: List of all projects with event counts
- **Main Area**: Timeline of changes (click to expand)
- **Search**: Filter events by filename, path, or content
- **AI Analysis**: Click to get AI-powered insights on recent changes
- **Real-time**: Events appear instantly via Server-Sent Events (SSE)

## 📚 More Help

- **[ADDING-PROJECTS.md](ADDING-PROJECTS.md)** - Detailed guide on adding projects
- **[MULTI-PROJECT-GUIDE.md](MULTI-PROJECT-GUIDE.md)** - Complete feature documentation
- **API Docs**: [http://localhost:4381/docs](http://localhost:4381/docs)

## 🐛 Troubleshooting

### Can't see project after adding?

1. Check browser console for errors
2. Refresh the page
3. Verify path exists in container:
   ```bash
   docker exec code-monitor-backend ls -la /projects/your-project-name
   ```

### Events not appearing?

1. Make sure project is selected in sidebar (blue highlight)
2. Make a change to a file
3. Check backend logs:
   ```bash
   docker logs code-monitor-backend --tail 50
   ```

### Want to monitor projects elsewhere?

Edit `docker-compose.yml` and add more volume mounts:
```yaml
volumes:
  - .:/workspace:ro
  - ./.agent/data:/data
  - /Users/subhagatoadak/Documents/github:/projects:ro
  - /Users/subhagatoadak/Desktop/projects:/desktop:ro  # NEW
```

Then restart: `docker compose down && docker compose up -d`

## 🎉 You're All Set!

Your Code Monitor is now fully functional with multi-project support. Try it out:

1. Select the "Code Monitor" project in the sidebar
2. Edit this file (QUICK-START.md)
3. Watch it appear in the timeline!
4. Click to expand and see the diff
5. Click "AI Analysis" to get insights

Happy monitoring! 🚀
