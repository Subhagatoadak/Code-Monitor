#!/bin/bash

# Code Monitor - AI Assistant Hooks
# Add to ~/.zshrc or ~/.bashrc: source /path/to/Code-Monitor/scripts/ai-hooks.sh

CODE_MONITOR_API="${CODE_MONITOR_API:-http://localhost:4381}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log AI chat to Code Monitor
log_ai_chat() {
    local ai_provider="$1"
    local user_prompt="$2"
    local ai_response="$3"
    local project_id="${4:-null}"

    curl -s -X POST "$CODE_MONITOR_API/ai-chat" \
        -H "Content-Type: application/json" \
        -d "{
            \"ai_provider\": \"$ai_provider\",
            \"user_prompt\": $(echo "$user_prompt" | jq -Rs .),
            \"ai_response\": $(echo "$ai_response" | jq -Rs .),
            \"project_id\": $project_id,
            \"timestamp\": $(date +%s)
        }" >/dev/null 2>&1 &
}

# Hook for Claude CLI
claude() {
    local session_id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "session-$$")
    local prompt="$*"

    echo -e "${BLUE}[Code Monitor] Logging conversation...${NC}" >&2

    # Run actual Claude CLI and capture output
    local response=$(command claude "$@" 2>&1)
    local exit_code=$?

    # Log to Code Monitor
    log_ai_chat "claude-cli" "$prompt" "$response"

    # Display response
    echo "$response"

    return $exit_code
}

# Hook for Aider
aider() {
    echo -e "${GREEN}[Code Monitor] Monitoring Aider session...${NC}" >&2

    # Detect current git project
    local project_path=$(git rev-parse --show-toplevel 2>/dev/null || echo "unknown")

    # Run Aider with logging wrapper
    command aider "$@" 2>&1 | while IFS= read -r line; do
        echo "$line"

        # Detect user prompts (lines starting with ">")
        if [[ "$line" =~ ^\> ]]; then
            AIDER_LAST_PROMPT="${line#> }"
        fi

        # Detect Aider responses
        if [[ "$line" =~ ^Aider ]]; then
            if [[ -n "$AIDER_LAST_PROMPT" ]]; then
                log_ai_chat "aider" "$AIDER_LAST_PROMPT" "$line"
                AIDER_LAST_PROMPT=""
            fi
        fi
    done
}

# Hook for generic AI commands with logging
ai() {
    local ai_provider="${AI_PROVIDER:-generic-ai}"
    local prompt="$*"

    echo -e "${BLUE}[Code Monitor] AI Query: $prompt${NC}" >&2

    # Run the AI command (customize based on your setup)
    # Example: pipe to your preferred AI tool
    local response=$(echo "$prompt" | your-ai-command)

    # Log to Code Monitor
    log_ai_chat "$ai_provider" "$prompt" "$response"

    echo "$response"
}

# Monitor function for continuous log watching
monitor_ai_logs() {
    local log_path="$1"
    local ai_provider="$2"

    if [[ ! -f "$log_path" ]]; then
        echo "Log file not found: $log_path"
        return 1
    fi

    echo -e "${GREEN}[Code Monitor] Monitoring $ai_provider logs: $log_path${NC}"

    tail -f "$log_path" | while IFS= read -r line; do
        # Parse log format and extract conversations
        # This is AI-provider specific - customize as needed
        echo "$line"  # Pass through to terminal

        # TODO: Add parsing logic for your AI's log format
    done
}

# Auto-detect and monitor Claude Desktop logs (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    CLAUDE_LOG_DIR="$HOME/Library/Application Support/Claude/logs"
    if [[ -d "$CLAUDE_LOG_DIR" ]]; then
        # Function to start Claude Desktop monitor
        monitor_claude_desktop() {
            local latest_log=$(ls -t "$CLAUDE_LOG_DIR"/*.log 2>/dev/null | head -1)
            if [[ -n "$latest_log" ]]; then
                monitor_ai_logs "$latest_log" "claude-desktop"
            else
                echo "No Claude Desktop logs found"
            fi
        }
    fi
fi

echo -e "${GREEN}[Code Monitor] AI hooks loaded!${NC}"
echo -e "  Available commands: ${BLUE}claude, aider, ai${NC}"
echo -e "  API endpoint: ${BLUE}$CODE_MONITOR_API${NC}"
