// Heuristic router: decides whether a task is small enough for the local
// model or needs Claude. Transparent by design — every decision records the
// score and the exact reasons, so the dashboard can show *why*, not just *what*.

const BIG_KEYWORDS = [
  'architecture', 'design', 'refactor', 'plan', 'debug', 'algorithm',
  'optimize', 'complex', 'migrate', 'security', 'review', 'codebase',
  'multi-step', 'research', 'strategy', 'implement', 'write tests',
  'integration', 'performance', 'schema', 'distributed', 'concurrency',
  'edge case', 'trade-off', 'tradeoff', 'compare approaches', 'comprehensive',
  'entire project', 'repository', 'explain in depth', 'root cause'
];

const SMALL_KEYWORDS = [
  'summarize', 'translate', 'rephrase', 'rewrite', 'fix typo', 'format',
  'convert', 'define', 'spell', 'short', 'quick', 'simple', 'extract',
  'capitalize', 'lowercase', 'uppercase', 'count', 'sentiment', 'classify',
  'tag', 'label', 'one-line', 'tldr', 'tl;dr', 'grammar', 'proofread',
  'rename', 'snake case', 'camel case', 'json', 'yaml', 'csv', 'uuid',
  'hash', 'base64', 'regex', 'boilerplate'
];

// Detects image-generation intent so it can be handled transparently under
// Auto/Local — the user shouldn't need a manual "Image" mode toggle just to
// ask for a picture.
const IMAGE_KEYWORDS = [
  'generate an image', 'generate a picture', 'create an image', 'create a picture',
  'draw a', 'draw an', 'draw me', 'paint a', 'paint an', 'illustrate',
  'make an image', 'make a picture', 'picture of', 'image of', 'photo of',
  'render a', 'render an', 'a drawing of', 'an illustration of'
];

export function isImageRequest(prompt) {
  const text = prompt.toLowerCase();
  return IMAGE_KEYWORDS.some((k) => text.includes(k));
}

export const DEFAULT_THRESHOLD = 2;

export function classify(prompt, threshold = DEFAULT_THRESHOLD) {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const reasons = [];
  let score = 0;

  if (wordCount > 120) {
    score += 3;
    reasons.push(`long prompt (${wordCount} words) +3`);
  } else if (wordCount > 60) {
    score += 1;
    reasons.push(`medium-length prompt (${wordCount} words) +1`);
  } else {
    reasons.push(`short prompt (${wordCount} words)`);
  }

  for (const keyword of BIG_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 2;
      reasons.push(`matched big-task keyword "${keyword}" +2`);
    }
  }

  for (const keyword of SMALL_KEYWORDS) {
    if (text.includes(keyword)) {
      score -= 2;
      reasons.push(`matched small-task keyword "${keyword}" -2`);
    }
  }

  const backend = score >= threshold ? 'claude' : 'ollama';
  reasons.push(`score ${score} >= threshold ${threshold} -> ${backend}`);

  return { backend, score, reasons };
}
