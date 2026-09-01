// "What is this project, and how does it work?" — always local, free, same
// reasoning as localAnalysis.js: this never touches Claude/Codex, so loading
// a project never costs anything. Three stages: (1) scan the real folder for
// a directory tree + manifest/README signals, (2) best-effort parse any SQL
// schema into an ER diagram, (3) ask a local model to synthesize purpose /
// tech stack / architecture from (1), and stitch it all into one self-
// contained HTML report saved into the project's own .ai-with-tj/ folder —
// same "it's a real file you can see in Finder" pattern as sources/skill.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
// qwen3:4b, not the smaller default — this is a synthesis/judgment task
// (same category as planner.js's routing call), not a bounded lookup.
const PROJECT_MODEL = process.env.OLLAMA_PROJECT_MODEL ?? 'qwen3:4b';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.ai-with-tj', 'dist', 'build', '.next', '.nuxt',
  '.venv', 'venv', '__pycache__', '.cache', 'coverage', 'tmp', 'target',
  '.expo', 'Pods', '.gradle', '.idea', '.vscode', 'vendor', '.terraform'
]);
const MAX_TREE_ENTRIES = 4000;
const MAX_TREE_DEPTH = 14;
const MAX_FILE_BYTES = 300_000;
const MANIFEST_NAMES = [
  'README.md', 'AGENTS.md', 'CLAUDE.md', 'package.json', 'Gemfile',
  'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
  'composer.json', 'Dockerfile', 'docker-compose.yml'
];

function overviewDir(project) {
  const dir = path.join(project.path, '.ai-with-tj');
  mkdirSync(dir, { recursive: true });
  return dir;
}
function overviewJsonPath(project) {
  return path.join(overviewDir(project), 'PROJECT_OVERVIEW.json');
}
function overviewHtmlPath(project) {
  return path.join(overviewDir(project), 'PROJECT_OVERVIEW.html');
}

// ---------- file tree ----------

export function scanTree(rootPath) {
  let entryCount = 0;
  let truncated = false;

  function walk(dir, depth) {
    if (truncated || depth > MAX_TREE_DEPTH) return [];
    let names;
    try {
      names = readdirSync(dir).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
    const nodes = [];
    for (const name of names) {
      if (truncated) break;
      if (name.startsWith('.') && name !== '.env.example') continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        entryCount++;
        if (entryCount > MAX_TREE_ENTRIES) { truncated = true; break; }
        nodes.push({ name, type: 'dir', children: walk(full, depth + 1) });
      } else {
        entryCount++;
        if (entryCount > MAX_TREE_ENTRIES) { truncated = true; break; }
        nodes.push({ name, type: 'file', sizeBytes: stat.size });
      }
    }
    return nodes;
  }

  const tree = walk(rootPath, 0);
  return { tree, truncated, entryCount };
}

function flattenFiles(nodes, prefix = '') {
  const out = [];
  for (const node of nodes) {
    const rel = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'dir') out.push(...flattenFiles(node.children, rel));
    else out.push({ path: rel, sizeBytes: node.sizeBytes });
  }
  return out;
}

export function buildFileStats(tree) {
  const files = flattenFiles(tree);
  const byExtension = {};
  let totalBytes = 0;
  for (const f of files) {
    const ext = path.extname(f.path).toLowerCase() || '(none)';
    byExtension[ext] = (byExtension[ext] ?? 0) + 1;
    totalBytes += f.sizeBytes;
  }
  const topExtensions = Object.entries(byExtension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, count]) => ({ ext, count }));
  return { totalFiles: files.length, totalBytes, topExtensions };
}

// ---------- safe single-file read (for the "select a file, ask about it" UI) ----------

export function readProjectFile(project, relPath) {
  const resolved = path.resolve(project.path, relPath);
  const root = path.resolve(project.path) + path.sep;
  if (!resolved.startsWith(root)) throw new Error('path escapes project folder');
  const stat = statSync(resolved);
  if (!stat.isFile()) throw new Error('not a file');

  // Bounded read via fd, not readFileSync — a stray multi-GB binary sitting
  // in the project folder must never be pulled fully into memory just
  // because someone clicked it in the tree.
  const readBytes = Math.min(stat.size, MAX_FILE_BYTES);
  const buffer = Buffer.alloc(readBytes);
  const fd = openSync(resolved, 'r');
  try {
    readSync(fd, buffer, 0, readBytes, 0);
  } finally {
    closeSync(fd);
  }

  const binary = buffer.subarray(0, 8000).includes(0);
  if (binary) return { path: relPath, binary: true, sizeBytes: stat.size, content: '' };

  const truncated = stat.size > MAX_FILE_BYTES;
  return { path: relPath, binary: false, truncated, sizeBytes: stat.size, content: buffer.toString('utf8') };
}

