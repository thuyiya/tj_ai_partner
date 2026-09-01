import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classify, isImageRequest } from './classifier.js';
import { planRoute } from './backends/planner.js';
import { runLocal, isVisionModel, listModels, DEFAULT_MODEL } from './backends/ollama.js';
import { runClaude } from './backends/claude.js';
import { runCodex } from './backends/codex.js';
import { generateImage, IMAGE_MODEL_LABEL } from './backends/imageGen.js';
import { visualizeResponse, securityReviewSnippet } from './backends/localAnalysis.js';
import { logRequest } from './db.js';
import { startJob, finishJob, recordAgentEvent, recordSecurityFindings, addTimelineStep, updateTimelineStep, attachUsageToRecentSteps } from './jobs.js';
import { activeClaudeApiKey } from './credentials.js';
import { buildProjectContext } from './projectAssets.js';

const CLOUD_BACKENDS = new Set(['claude', 'codex']);

function decideForImageTask({ force, model }) {
  const effectiveModel = model || DEFAULT_MODEL;
  if (CLOUD_BACKENDS.has(force)) return { backend: force, reasons: [`image attached, forced -> ${force}`] };
  if (force === 'ollama') {
    return isVisionModel(effectiveModel)
      ? { backend: 'ollama', reasons: [`image attached, forced -> local vision model "${effectiveModel}"`] }
      : { backend: 'claude', reasons: [`image attached, forced local but "${effectiveModel}" has no vision -> falling back to claude`] };
  }
  return isVisionModel(effectiveModel)
    ? { backend: 'ollama', reasons: [`image attached, local model "${effectiveModel}" supports vision -> ollama`] }
    : { backend: 'claude', reasons: [`image attached, local model "${effectiveModel}" has no vision -> claude`] };
}

// Auto mode's routing decision comes from an actual model reading the
// prompt — not hand-coded keyword rules. It also picks *which* installed
// local model fits (a coder model for code, vision for image questions,
// etc.) and, for anything that looks like a real multi-step task, sketches
// an approach for the escalated backend to follow — the model designs the
// task breakdown, nothing here hard-codes how to divide agentic work.
// Falls back to the old keyword heuristic only if the planner call itself
// fails (Ollama unreachable, bad JSON) — never silently guesses on a
// malformed-but-successful planner response.
async function decideAuto(prompt, threshold, project, history) {
  try {
    const installedModels = await listModels();
    const plan = await planRoute(prompt, { installedModels, threshold, project, history });
    return {
      backend: plan.backend,
      score: null,
      reasons: [`ai-planned: ${plan.reasoning}`],
      localModel: plan.localModel,
      subtaskPlan: plan.subtaskPlan
    };
  } catch (error) {
    const fallback = classify(prompt, threshold);
    return { ...fallback, reasons: [...fallback.reasons, `(planner unavailable: ${error.message}, used keyword fallback)`] };
  }
}

// Real actions only — Read/Grep/Glob don't change anything, so they're not
// worth a security pass. Extracts a (kind, label, content) triple from each
// tool's own input shape (verified empirically per-tool, not guessed).
function extractClaudeToolAction(block) {
  const input = block.input ?? {};
  if (block.name === 'Write') {
    return { kind: 'write', label: input.file_path, content: input.content ?? '' };
  }
  if (block.name === 'Edit') {
    return { kind: 'edit', label: input.file_path, content: `${input.old_string ?? ''}\n---\n${input.new_string ?? ''}` };
  }
  if (block.name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return { kind: 'edit', label: input.file_path, content: edits.map((e) => `${e.old_string ?? ''}\n---\n${e.new_string ?? ''}`).join('\n\n') };
  }
  if (block.name === 'Bash') {
    return { kind: 'command', label: input.command, content: input.command ?? '' };
  }
  return null;
}

