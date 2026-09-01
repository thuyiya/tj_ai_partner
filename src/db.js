import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'router.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    prompt TEXT NOT NULL,
    backend TEXT NOT NULL,
    model TEXT,
    score INTEGER,
    reasons TEXT,
    forced INTEGER DEFAULT 0,
    has_image INTEGER DEFAULT 0,
    response TEXT,
    latency_ms INTEGER,
    cost_usd REAL,
    tokens_in INTEGER,
    tokens_out INTEGER,
    tokens_thinking INTEGER,
    error TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    permission_mode TEXT NOT NULL DEFAULT 'plan',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    images TEXT,
    backend TEXT,
    model TEXT,
    score INTEGER,
    latency_ms INTEGER,
    cost_usd REAL,
    tokens_in INTEGER,
    tokens_out INTEGER,
    error TEXT,
    visualization TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

  -- One row per saved credential; 'cli' rows carry no secret (they just mean
  -- "use whatever the claude/codex CLI is already logged into"). 'api_key'
  -- rows store only a Keychain account reference — the actual key lives in
  -- macOS Keychain (src/keychain.js), never in this DB or in any log.
  CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cli',
    keychain_account TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

const insertStatement = db.prepare(`
  INSERT INTO requests
    (created_at, prompt, backend, model, score, reasons, forced, has_image, response, latency_ms, cost_usd, tokens_in, tokens_out, tokens_thinking, error)
  VALUES
    (:created_at, :prompt, :backend, :model, :score, :reasons, :forced, :has_image, :response, :latency_ms, :cost_usd, :tokens_in, :tokens_out, :tokens_thinking, :error)
`);

export function logRequest(row) {
  insertStatement.run({
    created_at: new Date().toISOString(),
    prompt: row.prompt,
    backend: row.backend,
    model: row.model ?? null,
    score: row.score ?? null,
    reasons: JSON.stringify(row.reasons ?? []),
    forced: row.forced ? 1 : 0,
    has_image: row.hasImage ? 1 : 0,
    response: row.response ?? null,
    latency_ms: row.latencyMs ?? null,
    cost_usd: row.costUsd ?? null,
    tokens_in: row.tokensIn ?? null,
    tokens_out: row.tokensOut ?? null,
    tokens_thinking: row.tokensThinking ?? null,
    error: row.error ?? null
  });
}

export function recentRequests(limit = 50) {
  const rows = db
    .prepare('SELECT * FROM requests ORDER BY id DESC LIMIT ?')
    .all(limit);
  return rows.map((r) => ({ ...r, reasons: JSON.parse(r.reasons ?? '[]') }));
}

export function stats() {
  const totals = db
    .prepare(
      `SELECT backend,
              COUNT(*) AS count,
              AVG(latency_ms) AS avg_latency_ms,
              SUM(COALESCE(cost_usd, 0)) AS total_cost_usd
       FROM requests
       GROUP BY backend`
    )
    .all();

  const errorCount = db
    .prepare('SELECT COUNT(*) AS c FROM requests WHERE error IS NOT NULL')
    .get().c;

  const timeline = db
    .prepare(
      `SELECT substr(created_at, 1, 16) AS bucket, backend, COUNT(*) AS count
       FROM requests
       GROUP BY bucket, backend
       ORDER BY bucket ASC`
    )
    .all();

  // Per-model, not just per-backend — Claude Code alone can route a single
  // call across multiple underlying models (e.g. Haiku + Sonnet in one
  // turn), so "token spend per model" needs its own grouping to mean
  // anything.
  const byModel = db
    .prepare(
      `SELECT backend, model,
              COUNT(*) AS count,
              SUM(COALESCE(tokens_in, 0)) AS tokens_in,
              SUM(COALESCE(tokens_out, 0)) AS tokens_out,
              SUM(COALESCE(tokens_thinking, 0)) AS tokens_thinking,
              SUM(COALESCE(cost_usd, 0)) AS total_cost_usd,
              AVG(latency_ms) AS avg_latency_ms
       FROM requests
       WHERE model IS NOT NULL
       GROUP BY backend, model
       ORDER BY (tokens_in + tokens_out) DESC`
    )
    .all();

  return { totals, errorCount, timeline, byModel };
}

// ---------- projects ----------

