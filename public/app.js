const tooltip = document.getElementById('tooltip');

// Real Lucide icon paths (fetched from lucide-static, not hand-drawn) —
// inlined as plain SVG strings since this app has no bundler/icon-font step.
const ICON_PATHS = {
  search: '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
  'bar-chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect x="2" y="4" width="20" height="16" rx="2" />',
  calendar: '<path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />',
  terminal: '<path d="M12 19h8" /><path d="m4 17 6-6-6-6" />',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />',
  globe: '<circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />',
  'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
  'check-circle': '<circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" />',
  'x-circle': '<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />',
  bot: '<path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />',
  clock: '<circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />',
  'chevron-up': '<path d="m18 15-6-6-6 6" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  'trash-2': '<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
  'arrow-left': '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />',
  'code-2': '<path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" />',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />'
};

function icon(name, size = 15) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">${ICON_PATHS[name] ?? ''}</svg>`;
}

// Heuristic only — picks a representative icon for a task description /
// tool name. Purely cosmetic; never used to decide behavior.
function iconForTask(text = '') {
  const t = text.toLowerCase();
  if (/research|search|find|investigat/.test(t)) return 'search';
  if (/data|analy|report|chart|stat/.test(t)) return 'bar-chart';
  if (/writ|draft|edit|content|blog/.test(t)) return 'pencil';
  if (/email|mail/.test(t)) return 'mail';
  if (/schedul|calendar|meeting/.test(t)) return 'calendar';
  if (/database|sql|query/.test(t)) return 'database';
  if (/api|http|fetch|request|web|url/.test(t)) return 'globe';
  if (/command|shell|bash|run |script/.test(t)) return 'terminal';
  if (/read|file|open/.test(t)) return 'file-text';
  if (/code|function|implement/.test(t)) return 'code-2';
  return 'bot';
}

// Newer families added on request after seeing a benchmark of Qwen3.5-122B /
// GLM-5 / MiniMax-M2.5 style workstation models — those specific sizes need
// hundreds of GB of RAM (that benchmark ran on a 512GB M3 Ultra) and aren't
// realistic on a laptop, so these are the practically-sized siblings from
// the same current generation that Ollama actually serves.
const CURATED_MODELS = [
  'llama3.2:3b', 'llama3.2:1b', 'qwen2.5:7b', 'qwen2.5-coder:7b',
  'qwen3:4b', 'qwen3:8b', 'deepseek-r1:8b', 'gemma3:4b', 'gpt-oss:20b',
  'phi3.5', 'moondream', 'llava:7b'
];

const state = {
  conversation: [],
  attachments: [],
  contextChips: [],   // [{label, text}] from connectors (e.g. GitHub)
  routeMode: 'auto',
  model: null,
  threshold: 2,
  currentSessionId: null,
  currentProjectId: null,
  projects: [],
  sessions: []
};

// ---------- helpers ----------

