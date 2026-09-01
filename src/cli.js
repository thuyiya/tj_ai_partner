import { routeTask } from './router.js';

const prompt = process.argv.slice(2).join(' ');

if (!prompt) {
  console.error('Usage: npm run cli -- "your task here"');
  process.exit(1);
}

const result = await routeTask(prompt);

console.log(`\n[routed to ${result.backend}] score=${result.score}`);
console.log(result.reasons.map((r) => `  - ${r}`).join('\n'));
console.log(`\n${result.text}\n`);
console.log(
  `(${result.latencyMs}ms, cost=$${(result.costUsd ?? 0).toFixed(4)})`
);
