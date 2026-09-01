let nextId = 1;
const jobs = new Map();
let nextFindingId = 1;
let nextStepId = 1;

// Completed jobs stay visible for a bit so the Agents/Security tabs aren't
// just a blank flash the instant a reply lands — the point is seeing the
// process, not just a spinner that vanishes.
const LINGER_MS = 20_000;

export function startJob({ backend, model, prompt, sessionId }) {
  const id = nextId++;
  jobs.set(id, {
    id,
    backend,
    model,
    sessionId: sessionId ?? null,
    prompt: prompt.slice(0, 140),
    startedAt: Date.now(),
    status: 'running',
    subagents: new Map(),
    securityFindings: [],
    timeline: [],
    usageAssignedUpTo: 0
  });
  return id;
}

export function finishJob(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'done';
  job.finishedAt = Date.now();
  setTimeout(() => jobs.delete(id), LINGER_MS);
}

export function getJob(id) {
  const job = jobs.get(id);
  return job ? serialize(job) : null;
}

// Fed the raw stream-json events from the Claude backend. Only three
// subtypes carry subagent (Task tool) lifecycle info — everything else
// (text deltas, hook events, rate-limit pings, etc.) is ignored here.
export function recordAgentEvent(jobId, event) {
  const job = jobs.get(jobId);
  if (!job || event.type !== 'system') return;

  if (event.subtype === 'task_started') {
    job.subagents.set(event.task_id, {
      taskId: event.task_id,
      description: event.description,
      subagentType: event.subagent_type,
      status: 'running',
      startedAt: Date.now()
    });
    return;
  }

  const sub = job.subagents.get(event.task_id);
  if (!sub) return;

  if (event.subtype === 'task_updated' && event.patch?.status) {
    sub.status = event.patch.status;
  } else if (event.subtype === 'task_notification') {
    sub.status = event.status;
    sub.summary = event.summary;
    sub.usage = event.usage;
    sub.completedAt = Date.now();
  }
}

// Findings come from a local (always-Ollama, never-Claude) security review
// of each real file edit / shell command Claude actually executes, fired the
// moment the tool_use event arrives — not a summary after the whole task.
export function recordSecurityFindings(jobId, { kind, label }, findings) {
  const job = jobs.get(jobId);
  if (!job || !findings.length) return;

  for (const finding of findings) {
    job.securityFindings.push({
      id: nextFindingId++,
      kind,
      label,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      at: Date.now()
    });
  }
}

// A step-by-step record of what a job actually did — real tool calls
// (Claude) or real command executions (Codex), not fabricated progress. Used
// by the Agents-tab detail drill-down. `key` correlates a start/complete
// pair (Codex sends both); omit it for events observed only once (Claude's
// stream reports a tool_use already decided, not a separate start/finish).
export function addTimelineStep(jobId, step, key) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.timeline.push({ id: nextStepId++, key, startedAt: Date.now(), ...step });
}

export function updateTimelineStep(jobId, key, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  const step = job.timeline.find((s) => s.key === key);
  if (!step) return;
  Object.assign(step, patch, { completedAt: Date.now() });
}

function mergeUsage(a, b) {
  if (!a) return b;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (typeof value === 'number') out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

// Real per-turn token usage (Claude's `assistant` events, Codex's
// `turn.completed` events both report it live) attributed to whichever
// timeline steps were added since the last turn — never estimated or
// evenly split, so a "which step cost the tokens" breakdown is only ever
// built from numbers the backend itself actually reported. A turn that adds
// no new step (a text-only planning turn, or the final answer) has nowhere
// to attach its usage yet — it accumulates in `pendingUsage` and rides along
// onto whichever step comes next, rather than being silently dropped.
export function attachUsageToRecentSteps(jobId, usage) {
  const job = jobs.get(jobId);
  if (!job) return;
  if (usage) job.pendingUsage = mergeUsage(job.pendingUsage, usage);
  if (!job.pendingUsage) return;

  const from = job.usageAssignedUpTo ?? 0;
  if (from >= job.timeline.length) return;
  for (let i = from; i < job.timeline.length; i++) job.timeline[i].usage = job.pendingUsage;
  job.usageAssignedUpTo = job.timeline.length;
  job.pendingUsage = null;
}

function serialize(job) {
  return {
    ...job,
    subagents: [...job.subagents.values()].sort((a, b) => a.startedAt - b.startedAt)
  };
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => a.startedAt - b.startedAt).map(serialize);
}