function fmtMoney(n) { return `$${(n ?? 0).toFixed(4)}`; }
function fmtMs(n) {
  if (n == null) return '—';
  return n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`;
}
function fmtElapsed(startedAt) {
  return `${Math.max(0, Math.round((Date.now() - startedAt) / 1000))}s`;
}
function fmtRelative(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function escapeHtml(s) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
const BACKEND_META = {
  ollama: { label: 'Local', cls: 'local' },
  claude: { label: 'Claude', cls: 'claude' },
  codex: { label: 'Codex', cls: 'codex' },
  // 'image' deliberately has no categorical hue — the validator confirmed a
  // 4th chart color genuinely fails CVD/contrast checks here (all-pairs
  // ΔE collapses below the floor in both light and dark), matching the
  // palette doc's own warning about a 4th slot. Shown as a neutral badge and
  // excluded from the categorical activity chart rather than forcing it.
  image: { label: 'Image', cls: 'image' }
};
function badge(backend, extra = '') {
  const meta = BACKEND_META[backend] ?? BACKEND_META.ollama;
  return `<span class="badge ${meta.cls}">${escapeHtml(meta.label)}${extra}</span>`;
}
async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
}

// ---------- composer ----------

const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const attachmentRow = document.getElementById('attachmentRow');
const contextChipRow = document.getElementById('contextChipRow');
const routePill = document.getElementById('routePill');

function autoGrow() {
  promptEl.style.height = 'auto';
  promptEl.style.height = Math.min(160, promptEl.scrollHeight) + 'px';
}
promptEl.addEventListener('input', () => { autoGrow(); syncSendEnabled(); });
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

function syncSendEnabled() {
  sendBtn.disabled = !promptEl.value.trim() && state.attachments.length === 0;
}

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  for (const file of fileInput.files) {
    state.attachments.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  fileInput.value = '';
  renderAttachments();
  syncSendEnabled();
});

function renderAttachments() {
  attachmentRow.innerHTML = state.attachments.map((a, i) => `
    <div class="attachment-chip"><img src="${a.previewUrl}" /><button data-i="${i}">✕</button></div>`).join('');
  attachmentRow.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.attachments.splice(Number(btn.dataset.i), 1);
      renderAttachments();
      syncSendEnabled();
    });
  });
}

function renderContextChips() {
  contextChipRow.innerHTML = state.contextChips.map((c, i) =>
    `<div class="context-chip">${escapeHtml(c.label)} <button data-i="${i}">✕</button></div>`).join('');
  contextChipRow.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.contextChips.splice(Number(btn.dataset.i), 1);
      renderContextChips();
    });
  });
}

const ROUTE_MODE_ORDER = ['auto', 'ollama', 'claude', 'codex'];
function updateRoutePillLabel() {
  const labels = { auto: 'Auto-route', ollama: 'Force local', claude: 'Force Claude', codex: 'Force Codex' };
  routePill.textContent = labels[state.routeMode];
}
routePill.addEventListener('click', () => {
  state.routeMode = ROUTE_MODE_ORDER[(ROUTE_MODE_ORDER.indexOf(state.routeMode) + 1) % ROUTE_MODE_ORDER.length];
  updateRoutePillLabel();
  syncSegmented();
});

// ---------- GitHub connector popover ----------

const ghBtn = document.getElementById('ghBtn');
const ghPopover = document.getElementById('ghPopover');
const ghRepo = document.getElementById('ghRepo');
const ghNumber = document.getElementById('ghNumber');
const ghFetchBtn = document.getElementById('ghFetchBtn');
const ghError = document.getElementById('ghError');
let ghType = 'issue';

ghBtn.addEventListener('click', async () => {
  ghPopover.hidden = !ghPopover.hidden;
  if (!ghPopover.hidden && !ghRepo.value && state.currentProjectId) {
    try {
      const { repo } = await getJSON(`/api/connectors/github/repo?projectId=${state.currentProjectId}`);
      if (repo) ghRepo.value = repo;
    } catch { /* no repo detected, leave blank */ }
  }
});
ghPopover.querySelectorAll('.segmented button').forEach((btn) => {
  btn.addEventListener('click', () => {
    ghType = btn.dataset.type;
    ghPopover.querySelectorAll('.segmented button').forEach((b) => b.classList.toggle('active', b === btn));
  });
});
ghFetchBtn.addEventListener('click', async () => {
  const repo = ghRepo.value.trim();
  const number = ghNumber.value.trim();
  if (!repo || !number) { ghError.textContent = 'repo and number required'; return; }
  ghError.textContent = 'Fetching…';
  try {
    const ctx = await getJSON(`/api/connectors/github/context?repo=${encodeURIComponent(repo)}&number=${number}&type=${ghType}`);
    state.contextChips.push(ctx);
    renderContextChips();
    ghNumber.value = '';
    ghError.textContent = '';
    ghPopover.hidden = true;
  } catch (err) {
    ghError.textContent = err.message;
  }
});
document.addEventListener('click', (e) => {
  if (!ghPopover.hidden && !ghPopover.contains(e.target) && e.target !== ghBtn) ghPopover.hidden = true;
});

// ---------- messages ----------

const messagesInner = document.getElementById('messagesInner');
const emptyState = document.getElementById('emptyState');

function renderConversation() {
  emptyState.style.display = state.conversation.length ? 'none' : 'flex';
  const html = state.conversation.map((m, i) => {
    if (m.role === 'user') {
      const thumbs = m.images?.length ? `<div class="thumbs">${m.images.map((src) => `<img src="${src}" />`).join('')}</div>` : '';
      return `<div class="msg user">${thumbs}<div class="bubble">${escapeHtml(m.content)}</div></div>`;
    }
    if (m.pending) {
      return `<div class="msg assistant" data-i="${i}">
        <div class="thinking"><span class="dots"><span></span><span></span><span></span></span>${m.label || 'Thinking…'}</div>
      </div>`;
    }
    if (m.error) {
      return `<div class="msg assistant" data-i="${i}">
        <div class="bubble">${escapeHtml(m.error)}</div>
        <div class="msg-meta">${badge(m.backend || 'ollama')} <span class="badge error">error</span></div>
      </div>`;
    }
    const viz = m.visualization;
    const generated = m.images?.length ? `<div class="generated-images">${m.images.map((src) => `<img src="${src}" />`).join('')}</div>` : '';
    return `<div class="msg assistant" data-i="${i}">
      ${generated}
      <div class="bubble">${escapeHtml(m.content)}</div>
      <div class="msg-meta">${badge(m.backend)} <span>${fmtMs(m.meta?.latencyMs)} · ${fmtMoney(m.meta?.costUsd)}${m.meta?.score != null ? ` · score ${m.meta.score}` : ''}</span></div>
      ${viz ? `<button class="viz-btn" data-viz-open="${i}">${icon('sparkles', 12)} Visualize</button>` : ''}
    </div>`;
  }).join('');

  messagesInner.innerHTML = html || '';
  if (!state.conversation.length) messagesInner.appendChild(emptyState);
  messagesInner.querySelectorAll('[data-viz-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = state.conversation[Number(btn.dataset.vizOpen)];
      openModal('Visualize', renderVisualization(m.visualization));
    });
  });
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

async function send() {
  const text = promptEl.value.trim();
  if (!text && state.attachments.length === 0) return;

  const chipContext = state.contextChips.map((c) => c.text).join('\n\n---\n\n');
  const fullPrompt = chipContext ? `${chipContext}\n\n---\n\n${text}` : text;

  const imagePreviews = state.attachments.map((a) => a.previewUrl);
  const filesToSend = state.attachments.map((a) => a.file);
  const targetSessionId = state.currentSessionId;
  const targetProjectId = state.currentProjectId;

  state.conversation.push({ role: 'user', content: text, images: imagePreviews });
  const pendingIndex = state.conversation.length;
  state.conversation.push({
    role: 'assistant', pending: true,
    label: state.routeMode === 'image' ? 'Generating image…' : filesToSend.length ? 'Looking at image…' : 'Routing…'
  });

  promptEl.value = '';
  autoGrow();
  state.attachments = [];
  state.contextChips = [];
  renderAttachments();
  renderContextChips();
  syncSendEnabled();
  renderConversation();

  const history = state.conversation
    .slice(0, pendingIndex - 1)
    .filter((m) => !m.pending)
    .map((m) => ({ role: m.role, content: m.content }));

  let data, ok = true;
  try {
    let response;
    if (filesToSend.length) {
      const form = new FormData();
      form.append('prompt', fullPrompt);
      form.append('history', JSON.stringify(history));
      if (targetSessionId) form.append('sessionId', targetSessionId);
      if (targetProjectId) form.append('projectId', targetProjectId);
      if (state.routeMode !== 'auto') form.append('force', state.routeMode);
      if (state.model) form.append('model', state.model);
      form.append('threshold', state.threshold);
      for (const f of filesToSend) form.append('images', f);
      response = await fetch('/api/route', { method: 'POST', body: form });
    } else {
      response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          history,
          sessionId: targetSessionId || undefined,
          projectId: targetProjectId || undefined,
          force: state.routeMode !== 'auto' ? state.routeMode : undefined,
          model: state.model || undefined,
          threshold: state.threshold
        })
      });
    }
    data = await response.json();
    if (!response.ok) { ok = false; }
  } catch (err) {
    data = { error: err.message };
    ok = false;
  }

  if (data.sessionId && !targetSessionId) {
    state.currentSessionId = data.sessionId;
    await loadSessions();
  }

  // If the user switched sessions/projects while this was in flight, the
  // message is already persisted server-side — don't corrupt whatever's
  // on screen now. A reload of that session will show it.
  if (state.currentSessionId !== (targetSessionId || data.sessionId)) {
    refreshSidebar();
    return;
  }

  state.conversation[pendingIndex] = ok
    ? { role: 'assistant', content: data.text, backend: data.backend, visualization: data.visualization, images: data.images, meta: { latencyMs: data.latencyMs, costUsd: data.costUsd, score: data.score } }
    : { role: 'assistant', error: data.error, backend: state.routeMode !== 'auto' ? state.routeMode : 'ollama' };

  renderConversation();
  refreshSidebar();
}

sendBtn.addEventListener('click', send);

// ---------- routing mode + threshold ----------

const routeSegmented = document.getElementById('routeSegmented');
function syncSegmented() {
  routeSegmented.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.routeMode));
  updateRoutePillLabel();
  document.getElementById('localModelSection').hidden = !['auto', 'ollama'].includes(state.routeMode);
}
routeSegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.routeMode = btn.dataset.mode;
  syncSegmented();
});

const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdVal = document.getElementById('thresholdVal');
thresholdSlider.addEventListener('input', () => {
  state.threshold = Number(thresholdSlider.value);
  thresholdVal.textContent = state.threshold;
});

// ---------- models ----------

const modelSelect = document.getElementById('modelSelect');
const modelChips = document.getElementById('modelChips');
const installedModelList = document.getElementById('installedModelList');
const pullInput = document.getElementById('pullInput');
const pullBtn = document.getElementById('pullBtn');
const pullStopBtn = document.getElementById('pullStopBtn');
const pullProgress = document.getElementById('pullProgress');
const pullLabel = document.getElementById('pullLabel');
const pullBarFill = document.getElementById('pullBarFill');

function fmtBytes(n) {
  if (!n) return '';
  const gb = n / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(n / 1e6).toFixed(0)} MB`;
}

