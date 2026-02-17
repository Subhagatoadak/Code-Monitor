#!/usr/bin/env python3
"""
Code Monitor - AI Log Monitor
Monitors AI assistant logs and sends conversations to Code Monitor

Usage:
    python monitor_ai_logs.py --provider claude --log-dir ~/Library/Application\ Support/Claude/logs
    python monitor_ai_logs.py --provider cursor --log-file ~/cursor.log
"""

import argparse
import json
import re
import time
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AILogMonitor:
    """Monitor AI assistant log files and send to Code Monitor"""

    def __init__(self, provider: str, api_url: str = "http://localhost:4381"):
        self.provider = provider
        self.api_url = api_url
        self.last_position = 0
        self.session_id = datetime.now().strftime("%Y%m%d-%H%M%S")

    def parse_claude_desktop_log(self, line: str) -> Optional[Dict]:
        """Parse Claude Desktop log format"""
        # Example formats:
        # [2026-02-16 22:30:00] USER: How do I implement OAuth2?
        # [2026-02-16 22:30:05] ASSISTANT: Here's how...

        patterns = [
            r'\[([\d\-: ]+)\] USER: (.*)',
            r'\[([\d\-: ]+)\] ASSISTANT: (.*)',
            r'USER: (.*)',  # Simpler format
            r'ASSISTANT: (.*)',
        ]

        for pattern in patterns:
            match = re.match(pattern, line)
            if match:
                groups = match.groups()
                if len(groups) == 2:
                    timestamp_str, content = groups
                    try:
                        timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                    except:
                        timestamp = datetime.now()

                    role = 'user' if 'USER' in line else 'assistant'
                    return {
                        'timestamp': timestamp,
                        'role': role,
                        'content': content.strip()
                    }
                elif len(groups) == 1:
                    role = 'user' if 'USER' in line else 'assistant'
                    return {
                        'timestamp': datetime.now(),
                        'role': role,
                        'content': groups[0].strip()
                    }

        return None

    def extract_code_snippets(self, text: str) -> List[Dict]:
        """Extract code blocks from text"""
        pattern = r'```(\w+)?\n(.*?)\n```'
        snippets = []

        for match in re.finditer(pattern, text, re.DOTALL):
            language = match.group(1) or 'unknown'
            code = match.group(2)
            snippets.append({
                'language': language,
                'code': code,
                'lines': len(code.split('\n'))
            })

        return snippets

    def extract_file_references(self, text: str) -> List[str]:
        """Extract file paths mentioned in text"""
        patterns = [
            r'(?:in |file |update |modify |edit |create |delete )([\w/.-]+\.[\w]+)',
            r'`([^`]+\.\w+)`',
            r'"([^"]+\.\w+)"',
            r"'([^']+\.\w+)'",
        ]

        files = set()
        for pattern in patterns:
            files.update(re.findall(pattern, text))

        # Filter out common false positives
        filtered = [f for f in files if not f.startswith('http') and len(f) < 200]
        return filtered

    def send_to_code_monitor(self, conversation: Dict) -> bool:
        """Send conversation to Code Monitor API"""
        try:
            response = requests.post(
                f"{self.api_url}/ai-chat",
                json=conversation,
                timeout=5
            )

            if response.status_code == 200:
                logger.info(f"✓ Logged conversation to Code Monitor (ID: {response.json().get('id')})")
                return True
            else:
                logger.error(f"✗ Failed to log: {response.status_code} - {response.text}")
                return False

        except requests.exceptions.ConnectionError:
            logger.error(f"✗ Cannot connect to Code Monitor at {self.api_url}")
            return False
        except Exception as e:
            logger.error(f"✗ Error sending to Code Monitor: {e}")
            return False

    def monitor_file(self, log_file: Path, follow: bool = True):
        """Monitor a single log file"""
        logger.info(f"📡 Monitoring {self.provider} logs: {log_file}")

        if not log_file.exists():
            logger.error(f"Log file not found: {log_file}")
            return

        current_exchange = {'user': None, 'assistant': None}

        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            # Jump to last position if following
            if follow and self.last_position > 0:
                f.seek(self.last_position)

            while True:
                line = f.readline()

                if not line:
                    if follow:
                        time.sleep(0.5)
                        continue
                    else:
                        break

                # Parse the line
                parsed = self.parse_claude_desktop_log(line)

                if parsed:
                    if parsed['role'] == 'user':
                        # Save user message
                        current_exchange['user'] = parsed

                    elif parsed['role'] == 'assistant':
                        # Save assistant response
                        current_exchange['assistant'] = parsed

                        # If we have both, create conversation entry
                        if current_exchange['user']:
                            self.create_and_send_conversation(current_exchange)
                            current_exchange = {'user': None, 'assistant': None}

                # Save position
                self.last_position = f.tell()

    def create_and_send_conversation(self, exchange: Dict):
        """Create conversation entry and send to Code Monitor"""
        if not exchange['user'] or not exchange['assistant']:
            return

        user_content = exchange['user']['content']
        ai_content = exchange['assistant']['content']

        # Extract metadata
        code_snippets = self.extract_code_snippets(ai_content)
        context_files = self.extract_file_references(user_content + ' ' + ai_content)

        conversation = {
            'session_id': self.session_id,
            'ai_provider': self.provider,
            'ai_model': f"{self.provider}-model",  # Update if you can detect model
            'user_prompt': user_content,
            'ai_response': ai_content,
            'context_files': context_files,
            'code_snippets': code_snippets,
            'metadata': {
                'code_blocks': len(code_snippets),
                'mentioned_files': len(context_files),
                'response_length': len(ai_content),
            }
        }

        logger.info(f"📝 Conversation detected:")
        logger.info(f"   User: {user_content[:100]}...")
        logger.info(f"   AI: {ai_content[:100]}...")
        logger.info(f"   Files: {context_files}")

        self.send_to_code_monitor(conversation)

    def monitor_directory(self, log_dir: Path, follow: bool = True):
        """Monitor most recent log file in directory"""
        if not log_dir.exists():
            logger.error(f"Directory not found: {log_dir}")
            return

        # Find most recent log file
        log_files = sorted(log_dir.glob('*.log'), key=lambda p: p.stat().st_mtime, reverse=True)

        if not log_files:
            logger.error(f"No log files found in {log_dir}")
            return

        latest_log = log_files[0]
        logger.info(f"📂 Latest log file: {latest_log}")

        self.monitor_file(latest_log, follow=follow)