// ---------- manifests / README signal ----------

function collectManifests(rootPath) {
  const parts = [];
  for (const name of MANIFEST_NAMES) {
    const full = path.join(rootPath, name);
    if (!existsSync(full)) continue;
    try {
      const content = readFileSync(full, 'utf8').slice(0, 3000);
      parts.push(`--- ${name} ---\n${content}`);
    } catch {
      // unreadable — skip
    }
  }
  return parts.join('\n\n');
}

// ---------- SQL schema -> ER diagram (best-effort, not a full SQL parser) ----------

function findSqlFiles(rootPath, max = 60) {
  const found = [];
  function walk(dir, depth) {
    if (found.length >= max || depth > MAX_TREE_DEPTH) return;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (found.length >= max) return;
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        walk(full, depth + 1);
      } else if (name.toLowerCase().endsWith('.sql')) {
        found.push(full);
      }
    }
  }
  walk(rootPath, 0);
  return found;
}

// Scans forward from `startIndex` (the '(' right after the table name) and
// returns the index of its matching ')', respecting nested parens (needed
// because column definitions like VARCHAR(100) contain their own parens).
function matchParen(text, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0, current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function cleanIdentifier(raw) {
  return raw.replace(/[[\]"`]/g, '').trim();
}

export function parseSqlSchema(rootPath) {
  const files = findSqlFiles(rootPath);
  const tables = new Map(); // name -> { columns: [{name, type}], foreignKeys: [{column, refTable}] }
  const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)\s*\(/gi;
  const FK_INLINE_RE = /REFERENCES\s+([\w."`[\]]+)/i;
  const FK_CONSTRAINT_RE = /FOREIGN\s+KEY\s*\(([\w,"`[\]\s]+)\)\s*REFERENCES\s+([\w."`[\]]+)/i;

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8').slice(0, 200_000);
    } catch {
      continue;
    }
    let match;
    while ((match = CREATE_TABLE_RE.exec(text))) {
      const rawName = match[1];
      const tableName = cleanIdentifier(rawName.split('.').pop());
      const openParen = match.index + match[0].length - 1;
      const closeParen = matchParen(text, openParen);
      if (closeParen === -1) continue;
      const body = text.slice(openParen + 1, closeParen);

      if (!tables.has(tableName)) tables.set(tableName, { columns: [], foreignKeys: [] });
      const table = tables.get(tableName);

      for (const rawLine of splitTopLevel(body)) {
        const line = rawLine.trim();
        if (!line) continue;
        const upper = line.toUpperCase();
        const fkConstraint = line.match(FK_CONSTRAINT_RE);
        if (fkConstraint) {
          const cols = fkConstraint[1].split(',').map((c) => cleanIdentifier(c));
          const refTable = cleanIdentifier(fkConstraint[2].split('.').pop());
          for (const col of cols) table.foreignKeys.push({ column: col, refTable });
          continue;
        }
        if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT)/.test(upper)) continue; // other table-level constraints, not a column

        const colMatch = line.match(/^([\w"`[\]]+)\s+([\w()]+)/);
        if (!colMatch) continue;
        const columnName = cleanIdentifier(colMatch[1]);
        const columnType = colMatch[2];
        table.columns.push({ name: columnName, type: columnType });

        const inlineRef = line.match(FK_INLINE_RE);
        if (inlineRef) {
          table.foreignKeys.push({ column: columnName, refTable: cleanIdentifier(inlineRef[1].split('.').pop()) });
        }
      }
    }
  }

  return { fileCount: files.length, tables };
}

export function buildErDiagram(tables, maxTables = 40) {
  if (!tables.size) return null;
  const names = [...tables.keys()].slice(0, maxTables);
  const nameSet = new Set(names);
  const lines = ['erDiagram'];

  for (const name of names) {
    const table = tables.get(name);
    lines.push(`  ${name} {`);
    for (const col of table.columns.slice(0, 25)) {
      const safeType = (col.type || 'TEXT').replace(/[^\w]/g, '_') || 'TEXT';
      const safeName = col.name.replace(/[^\w]/g, '_');
      if (safeName) lines.push(`    ${safeType} ${safeName}`);
    }
    lines.push('  }');
  }

  const seen = new Set();
  for (const name of names) {
    for (const fk of tables.get(name).foreignKeys) {
      if (!nameSet.has(fk.refTable) || fk.refTable === name) continue;
      const key = `${name}->${fk.refTable}->${fk.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${fk.refTable} ||--o{ ${name} : "${fk.column}"`);
    }
  }

  return lines.join('\n');
}

// ---------- AI synthesis (local, free) ----------

function describeTreeForPrompt(tree, prefix = '', depth = 0, maxLines = 250, acc = []) {
  if (acc.length >= maxLines) return acc;
  for (const node of tree) {
    if (acc.length >= maxLines) break;
    const label = node.type === 'dir' ? `${prefix}${node.name}/` : `${prefix}${node.name}`;
    acc.push(label);
    if (node.type === 'dir' && depth < 3) describeTreeForPrompt(node.children, `${prefix}  `, depth + 1, maxLines, acc);
  }
  return acc;
}

async function synthesize({ projectName, treeLines, manifests, sqlSummary }) {
  const prompt =
    `You are analyzing a real software project's folder to explain it to someone opening it for the first time.\n\n` +
    `Project name: "${projectName}"\n\n` +
    `Folder structure (partial):\n${treeLines.join('\n')}\n\n` +
    `Manifest / README file contents found:\n${manifests || '(none found)'}\n\n` +
    `${sqlSummary ? `Database schema detected: ${sqlSummary}\n\n` : ''}` +
    `Respond with JSON only, matching exactly:\n` +
    `{"purpose":"1-2 sentence plain-language description of what this project is and does",` +
    `"techStack":["short tag", "..."],` +
    `"architecture":"a short paragraph describing how the main pieces fit together and communicate",` +
    `"keyFiles":[{"path":"relative/path","why":"one short phrase"}],` +
    `"flowDiagram":"a mermaid flowchart TD string describing the main components and how data/requests flow between them, using short plain-text node labels, newlines escaped as \\n"}`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — see planner.js: hybrid-reasoning models otherwise leave
    // "response" empty and put everything into a separate "thinking" field.
    body: JSON.stringify({ model: PROJECT_MODEL, prompt, format: 'json', think: false, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}`);
  const data = await response.json();
  const parsed = JSON.parse(data.response);

  return {
    purpose: String(parsed.purpose ?? '').slice(0, 600),
    techStack: Array.isArray(parsed.techStack) ? parsed.techStack.slice(0, 14).map(String) : [],
    architecture: String(parsed.architecture ?? '').slice(0, 1500),
    keyFiles: Array.isArray(parsed.keyFiles)
      ? parsed.keyFiles.slice(0, 10).map((f) => ({ path: String(f.path ?? '').slice(0, 200), why: String(f.why ?? '').slice(0, 150) }))
      : [],
    flowDiagram: typeof parsed.flowDiagram === 'string' ? parsed.flowDiagram.slice(0, 4000) : ''
  };
}

// ---------- HTML report ----------

function escapeHtml(s) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function buildOverviewHtml({ project, analysis, erDiagram, stats, generatedAt }) {
  const techBadges = analysis.techStack.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('') || '<span class="empty">Not detected</span>';
  const keyFilesRows = analysis.keyFiles.length
    ? analysis.keyFiles.map((f) => `<tr><td><code>${escapeHtml(f.path)}</code></td><td>${escapeHtml(f.why)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">None identified</td></tr>';
  const extRows = stats.topExtensions.map((e) => `<tr><td>${escapeHtml(e.ext)}</td><td>${e.count}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(project.name)} — Project Overview</title>
<style>
:root{ --page:#f9f9f7; --surface:#fff; --surface-2:#f2f1ee; --text:#0b0b0b; --text-2:#52514e; --muted:#898781; --border:rgba(11,11,11,.1); --accent:#2a78d6; }
@media (prefers-color-scheme: dark){ :root{ --page:#0b0b0c; --surface:#161617; --surface-2:#1e1e20; --text:#f2f2f0; --text-2:#b3b1a8; --muted:#7c7a73; --border:rgba(255,255,255,.08); --accent:#3987e5; } }
*{box-sizing:border-box;}
body{margin:0;background:var(--page);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55;}
.wrap{max-width:920px;margin:0 auto;padding:48px 24px 80px;}
h1{font-size:28px;margin:0 0 6px;letter-spacing:-0.01em;}
.meta{color:var(--muted);font-size:13px;margin-bottom:28px;}
.purpose{font-size:17px;color:var(--text-2);margin-bottom:28px;}
section{margin-bottom:36px;}
h2{font-size:16px;margin:0 0 14px;color:var(--text);border-top:1px solid var(--border);padding-top:24px;}
.badge{display:inline-block;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:4px 12px;font-size:12.5px;margin:0 6px 6px 0;}
.empty{color:var(--muted);font-style:italic;font-size:13px;}
table{width:100%;border-collapse:collapse;font-size:13.5px;}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);}
th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;}
code{background:var(--surface-2);padding:2px 6px;border-radius:5px;font-size:.9em;}
.mermaid{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;overflow-x:auto;}
.arch{color:var(--text-2);white-space:pre-wrap;}
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(project.name)}</h1>
  <div class="meta">Auto-generated by TJ AI Partner (local model, no cloud calls) · ${escapeHtml(generatedAt)} · ${stats.totalFiles} files scanned</div>
  <div class="purpose">${escapeHtml(analysis.purpose) || '<span class="empty">Could not determine purpose.</span>'}</div>

  <section>
    <h2>Tech stack</h2>
    ${techBadges}
  </section>

  <section>
    <h2>Architecture</h2>
    <div class="arch">${escapeHtml(analysis.architecture) || '<span class="empty">Not enough signal to describe architecture.</span>'}</div>
  </section>

  ${analysis.flowDiagram ? `<section><h2>How it connects</h2><pre class="mermaid">${escapeHtml(analysis.flowDiagram)}</pre></section>` : ''}

  ${erDiagram ? `<section><h2>Database schema</h2><pre class="mermaid">${escapeHtml(erDiagram)}</pre></section>` : ''}

  <section>
    <h2>Key files</h2>
    <table><thead><tr><th>Path</th><th>Why it matters</th></tr></thead><tbody>${keyFilesRows}</tbody></table>
  </section>

  <section>
    <h2>File composition</h2>
    <table><thead><tr><th>Extension</th><th>Count</th></tr></thead><tbody>${extRows}</tbody></table>
  </section>
</div>
<script src="/vendor/mermaid.min.js"></script>
<script>
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: true, theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default', securityLevel: 'strict' });
  }
</script>
</body>
</html>`;
}

// ---------- orchestration ----------

export async function analyzeProject(project) {
  const { tree, truncated } = scanTree(project.path);
  const stats = buildFileStats(tree);
  const manifests = collectManifests(project.path);
  const { tables } = parseSqlSchema(project.path);
  const erDiagram = buildErDiagram(tables);
  const treeLines = describeTreeForPrompt(tree);
  const sqlSummary = tables.size ? `${tables.size} table(s) found: ${[...tables.keys()].slice(0, 30).join(', ')}` : '';

  const analysis = await synthesize({ projectName: project.name, treeLines, manifests, sqlSummary });
  const generatedAt = new Date().toISOString();
  const html = buildOverviewHtml({ project, analysis, erDiagram, stats, generatedAt });

  const record = { analysis, erDiagram, stats, treeTruncated: truncated, generatedAt };
  const dir = overviewDir(project);
  try {
    writeFileSync(overviewJsonPath(project), JSON.stringify(record, null, 2), 'utf8');
    writeFileSync(overviewHtmlPath(project), html, 'utf8');
  } catch {
    // Best-effort persistence — the caller still gets the freshly computed
    // result back even if this project's folder isn't writable.
  }

  return record;
}

export function loadCachedOverview(project) {
  const file = overviewJsonPath(project);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function loadOverviewHtml(project) {
  const file = overviewHtmlPath(project);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}