async function loadModels() {
  const data = await getJSON('/api/models');
  if (!state.model) state.model = data.default;
  if (!data.installed.some((m) => m.name === state.model)) state.model = data.installed[0]?.name ?? null;

  modelSelect.innerHTML = data.installed
    .map((m) => `<option value="${m.name}" ${m.name === state.model ? 'selected' : ''}>${m.name}${m.vision ? ' 👁' : ''}</option>`)
    .join('');

  installedModelList.innerHTML = data.installed.length
    ? data.installed.map((m) => `
        <div class="installed-model-row">
          <span class="imname">${escapeHtml(m.name)}${m.vision ? ' 👁' : ''}</span>
          <span class="imsize">${fmtBytes(m.sizeBytes)}</span>
          <button class="imdel" data-name="${escapeHtml(m.name)}" title="Delete from this machine">🗑</button>
        </div>`).join('')
    : '<div class="empty-mini">No models installed.</div>';
  installedModelList.querySelectorAll('.imdel').forEach((btn) => btn.addEventListener('click', () => deleteInstalledModel(btn.dataset.name)));

  const installedNames = new Set(data.installed.map((m) => m.name));
  modelChips.innerHTML = CURATED_MODELS.map((name) => {
    const installed = installedNames.has(name);
    const vision = /vision|llava|moondream/i.test(name);
    return `<button class="model-chip ${installed ? 'installed' : ''} ${vision ? 'vision' : ''}" data-name="${name}" ${installed ? 'disabled' : ''}>${name}</button>`;
  }).join('');
  modelChips.querySelectorAll('button:not(:disabled)').forEach((btn) => btn.addEventListener('click', () => pullModel(btn.dataset.name)));
}
modelSelect.addEventListener('change', () => { state.model = modelSelect.value; });

async function deleteInstalledModel(name) {
  if (!confirm(`Delete "${name}" from this machine? You'll need to re-download it to use it again.`)) return;
  try {
    await getJSON(`/api/models?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadModels();
  } catch (err) {
    alert(err.message);
  }
}

async function pullModel(name) {
  const res = await fetch('/api/models/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const d = await res.json();
  if (d.error) { alert(d.error); return; }
  pollPullStatus();
}
pullBtn.addEventListener('click', () => {
  const name = pullInput.value.trim();
  if (!name) return;
  pullInput.value = '';
  pullModel(name);
});
pullStopBtn.addEventListener('click', async () => {
  try { await getJSON('/api/models/pull/cancel', { method: 'POST' }); } catch { /* already finished */ }
});

let pullPollTimer = null;
function pollPullStatus() {
  clearInterval(pullPollTimer);
  pullPollTimer = setInterval(async () => {
    const status = await getJSON('/api/models/pull-status');
    if (!status.name) { clearInterval(pullPollTimer); pullProgress.style.display = 'none'; return; }
    pullProgress.style.display = 'block';
    const label = status.status === 'cancelled' ? 'cancelled' : (status.status || '…');
    pullLabel.textContent = `${status.name} — ${label} ${status.percent}%`;
    pullBarFill.style.width = `${status.percent}%`;
    if (!status.active) {
      clearInterval(pullPollTimer);
      setTimeout(() => { pullProgress.style.display = 'none'; loadModels(); }, 1500);
    }
  }, 800);
}

// ---------- projects ----------

const projectList = document.getElementById('projectList');
const noProjectRow = document.getElementById('noProjectRow');
const currentContextLabel = document.getElementById('currentContextLabel');
const projectPermPanel = document.getElementById('projectPermPanel');
const projectPermSegmented = document.getElementById('projectPermSegmented');
const projectPermHint = document.getElementById('projectPermHint');
const addProjectBtn = document.getElementById('addProjectBtn');

const PERM_HINTS = {
  plan: 'Read-only for both — Claude and Codex can view files here but can’t edit or run anything.',
  edits: 'Claude: can create/edit files, shell commands still blocked. Codex: its sandbox can’t separate the two, so this also allows shell commands scoped to this folder.',
  full: '⚠ Full trust for both — edit files AND run shell commands, no sandbox. Codex additionally loses its folder/network boundary here.'
};

async function loadProjects() {
  state.projects = await getJSON('/api/projects');
  renderProjects();
}

function renderProjects() {
  projectList.innerHTML = state.projects.map((p) => `
    <button class="project-row ${p.id === state.currentProjectId ? 'active' : ''}" data-id="${p.id}">
      <span class="perm-dot ${p.permission_mode}"></span>
      <span class="project-name" title="${escapeHtml(p.path)}">${escapeHtml(p.name)}</span>
      <span class="session-del" data-detail="${p.id}" title="Sources &amp; skill">${icon('file-text', 12)}</span>
      <span class="session-del" data-del="${p.id}">✕</span>
    </button>`).join('');

  projectList.querySelectorAll('.project-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) {
        e.stopPropagation();
        deleteProject(Number(e.target.closest('[data-del]').dataset.del));
        return;
      }
      if (e.target.closest('[data-detail]')) {
        e.stopPropagation();
        openProjectDetail(Number(e.target.closest('[data-detail]').dataset.detail));
        return;
      }
      selectProject(Number(row.dataset.id));
    });
  });
  noProjectRow.classList.toggle('active', state.currentProjectId === null);
}

function selectProject(id) {
  state.currentProjectId = id || null;
  renderProjects();
  renderSessions();
  updateContextLabel();
  syncProjectPermPanel();
}
noProjectRow.addEventListener('click', () => selectProject(null));

function updateContextLabel() {
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  currentContextLabel.textContent = project ? `📁 ${project.name}` : 'Global chat';
}

function syncProjectPermPanel() {
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  projectPermPanel.hidden = !project;
  if (!project) return;
  projectPermSegmented.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === project.permission_mode));
  projectPermHint.textContent = PERM_HINTS[project.permission_mode];
}
projectPermSegmented.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  if (!btn || !project) return;
  if (btn.dataset.mode === 'full' && !confirm('Allow Claude to run shell commands and edit files in this project with no restrictions?')) return;
  const updated = await getJSON(`/api/projects/${project.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissionMode: btn.dataset.mode })
  });
  Object.assign(project, updated);
  renderProjects();
  syncProjectPermPanel();
});

async function addProject() {
  let folderPath = null;
  if (window.desktop?.isElectron) {
    folderPath = await window.desktop.pickFolder();
  } else {
    folderPath = window.prompt('Absolute path to the project folder:');
  }
  if (!folderPath) return;
  const name = folderPath.split('/').filter(Boolean).pop() || folderPath;
  try {
    const project = await getJSON('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path: folderPath, permissionMode: 'plan' })
    });
    state.projects.unshift(project);
    selectProject(project.id);
  } catch (err) {
    alert(err.message);
  }
}
addProjectBtn.addEventListener('click', addProject);

async function deleteProject(id) {
  if (!confirm('Remove this project? Its chats stay but lose file access.')) return;
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  state.projects = state.projects.filter((p) => p.id !== id);
  if (state.currentProjectId === id) selectProject(null);
  else renderProjects();
}

// ---------- project detail (sources + skill / codebase / overview) ----------
// Sources+skill are real files in the project's own folder (<path>/.ai-with-tj/)
// — this view just reflects what's actually on disk, not a hidden app-managed
// store. Codebase + Overview are new: a live file browser over that same real
// folder, and an AI-generated ("local model only, never Claude/Codex, so it's
// free") one-page report — see projectAnalysis.js.

const PROJ_TABS = [
  { key: 'sources', label: 'Sources & Skill' },
  { key: 'codebase', label: 'Codebase' },
  { key: 'overview', label: 'Overview' }
];

