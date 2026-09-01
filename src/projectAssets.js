import { mkdirSync, readdirSync, statSync, renameSync, unlinkSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Sources/skills live inside the project's own real folder, not a separate
// app-managed store — the same reasoning as everything else in this app:
// a project already points at a real directory, Claude/Codex already get
// file access to it under Edits/Full, and the user can see exactly where
// "the references" are kept (their own Finder window), not a hidden DB blob.
const DOT_DIR = '.ai-with-tj';
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.yaml', '.yml', '.js', '.ts', '.py', '.rb', '.html', '.css', '.log']);
const MAX_INLINE_CHARS = 4000;

function dotDir(project) {
  const dir = path.join(project.path, DOT_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function sourcesDir(project) {
  const dir = path.join(dotDir(project), 'sources');
  mkdirSync(dir, { recursive: true });
  return dir;
}
function skillPath(project) {
  return path.join(dotDir(project), 'SKILL.md');
}

export function listSources(project) {
  const dir = sourcesDir(project);
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const stat = statSync(path.join(dir, name));
      return { name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function saveSource(project, uploadedFile) {
  const dest = path.join(sourcesDir(project), path.basename(uploadedFile.originalname));
  renameSync(uploadedFile.path, dest);
  return { name: path.basename(dest) };
}

export function deleteSource(project, filename) {
  const target = path.join(sourcesDir(project), path.basename(filename));
  if (existsSync(target)) unlinkSync(target);
}

export function getSkill(project) {
  const file = skillPath(project);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

export function saveSkill(project, content) {
  writeFileSync(skillPath(project), content ?? '', 'utf8');
}

// Injected into the prompt for every backend (including local Ollama, which
// has no file-system access at all) — matches how ChatGPT/Claude "Projects"
// actually work: the model sees the content directly, not just a path it
// might go read if it happens to have tool access.
export function buildProjectContext(project) {
  const parts = [];

  const skill = getSkill(project);
  if (skill.trim()) {
    parts.push(`Project instructions (from this project's SKILL.md — follow these):\n${skill.slice(0, MAX_INLINE_CHARS)}`);
  }

  const sources = listSources(project);
  const textSources = sources.filter((s) => TEXT_EXTENSIONS.has(path.extname(s.name).toLowerCase()));
  for (const source of textSources) {
    try {
      const content = readFileSync(path.join(sourcesDir(project), source.name), 'utf8').slice(0, MAX_INLINE_CHARS);
      parts.push(`Project reference "${source.name}":\n${content}`);
    } catch {
      // Unreadable as text (e.g. binary despite the extension) — skip silently.
    }
  }

  const nonTextCount = sources.length - textSources.length;
  if (nonTextCount > 0) {
    parts.push(`(${nonTextCount} additional non-text project source file(s) available in the project folder — not shown here, but Claude/Codex can read them directly if this project grants file access.)`);
  }

  return parts.join('\n\n---\n\n');
}
