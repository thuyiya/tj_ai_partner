// Replaces hand-coded keyword routing with an actual model making the call.
// Uses whichever local model is already the default (already resident in
// Ollama's memory once warm, so this adds a fast, free decision step rather
// than a second heavy call) to read the prompt, decide local vs. Claude vs.
// Codex, pick *which* installed local model fits best, and — for anything
// that looks like a real multi-step task — sketch a short approach the
// escalated model can follow. The model designs the routing; nothing here
// hand-codes "if keyword X then Y".
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
// qwen3:4b, not the general default (llama3.2:3b) — verified empirically:
// llama3.2:3b escalated "What is 12 times 7?" and "What is the capital of
// Japan?" to Claude even with explicit few-shot examples telling it not to;
// qwen3:4b got all 5 test cases (3 trivial, 2 genuinely complex) right with
// sound reasoning. Routing quality directly costs real money when wrong, so
// this is worth a stronger model even though it's still small/local/free.
const PLANNER_MODEL = process.env.OLLAMA_PLANNER_MODEL ?? 'qwen3:4b';

function describeModel(m) {
  const hint = m.vision ? 'vision — can view images'
    : /coder|code/i.test(m.name) ? 'code-focused'
    : /deepseek-r1|reasoning/i.test(m.name) ? 'reasoning-focused, slower'
    : 'general-purpose';
  return `- "${m.name}" (${hint})`;
}

function biasHint(threshold) {
  if (threshold <= -2) return 'Strongly prefer keeping things local — only escalate for tasks a small local model genuinely cannot do.';
  if (threshold >= 6) return 'Be conservative about local — escalate readily whenever there is real ambiguity or multi-step reasoning involved.';
  return 'Use balanced judgment between local and escalation.';
}

// A terse follow-up ("do it", "you have access so do it", "yes continue")
// carries zero routing signal on its own — verified empirically that this
// is a real failure mode: a whole prior turn asking to build something in
// an edit-permitted project, then a short confirmation reply, stayed local
// because the planner never saw what "it" referred to. Recent turns give it
// that referent without bloating the (small, fast) planning call.
function recentHistoryForPrompt(history) {
  if (!history.length) return '(this is the first message — no prior turns)';
  return history.slice(-4).map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content.slice(0, 300)}`).join('\n');
}

// Whether a project with real file-edit access should escalate is NOT left
// to the same multi-purpose routing call below — verified empirically that
// it should be: asked as part of that larger prompt (backend + local model
// + subtask plan + calibration examples all competing for attention), a 4B
// model gave "ollama" 2 times out of 3 on an identical real production
// prompt, rationalizing that "the user will copy the code in by hand" even
// after the prompt explicitly told it not to. Isolating this into its own
// small yes/no question with nothing else to think about was 21/21 correct
// across repeated runs on both directions (real build requests, plain Q&A,
// and history-dependent follow-ups like "do it"). A hard technical fact
// like "local models cannot write files" shouldn't be riding on a
// probabilistic judgment call anyway — this makes it deterministic instead.
async function wantsRealFileChange(prompt, history) {
  const q =
    `Recent conversation:\n${recentHistoryForPrompt(history)}\n\n` +
    `Newest user message: "${prompt.slice(0, 1500)}"\n\n` +
    `Question: is the user asking you to CREATE, ADD, BUILD, IMPLEMENT, FIX, EDIT, or otherwise CHANGE actual files in a software project? The newest message might be short and only make sense given the recent conversation (e.g. "do it", "yes continue" confirms whatever was just being discussed). Answer false if they are only asking what something currently does, how something works, or requesting an explanation/diagnosis — even if the topic is code-related and even if you'd need to read files to answer. Only answer true if they want a real modification actually made.\n\n` +
    `Examples:\n` +
    `"What does the settings page do?" -> false (asking about existing behavior)\n` +
    `"How does the theme provider work?" -> false (explanation request)\n` +
    `"Why is my build failing?" -> false (diagnostic question, no explicit request to fix it)\n` +
    `"Build a React app for this prototype using the theme" -> true (real implementation request)\n` +
    `"Fix the bug in the settings form" -> true (real change request)\n\n` +
    `Answer with JSON only, matching exactly: {"wantsFileChange": true, "why": "one short phrase"}`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: PLANNER_MODEL, prompt: q, format: 'json', think: false, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  const parsed = JSON.parse(data.response);
  return parsed.wantsFileChange === true;
}