// A step-by-step record of what Claude actually did, for the Agents-tab
// detail drill-down. Claude's stream reports each tool call already decided
// and (for our purposes) complete in one event — there's no separate
// start/finish pair to correlate the way Codex gives us, so these log as
// 'completed' the moment they're observed.
function claudeTimelineStep(block) {
  const input = block.input ?? {};
  switch (block.name) {
    case 'Read': return { icon: 'file-text', title: 'Read file', subtitle: input.file_path, detail: input.file_path };
    case 'Write': return { icon: 'pencil', title: 'Write file', subtitle: input.file_path, detail: (input.content ?? '').slice(0, 2000) };
    case 'Edit': return { icon: 'pencil', title: 'Edit file', subtitle: input.file_path, detail: `- ${input.old_string ?? ''}\n+ ${input.new_string ?? ''}`.slice(0, 2000) };
    case 'MultiEdit': return { icon: 'pencil', title: 'Edit file', subtitle: input.file_path, detail: (input.edits ?? []).map((e) => `- ${e.old_string}\n+ ${e.new_string}`).join('\n\n').slice(0, 2000) };
    case 'Bash': return { icon: 'terminal', title: input.description || 'Run command', subtitle: input.command, detail: input.command };
    case 'Agent': return { icon: 'bot', title: `Delegate: ${input.description || 'sub-agent task'}`, subtitle: input.subagent_type, detail: input.prompt };
    case 'Grep': return { icon: 'search', title: 'Search', subtitle: input.pattern, detail: `pattern: ${input.pattern}\npath: ${input.path ?? '.'}` };
    case 'Glob': return { icon: 'folder', title: 'Find files', subtitle: input.pattern, detail: input.pattern };
    case 'WebFetch': return { icon: 'globe', title: 'Fetch URL', subtitle: input.url, detail: input.url };
    default: return { icon: 'code-2', title: block.name, subtitle: '', detail: JSON.stringify(input).slice(0, 500) };
  }
}

// Fires a local (never Claude/Codex) security review the instant a real file
// edit or shell command streams in — not a summary after the whole task —
// so the Security tab reflects what's actually happening as it happens.
// Also logs every tool call to the job's timeline for the detail view.
function scanClaudeEvent(jobId, event) {
  if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return;
  for (const block of event.message.content) {
    if (block.type !== 'tool_use') continue;

    addTimelineStep(jobId, { ...claudeTimelineStep(block), status: 'completed' });

    const action = extractClaudeToolAction(block);
    if (!action || !action.content.trim()) continue;
    securityReviewSnippet(action.kind, action.label, action.content)
      .then((findings) => recordSecurityFindings(jobId, action, findings))
      .catch(() => {});
  }
  // Each assistant event IS one API turn and already carries that turn's own
  // real usage — attribute it to whatever step(s) this same event just added
  // (a plain text-only turn with no tool_use adds no new steps, so its usage
  // simply carries forward to the next turn that does).
  attachUsageToRecentSteps(jobId, event.message?.usage);
}

// Codex reports real shell commands as `command_execution` items (its
// sandbox doesn't distinguish an "edit" tool from a "run a command" tool the
// way Claude does — see codex.js). Unlike Claude, Codex gives a genuine
// started -> completed pair (matched by item.id) with a real duration.
function scanCodexEvent(jobId, event) {
  // Unlike Claude (where one stream event both adds a step AND carries that
  // step's usage), Codex reports command execution and turn-level usage as
  // separate event types — usage for a turn arrives after the item(s) it
  // covers, so it attaches to whatever steps have accumulated since the
  // last turn rather than the step that's currently in this event.
  if (event.type === 'turn.completed') {
    attachUsageToRecentSteps(jobId, event.usage);
    return;
  }
  if (event.type !== 'item.started' && event.type !== 'item.completed') return;
  if (event.item?.type !== 'command_execution') return;

  const { id, command } = event.item;
  if (!command?.trim()) return;

  if (event.type === 'item.started') {
    addTimelineStep(jobId, { icon: 'terminal', title: 'Run command', subtitle: command, detail: command, status: 'running' }, id);
    return;
  }

  const failed = event.item.exit_code !== 0;
  updateTimelineStep(jobId, id, {
    status: failed ? 'failed' : 'completed',
    detail: event.item.aggregated_output?.trim() || command
  });

  const action = { kind: 'command', label: command };
  securityReviewSnippet('command', command, command)
    .then((findings) => recordSecurityFindings(jobId, action, findings))
    .catch(() => {});
}

