const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';

const VISION_PATTERNS = [/vision/i, /llava/i, /moondream/i, /bakllava/i, /minicpm-v/i];

export function isVisionModel(name = '') {
  return VISION_PATTERNS.some((p) => p.test(name));
}

export async function runLocal(prompt, { model = DEFAULT_MODEL, images = [], history = [] } = {}) {
  const startedAt = Date.now();

  const messages = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: prompt, ...(images.length ? { images } : {}) }
  ];

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  return {
    text: data.message?.content ?? '',
    model,
    latencyMs: Date.now() - startedAt,
    costUsd: 0,
    tokensIn: data.prompt_eval_count ?? null,
    tokensOut: data.eval_count ?? null
  };
}

export async function listModels() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  return (data.models ?? []).map((m) => ({
    name: m.name,
    sizeBytes: m.size,
    modifiedAt: m.modified_at,
    vision: isVisionModel(m.name)
  }));
}

export async function deleteModel(name) {
  const response = await fetch(`${OLLAMA_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
}
