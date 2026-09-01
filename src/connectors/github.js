import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function gh(args, opts = {}) {
  const { stdout } = await execFileAsync('gh', args, { maxBuffer: 5 * 1024 * 1024, ...opts });
  return stdout;
}

export async function status() {
  try {
    await gh(['auth', 'status']);
    return { connected: true, detail: 'Authenticated' };
  } catch (error) {
    const notFound = error.code === 'ENOENT';
    return {
      connected: false,
      detail: notFound ? 'gh CLI not installed' : 'Not authenticated — run `gh auth login`'
    };
  }
}

// Parses "owner/repo" from a git remote URL (https or ssh form).
export async function detectRepo(projectPath) {
  try {
    const url = (await gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd: projectPath })).trim();
    return url || null;
  } catch {
    return null;
  }
}

export async function listIssues(repo, { state = 'open', limit = 10 } = {}) {
  const out = await gh([
    'issue', 'list', '--repo', repo, '--state', state, '--limit', String(limit),
    '--json', 'number,title,state,url'
  ]);
  return JSON.parse(out);
}

export async function listPRs(repo, { state = 'open', limit = 10 } = {}) {
  const out = await gh([
    'pr', 'list', '--repo', repo, '--state', state, '--limit', String(limit),
    '--json', 'number,title,state,url'
  ]);
  return JSON.parse(out);
}

export async function getIssueContext(repo, number) {
  const out = await gh([
    'issue', 'view', String(number), '--repo', repo,
    '--json', 'number,title,body,state,url,comments'
  ]);
  const issue = JSON.parse(out);
  const comments = (issue.comments ?? [])
    .slice(0, 5)
    .map((c) => `  - ${c.author?.login ?? 'someone'}: ${c.body}`)
    .join('\n');

  return {
    label: `gh:${repo}#${number}`,
    text: `GitHub issue ${repo}#${issue.number} — "${issue.title}" (${issue.state})\nURL: ${issue.url}\n\n${issue.body ?? ''}${comments ? `\n\nRecent comments:\n${comments}` : ''}`
  };
}

export async function getPRContext(repo, number) {
  const out = await gh([
    'pr', 'view', String(number), '--repo', repo,
    '--json', 'number,title,body,state,url,files'
  ]);
  const pr = JSON.parse(out);
  const files = (pr.files ?? []).map((f) => `  - ${f.path} (+${f.additions}/-${f.deletions})`).join('\n');
  const diff = await gh(['pr', 'diff', String(number), '--repo', repo]).catch(() => '');
  const truncatedDiff = diff.length > 6000 ? diff.slice(0, 6000) + '\n… (diff truncated)' : diff;

  return {
    label: `gh:${repo}#${number}`,
    text: `GitHub PR ${repo}#${pr.number} — "${pr.title}" (${pr.state})\nURL: ${pr.url}\n\n${pr.body ?? ''}\n\nFiles changed:\n${files}\n\nDiff:\n${truncatedDiff}`
  };
}
