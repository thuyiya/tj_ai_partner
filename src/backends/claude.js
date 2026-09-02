import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CLAUDE_MODEL_LABEL = 'claude (headless, Max plan)';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_MODEL_SERVER_PATH = path.join(__dirname, '..', 'mcp', 'localModelServer.js');

// Registered only for edits/full — a read-only Plan-mode call has nothing
// to write local-model drafts into anyway. process.execPath (not a bare
// "node") so this resolves to the exact Node binary already running this
// app, regardless of what's on the inherited PATH.
function mcpConfigFlags() {
  return ['--mcp-config', JSON.stringify({
    mcpServers: { 'local-model': { command: process.execPath, args: [LOCAL_MODEL_SERVER_PATH] } }
  })];
}

// Told to the model alongside the permission notices — the tool's own MCP
// description covers *how* to call it; this covers *that it exists and
// when it's worth reaching for*, since a model won't necessarily think to
// look for a cost-saving option unprompted. Named exactly as it actually
// appears in the tool list (verified: MCP tools are namespaced
// mcp__<server>__<tool>, and load as a deferred tool needing its own
// ToolSearch fetch first) — spelling it out here saves the exploratory
// searches an unprefixed name would cost.
const LOCAL_MODEL_BRIDGE_NOTICE = 'You have a deferred MCP tool named "mcp__local-model__ask_local_model" (fetch its schema via ToolSearch first, e.g. select:mcp__local-model__ask_local_model) — a free, fast local model, running on this machine, that you can delegate self-contained text-generation sub-tasks to. Using it is not optional-but-nice-to-have — this app exists specifically to keep your token spend down by offloading what does not need your own reasoning, so treat "did I check whether this step could be delegated" as a real step in your own process, not an afterthought.\n\n' +
  'BEFORE you write any of the following yourself, delegate it to ask_local_model first, then review/edit its output rather than drafting from scratch:\n' +
  '- More than 2 similar/repetitive items in a row (placeholder pages, list entries, sample data rows, similar small components following an established pattern)\n' +
  '- Boilerplate or scaffolding whose shape is already fully determined by a pattern you can describe in the prompt (e.g. "5 more files just like this one, but for X/Y/Z")\n' +
  '- Draft prose you intend to review and edit anyway (descriptions, comments, placeholder copy, commit-message drafts) — draft it locally, then edit the draft rather than writing it yourself first\n\n' +
  'Do NOT delegate: anything requiring your own judgment, verification, understanding of THIS specific codebase/conversation, or where correctness actually matters and a wrong answer would cost more (in your own time fixing it) than the tokens saved. It cannot read files or see this conversation — every prompt to it must be fully self-contained.\n\n' +
  'This is a real, working tool, not a hypothetical — it has already been verified to work end-to-end in this app: a prior identical request produced real, useful drafts that were reviewed, corrected, and saved.';

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
// --setting-sources '' on every tier: confirmed empirically that this
// headless call otherwise inherits whatever hooks/plugins are configured in
// the *user's own* ~/.claude/settings.json — e.g. a SessionStart hook fired
// and injected unrelated plugin instructions into the automated call, which
// is both nondeterministic (depends on whatever's installed on this Mac)
// and a plausible source of the intermittent "no result" failures seen in
// testing. This was originally --safe-mode instead, which fixed the same
// problem but ALSO disables MCP servers passed via --mcp-config in the same
// invocation — confirmed via a direct A/B spawn — which broke the local-
// model bridge below before it ever worked. --setting-sources '' verified
// to isolate the exact same hook/plugin pollution (no hook_started event,
// clean result) while leaving an explicit --mcp-config server discoverable,
// and auth/model selection/permissions untouched. --restricted already
// implies similar isolation (it ignores user/project/local settings files)
// but doesn't apply to 'full' (mutually exclusive with bypassPermissions),
// so this is added uniformly rather than relying on that as the only guard.
const PERMISSION_FLAGS = {
  plan: ['--restricted', '--permission-mode', 'plan', '--disallowedTools', 'Edit Write MultiEdit NotebookEdit', '--setting-sources', ''],
  edits: ['--restricted', '--permission-mode', 'acceptEdits', '--setting-sources', ''],
  full: ['--permission-mode', 'bypassPermissions', '--setting-sources', '']
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
  const canWrite = permissionMode === 'edits' || permissionMode === 'full';
  if (canWrite) flags.push(...mcpConfigFlags());
  const notice = [NO_BACKGROUND_NOTICE, PERMISSION_NOTICES[permissionMode], canWrite ? LOCAL_MODEL_BRIDGE_NOTICE : null]
    .filter(Boolean).join('\n\n');
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