async function openProjectDetail(id, tab = 'sources') {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;

  const shell = `
    <div class="proj-tabs">${PROJ_TABS.map((t) => `<button class="proj-tab ${t.key === tab ? 'active' : ''}" data-proj-tab="${t.key}">${t.label}</button>`).join('')}</div>
    <div id="projTabBody"></div>
  `;
  openModal(`📁 ${project.name}`, shell, { wide: tab !== 'sources' });

  modalBody.querySelectorAll('[data-proj-tab]').forEach((btn) => {
    btn.addEventListener('click', () => openProjectDetail(id, btn.dataset.projTab));
  });

  const tabBody = document.getElementById('projTabBody');
  if (tab === 'codebase') await renderCodebaseTab(project, tabBody);
  else if (tab === 'overview') await renderOverviewTab(project, tabBody);
  else await renderSourcesTab(project, tabBody);
}

async function renderSourcesTab(project, container) {
  const id = project.id;
  const [sources, skill] = await Promise.all([
    getJSON(`/api/projects/${id}/sources`),
    getJSON(`/api/projects/${id}/skill`)
  ]);

  container.innerHTML = `
    <div class="empty-mini" style="margin-bottom:12px;">Stored in <code>${escapeHtml(project.path)}/.ai-with-tj/</code> — visible in Finder, and readable by Claude/Codex when this project grants file access. Text sources and the skill are also injected as context for every backend, including local models with no file access.</div>

    <div class="field-label" style="margin-top:0;">Skill (project instructions)</div>
    <textarea id="skillTextarea" style="width:100%; min-height:100px; font-family:inherit; font-size:12.5px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-primary);" placeholder="Always answer in one sentence. Use metric units. ...">${escapeHtml(skill.content)}</textarea>
    <div class="pull-row"><button id="saveSkillBtn" style="flex:1;">Save skill</button></div>

    <div class="field-label">Sources (${sources.length})</div>
    <div id="sourceList">${sources.length ? sources.map((s) => `
      <div class="installed-model-row">
        <span class="imname" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
        <span class="imsize">${fmtBytes(s.sizeBytes)}</span>
        <button class="imdel" data-source-del="${escapeHtml(s.name)}">🗑</button>
      </div>`).join('') : '<div class="empty-mini">No sources uploaded yet.</div>'}</div>
    <div class="pull-row">
      <input type="file" id="sourceFileInput" style="flex:1;" />
      <button id="sourceUploadBtn">Upload</button>
    </div>
  `;

  document.getElementById('saveSkillBtn').addEventListener('click', async () => {
    await fetch(`/api/projects/${id}/skill`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: document.getElementById('skillTextarea').value })
    });
    closeModal();
  });

  document.getElementById('sourceUploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('sourceFileInput');
    if (!fileInput.files[0]) return;
    const form = new FormData();
    form.append('file', fileInput.files[0]);
    await fetch(`/api/projects/${id}/sources`, { method: 'POST', body: form });
    openProjectDetail(id, 'sources'); // re-render with the new file
  });

  container.querySelectorAll('[data-source-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/projects/${id}/sources/${encodeURIComponent(btn.dataset.sourceDel)}`, { method: 'DELETE' });
      openProjectDetail(id, 'sources');
    });
  });
}

// ---------- codebase tab: real file tree over the project's own folder ----------

function renderTreeNodes(nodes, parentPath = '') {
  return nodes.map((node) => {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.type === 'dir') {
      return `
        <div class="tree-dir">
          <div class="tree-label" data-toggle-dir>${icon('folder', 12)} ${escapeHtml(node.name)}</div>
          <div class="tree-children collapsed">${renderTreeNodes(node.children, fullPath)}</div>
        </div>`;
    }
    return `<div class="tree-file" data-file-path="${escapeHtml(fullPath)}" title="${escapeHtml(fullPath)}">${escapeHtml(node.name)}</div>`;
  }).join('');
}

async function renderCodebaseTab(project, container) {
  container.innerHTML = '<div class="empty-mini">Scanning project folder…</div>';
  let data;
  try {
    data = await getJSON(`/api/projects/${project.id}/tree`);
  } catch (err) {
    container.innerHTML = `<div class="empty-mini">Could not read this project's folder: ${escapeHtml(err.message)}</div>`;
    return;
  }

  container.innerHTML = `
    ${data.truncated ? `<div class="empty-mini" style="margin-bottom:8px;">This project is large — showing the first ${data.entryCount} entries.</div>` : ''}
    <div class="codebase-pane">
      <div class="file-tree">${data.tree.length ? renderTreeNodes(data.tree) : '<div class="empty-mini">Empty folder.</div>'}</div>
      <div class="file-viewer">
        <div class="file-viewer-header">
          <span class="file-viewer-path" id="fileViewerPath">Select a file to view it</span>
          <button id="askAboutFileBtn" hidden>Ask AI to improve this</button>
        </div>
        <pre id="fileViewerContent"></pre>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-toggle-dir]').forEach((label) => {
    label.addEventListener('click', () => label.nextElementSibling.classList.toggle('collapsed'));
  });

  const pathEl = document.getElementById('fileViewerPath');
  const contentEl = document.getElementById('fileViewerContent');
  const askBtn = document.getElementById('askAboutFileBtn');
  let selectedFile = null;

  container.querySelectorAll('[data-file-path]').forEach((el) => {
    el.addEventListener('click', async () => {
      container.querySelectorAll('.tree-file.active').forEach((n) => n.classList.remove('active'));
      el.classList.add('active');
      const relPath = el.dataset.filePath;
      pathEl.textContent = relPath;
      contentEl.textContent = 'Loading…';
      askBtn.hidden = true;
      try {
        const file = await getJSON(`/api/projects/${project.id}/file?path=${encodeURIComponent(relPath)}`);
        if (file.binary) {
          contentEl.textContent = `Binary file (${fmtBytes(file.sizeBytes)}) — not shown.`;
        } else {
          contentEl.textContent = file.content + (file.truncated ? '\n\n… (truncated, file is larger)' : '');
          selectedFile = file;
          askBtn.hidden = false;
        }
      } catch (err) {
        contentEl.textContent = `Could not read file: ${err.message}`;
      }
    });
  });

  askBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    selectProject(project.id);
    const snippet = selectedFile.content.slice(0, 6000);
    promptEl.value = `Regarding \`${selectedFile.path}\` in this project:\n\n\`\`\`\n${snippet}${selectedFile.content.length > 6000 ? '\n… (truncated)' : ''}\n\`\`\`\n\nHow could this be improved?`;
    closeModal();
    promptEl.focus();
  });
}

// ---------- overview tab: AI-generated project report (local model, free) ----------

