// Always-local side analysis — never Claude, so it's free and doesn't touch
// the thing being analyzed. Two jobs: (1) a post-hoc "Visualize" breakdown of
// the final response, and (2) a live security scan of every file edit / shell
// command Claude actually executes, fired the moment the tool_use event
// arrives (not after the whole task finishes).
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const ANALYSIS_MODEL = process.env.OLLAMA_ANALYSIS_MODEL ?? 'llama3.2:3b';

async function generateJson(prompt) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — see planner.js: hybrid-reasoning models otherwise leave
    // "response" empty and put everything in a separate "thinking" field.
    body: JSON.stringify({ model: ANALYSIS_MODEL, prompt, format: 'json', think: false, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.response);
}

function coerceSummary(parsed) {
  return {
    format: 'summary',
    summary: String(parsed.summary ?? '').slice(0, 300),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5).map(String) : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 6).map(String) : []
  };
}

// The model picks the format itself — a chart only when the response
// genuinely contains comparable numeric data, a Mermaid diagram only for a
// described process/flow, otherwise the plain summary card. Every branch
// falls back to `summary` on malformed output — a broken visualization must
// never break the chat reply, and a wrong chart is worse than no chart.
export async function visualizeResponse(userPrompt, responseText) {
  try {
    const parsed = await generateJson(
      `Analyze this AI response and pick the best way to visualize it. User asked: "${userPrompt.slice(0, 500)}"\n\n` +
        `Response:\n${responseText.slice(0, 3000)}\n\n` +
        `Respond with JSON only, matching exactly ONE of these three shapes:\n\n` +
        `1) Plain summary (default choice — use this unless one of the others clearly fits better):\n` +
        `{"format":"summary","summary":"one sentence","keyPoints":["short point", ...max 5],"topics":["short tag", ...max 6]}\n\n` +
        `2) Chart — ONLY if the response contains genuinely comparable numeric data (e.g. sizes, counts, percentages across a few named items):\n` +
        `{"format":"chart","summary":"one sentence","chart":{"title":"short title","unit":"e.g. GB, %, ms (or empty string)","labels":["A","B","C"],"values":[1,2,3]}}\n\n` +
        `3) Mermaid diagram — ONLY if the response describes a sequential process, decision flow, or system/architecture relationship:\n` +
        `{"format":"mermaid","summary":"one sentence","mermaid":"flowchart TD\\n  A[Start] --> B[Step]\\n  B --> C[End]"}\n` +
        `Mermaid syntax rules: use flowchart TD or sequenceDiagram only; keep node labels short and plain text (no special characters that could break parsing); escape newlines as \\n within the JSON string.\n\n` +
        `Examples of picking correctly:\n` +
        `- Response mentions "Model A: 12GB, Model B: 8GB, Model C: 20GB" -> use format "chart" with those exact labels/values. Do not use "summary" for this case.\n` +
        `- Response says "First X happens, then Y, then Z" -> use format "mermaid" with a flowchart of those steps. Do not use "summary" for this case.\n` +
        `- Response is an explanation, opinion, or answer with no comparable numbers and no described sequence -> use format "summary".\n` +
        `Default to "summary" only when neither of the other two patterns is actually present — don't default to it out of caution when the data or steps are clearly there.`
    );

    if (parsed.format === 'chart' && parsed.chart) {
      const { labels, values } = parsed.chart;
      if (Array.isArray(labels) && Array.isArray(values) && labels.length && labels.length === values.length && values.every((v) => typeof v === 'number')) {
        return {
          format: 'chart',
          summary: String(parsed.summary ?? '').slice(0, 300),
          chart: {
            title: String(parsed.chart.title ?? '').slice(0, 100),
            unit: String(parsed.chart.unit ?? '').slice(0, 20),
            labels: labels.slice(0, 12).map((l) => String(l).slice(0, 40)),
            values: values.slice(0, 12)
          }
        };
      }
    }

    if (parsed.format === 'mermaid' && typeof parsed.mermaid === 'string' && parsed.mermaid.trim()) {
      return {
        format: 'mermaid',
        summary: String(parsed.summary ?? '').slice(0, 300),
        mermaid: parsed.mermaid.slice(0, 4000)
      };
    }

    return coerceSummary(parsed);
  } catch {
    return null; // Best-effort — a broken visualization must never break the chat reply.
  }
}

const SEVERITIES = new Set(['info', 'warning', 'critical']);

export async function securityReviewSnippet(kind, label, content) {
  try {
    const parsed = await generateJson(
      `You are a security reviewer. A coding agent just performed this action: ${kind} on "${label}".\n\n` +
        `Content:\n${content.slice(0, 3000)}\n\n` +
        `Look for: hardcoded secrets/API keys/passwords, injection risks (SQL/command/shell), unsafe deserialization, ` +
        `path traversal, disabled security checks, destructive commands (rm -rf, force push, DROP TABLE), or other real security concerns. ` +
        `Hardcoded live-looking credentials are always "critical". If genuinely nothing stands out, return an empty findings array — don't invent minor style nitpicks.\n\n` +
        `Respond with JSON only: {"findings": [{"severity": "info|warning|critical", "title": "short", "detail": "one sentence"}]}`
    );
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    return findings
      .filter((f) => f && typeof f.title === 'string')
      .map((f) => ({
        severity: SEVERITIES.has(f.severity) ? f.severity : 'info',
        title: String(f.title).slice(0, 140),
        detail: String(f.detail ?? '').slice(0, 400)
      }));
  } catch {
    return [];
  }
}
