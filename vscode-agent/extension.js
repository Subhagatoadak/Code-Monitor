const vscode = require('vscode');

let channel;

function activate(context) {
  channel = vscode.window.createOutputChannel('Code Agent');

  const logPrompt = vscode.commands.registerCommand('codeAgent.logPrompt', async () => {
    const config = getConfig();
    const editor = vscode.window.activeTextEditor;
    let prompt = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    if (!prompt) {
      prompt = await vscode.window.showInputBox({ prompt: 'Prompt to log', ignoreFocusOut: true });
    }
    if (!prompt) {
      return;
    }
    const model = config.defaultModel;
    try {
      await post('/prompt', { text: prompt, model, source: config.source }, config.endpoint);
      vscode.window.showInformationMessage('Prompt logged to code-agent.');
    } catch (err) {
      showError(err);
    }
  });

  const logCopilot = vscode.commands.registerCommand('codeAgent.logCopilotChat', async () => {
    const config = getConfig();
    const editor = vscode.window.activeTextEditor;
    let prompt = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    prompt = await vscode.window.showInputBox({
      prompt: 'Copilot/Codex prompt',
      value: prompt,
      ignoreFocusOut: true
    });
    if (!prompt) return;

    const response = await vscode.window.showInputBox({
      prompt: 'Assistant response',
      ignoreFocusOut: true
    });
    if (response === undefined) return;

    const conversationId = config.conversationId || '';
    try {
      await post('/copilot', {
        prompt,
        response,
        source: config.source,
        model: config.defaultCopilotModel,
        conversation_id: conversationId
      }, config.endpoint);
      vscode.window.showInformationMessage('Copilot/Codex chat logged to code-agent.');
    } catch (err) {
      showError(err);
    }
  });

  const logError = vscode.commands.registerCommand('codeAgent.logError', async () => {
    const editor = vscode.window.activeTextEditor;
    let message = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    message = await vscode.window.showInputBox({ prompt: 'Error message to log', value: message, ignoreFocusOut: true });
    if (!message) return;

    try {
      await post('/error', { message, context: {} }, getConfig().endpoint);
      vscode.window.showInformationMessage('Error logged to code-agent.');
    } catch (err) {
      showError(err);
    }
  });

  const runSummary = vscode.commands.registerCommand('codeAgent.runSummary', async () => {
    try {
      const res = await post('/summary/run', {}, getConfig().endpoint);
      const summary = res.summary || 'No summary returned';
      output(`\n[summary/run]\n${summary}\n`);
      vscode.window.showInformationMessage('Project summary generated.');
    } catch (err) {
      showError(err);
    }
  });

  const showLatestSummary = vscode.commands.registerCommand('codeAgent.showLatestSummary', async () => {
    try {
      const data = await get('/summary/latest', getConfig().endpoint);
      output(`\n[summary/latest @ ${data.ts}]\n${data.content}\n`);
      vscode.window.showInformationMessage('Latest summary shown in Output: Code Agent.');
    } catch (err) {
      showError(err);
    }
  });

  context.subscriptions.push(logPrompt, logCopilot, logError, runSummary, showLatestSummary, channel);
}

function deactivate() {
  if (channel) {
    channel.dispose();
  }
}

function getConfig() {
  const config = vscode.workspace.getConfiguration('codeAgent');
  return {
    endpoint: config.get('endpoint', 'http://localhost:4381'),
    source: config.get('source', 'vscode'),
    defaultModel: config.get('defaultModel', 'claude-code'),
    defaultCopilotModel: config.get('defaultCopilotModel', 'copilot'),
    conversationId: config.get('conversationId', '')
  };
}

async function post(path, body, baseUrl) {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return {};
}

async function get(path, baseUrl) {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return {};
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function output(text) {
  if (!channel) return;
  channel.appendLine(text);
  channel.show(true);
}

function showError(err) {
  const message = err?.message || String(err);
  output(`[error] ${message}`);
  vscode.window.showErrorMessage(message);
}

module.exports = {
  activate,
  deactivate
};