function projectContextForPrompt(project) {
  if (!project) return 'No project is open — this is a plain chat with no real files attached. A local answer is just a suggestion in the chat either way, so that\'s not a factor here.';
  if (project.permissionMode === 'plan') {
    return `A project ("${project.name}") is open, but it's in read-only "Plan" mode — nothing (not even Claude/Codex) can edit its files right now, so this is effectively also just an in-chat suggestion regardless of backend.`;
  }
  return `A project ("${project.name}") is open with real file-edit access granted (permission: "${project.permissionMode}"). IMPORTANT: only Claude and Codex can actually read or write files on disk in this app — a local Ollama model has zero file-system access, ever. If the local model answers, its "code" is only ever text printed in the chat that the user must copy in by hand themselves — it can never actually create, edit, or touch a real file, no matter how simple the change looks.`;
}

export async function planRoute(prompt, { installedModels = [], threshold = 2, project = null, history = [] } = {}) {
  // The planner model itself is excluded from its own candidate list —
  // verified empirically that recommending itself for a trivial question
  // produced a bizarrely verbose, over-explained answer (three different
  // methods to compute 12×7). Its job here is judging, not answering.
  const answerCandidates = installedModels.filter((m) => m.name !== PLANNER_MODEL);
  const candidatesForPrompt = answerCandidates.length ? answerCandidates : installedModels;
  const modelList = candidatesForPrompt.length ? candidatesForPrompt.map(describeModel).join('\n') : '- (none installed)';

  const planningPrompt =
    `You are a fast local routing assistant deciding how to handle a user's message.\n\n` +
    `Recent conversation (may be empty if this is the first message):\n${recentHistoryForPrompt(history)}\n\n` +
    `User's newest message: "${prompt.slice(0, 1500)}"\n\n` +
    `IMPORTANT: the newest message might be short and only make sense given the recent conversation above — e.g. "do it", "yes continue", "you have access so do it" is a confirmation to carry out whatever was just being discussed, not a new trivial question on its own. Judge the underlying task (from the conversation), not just the literal words of the newest message.\n\n` +
    `Project context: ${projectContextForPrompt(project)}\n\n` +
    `============================================================\n` +
    `STEP 0 — CHECK THIS FIRST, before any judgment about complexity or reasoning difficulty:\n` +
    `Is a project open with real file-edit access (permission "edits" or "full", per Project context above) AND is the user's underlying request (from the conversation) to add, build, implement, fix, create, refactor, or otherwise change something in that actual codebase — not just asking a question or wanting an explanation?\n\n` +
    `If YES to both: the backend MUST be "claude" or "codex". This is a hard technical fact, not a judgment call and not a stylistic preference — a local Ollama model has ZERO ability to create, edit, or save a file, under any circumstances, no matter how simple or well-known the code is. Answering locally here means the user gets text they must manually copy-paste themselves, which does NOT fulfill "do it" / "build X" / "implement Y" when they have an actual project open with edit access — it is an objectively wrong answer, not an acceptable shortcut, even if the local model could write correct-looking code. Do not rationalize a local answer by assuming the user will copy it in by hand — that is not what they asked for.\n` +
    `If NO (no project open, project is read-only "Plan" mode, or this is genuine Q&A/explanation with nothing to save): skip this gate and judge normally below.\n` +
    `============================================================\n\n` +
    `Local models installed on this machine (free, fast, but limited reasoning):\n${modelList}\n\n` +
    `Cloud options (slower, cost real usage, but much more capable — full reasoning, real file/code operations, can run sub-agents for multi-part work):\n` +
    `- "claude": Claude, strong at reasoning, writing, analysis, and real coding/file work\n` +
    `- "codex": OpenAI Codex, similar capability, strong at coding and running shell commands\n\n` +
    `${biasHint(threshold)}\n\n` +
    `If Step 0's gate did not apply, decide normally:\n` +
    `1. Can an installed local model fully and correctly handle this, or does it need real multi-step reasoning only Claude or Codex can do well?\n` +
    `2. If local is enough, which installed model fits best? Prefer a code-focused model for code questions, the vision model only if the message is about an attached image, otherwise the general one.\n` +
    `3. If this needs Claude or Codex AND looks like a multi-part task, sketch 2-4 short suggested steps to guide its approach. Otherwise leave this empty — don't invent steps for a simple question.\n\n` +
    `Calibration for Step 0 NOT applying (no project / read-only / pure Q&A) — you have a strong bias to over-escalate simple things. Correct examples:\n` +
    `- "What is 12 times 7?" -> ollama (arithmetic, a local model computes this correctly every time — this is NOT complex reasoning)\n` +
    `- "What's the capital of France?" -> ollama (a fact lookup, trivial)\n` +
    `- "Summarize this in one sentence: ..." -> ollama (simple, bounded task)\n` +
    `- "Write a haiku about the ocean" -> ollama (short creative task, well within a small model)\n` +
    `- "Design a distributed rate-limiting system with failover and clock-skew handling" -> claude/codex (genuinely deep multi-part reasoning)\n` +
    `- "Refactor this codebase to use dependency injection across 12 files" -> codex (real multi-file code operations)\n` +
    `Local can do: arithmetic, facts, short creative writing, formatting/conversion, simple summarization, short code snippets, casual conversation.\n` +
    `Escalate only for: genuinely deep multi-step reasoning, non-trivial architecture/design questions, real multi-file code changes, or tasks that need actual file/shell access.\n` +
    `When genuinely unsure between local and escalating, choose local — the cost of being wrong by escalating a simple question is much higher than a local model giving an imperfect answer to something plainly simple.\n\n` +
    `Respond with JSON only, matching exactly:\n` +
    `{"backend":"ollama|claude|codex","localModel":"<exact installed model name, only if backend is ollama>","reasoning":"one short sentence","subtaskPlan":["step 1","step 2"]}`;

  // Runs alongside the main call (independent, so no added latency in the
  // common case) only when there's actually a hard fact to enforce — no
  // project, or a read-only Plan-mode project, has nothing for it to
  // override, so it's skipped rather than spending a call on a foregone
  // conclusion.
  const editAccessOpen = project && project.permissionMode !== 'plan';
  const gatePromise = editAccessOpen ? wantsRealFileChange(prompt, history).catch(() => false) : Promise.resolve(false);

  const responsePromise = fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — confirmed empirically that hybrid-reasoning models
    // (qwen3 and similar) otherwise put their entire output into a separate
    // "thinking" field and leave "response" empty under format:'json',
    // which looks like a silent failure rather than the model just needing
    // this flag.
    body: JSON.stringify({ model: PLANNER_MODEL, prompt: planningPrompt, format: 'json', think: false, stream: false })
  });

  const [mustEscalate, response] = await Promise.all([gatePromise, responsePromise]);
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);

  const data = await response.json();
  const parsed = JSON.parse(data.response);

  const validBackends = new Set(['ollama', 'claude', 'codex']);
  let backend = validBackends.has(parsed.backend) ? parsed.backend : 'ollama';
  let reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : 'planner decision';

  // The deterministic override: a real file-change request against a
  // project with edit access always escalates, regardless of what the main
  // call's own (less reliable, on this specific axis) judgment said.
  if (mustEscalate && backend === 'ollama') {
    backend = 'claude';
    reasoning = 'Deterministic override: a project with real file-edit access is open and this is a real file-change request, not just a question — only Claude/Codex can actually save that change, so a local answer is never correct here regardless of how simple the code looks.';
  }

  const installedNames = new Set(candidatesForPrompt.map((m) => m.name));
  const localModel = backend === 'ollama' && installedNames.has(parsed.localModel) ? parsed.localModel : undefined;

  return {
    backend,
    localModel,
    reasoning,
    subtaskPlan: Array.isArray(parsed.subtaskPlan) ? parsed.subtaskPlan.slice(0, 4).map(String) : []
  };
}
