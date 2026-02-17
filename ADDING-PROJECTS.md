# 📁 How to Add Projects to Code Monitor

## The Path Issue Explained

Code Monitor runs inside Docker containers, which means it has its **own isolated filesystem**. When you enter a path like `/Users/subhagatoadak/myproject`, Docker can't access it unless it's mounted into the container.

## 🎯 Solution: Mounted Directories

Your docker-compose.yml now mounts these directories:

| Host Path (Your Machine) | Container Path | Description |
|--------------------------|----------------|-------------|
| `/Users/subhagatoadak/Documents/github` | `/projects` | All your GitHub projects |
| `./` (Code-Monitor folder) | `/workspace` | This Code-Monitor project |

## 📝 How to Add a Project

### Step 1: Know Your Project Location

Find where your project is on your machine:
```bash
# Example: If your project is at
/Users/subhagatoadak/Documents/github/MyAwesomeApp
```

### Step 2: Convert to Container Path

Since `/Users/subhagatoadak/Documents/github` is mounted as `/projects` in the container:

- **Host path**: `/Users/subhagatoadak/Documents/github/MyAwesomeApp`
- **Container path**: `/projects/MyAwesomeApp` ✅

### Step 3: Add Project in UI

1. Open [http://localhost:5173](http://localhost:5173)
2. Click **"Add Project"** button
3. Fill in the form:
   - **Name**: `My Awesome App` (whatever you want to call it)
   - **Path**: `/projects/MyAwesomeApp` (the container path)
   - **Description**: Optional description
4. Click **"Add Project"**

## 📋 Examples

### Example 1: Monitor Another GitHub Project

**Host location**: `/Users/subhagatoadak/Documents/github/my-website`

**Container path to use**: `/projects/my-website`

### Example 2: Monitor the Code-Monitor Project Itself

**Host location**: `/Users/subhagatoadak/Documents/github/Code-Monitor`

**Container path to use**: `/projects/Code-Monitor` or `/workspace`

Both will work since this folder is mounted twice!

## 🔧 Monitoring Projects Outside GitHub Folder

If you want to monitor projects in a **different location** (e.g., `~/Desktop/project`), you need to:

1. Stop the containers:
   ```bash
   docker compose down
   ```

2. Edit `docker-compose.yml` and add a new volume mount:
   ```yaml
   services:
     backend:
       volumes:
         - .:/workspace:ro
         - ./.agent/data:/data
         - /Users/subhagatoadak/Documents/github:/projects:ro
         # Add your custom path here
         - /Users/subhagatoadak/Desktop:/desktop:ro  # NEW
   ```

3. Restart:
   ```bash
   docker compose up -d
   ```

4. Now you can use `/desktop/project` in the UI

## ✅ Quick Test

Try adding the Code-Monitor project itself:

1. **Name**: `Code Monitor`
2. **Path**: `/workspace`
3. **Description**: `The Code Monitor application itself`

You should see it appear in the sidebar and start monitoring immediately!

## 🚨 Common Errors

### Error: "Project path does not exist"

**Cause**: The path doesn't exist **inside the container**

**Fix**:
- Make sure you're using the container path (e.g., `/projects/myapp`) not the host path
- Check that the folder exists on your machine
- Verify the volume mount in docker-compose.yml

### Error: "Project with this path already exists"

**Cause**: You already added this project

**Fix**: Delete the existing project first, or choose a different path

## 💡 Pro Tips

1. **List your GitHub projects** to see what's available:
   ```bash
   ls -la ~/Documents/github/
   ```

2. **Check what's mounted** in the container:
   ```bash
   docker exec code-monitor-backend ls -la /projects
   ```

3. **Test a path** before adding:
   ```bash
   docker exec code-monitor-backend ls -la /projects/YourProjectName
   ```

4. **See all events** for a project via API:
   ```bash
   curl http://localhost:4381/events?project_id=1 | jq
   ```

## 🎉 You're Ready!

Now you know how to add projects correctly. The UI will show you a helpful hint box with this information when you click "Add Project".

Happy monitoring! 🚀