export function createProject({ name, path: projectPath, permissionMode = 'plan' }) {
  const info = db
    .prepare('INSERT INTO projects (name, path, permission_mode, created_at) VALUES (?, ?, ?, ?)')
    .run(name, projectPath, permissionMode, new Date().toISOString());
  return getProject(Number(info.lastInsertRowid));
}

export function listProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY id DESC').all();
}

export function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) ?? null;
}

export function updateProjectPermission(id, permissionMode) {
  db.prepare('UPDATE projects SET permission_mode = ? WHERE id = ?').run(permissionMode, id);
  return getProject(id);
}

export function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ---------- sessions ----------

export function createSession({ projectId = null, title = null } = {}) {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO sessions (project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(projectId, title, now, now);
  return getSession(Number(info.lastInsertRowid));
}

export function listSessions() {
  return db
    .prepare(
      `SELECT s.*, p.name AS project_name,
              agg.total_tokens AS total_tokens,
              agg.last_backend AS last_backend,
              agg.last_model AS last_model
       FROM sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN (
         SELECT session_id,
                SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) AS total_tokens,
                (SELECT backend FROM messages m2 WHERE m2.session_id = m.session_id AND m2.role = 'assistant' ORDER BY m2.id DESC LIMIT 1) AS last_backend,
                (SELECT model FROM messages m2 WHERE m2.session_id = m.session_id AND m2.role = 'assistant' ORDER BY m2.id DESC LIMIT 1) AS last_model
         FROM messages m
         WHERE role = 'assistant'
         GROUP BY session_id
       ) agg ON agg.session_id = s.id
       ORDER BY s.updated_at DESC`
    )
    .all();
}

export function getSession(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) ?? null;
}

export function touchSession(id, title) {
  if (title) {
    db.prepare('UPDATE sessions SET updated_at = ?, title = COALESCE(title, ?) WHERE id = ?')
      .run(new Date().toISOString(), title, id);
  } else {
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }
}

export function renameSession(id, title) {
  db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
}

export function deleteSession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ---------- messages ----------

export function addMessage(row) {
  db.prepare(
    `INSERT INTO messages
      (session_id, role, content, images, backend, model, score, latency_ms, cost_usd, tokens_in, tokens_out, error, visualization, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.sessionId,
    row.role,
    row.content ?? '',
    JSON.stringify(row.images ?? []),
    row.backend ?? null,
    row.model ?? null,
    row.score ?? null,
    row.latencyMs ?? null,
    row.costUsd ?? null,
    row.tokensIn ?? null,
    row.tokensOut ?? null,
    row.error ?? null,
    row.visualization ? JSON.stringify(row.visualization) : null,
    new Date().toISOString()
  );
}

export function listMessages(sessionId) {
  return db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId)
    .map((m) => ({
      ...m,
      images: JSON.parse(m.images ?? '[]'),
      visualization: m.visualization ? JSON.parse(m.visualization) : null
    }));
}

// ---------- credentials ----------
// Secrets themselves live only in macOS Keychain (src/keychain.js) — this
// table only ever stores a reference (keychain_account), never a value.

export function listCredentials(provider) {
  return provider
    ? db.prepare('SELECT * FROM credentials WHERE provider = ? ORDER BY id ASC').all(provider)
    : db.prepare('SELECT * FROM credentials ORDER BY provider, id ASC').all();
}

export function getCredential(id) {
  return db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) ?? null;
}

export function getActiveCredential(provider) {
  return db.prepare('SELECT * FROM credentials WHERE provider = ? AND is_active = 1').get(provider) ?? null;
}

export function createCredential({ provider, label, type, keychainAccount = null }) {
  const info = db
    .prepare('INSERT INTO credentials (provider, label, type, keychain_account, is_active, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(provider, label, type, keychainAccount, new Date().toISOString());
  return getCredential(Number(info.lastInsertRowid));
}

export function activateCredential(id) {
  const cred = getCredential(id);
  if (!cred) return null;
  db.prepare('UPDATE credentials SET is_active = 0 WHERE provider = ?').run(cred.provider);
  db.prepare('UPDATE credentials SET is_active = 1 WHERE id = ?').run(id);
  return getCredential(id);
}

export function deleteCredential(id) {
  db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
}
