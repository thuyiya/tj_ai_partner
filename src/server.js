import express from 'express';
import { existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeTask } from './router.js';
import {
  recentRequests, stats,
  createProject, listProjects, getProject, updateProjectPermission, deleteProject,
  createSession, listSessions, getSession, touchSession, renameSession, deleteSession,
  addMessage, listMessages
} from './db.js';
import { listModels, deleteModel, DEFAULT_MODEL } from './backends/ollama.js';
import { startPull, pullStatus, cancelPull } from './backends/modelPull.js';
import { maybeUpload, uploadAsset } from './uploads.js';
import { listSources, saveSource, deleteSource, getSkill, saveSkill } from './projectAssets.js';
import { scanTree, readProjectFile, analyzeProject, loadCachedOverview, loadOverviewHtml } from './projectAnalysis.js';
import { listJobs, getJob } from './jobs.js';
import { attachmentsDir, persistAttachment } from './attachments.js';
import { connectors, listConnectorStatus } from './connectors/index.js';
import {
  ensureDefaults, listSafe, addApiKey, activate as activateCredential, remove as removeCredential,
  claudeStatus, codexStatus
} from './credentials.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  ensureDefaults();

  app.use(express.json({ limit: '1mb' }));
  // no-store: this is a locally-served desktop app, not a CDN-fronted site —
  // never worth the staleness risk of a cached HTML/CSS/JS asset.
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
  }));
  app.use('/attachments', express.static(attachmentsDir));

  // ---------- chat routing ----------

  app.post('/api/route', maybeUpload, async (req, res) => {
    let uploadedFiles = [];
    let session;

    try {
      const { prompt, force, model, threshold } = req.body ?? {};
      const rawHistory = req.body?.history;
      const history = typeof rawHistory === 'string' ? JSON.parse(rawHistory) : (rawHistory ?? []);
      uploadedFiles = req.files ?? [];

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'prompt is required' });
      }
      if (force && !['ollama', 'claude', 'codex', 'image'].includes(force)) {
        return res.status(400).json({ error: 'force must be "ollama", "claude", "codex", or "image"' });
      }

      session = req.body.sessionId ? getSession(Number(req.body.sessionId)) : null;
      if (!session) session = createSession({ projectId: req.body.projectId ? Number(req.body.projectId) : null });

      const project = session.project_id ? getProject(session.project_id) : null;
      const images = uploadedFiles.map((f) => ({ path: f.path, mimetype: f.mimetype }));

      const result = await routeTask(prompt, {
        force: force || undefined,
        model: model || undefined,
        threshold: threshold ? Number(threshold) : undefined,
        images,
        history,
        project: project ? { name: project.name, path: project.path, permissionMode: project.permission_mode } : undefined
      });

      const persistedImages = uploadedFiles.map((f) => persistAttachment(session.id, f));
      const generatedImages = result.generatedImagePath
        ? [persistAttachment(session.id, { path: result.generatedImagePath })]
        : [];

      addMessage({ sessionId: session.id, role: 'user', content: prompt, images: persistedImages });
      addMessage({
        sessionId: session.id, role: 'assistant', content: result.text, images: generatedImages,
        backend: result.backend, model: result.model, score: result.score,
        latencyMs: result.latencyMs, costUsd: result.costUsd,
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        visualization: result.visualization
      });
      touchSession(session.id, prompt.slice(0, 60));

      res.json({ ...result, images: generatedImages, sessionId: session.id });
    } catch (error) {
      for (const f of uploadedFiles) unlink(f.path).catch(() => {});
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      if (session) {
        addMessage({ sessionId: session.id, role: 'user', content: prompt, images: [] });
        addMessage({ sessionId: session.id, role: 'assistant', content: '', error: error.message });
        touchSession(session.id, prompt.slice(0, 60));
      }
      res.status(502).json({ error: error.message, sessionId: session?.id });
    }
  });

  // ---------- sessions ----------

  app.get('/api/sessions', (req, res) => res.json(listSessions()));

  app.post('/api/sessions', (req, res) => {
    const { projectId } = req.body ?? {};
    res.json(createSession({ projectId: projectId ?? null }));
  });

  app.get('/api/sessions/:id/messages', (req, res) => {
    res.json(listMessages(Number(req.params.id)));
  });

  app.patch('/api/sessions/:id', (req, res) => {
    const { title } = req.body ?? {};
    if (title) renameSession(Number(req.params.id), title);
    res.json(getSession(Number(req.params.id)));
  });

  app.delete('/api/sessions/:id', (req, res) => {
    deleteSession(Number(req.params.id));
    res.json({ deleted: true });
  });

  // ---------- projects ----------

  app.get('/api/projects', (req, res) => res.json(listProjects()));

  app.post('/api/projects', (req, res) => {
    const { name, path: projectPath, permissionMode = 'plan' } = req.body ?? {};
    if (!name || !projectPath) return res.status(400).json({ error: 'name and path are required' });
    if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
      return res.status(400).json({ error: `not a directory: ${projectPath}` });
    }
    try {
      res.json(createProject({ name, path: path.resolve(projectPath), permissionMode }));
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  app.patch('/api/projects/:id', (req, res) => {
    const { permissionMode } = req.body ?? {};
    if (!['plan', 'edits', 'full'].includes(permissionMode)) {
      return res.status(400).json({ error: 'permissionMode must be plan, edits, or full' });
    }
    res.json(updateProjectPermission(Number(req.params.id), permissionMode));
  });

  app.delete('/api/projects/:id', (req, res) => {
    deleteProject(Number(req.params.id));
    res.json({ deleted: true });
  });

  // ---------- project sources + skill ----------
  // Stored inside the project's own folder (<path>/.ai-with-tj/) — see
  // projectAssets.js for why: it's where the user can actually see them,
  // and it works uniformly for every backend including local Ollama.

  app.get('/api/projects/:id/sources', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    try {
      res.json(listSources(project));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/projects/:id/sources', uploadAsset.single('file'), (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    try {
      res.json(saveSource(project, req.file));
    } catch (error) {
      unlink(req.file.path).catch(() => {});
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/projects/:id/sources/:filename', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    deleteSource(project, req.params.filename);
    res.json({ deleted: true });
  });

  app.get('/api/projects/:id/skill', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    res.json({ content: getSkill(project) });
  });

  app.put('/api/projects/:id/skill', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    saveSkill(project, req.body?.content ?? '');
    res.json({ saved: true });
  });

  // ---------- project codebase explorer + AI-generated overview ----------
  // All local/free — see projectAnalysis.js. Nothing here ever calls
  // Claude/Codex, so opening or re-scanning a project costs nothing.

  app.get('/api/projects/:id/tree', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    try {
      res.json(scanTree(project.path));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/projects/:id/file', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: 'path is required' });
    try {
      res.json(readProjectFile(project, relPath));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/projects/:id/overview', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    const cached = loadCachedOverview(project);
    res.json(cached ?? { cached: false });
  });

  app.get('/api/projects/:id/overview.html', (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).send('Project not found');
    const html = loadOverviewHtml(project);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html ?? '<p style="font-family:sans-serif;padding:24px;">No overview generated yet — click "Analyze project" first.</p>');
  });

  app.post('/api/projects/:id/analyze', async (req, res) => {
    const project = getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'project not found' });
    try {
      res.json(await analyzeProject(project));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------- connectors (plugins) ----------

  app.get('/api/connectors', async (req, res) => {
    try {
      res.json(await listConnectorStatus());
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/connectors/github/repo', async (req, res) => {
    const project = getProject(Number(req.query.projectId));
    if (!project) return res.status(404).json({ error: 'project not found' });
    try {
      const repo = await connectors.github.module.detectRepo(project.path);
      res.json({ repo });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/connectors/github/list', async (req, res) => {
    const { repo, type = 'issue' } = req.query;
    if (!repo) return res.status(400).json({ error: 'repo is required' });
    try {
      const items = type === 'pr'
        ? await connectors.github.module.listPRs(repo)
        : await connectors.github.module.listIssues(repo);
      res.json(items);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/connectors/github/context', async (req, res) => {
    const { repo, number, type = 'issue' } = req.query;
    if (!repo || !number) return res.status(400).json({ error: 'repo and number are required' });
    try {
      const context = type === 'pr'
        ? await connectors.github.module.getPRContext(repo, number)
        : await connectors.github.module.getIssueContext(repo, number);
      res.json(context);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // ---------- onboarding + credentials ----------

  app.get('/api/onboarding', async (req, res) => {
    const { execFile } = await import('node:child_process');
    const checkInstalled = (bin) => new Promise((resolve) => {
      execFile(bin, ['--version'], (error) => resolve(!error || error.code !== 'ENOENT'));
    });

    const [claude, codex, github, ollamaOk, drawThingsInstalled] = await Promise.all([
      claudeStatus(),
      codexStatus(),
      connectors.github.module.status(),
      listModels().then(() => true).catch(() => false),
      checkInstalled('draw-things-cli')
    ]);

    res.json({
      claude, codex, github,
      ollama: { installed: true, reachable: ollamaOk },
      drawThings: { installed: drawThingsInstalled }
    });
  });

  app.get('/api/credentials', (req, res) => {
    res.json(listSafe(req.query.provider || undefined));
  });

  app.post('/api/credentials', async (req, res) => {
    const { provider, label, apiKey } = req.body ?? {};
    if (!['claude', 'codex'].includes(provider)) return res.status(400).json({ error: 'provider must be "claude" or "codex"' });
    try {
      res.json(await addApiKey(provider, label, apiKey));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/credentials/:id/activate', async (req, res) => {
    try {
      res.json(await activateCredential(Number(req.params.id)));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/credentials/:id', async (req, res) => {
    try {
      await removeCredential(Number(req.params.id));
      res.json({ deleted: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ---------- models ----------

  app.get('/api/models', async (req, res) => {
    try {
      const installed = await listModels();
      res.json({ default: DEFAULT_MODEL, installed });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.post('/api/models/pull', async (req, res) => {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    try {
      await startPull(name.trim());
      res.json({ started: true });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  app.get('/api/models/pull-status', (req, res) => res.json(pullStatus()));

  app.post('/api/models/pull/cancel', (req, res) => {
    try {
      cancelPull();
      res.json({ cancelled: true });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  app.delete('/api/models', async (req, res) => {
    const { name } = req.query;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    try {
      await deleteModel(name);
      res.json({ deleted: true });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // ---------- analytics ----------

  app.get('/api/requests', (req, res) => {
    res.json(recentRequests(Math.min(Number(req.query.limit) || 50, 500)));
  });
  app.get('/api/stats', (req, res) => res.json(stats()));
  app.get('/api/active', (req, res) => res.json(listJobs()));

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'job not found or expired' });
    res.json(job);
  });

  return app;
}

export function startServer(port = process.env.PORT ?? 4141) {
  const app = createApp();

  // This process also hosts the Electron main process — a single bad
  // request must never take the whole desktop app down with it.
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
  process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

  return app.listen(port, () => {
    console.log(`ai-with-tj router listening on http://localhost:${port}`);
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) startServer();
