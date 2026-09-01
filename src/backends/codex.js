import { spawn } from 'node:child_process';

export const CODEX_MODEL_LABEL = 'codex (headless, ChatGPT auth)';

// Verified empirically against a scratch directory, same method as Claude's
// permission tiers — asked it to write a file AND run a shell command, then
// inspected the directory on disk:
//
//   read-only        -> neither happened (`operation not permitted`)
//   workspace-write   -> BOTH happened — file written AND shell command ran
//   danger-full-access -> everything, no workspace boundary
//
// Unlike Claude Code, Codex's sandbox has no way to allow file writes while
// blocking shell commands — it sandboxes command execution as a whole, not
// individual tools. So our 'edits' tier is honestly the same as 'full' for
// Codex except for the workspace directory boundary (and, per Codex's own
// design, network access) — there is no finer-grained option to offer.
const SANDBOX_FLAGS = {
  plan: ['--sandbox', 'read-only'],
  edits: ['--sandbox', 'workspace-write'],
  full: ['--sandbox', 'danger-full-access']
};

const TIMEOUT_MS = 300_000;

function buildPrompt(prompt, { history = [] } = {}) {
  if (!history.length) return prompt;
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
    .join('\n');
  return `Conversation so far:\n${transcript}\n\nUser: ${prompt}`;
}

// Runs Codex CLI in non-interactive `exec` mode using whatever auth is
// already configured (ChatGPT subscription login) — no separate API key.
// `onEvent` receives each parsed JSONL event so the router can feed
// `command_execution` items into the same live security scanner used for
// Claude's Bash/Edit/Write tool calls.
export function runCodex(prompt, opts = {}) {
  const { cwd, permissionMode = 'plan', imagePaths = [], onEvent } = opts;
  const fullPrompt = buildPrompt(prompt, opts);
  const sandboxFlags = SANDBOX_FLAGS[permissionMode] ?? SANDBOX_FLAGS.plan;
  const startedAt = Date.now();

  const args = ['exec', fullPrompt, '--json', '--skip-git-repo-check', ...sandboxFlags];
  if (cwd) args.push('-C', cwd);
  for (const imagePath of imagePaths) args.push('-i', imagePath);

  return new Promise((resolve, reject) => {
    // stdin explicitly closed — without this, `codex exec` prints "Reading
    // additional input from stdin..." and can hang waiting on a stream that
    // will never send anything (confirmed empirically; a bare inherited
    // stdin under a spawned, non-interactive parent is exactly this trap).
    const child = spawn('codex', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    let stderr = '';
    let lastMessage = '';
    let usage = null;
    let settled = false;

    const timeout = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
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

        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          lastMessage = event.item.text ?? lastMessage;
        } else if (event.type === 'turn.completed') {
          usage = event.usage;
        }

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
        if (code !== 0 && !lastMessage) {
          reject(new Error(stderr.trim() || `codex exited with code ${code}`));
          return;
        }
        resolve({
          text: lastMessage,
          model: CODEX_MODEL_LABEL,
          latencyMs: Date.now() - startedAt,
          costUsd: null, // ChatGPT subscription — no per-call cost to report, unlike Claude's list-price estimate
          tokensIn: usage?.input_tokens ?? null,
          tokensOut: usage?.output_tokens ?? null,
          tokensThinking: usage?.reasoning_output_tokens ?? null
        });
      });
    });
  });
}