def main():
    parser = argparse.ArgumentParser(description='Monitor AI assistant logs for Code Monitor')

    parser.add_argument('--provider', required=True,
                        choices=['claude', 'cursor', 'aider', 'codex'],
                        help='AI provider to monitor')

    parser.add_argument('--log-file', type=Path,
                        help='Specific log file to monitor')

    parser.add_argument('--log-dir', type=Path,
                        help='Directory containing log files (monitors latest)')

    parser.add_argument('--api-url', default='http://localhost:4381',
                        help='Code Monitor API URL')

    parser.add_argument('--follow', action='store_true', default=True,
                        help='Follow log file for new entries (like tail -f)')

    parser.add_argument('--parse-existing', action='store_true',
                        help='Parse existing log entries (not just new ones)')

    args = parser.parse_args()

    # Auto-detect log locations if not specified
    if not args.log_file and not args.log_dir:
        if args.provider == 'claude':
            # Auto-detect Claude Desktop logs
            import platform
            system = platform.system()

            if system == 'Darwin':  # macOS
                args.log_dir = Path.home() / 'Library/Application Support/Claude/logs'
            elif system == 'Windows':
                args.log_dir = Path.home() / 'AppData/Roaming/Claude/logs'
            else:  # Linux
                args.log_dir = Path.home() / '.config/Claude/logs'

            logger.info(f"Auto-detected log directory: {args.log_dir}")

    if not args.log_file and not args.log_dir:
        parser.error("Must specify either --log-file or --log-dir")

    # Create monitor
    monitor = AILogMonitor(args.provider, args.api_url)

    # Test connection
    try:
        response = requests.get(f"{args.api_url}/health", timeout=2)
        logger.info(f"✓ Connected to Code Monitor at {args.api_url}")
    except:
        logger.warning(f"⚠ Cannot connect to Code Monitor at {args.api_url}")
        logger.warning("  Make sure Code Monitor is running!")

    # Start monitoring
    try:
        if args.log_file:
            monitor.monitor_file(args.log_file, follow=args.follow)
        elif args.log_dir:
            monitor.monitor_directory(args.log_dir, follow=args.follow)

    except KeyboardInterrupt:
        logger.info("\n👋 Monitoring stopped")


if __name__ == '__main__':
    main()