export async function routeTask(prompt, opts = {}) {
  const { force, model, images = [], history = [], threshold, project, sessionId } = opts;
  const hasImages = images.length > 0;

  // No manual "Image" mode — asking for a picture under Auto or Local (the
  // two modes where a local text model would otherwise just describe the
  // image instead of making one) transparently routes to image generation.
  // An explicit Claude/Codex choice is respected as-is; an attached image
  // (for analysis) also takes priority, since attach-to-generate isn't a
  // defined flow yet.
  const wantsImage = !hasImages && (force === undefined || force === 'ollama') && isImageRequest(prompt);

  // Auto mode (force undefined) is the only path that consults the planner —
  // an explicit Local/Claude/Codex choice is a direct user override and
  // bypasses it entirely, same as it always has.
  let classification;
  if (wantsImage || force === 'image') {
    classification = { backend: 'image', score: null, reasons: [wantsImage ? 'auto-detected image-generation request' : 'forced by caller -> image'] };
  } else if (hasImages) {
    classification = decideForImageTask({ force, model });
  } else if (force) {
    classification = { backend: force, score: null, reasons: [`forced by caller -> ${force}`] };
  } else {
    classification = await decideAuto(prompt, threshold, project, history);
  }

  const backend = classification.backend;
  const effectiveModel = backend === 'ollama' ? classification.localModel || model || DEFAULT_MODEL : model;
  const jobId = startJob({ backend, model: backend === 'image' ? IMAGE_MODEL_LABEL : effectiveModel || DEFAULT_MODEL, prompt, sessionId });

  // Project sources/skill are injected as context text for every backend —
  // including local Ollama, which has no file-system access at all — the
  // same way ChatGPT/Claude "Projects" make uploaded references usable
  // regardless of whether the model can independently go read a file.
  // Classification above ran on the raw prompt so a large skill file can't
  // skew the word-count heuristic.
  const projectContext = project && backend !== 'image' ? buildProjectContext(project) : '';

  // The planner's own suggested breakdown, when it produced one — guidance
  // for the escalated model's approach, not a rigid script it must follow.
  const planGuidance = classification.subtaskPlan?.length
    ? `Suggested approach (from initial triage, adjust as needed):\n${classification.subtaskPlan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const effectivePrompt = [projectContext, planGuidance, prompt].filter(Boolean).join('\n\n---\n\n');

  try {
    let result;

    if (backend === 'image') {
      const outputPath = path.join(os.tmpdir(), `gen-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
      const gen = await generateImage(prompt, { outputPath });
      result = {
        text: `Generated an image for: "${prompt}"`,
        model: IMAGE_MODEL_LABEL,
        latencyMs: gen.latencyMs,
        costUsd: 0,
        tokensIn: null,
        tokensOut: null,
        tokensThinking: null,
        generatedImagePath: outputPath
      };
    } else if (backend === 'claude') {
      result = await runClaude(effectivePrompt, {
        history,
        imagePaths: images.map((i) => i.path),
        cwd: project?.path,
        permissionMode: project?.permissionMode ?? 'plan',
        apiKey: await activeClaudeApiKey(),
        onEvent: (event) => {
          recordAgentEvent(jobId, event);
          scanClaudeEvent(jobId, event);
        }
      });
    } else if (backend === 'codex') {
      result = await runCodex(effectivePrompt, {
        history,
        imagePaths: images.map((i) => i.path),
        cwd: project?.path,
        permissionMode: project?.permissionMode ?? 'plan',
        onEvent: (event) => scanCodexEvent(jobId, event)
      });
    } else {
      const encodedImages = await Promise.all(
        images.map(async (img) => (await readFile(img.path)).toString('base64'))
      );
      result = await runLocal(effectivePrompt, { model: effectiveModel, images: encodedImages, history });
    }

    // Always local, regardless of which backend just answered — a second
    // opinion from a different, free model, not a summary asked of the same
    // model that wrote the response. Doesn't apply to image generation —
    // there's no text response worth summarizing/charting.
    if (backend !== 'image') {
      result.visualization = await visualizeResponse(prompt, result.text);
    }

    logRequest({
      prompt,
      backend,
      model: result.model,
      score: classification.score,
      reasons: classification.reasons,
      forced: Boolean(force),
      hasImage: hasImages,
      response: result.text,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      tokensThinking: result.tokensThinking
    });

    return { ...classification, ...result, jobId };
  } catch (error) {
    logRequest({
      prompt,
      backend,
      score: classification.score,
      reasons: classification.reasons,
      forced: Boolean(force),
      hasImage: hasImages,
      error: error.message
    });
    // The backend that was actually being attempted, so the caller can
    // persist/display it instead of falling back to a guess — a failed
    // Claude/Codex CLI call must never render as "Local" in the chat.
    error.backend = backend;
    error.model = effectiveModel;
    throw error;
  } finally {
    finishJob(jobId);
  }
}