async function renderOverviewTab(project, container) {
  const cached = await getJSON(`/api/projects/${project.id}/overview`);
  const hasReport = cached && cached.cached !== false;

  container.innerHTML = `
    <div class="overview-pane">
      <div class="overview-toolbar">
        <span class="meta">${hasReport ? `Generated ${fmtRelative(cached.generatedAt)}, from ${cached.stats.totalFiles} files.` : 'No report yet — a local model (never Claude/Codex, so this is free) reads the project structure and writes one.'}</span>
        <button id="analyzeProjectBtn">${hasReport ? 'Re-analyze' : 'Analyze project'}</button>
      </div>
      ${hasReport ? `<iframe class="overview-frame" id="overviewFrame" src="/api/projects/${project.id}/overview.html"></iframe>` : '<div class="empty-mini">Click "Analyze project" to generate a purpose / tech stack / architecture / database-schema report for this codebase.</div>'}
    </div>
  `;

  document.getElementById('analyzeProjectBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Analyzing… (can take a minute)';
    try {
      await getJSON(`/api/projects/${project.id}/analyze`, { method: 'POST' });
      await renderOverviewTab(project, container);
    } catch (err) {
      e.target.disabled = false;
      alert(`Analysis failed: ${err.message}`);
    }
  });
}

// ---------- sessions ----------

const sessionList = document.getElementById('sessionList');
const newChatBtn = document.getElementById('newChatBtn');

async function loadSessions() {
  state.sessions = await getJSON('/api/sessions');
  renderSessions();
}

function renderSessions() {
  const filtered = state.sessions.filter((s) => (s.project_id ?? null) === state.currentProjectId);
  sessionList.innerHTML = filtered.length
    ? filtered.map((s) => `
        <div class="session-row ${s.id === state.currentSessionId ? 'active' : ''}" data-id="${s.id}">
          <div class="session-row-main">
            <span class="session-title">${escapeHtml(s.title || 'New chat')}</span>
            <button class="session-del" data-del="${s.id}">✕</button>
          </div>
          ${s.last_backend ? `<div class="session-meta">${badge(s.last_backend)} <span>${fmtRelative(s.updated_at)}</span>${s.total_tokens ? ` <span>· ${fmtTokens(s.total_tokens)} tok</span>` : ''}</div>` : ''}
        </div>`).join('')
    : '<div class="empty-mini">No chats yet.</div>';

  sessionList.querySelectorAll('.session-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.dataset.del) { e.stopPropagation(); deleteSession(Number(e.target.dataset.del)); return; }
      openSession(Number(row.dataset.id));
    });
  });
}

async function openSession(id) {
  const session = state.sessions.find((s) => s.id === id);
  state.currentSessionId = id;
  state.currentProjectId = session?.project_id ?? null;
  const messages = await getJSON(`/api/sessions/${id}/messages`);
  state.conversation = messages.map((m) => m.role === 'user'
    ? { role: 'user', content: m.content, images: m.images }
    : { role: 'assistant', content: m.content, backend: m.backend, visualization: m.visualization, images: m.images, error: m.error || undefined, meta: { latencyMs: m.latency_ms, costUsd: m.cost_usd, score: m.score } });
  renderConversation();
  renderProjects();
  renderSessions();
  updateContextLabel();
  syncProjectPermPanel();
}

function startNewChat() {
  state.currentSessionId = null;
  state.conversation = [];
  renderConversation();
  renderSessions();
  promptEl.focus();
}
newChatBtn.addEventListener('click', startNewChat);

async function deleteSession(id) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (state.currentSessionId === id) startNewChat();
  else renderSessions();
}

// ---------- connectors ----------

async function loadConnectors() {
  const list = await getJSON('/api/connectors');
  document.getElementById('connectorList').innerHTML = list.map((c) => `
    <div class="connector-row">
      <span class="cdot ${c.connected ? 'on' : 'off'}"></span>
      <span class="cname">${escapeHtml(c.name)}</span>
      <span class="cdetail">${escapeHtml(c.detail)}</span>
    </div>`).join('');
}

// ---------- accounts: onboarding status + credentials ----------
// The onboarding checklist and the credential switcher are the same panel —
// a fresh install needs both "is anything logged in" and "add a key instead"
// in one place, not a separate wizard that's gone after first run.

async function loadOnboarding() {
  const status = await getJSON('/api/onboarding');
  const row = (ok, label, detail) => `
    <div class="connector-row">
      <span class="cdot ${ok ? 'on' : 'off'}"></span>
      <span class="cname">${escapeHtml(label)}</span>
      <span class="cdetail">${escapeHtml(detail)}</span>
    </div>`;
  document.getElementById('onboardingStatus').innerHTML = [
    row(status.claude.loggedIn, 'Claude CLI', status.claude.loggedIn ? `${status.claude.email ?? ''} (${status.claude.plan ?? 'unknown plan'})` : status.claude.installed ? 'Not logged in — run `claude auth login`' : 'Not installed'),
    row(status.codex.loggedIn, 'Codex CLI', status.codex.loggedIn ? `via ${status.codex.method ?? 'unknown'}` : status.codex.installed ? 'Not logged in — run `codex login`' : 'Not installed'),
    row(status.ollama.reachable, 'Ollama', status.ollama.reachable ? 'Running' : 'Not reachable — start it with `brew services start ollama`'),
    row(status.drawThings.installed, 'Draw Things CLI', status.drawThings.installed ? 'Installed' : 'Not installed — image generation unavailable')
  ].join('');
}

async function loadCredentials() {
  for (const provider of ['claude', 'codex']) {
    const creds = await getJSON(`/api/credentials?provider=${provider}`);
    const list = document.getElementById(`${provider}CredList`);
    list.innerHTML = creds.map((c) => `
      <div class="connector-row">
        <span class="cdot ${c.is_active ? 'on' : 'off'}"></span>
        <span class="cname">${escapeHtml(c.label)}${c.is_active ? ' (active)' : ''}</span>
        <span class="cdetail">${c.type === 'cli' ? 'CLI login' : 'API key'}</span>
        ${!c.is_active ? `<button class="imdel" data-activate="${c.id}" title="Activate">✓</button>` : ''}
        ${c.type === 'api_key' && !c.is_active ? `<button class="imdel" data-remove-cred="${c.id}" title="Remove">🗑</button>` : ''}
      </div>`).join('');

    list.querySelectorAll('[data-activate]').forEach((btn) => btn.addEventListener('click', async () => {
      if (provider === 'codex' && !confirm('This changes what `codex` uses everywhere on this Mac, including your terminal. Continue?')) return;
      try {
        const result = await getJSON(`/api/credentials/${btn.dataset.activate}/activate`, { method: 'POST' });
        if (result.note) alert(result.note);
      } catch (err) { alert(err.message); }
      loadCredentials();
    }));
    list.querySelectorAll('[data-remove-cred]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Remove this saved key?')) return;
      await fetch(`/api/credentials/${btn.dataset.removeCred}`, { method: 'DELETE' });
      loadCredentials();
    }));
  }
}

function wireCredentialForm(provider) {
  document.getElementById(`${provider}KeyAddBtn`).addEventListener('click', async () => {
    const label = document.getElementById(`${provider}KeyLabel`).value.trim();
    const apiKey = document.getElementById(`${provider}KeyInput`).value.trim();
    if (!apiKey) return;
    try {
      await getJSON('/api/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, label, apiKey })
      });
      document.getElementById(`${provider}KeyLabel`).value = '';
      document.getElementById(`${provider}KeyInput`).value = '';
      loadCredentials();
    } catch (err) { alert(err.message); }
  });
}
wireCredentialForm('claude');
wireCredentialForm('codex');

// ---------- sidebar: active jobs ----------

