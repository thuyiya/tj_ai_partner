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

export async function planRoute(prompt, { installedModels = [], threshold = 2 } = {}) {
  // The planner model itself is excluded from its own candidate list —
  // verified empirically that recommending itself for a trivial question
  // produced a bizarrely verbose, over-explained answer (three different
  // methods to compute 12×7). Its job here is judging, not answering.
  const answerCandidates = installedModels.filter((m) => m.name !== PLANNER_MODEL);
  const candidatesForPrompt = answerCandidates.length ? answerCandidates : installedModels;
  const modelList = candidatesForPrompt.length ? candidatesForPrompt.map(describeModel).join('\n') : '- (none installed)';

  const planningPrompt =
    `You are a fast local routing assistant deciding how to handle a user's message. Read it and decide.\n\n` +
    `User message: "${prompt.slice(0, 1500)}"\n\n` +
    `Local models installed on this machine (free, fast, but limited reasoning):\n${modelList}\n\n` +
    `Cloud options (slower, cost real usage, but much more capable — full reasoning, real file/code operations, can run sub-agents for multi-part work):\n` +
    `- "claude": Claude, strong at reasoning, writing, analysis, and real coding/file work\n` +
    `- "codex": OpenAI Codex, similar capability, strong at coding and running shell commands\n\n` +
    `${biasHint(threshold)}\n\n` +
    `Decide:\n` +
    `1. Can an installed local model fully and correctly handle this, or does it need real multi-step reasoning / coding / file operations only Claude or Codex can do well?\n` +
    `2. If local is enough, which installed model fits best? Prefer a code-focused model for code questions, the vision model only if the message is about an attached image, otherwise the general one.\n` +
    `3. If this needs Claude or Codex AND looks like a multi-part task, sketch 2-4 short suggested steps to guide its approach. Otherwise leave this empty — don't invent steps for a simple question.\n\n` +
    `Calibration — you have a strong bias to over-escalate simple things. Correct examples:\n` +
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

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — confirmed empirically that hybrid-reasoning models
    // (qwen3 and similar) otherwise put their entire output into a separate
    // "thinking" field and leave "response" empty under format:'json',
    // which looks like a silent failure rather than the model just needing
    // this flag.
    body: JSON.stringify({ model: PLANNER_MODEL, prompt: planningPrompt, format: 'json', think: false, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);

  const data = await response.json();
  const parsed = JSON.parse(data.response);

  const validBackends = new Set(['ollama', 'claude', 'codex']);
  const backend = validBackends.has(parsed.backend) ? parsed.backend : 'ollama';
  const installedNames = new Set(candidatesForPrompt.map((m) => m.name));
  const localModel = backend === 'ollama' && installedNames.has(parsed.localModel) ? parsed.localModel : undefined;

  return {
    backend,
    localModel,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : 'planner decision',
    subtaskPlan: Array.isArray(parsed.subtaskPlan) ? parsed.subtaskPlan.slice(0, 4).map(String) : []
  };
}
