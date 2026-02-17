# 🚀 AI Chat Integration - Quick Start Guide

## What's Working Now

✅ **Backend AI Chat System** - Fully functional!
✅ **Database Tables** - ai_conversations & ai_code_matches created
✅ **API Endpoints** - All 6 endpoints working
✅ **GPT-4 Matching** - Automatic conversation-to-code matching
✅ **Monitoring Scripts** - Ready to use

---

## 🎯 Quick Test

### 1. **Log an AI Conversation**

```bash
curl -X POST http://localhost:4381/ai-chat \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "ai_provider": "claude",
    "ai_model": "claude-3.5-sonnet",
    "user_prompt": "How do I implement OAuth2 authentication in Python?",
    "ai_response": "To implement OAuth2 in Python:\n\n1. Install authlib\n2. Create an OAuth2Provider class\n3. Update your auth service\n\n```python\nfrom authlib.integrations.flask_client import OAuth\n\noauth = OAuth(app)\noauth.register(\n    name='\''google'\'',\n    client_id='\''your-id'\'',\n    client_secret='\''your-secret'\''\n)\n```"
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "status": "logged",
  "session_id": "abc-123-def-456"
}
```

### 2. **List Conversations**

```bash
curl "http://localhost:4381/ai-chat?project_id=1"
```

### 3. **View Conversation Timeline**

```bash
curl "http://localhost:4381/ai-chat/1/timeline"
```

### 4. **Get Statistics**

```bash
curl "http://localhost:4381/ai-chat/stats"
```

---

## 🤖 Monitor Claude Desktop (Auto-Logging)

### **Setup:**

```bash
# Navigate to scripts directory
cd /Users/subhagatoadak/Documents/github/Code-Monitor

# Run the monitor (it auto-detects Claude Desktop logs)
python scripts/monitor_ai_logs.py --provider claude --follow
```

**What It Does:**
- Monitors Claude Desktop log files
- Extracts conversations automatically
- Sends them to Code Monitor API
- Runs in real-time (like `tail -f`)

**Output:**
```
📡 Monitoring claude logs: /Users/.../Claude/logs/app.log
✓ Connected to Code Monitor at http://localhost:4381
📝 Conversation detected:
   User: How do I add authentication?...
   AI: Here's how to add authentication...
   Files: ['auth/service.py']
✓ Logged conversation to Code Monitor (ID: 5)
```

---

## 🔧 Terminal AI Hooks

### **Setup:**

```bash
# Add to your ~/.zshrc or ~/.bashrc
echo 'export CODE_MONITOR_API="http://localhost:4381"' >> ~/.zshrc
echo 'source /Users/subhagatoadak/Documents/github/Code-Monitor/scripts/ai-hooks.sh' >> ~/.zshrc

# Reload shell
source ~/.zshrc
```

### **Usage:**

```bash
# Use Claude CLI - automatically logged!
claude "How do I implement JWT authentication?"

# Use Aider - automatically logged!
aider --yes "Add authentication to my API"

# Generic AI command
ai "Write a function to validate email addresses"
```

**What Happens:**
- Your command runs normally
- Response is captured
- Conversation sent to Code Monitor in background
- No interruption to your workflow!

---

## 📊 Example Workflow

### **Scenario: Adding Authentication**

**1. Ask Claude:**
```bash
curl -X POST http://localhost:4381/ai-chat \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "ai_provider": "claude",
    "user_prompt": "How do I add JWT authentication to my Flask API?",
    "ai_response": "Install PyJWT, create auth/token.py, update auth/service.py with authentication logic"
  }'
```

**Response:** `{"id": 10, "status": "logged"}`

**2. Implement the Code:**
Make changes to your files:
- Create `auth/token.py`
- Modify `auth/service.py`
- Update `requirements.txt`

**3. View Matches (after 5 minutes):**
```bash
curl "http://localhost:4381/ai-chat/10/timeline"
```

**Response:**
```json
{
  "conversation": {
    "user_prompt": "How do I add JWT authentication...",
    "ai_response": "Install PyJWT, create auth/token.py..."
  },
  "matched_changes": [
    {
      "path": "auth/token.py",
      "confidence": 0.95,
      "reasoning": "AI suggested creating this file",
      "match_type": "direct"
    },
    {
      "path": "auth/service.py",
      "confidence": 0.92,
      "reasoning": "AI suggested updating authentication logic",
      "match_type": "direct"
    }
  ]
}
```

---

## 🎨 What Gets Extracted Automatically

### **Code Snippets**
Any code blocks in AI response:
```python
def example():
    pass
```

Becomes:
```json
{
  "language": "python",
  "code": "def example():\n    pass",
  "lines": 2
}
```

### **File References**
Any file paths mentioned:
- "in auth/service.py"
- "update `config.json`"
- "create token.py"

Becomes:
```json
["auth/service.py", "config.json", "token.py"]
```

---

## 📈 View Statistics

```bash
curl "http://localhost:4381/ai-chat/stats?project_id=1"
```

**Response:**
```json
{
  "total_conversations": 156,
  "matched_conversations": 142,
  "unmatched_conversations": 14,
  "by_provider": [
    {"provider": "claude", "count": 89},
    {"provider": "copilot", "count": 45},
    {"provider": "cursor", "count": 22}
  ]
}
```

---

## 🔄 Manual Matching

If automatic matching didn't work, trigger it manually:

```bash
curl -X POST "http://localhost:4381/ai-chat/5/match"
```

---

## 🐛 Troubleshooting

### **Issue: Conversations not being logged**

**Check:**
```bash
# Verify backend is running
curl http://localhost:4381/health

# Check backend logs
docker compose logs backend --tail=20
```

### **Issue: Matching not working**

**Check:**
1. Is `OPENAI_API_KEY` set in `.env`?
2. Are there code changes within 5 minutes of conversation?
3. Check backend logs for matching errors

**Manual trigger:**
```bash
curl -X POST "http://localhost:4381/ai-chat/1/match"
```

### **Issue: Monitor script can't find logs**

**Specify path explicitly:**
```bash
python scripts/monitor_ai_logs.py \
  --provider claude \
  --log-dir "/Users/$(whoami)/Library/Application Support/Claude/logs" \
  --follow
```

---

## 📚 API Documentation

Full API docs available at: http://localhost:4381/docs

**Key Endpoints:**
- `POST /ai-chat` - Log conversation
- `GET /ai-chat` - List conversations
- `GET /ai-chat/{id}` - Get specific conversation
- `GET /ai-chat/{id}/timeline` - View matched timeline
- `POST /ai-chat/{id}/match` - Trigger matching
- `GET /ai-chat/stats` - Get statistics

---

## 🎯 Next Steps

1. **Test the API** - Use curl examples above
2. **Try monitoring** - Run monitor_ai_logs.py
3. **Use shell hooks** - Source ai-hooks.sh
4. **Make code changes** - See automatic matching!
5. **View timelines** - See conversation-to-code correlation

---

## 💡 Pro Tips

1. **Session IDs**: Group related conversations by using the same session_id
2. **Metadata**: Add custom metadata like `{"tokens": 500, "cost": 0.01}`
3. **Context Files**: Manually specify files if auto-extraction misses them
4. **Time Window**: Matching looks 5 minutes after conversation - make changes quickly!

---

**Happy AI-assisted coding!** 🚀

For more details, see:
- [AI-CHAT-INTEGRATION-COMPLETE.md](AI-CHAT-INTEGRATION-COMPLETE.md)
- [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md)