const jobList = document.getElementById('jobList');
const jobCount = document.getElementById('jobCount');
const agentBanner = document.getElementById('agentBanner');
const agentBannerText = document.getElementById('agentBannerText');
const agentsFeed = document.getElementById('agentsFeed');
const agentsTabCount = document.getElementById('agentsTabCount');
const securityFeed = document.getElementById('securityFeed');
const securityTabCount = document.getElementById('securityTabCount');
const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

function agentStatusIcon(status) {
  if (status === 'completed') return '<span class="check">✓</span>';
  if (status === 'failed' || status === 'error') return '<span class="cross">✕</span>';
  return '<span class="spinner"></span>';
}

async function refreshJobs() {
  const allJobs = await getJSON('/api/active');
  const running = allJobs.filter((j) => j.status === 'running');

  jobCount.textContent = running.length;
  jobList.innerHTML = running.length
    ? running.map((j) => `
        <div class="job-row ${j.backend}">
          <span class="spinner"></span>
          <span class="job-prompt">${escapeHtml(j.prompt)}</span>
          <span class="job-time">${fmtElapsed(j.startedAt)}</span>
        </div>`).join('')
    : '<div class="empty-mini">Idle — nothing running.</div>';

  // Sub-agent banner + Agents tab: driven by jobs that have spawned at
  // least one Task-tool sub-agent (only ever Claude, only when a project
  // grants Edits/Full access — plan mode blocks the Task tool itself).
  const jobsWithAgents = allJobs.filter((j) => j.subagents.length > 0).reverse();
  const runningAgentCount = jobsWithAgents
    .flatMap((j) => j.subagents)
    .filter((s) => s.status === 'running').length;

  if (runningAgentCount > 0) {
    agentBanner.hidden = false;
    agentBannerText.textContent = `${runningAgentCount} sub-agent${runningAgentCount === 1 ? '' : 's'} working`;
  } else {
    agentBanner.hidden = true;
  }

  // Agents tab: every Claude/Codex job (a "task" in flight or recently
  // finished), not just ones that spawned sub-agents — matches the
  // dashboard-style list requested, but every field here is real data this
  // app actually captured (no fabricated progress %, no invented system
  // stats like CPU/memory that we have no honest signal for).
  state.lastJobs = allJobs;
  const agentJobs = allJobs.filter((j) => j.backend === 'claude' || j.backend === 'codex').reverse();

  if (agentJobs.length) {
    agentsTabCount.hidden = false;
    agentsTabCount.textContent = agentJobs.filter((j) => j.status === 'running').length || agentJobs.length;

    const runningCount = agentJobs.filter((j) => j.status === 'running').length;
    agentsFeed.innerHTML = `
      <div class="agent-panel-header">
        ${runningCount ? `<span class="running-pill"><span class="rdot"></span>${runningCount} running</span>` : '<span class="empty-mini" style="margin:0;">Idle</span>'}
      </div>
      ${agentJobs.map((job) => {
        const failed = job.timeline.some((s) => s.status === 'failed');
        const status = failed ? 'failed' : job.status === 'running' ? 'running' : 'completed';
        const stepCount = job.timeline.length;
        const subCount = job.subagents.length;
        return `
        <div class="task-card" data-job-id="${job.id}">
          <div class="task-avatar ${job.backend}">${icon(iconForTask(job.prompt), 16)}</div>
          <div class="task-body">
            <div class="task-title-row">
              <span class="task-title">${escapeHtml(job.prompt.slice(0, 60))}</span>
              ${subCount ? `<span class="task-subcount">+${subCount} sub-agent${subCount === 1 ? '' : 's'}</span>` : ''}
            </div>
            <div class="task-desc">${badge(job.backend)} ${stepCount} step${stepCount === 1 ? '' : 's'}</div>
            <div class="task-meta-row">
              <span class="task-status-dot ${status}"></span>
              <span>${status === 'running' ? 'Running' : status === 'failed' ? 'Failed' : 'Completed'}</span>
              <div class="task-progress-track"><div class="task-progress-fill ${status}"></div></div>
              <span>${status === 'running' ? fmtElapsed(job.startedAt) : fmtMs((job.finishedAt ?? Date.now()) - job.startedAt)}</span>
            </div>
          </div>
        </div>`;
      }).join('')}`;

    agentsFeed.querySelectorAll('[data-job-id]').forEach((card) => {
      card.addEventListener('click', () => openAgentDetail(Number(card.dataset.jobId)));
    });
  } else {
    agentsTabCount.hidden = true;
    agentsFeed.innerHTML = '<div class="empty-mini">No Claude/Codex tasks yet. Local (Ollama) requests don\'t show up here — this tracks the two backends that can run real tool calls.</div>';
  }

  // Security tab: every finding from every job that has one, newest first.
  // Always produced by the local model reviewing a real Edit/Write/Bash
  // tool call the instant it streams in — never Claude reviewing itself.
  const allFindings = allJobs
    .flatMap((job) => job.securityFindings.map((f) => ({ ...f, jobPrompt: job.prompt })))
    .sort((a, b) => b.at - a.at);

  if (allFindings.length) {
    const worst = allFindings.reduce((acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc), 'info');
    securityTabCount.hidden = false;
    securityTabCount.textContent = allFindings.length;
    securityTabCount.className = `count-chip severity-dot ${worst}`;

    securityFeed.innerHTML = allFindings.map((f) => `
      <div class="finding-card ${f.severity}">
        <div class="finding-head">
          <span class="finding-sev ${f.severity}">${f.severity}</span>
          <span class="finding-title">${escapeHtml(f.title)}</span>
        </div>
        ${f.label ? `<div class="finding-label" title="${escapeHtml(f.label)}">${f.kind}: ${escapeHtml(f.label)}</div>` : ''}
        ${f.detail ? `<div class="finding-detail">${escapeHtml(f.detail)}</div>` : ''}
      </div>`).join('');
  } else {
    securityTabCount.hidden = true;
    securityFeed.innerHTML = '<div class="empty-mini">No findings yet.</div>';
  }
}

