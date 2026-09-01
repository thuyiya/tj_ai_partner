import { spawn } from 'node:child_process';

export const IMAGE_MODEL_LABEL = 'FLUX.1 [schnell] (Draw Things, local)';
const DEFAULT_MODEL = process.env.DRAWTHINGS_MODEL ?? 'flux_1_schnell_q8p.ckpt';
const TIMEOUT_MS = 180_000;

// Runs Draw Things' CLI (Core ML/MPS, native Apple Silicon acceleration) to
// generate an image entirely locally — no cloud, no API key. Chosen over
// ComfyUI specifically because it ships a plain CLI that fits this app's
// existing "shell out, get a result" pattern instead of needing a whole
// separate Python server process.
export function generateImage(prompt, { outputPath, width, height, model = DEFAULT_MODEL } = {}) {
  const startedAt = Date.now();
  const args = ['generate', '--model', model, '--prompt', prompt, '--output', outputPath];
  if (width) args.push('--width', String(width));
  if (height) args.push('--height', String(height));

  return new Promise((resolve, reject) => {
    const child = spawn('draw-things-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let stdout = '';
    let settled = false;

    const timeout = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (error) => finish(() => reject(error)));

    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `draw-things-cli exited with code ${code}`));
          return;
        }
        resolve({ latencyMs: Date.now() - startedAt, model });
      });
    });
  });
}
