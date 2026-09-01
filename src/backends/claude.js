import { spawn } from 'node:child_process';

export const CLAUDE_MODEL_LABEL = 'claude (headless, Max plan)';

// Verified empirically (not just from docs) against a scratch directory —
// each tier was tested asking Claude to both write a file and run a shell
// command, then the directory was inspected on disk:
//
//   plan   -> neither file nor command executed (tools not even loaded)
//   edits  -> file written, shell command refused (no Bash tool)
//   full   -> both executed
//
// 'plan' is deliberately double-guarded (--restricted + --disallowedTools)
// since it's the default for a brand-new project and for global (no-project)
// chat, where the promise made to the user is "this can't touch your files."
const PERMISSION_FLAGS = {
  plan: ['--restricted', '--permission-mode', 'plan', '--disallowedTools', 'Edit Write MultiEdit NotebookEdit'],
  edits: ['--restricted', '--permission-mode', 'acceptEdits'],
  full: ['--permission-mode', 'bypassPermissions']
};

const TIMEOUT_MS = 300_000;

function buildPrompt(prompt, { history = [], imagePaths = [] } = {}) {
  const parts = [];

  if (history.length) {
    const transcript = history
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
      .join('\n');
    parts.push(`Conversation so far:\n${transcript}\n`);
  }

  if (imagePaths.length) {
    parts.push(
      `Attached image file(s) — use the Read tool to view them before responding:\n${imagePaths
        .map((p) => `- ${p}`)
        .join('\n')}\n`
    );
  }

  parts.push(`User: ${prompt}`);
  return parts.join('\n');
}

// Runs Claude Code in non-interactive streaming mode using whatever auth is
// already configured for the `claude` CLI (Max plan OAuth login) — no
// separate API key needed. stream-json (rather than a single json blob) is
// what surfaces subagent lifecycle events (`task_started`/`task_updated`/
// `task_notification`) in real time as they happen, which `onEvent` forwards
// so the UI can show live subagent activity instead of just a final count.
export function runClaude(prompt, opts = {}) {
  const { cwd, permissionMode = 'plan', onEvent, apiKey } = opts;
  const fullPrompt = buildPrompt(prompt, opts);
  const flags = PERMISSION_FLAGS[permissionMode] ?? PERMISSION_FLAGS.plan;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    // Scoped to just this process — when an API-key credential is active,
    // ANTHROPIC_API_KEY here switches this one call to pay-per-token API
    // billing without touching the ambient `claude` CLI login at all (no
    // logout/login dance, unlike Codex — see credentials.js).
    const env = apiKey ? { ...process.env, ANTHROPIC_API_KEY: apiKey } : process.env;

    const child = spawn(
      'claude',
      ['-p', fullPrompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', ...flags],
      { cwd, env }
    );

    let buffer = '';
    let stderr = '';
    let finalResult = null;
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'result') finalResult = event;
        try {
          onEvent?.(event);
        } catch {
          // A UI-side tracking error must never take down the actual call.
        }
      }
    });

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => finish(() => reject(error)));

    child.on('close', (code) => {
      finish(() => {
        if (!finalResult) {
          // stderr often just contains a benign CLI notice (e.g. its stdin
          // probe) rather than the real reason nothing came back — label it
          // as such instead of surfacing that one line as if it were the
          // whole failure.
          const detail = stderr.trim() || `exited with code ${code}, no output`;
          reject(new Error(`Claude CLI produced no result (${detail})`));
          return;
        }
        if (finalResult.is_error) {
          reject(new Error(`Claude error: ${finalResult.result ?? 'unknown error'}`));
          return;
        }
        // `modelUsage` breaks down by the actual underlying model(s) used —
        // Claude Code can route a single call across more than one (e.g. a
        // cheap Haiku pass plus the main model), confirmed in earlier
        // testing. We only persist one `model` string per request, so pick
        // whichever did the most work rather than a generic fixed label —
        // "token spend per model" is meaningless if everything just says
        // "claude".
        const modelUsage = finalResult.modelUsage ?? {};
        const dominant = Object.entries(modelUsage).sort(
          (a, b) => (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens)
        )[0];

        resolve({
          text: finalResult.result,
          model: dominant?.[0] ?? CLAUDE_MODEL_LABEL,
          latencyMs: Date.now() - startedAt,
          costUsd: finalResult.total_cost_usd ?? null,
          tokensIn: finalResult.usage?.input_tokens ?? null,
          tokensOut: finalResult.usage?.output_tokens ?? null,
          tokensThinking: finalResult.usage?.output_tokens_details?.thinking_tokens ?? null
        });
      });
    });
  });
}