// The drill-down view (opened by tapping a task card) — a real step-by-step
// timeline of what that job actually did (file reads/writes, commands run,
// sub-agents delegated, security findings), not a mocked progress screen.
function openAgentDetail(jobId) {
  const job = state.lastJobs?.find((j) => j.id === jobId);
  if (!job) return;

  const failed = job.timeline.some((s) => s.status === 'failed');
  const overallStatus = failed ? 'failed' : job.status === 'running' ? 'running' : 'completed';

  const stepsHtml = job.timeline.length
    ? job.timeline.map((step, i) => `
      <div class="timeline-step">
        <div class="timeline-rail">
          <div class="timeline-icon ${step.status}">${icon(step.status === 'completed' ? 'check-circle' : step.status === 'failed' ? 'x-circle' : step.icon, 15)}</div>
          ${i < job.timeline.length - 1 ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="timeline-content">
          <div class="timeline-title-row">
            <span class="timeline-title">${escapeHtml(step.title)}</span>
            <span class="timeline-time">${step.completedAt ? fmtMs(step.completedAt - step.startedAt) : (step.status === 'running' ? fmtElapsed(step.startedAt) : '')}</span>
          </div>
          ${step.subtitle ? `<div class="timeline-subtitle">${escapeHtml(step.subtitle)}</div>` : ''}
          ${step.detail ? `<div class="timeline-detail">${escapeHtml(step.detail.slice(0, 1500))}</div>` : ''}
        </div>
      </div>`).join('')
    : '<div class="empty-mini">No tool calls recorded (a plain text answer with no file/command activity).</div>';

  const subagentsHtml = job.subagents.length ? `
    <div style="margin-top:18px;">
      <strong style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em;">Sub-agents delegated</strong>
      ${job.subagents.map((s) => `
        <div class="agent-card" style="margin-top:8px;">
          <div class="agent-card-head">
            ${agentStatusIcon(s.status)}
            <span class="desc">${escapeHtml(s.description || 'Sub-agent')}</span>
            <span class="elapsed">${s.status === 'running' ? fmtElapsed(s.startedAt) : fmtMs(s.usage?.duration_ms)}</span>
          </div>
          ${s.summary ? `<div class="summary">${escapeHtml(s.summary.slice(0, 200))}</div>` : ''}
        </div>`).join('')}
    </div>` : '';

  const findingsHtml = job.securityFindings.length ? `
    <div style="margin-top:18px;">
      <strong style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em;">Security findings</strong>
      ${job.securityFindings.map((f) => `
        <div class="finding-card ${f.severity}" style="margin-top:8px;">
          <div class="finding-head"><span class="finding-sev ${f.severity}">${f.severity}</span><span class="finding-title">${escapeHtml(f.title)}</span></div>
          ${f.detail ? `<div class="finding-detail">${escapeHtml(f.detail)}</div>` : ''}
        </div>`).join('')}
    </div>` : '';

  const headerHtml = `
    <div class="task-meta-row" style="margin-bottom:16px;">
      <span class="task-status-dot ${overallStatus}"></span>
      <span>${overallStatus === 'running' ? 'Running' : overallStatus === 'failed' ? 'Completed with issues' : 'Completed'}</span>
      <span style="color:var(--muted);">· ${badge(job.backend)} · ${fmtMs((job.finishedAt ?? Date.now()) - job.startedAt)}</span>
    </div>`;

  openModal(job.prompt.slice(0, 70), headerHtml + stepsHtml + subagentsHtml + findingsHtml);
}

const sidebarTabs = document.querySelectorAll('.sidebar-tabs button');
function switchSidebarTab(tab) {
  sidebarTabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('insightsTab').hidden = tab !== 'insights';
  document.getElementById('agentsTab').hidden = tab !== 'agents';
  document.getElementById('securityTab').hidden = tab !== 'security';
}
sidebarTabs.forEach((btn) => btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab)));
agentBanner.addEventListener('click', () => {
  document.getElementById('sidebar').style.display = 'flex';
  switchSidebarTab('agents');
});

// ---------- sidebar: stats + chart + recent ----------

async function refreshStats() {
  const stats = await getJSON('/api/stats');
  renderTiles(stats);
  renderChart(stats.timeline);
  renderModelUsage(stats.byModel);
}

function fmtTokens(n) {
  if (!n) return '0';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// "Token spend per model" — grouped server-side by the actual underlying
// model (not just backend), since Claude Code alone can route a single call
// across more than one model. Thinking/reasoning tokens shown only when a
// backend actually reports them (Claude and Codex do; local Ollama models
// don't expose an equivalent today).
function renderModelUsage(byModel) {
  const list = document.getElementById('modelUsageList');
  if (!byModel?.length) {
    list.innerHTML = '<div class="empty-mini">No requests yet.</div>';
    return;
  }

  const maxTotal = Math.max(...byModel.map((m) => m.tokens_in + m.tokens_out));
  const colorFor = (backend) => `var(--series-${backend === 'ollama' ? 'local' : backend})`;

  list.innerHTML = byModel.map((m) => {
    const total = m.tokens_in + m.tokens_out;
    const pct = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    return `
      <div class="model-usage-row">
        <div class="model-usage-head">
          ${badge(m.backend)}
          <span class="model-usage-name" title="${escapeHtml(m.model)}">${escapeHtml(m.model)}</span>
          <span class="model-usage-count">${m.count} request${m.count === 1 ? '' : 's'}</span>
        </div>
        <div class="model-usage-meta">
          <span><span class="stat-label">in</span> ${fmtTokens(m.tokens_in)}</span>
          <span><span class="stat-label">out</span> ${fmtTokens(m.tokens_out)}</span>
          ${m.tokens_thinking ? `<span><span class="stat-label">thinking</span> ${fmtTokens(m.tokens_thinking)}</span>` : ''}
          <span><span class="stat-label">avg</span> ${fmtMs(m.avg_latency_ms)}</span>
          ${m.total_cost_usd ? `<span><span class="stat-label">cost</span> ${fmtMoney(m.total_cost_usd)}</span>` : ''}
        </div>
        <div class="model-usage-bar"><div style="width:${pct}%; background:${colorFor(m.backend)};"></div></div>
      </div>`;
  }).join('');
}

function renderTiles(stats) {
  const byBackend = Object.fromEntries(stats.totals.map((t) => [t.backend, t]));
  const total = stats.totals.reduce((sum, t) => sum + t.count, 0);

  const tiles = [{ label: 'Total', value: total }, { label: 'Errors', value: stats.errorCount }];
  for (const backend of Object.keys(BACKEND_META)) {
    const row = byBackend[backend];
    if (!row) continue;
    const meta = BACKEND_META[backend];
    tiles.push({ label: meta.label, value: row.count, cls: meta.cls });
  }
  for (const backend of Object.keys(BACKEND_META)) {
    const row = byBackend[backend];
    if (!row) continue;
    const meta = BACKEND_META[backend];
    tiles.push({ label: `Avg ${meta.label}`, value: fmtMs(row.avg_latency_ms), cls: meta.cls });
  }

  document.getElementById('statTiles').innerHTML = tiles.map((t) => `
    <div class="tile-mini"><div class="label">${t.label}</div><div class="value ${t.cls ?? ''}">${t.value}</div></div>`).join('');
}

function renderChart(timeline) {
  const container = document.getElementById('chart');
  const width = container.clientWidth || 300;
  const height = 150;
  const margin = { top: 8, right: 6, bottom: 20, left: 6 };

  if (!timeline.length) {
    container.innerHTML = `<div style="height:${height}px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;">No activity yet</div>`;
    return;
  }

  const backends = Object.keys(BACKEND_META).filter((b) => b !== 'image' && timeline.some((t) => t.backend === b));
  const buckets = [...new Set(timeline.map((t) => t.bucket))].sort();
  const byBucket = new Map(buckets.map((b) => [b, Object.fromEntries(backends.map((k) => [k, 0]))]));
  for (const row of timeline) {
    const bucket = byBucket.get(row.bucket);
    if (bucket) bucket[row.backend] = row.count;
  }

  const maxCount = Math.max(1, ...[...byBucket.values()].flatMap((v) => backends.map((k) => v[k])));
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const groupW = plotW / buckets.length;
  const barW = Math.max(2, Math.min(12, groupW / (backends.length * 1.3 + 1)));
  const scaleY = (v) => plotH - (v / maxCount) * plotH;

  let bars = '';
  const labelEvery = Math.ceil(buckets.length / 4);
  buckets.forEach((bucket, i) => {
    const counts = byBucket.get(bucket);
    const groupX = margin.left + i * groupW + (groupW - barW * backends.length) / 2;
    backends.forEach((backend, bi) => {
      const count = counts[backend];
      const barH = plotH - scaleY(count);
      const x = groupX + bi * barW;
      bars += `<rect data-label="${bucket} · ${BACKEND_META[backend].label} · ${count}" x="${x}" y="${margin.top + scaleY(count)}" width="${barW}" height="${Math.max(barH, count ? 2 : 0)}" rx="2" fill="var(--series-${backend === 'ollama' ? 'local' : backend})" />`;
    });
    if (i % labelEvery === 0) bars += `<text x="${margin.left + i * groupW + groupW / 2}" y="${height - 5}" text-anchor="middle">${bucket.slice(11)}</text>`;
  });

  container.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line class="axis-line" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotH}" y2="${margin.top + plotH}" />
    ${bars}
  </svg>`;

  container.querySelectorAll('rect').forEach((bar) => {
    bar.addEventListener('mousemove', (e) => {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.pageX + 12}px`;
      tooltip.style.top = `${e.pageY + 12}px`;
      tooltip.textContent = bar.dataset.label;
    });
    bar.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

