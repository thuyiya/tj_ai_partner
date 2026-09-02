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
//
// --safe-mode on every tier: confirmed empirically that this headless call
// otherwise inherits whatever hooks/plugins/MCP servers are configured in
// the *user's own* ~/.claude/settings.json — e.g. a SessionStart hook fired
// and injected unrelated plugin instructions into the automated call, which
// is both nondeterministic (depends on whatever's installed on this Mac)
// and a plausible source of the intermittent "no result" failures seen in
// testing. --safe-mode strips hooks/plugins/MCP/CLAUDE.md while explicitly
// leaving auth, model selection, and permissions untouched — verified via a
// direct spawn that OAuth login still works and a real result still comes
// back with it on. --restricted already implies the same isolation (it
// ignores user/project/local settings files) but doesn't apply to 'full'
// (mutually exclusive with bypassPermissions), so this is added uniformly
// rather than relying on that as the only guard.
const PERMISSION_FLAGS = {
  plan: ['--restricted', '--permission-mode', 'plan', '--disallowedTools', 'Edit Write MultiEdit NotebookEdit', '--safe-mode'],
  edits: ['--restricted', '--permission-mode', 'acceptEdits', '--safe-mode'],
  full: ['--permission-mode', 'bypassPermissions', '--safe-mode']
};

// Without this, Claude has no idea *why* a tool call got refused, so it
// narrates around it — a Plan-mode call denied every write tool still
// needs to be told that's why, or it just talks past the refusal.
const PERMISSION_NOTICES = {
  plan: 'You are running in read-only PLAN mode for this project: you have no Edit, Write, MultiEdit, NotebookEdit, or Bash/shell tool available, and nothing you do here can touch any file on disk. Describe a concrete plan or the code itself in your answer instead, and say plainly that actually creating/editing files requires switching this project to Edits or Full access first.',
  edits: 'You are running in EDITS mode for this project: you can create and edit files directly, but you have no Bash/shell tool — you cannot run commands (no npm install, no build scripts, no git, no starting a dev server). Do the file work you can, and be explicit about any remaining step that needs a shell command, since the user will have to run that themselves.'
};

// Applies to every permission tier, including Full — verified by tracing a
// real production case: a 'full'-permission run (no restrictions at all)
// still answered "I've kicked off the build in the background... I'll
// report back with what's done", after 300s and 12.8k output tokens of
// real tool use — and the target folder was confirmed completely empty
// afterward. The actual bug wasn't a permission gap; it's architectural.
// This app calls `claude -p` as one bounded, synchronous process: whatever
// Task-tool sub-agents it delegates must complete before that process's
// single terminal `result` event fires, because once this process exits
// there is no persistent Claude process left to "continue" anything. "I'll
// report back later" describes a capability this integration cannot offer,
// regardless of permission tier — so this is told to the model unconditionally.
const NO_BACKGROUND_NOTICE = 'Important about how you are being run: this is a single, one-shot, non-interactive invocation. There is no persistent process after you finish responding — once your final answer is sent, this process exits completely and nothing continues running, including any Task-tool sub-agents you delegate. Never say you have "kicked off" something "in the background", that you will "report back once it finishes", or anything implying work continues after this response — that is never true here. Do everything you can synchronously, within this single response, before answering, and your final answer must describe only what you actually completed (or actually could not do), not what you intend to do next.';

// 300s was too short — confirmed via exit code 143 (SIGTERM, this timeout
// firing) on a genuinely complex real task (reconciling two project trees,
// weighing a multi-option decision) that just needed more than 5 minutes of
// real exploration. 20 minutes gives real multi-file agentic work room
// while still bounding a genuinely stuck process.
const TIMEOUT_MS = 1_200_000;

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
  // Copied, not a reference to the shared constant — pushing onto the
  // module-level array directly would accumulate a duplicate notice flag
  // on every single call for that permission tier, for the process's
  // entire lifetime.
  const flags = [...(PERMISSION_FLAGS[permissionMode] ?? PERMISSION_FLAGS.plan)];
  const notice = [NO_BACKGROUND_NOTICE, PERMISSION_NOTICES[permissionMode]].filter(Boolean).join('\n\n');
  flags.push('--append-system-prompt', notice);
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
          // probe) rather than the real reason nothing came back — the exit
          // code is included every time so a future silent-failure case
          // isn't stuck diagnosing from that one unrelated line alone.
          const detail = stderr.trim() || 'no output';
          reject(new Error(`Claude CLI produced no result, exit code ${code} (${detail})`));
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
