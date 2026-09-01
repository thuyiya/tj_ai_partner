const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

let state = { active: false, name: null, status: null, percent: 0, error: null, doneAt: null };
let controller = null;

export function pullStatus() {
  return state;
}

export function cancelPull() {
  if (!state.active || !controller) throw new Error('No pull in progress');
  controller.abort();
}

export async function startPull(name) {
  if (state.active) throw new Error(`Already pulling ${state.name}`);

  state = { active: true, name, status: 'starting', percent: 0, error: null, doneAt: null };
  controller = new AbortController();

  const response = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, stream: true }),
    signal: controller.signal
  });

  if (!response.ok || !response.body) {
    state = { ...state, active: false, error: `Ollama pull error ${response.status}`, doneAt: Date.now() };
    return;
  }

  // Runs in the background; caller does not await this.
  (async () => {
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          const update = JSON.parse(line);
          const percent = update.total
            ? Math.round(((update.completed ?? 0) / update.total) * 100)
            : state.percent;

          state = { ...state, status: update.status, percent, error: update.error ?? null };
        }
      }

      state = { ...state, active: false, percent: 100, status: 'success', doneAt: Date.now() };
    } catch (error) {
      const cancelled = error.name === 'AbortError';
      state = {
        ...state,
        active: false,
        status: cancelled ? 'cancelled' : state.status,
        error: cancelled ? null : error.message,
        doneAt: Date.now()
      };
    }
  })();
}
