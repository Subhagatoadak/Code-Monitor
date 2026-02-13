# Code Agent Logger (VS Code extension)

Sends prompts, Copilot/Codex chats, errors, and triggers summaries to your running code-agent sidecar.

## Install locally
1) `cd vscode-agent`
2) `npm install` (dev-only for type defs; no runtime deps)
3) Launch the extension host: press F5 in VS Code, or package with `npx vsce package` and install the VSIX.

## Commands (Command Palette)
- `Agent: Log Prompt (selection or input)` → POST /prompt using selection or prompted text.
- `Agent: Log Copilot/Codex Chat` → prompt + reply → POST /copilot.
- `Agent: Log Error` → selection or input → POST /error.
- `Agent: Run Project Summary` → POST /summary/run and show result in Output > Code Agent.
- `Agent: Show Latest Summary` → GET /summary/latest and display in Output.

## Settings
- `codeAgent.endpoint` (default `http://localhost:4381`)
- `codeAgent.source` (default `vscode`)
- `codeAgent.defaultModel` (default `claude-code`)
- `codeAgent.defaultCopilotModel` (default `copilot`)
- `codeAgent.conversationId` (optional tag added to Copilot/Codex logs)

## Notes
- Uses built-in `fetch`; no external runtime dependencies.
- Ensure the Docker sidecar is running and reachable at the configured endpoint.