async function refreshRecent() {
  const rows = await getJSON('/api/requests?limit=8');
  document.querySelector('#recentTable tbody').innerHTML = rows.map((r) => `
    <tr>
      <td>${badge(r.backend)}</td>
      <td class="prompt" title="${escapeHtml(r.prompt)}">${escapeHtml(r.prompt)}</td>
      <td class="right">${r.error ? '<span style="color:var(--status-critical)">error</span>' : fmtMs(r.latency_ms)}</td>
    </tr>`).join('');
}

async function refreshSidebar() {
  await Promise.all([refreshStats(), refreshRecent(), loadSessions()]);
}

// ---------- sidebar toggle ----------
// Toggling `hidden` alone left a gap: the grid still reserved the sidebar's
// column width even though the panel itself was gone. Toggling `.no-sidebar`
// on `.app` drops that column entirely so `.main` actually expands to fill it.

const appEl = document.querySelector('.app');
document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const collapsed = appEl.classList.toggle('no-sidebar');
  sidebar.hidden = collapsed;
});

// ---------- resizable panels ----------

function startResize(handle, cssVar, compute) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent) => {
      const value = compute(moveEvent.clientX);
      document.documentElement.style.setProperty(cssVar, `${value}px`);
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      if (value) localStorage.setItem(cssVar, value);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

startResize(document.getElementById('libraryResizeHandle'), '--library-w', (clientX) => Math.min(400, Math.max(180, clientX)));
startResize(document.getElementById('sidebarResizeHandle'), '--sidebar-w', (clientX) => Math.min(560, Math.max(280, window.innerWidth - clientX)));

for (const cssVar of ['--library-w', '--sidebar-w']) {
  const saved = localStorage.getItem(cssVar);
  if (saved) document.documentElement.style.setProperty(cssVar, saved);
}

// ---------- Electron menu wiring ----------

if (window.desktop?.isElectron) {
  window.desktop.onNewChat(() => startNewChat());
  window.desktop.onOpenProject(async (folderPath) => {
    const name = folderPath.split('/').filter(Boolean).pop() || folderPath;
    try {
      const project = await getJSON('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: folderPath, permissionMode: 'plan' })
      });
      state.projects.unshift(project);
      selectProject(project.id);
    } catch (err) { alert(err.message); }
  });
}

// ---------- modal ----------

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalBackBtn = document.getElementById('modalBackBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalPanel = document.querySelector('.modal-panel');

function openModal(title, bodyHtml, { onBack, wide } = {}) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalBackBtn.hidden = !onBack;
  modalBackBtn.onclick = onBack ?? null;
  modalPanel?.classList.toggle('wide', Boolean(wide));
  modalOverlay.hidden = false;
  if (modalBody.querySelector('.mermaid') && window.mermaid) {
    window.mermaid.run({ nodes: modalBody.querySelectorAll('.mermaid') }).catch(() => {
      modalBody.querySelector('.mermaid').outerHTML = '<div class="empty-mini">Could not render this diagram.</div>';
    });
  }
}
function closeModal() {
  modalOverlay.hidden = true;
  modalBody.innerHTML = '';
  modalPanel?.classList.remove('wide');
}
modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalOverlay.hidden) closeModal(); });

if (window.mermaid) {
  window.mermaid.initialize({
    startOnLoad: false,
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    securityLevel: 'strict'
  });
}

// A small reusable SVG bar chart — same mark language (thin bars, rounded
// ends, recessive axis) as the sidebar activity chart, just single-series
// and driven by whatever labels/values the local model extracted.
function renderBarChart(chart) {
  const width = 480, height = 220;
  const margin = { top: 16, right: 16, bottom: 32, left: 16 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxV = Math.max(1, ...chart.values);
  const groupW = plotW / chart.values.length;
  const barW = Math.max(8, Math.min(48, groupW * 0.55));

  let bars = '';
  chart.values.forEach((v, i) => {
    const barH = (v / maxV) * plotH;
    const x = margin.left + i * groupW + (groupW - barW) / 2;
    const y = margin.top + plotH - barH;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" rx="3" fill="var(--series-local)" />`;
    bars += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="var(--text-primary)">${escapeHtml(String(v))}${chart.unit ? ' ' + escapeHtml(chart.unit) : ''}</text>`;
    bars += `<text x="${x + barW / 2}" y="${height - 10}" text-anchor="middle" font-size="10.5">${escapeHtml(chart.labels[i])}</text>`;
  });

  return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width:${width}px;">
    <line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotH}" y2="${margin.top + plotH}" class="axis-line" />
    ${bars}
  </svg>`;
}

function renderVisualization(viz) {
  if (!viz) return '<div class="empty-mini">No visualization available.</div>';

  if (viz.format === 'chart' && viz.chart) {
    return `
      <div class="viz-modal-summary">${escapeHtml(viz.summary)}</div>
      ${viz.chart.title ? `<strong style="font-size:12.5px;">${escapeHtml(viz.chart.title)}</strong>` : ''}
      ${renderBarChart(viz.chart)}`;
  }

  if (viz.format === 'mermaid' && viz.mermaid) {
    return `
      <div class="viz-modal-summary">${escapeHtml(viz.summary)}</div>
      <pre class="mermaid">${escapeHtml(viz.mermaid)}</pre>`;
  }

  return `
    <div class="viz-modal-summary">${escapeHtml(viz.summary)}</div>
    ${viz.keyPoints?.length ? `<ul class="viz-modal-points">${viz.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
    ${viz.topics?.length ? `<div class="viz-modal-tags">${viz.topics.map((t) => `<span class="viz-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}`;
}

// ---------- boot ----------

async function boot() {
  syncSegmented();
  updateRoutePillLabel();
  await Promise.all([loadModels(), loadProjects(), loadSessions(), loadConnectors(), loadOnboarding(), loadCredentials()]);
  await refreshJobs();

  // Reopen the most recently used chat so history is visibly there on
  // relaunch, not just reachable by clicking into the sidebar.
  if (state.sessions.length) {
    await openSession(state.sessions[0].id);
  } else {
    renderConversation();
    updateContextLabel();
    syncProjectPermPanel();
  }

  const pull = await getJSON('/api/models/pull-status');
  if (pull.active) pollPullStatus();
}

setInterval(refreshJobs, 1200);
setInterval(refreshSidebar, 6000);

boot();
