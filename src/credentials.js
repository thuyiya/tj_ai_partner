import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  listCredentials, getCredential, getActiveCredential,
  createCredential, activateCredential, deleteCredential
} from './db.js';
import { setSecret, getSecret, deleteSecret } from './keychain.js';

const execFileAsync = promisify(execFile);
const PROVIDERS = ['claude', 'codex'];

// Every provider always has at least one 'cli' credential representing
// "whatever the claude/codex CLI is already logged into" — this is exactly
// today's behavior, so a fresh install works with zero setup.
export function ensureDefaults() {
  for (const provider of PROVIDERS) {
    const existing = listCredentials(provider);
    if (existing.length === 0) {
      const cred = createCredential({ provider, label: 'Existing CLI login', type: 'cli' });
      activateCredential(cred.id);
    }
  }
}

export function listSafe(provider) {
  // Never includes a secret — the DB never has one to include.
  return listCredentials(provider);
}

export async function addApiKey(provider, label, apiKey) {
  if (!PROVIDERS.includes(provider)) throw new Error(`unknown provider: ${provider}`);
  if (!apiKey?.trim()) throw new Error('apiKey is required');
  const keychainAccount = `${provider}-${randomUUID()}`;
  await setSecret(keychainAccount, apiKey.trim());
  return createCredential({ provider, label: label || 'API key', type: 'api_key', keychainAccount });
}

// Claude: fully scoped, fully automatable — an API key is just an env var
// passed to the specific spawned `claude` process (see backends/claude.js).
// No global state changes, nothing to undo.
//
// Codex: NOT scoped — the CLI only supports a persistent, global login state
// (`codex login` / `codex login --with-api-key` / `codex logout`), confirmed
// against the CLI's own docs. Switching Codex credentials from this app
// changes what `codex` uses everywhere, including the user's own terminal.
// Switching TO an API key is automatable (we have the key to pipe in).
// Switching TO the CLI/ChatGPT credential is NOT automatable — a fresh
// OAuth login needs an interactive browser flow we cannot drive headlessly.
// We just flip our own bookkeeping and tell the caller what's true.
export async function activate(id) {
  const cred = getCredential(id);
  if (!cred) throw new Error('credential not found');

  if (cred.provider === 'codex') {
    if (cred.type === 'api_key') {
      const apiKey = await getSecret(cred.keychain_account);
      if (!apiKey) throw new Error('stored key not found in Keychain — it may have been removed outside this app');
      await execFileAsync('codex', ['logout']).catch(() => {});
      await new Promise((resolve, reject) => {
        const child = execFile('codex', ['login', '--with-api-key'], (error, stdout, stderr) => {
          if (error) reject(new Error(stderr?.trim() || error.message));
          else resolve(stdout);
        });
        child.stdin.write(apiKey);
        child.stdin.end();
      });
      return { credential: activateCredential(id), note: 'Codex CLI is now using this API key — this also affects `codex` in your terminal, not just this app.' };
    }
    // Switching back to "CLI/ChatGPT" — only bookkeeping; can't drive the
    // interactive browser login for them.
    const status = await codexStatus();
    activateCredential(id);
    return {
      credential: getCredential(id),
      note: status.loggedIn && status.method !== 'apikey'
        ? 'Marked active. Codex CLI already has a ChatGPT session.'
        : 'Marked active, but Codex CLI isn\'t currently signed in with ChatGPT — run `codex login` in a terminal to complete it (needs a browser).'
    };
  }

  // Claude: no side effect needed — activating just changes which
  // credential this app injects on the next call.
  return { credential: activateCredential(id), note: null };
}

export async function remove(id) {
  const cred = getCredential(id);
  if (!cred) return;
  if (cred.is_active) throw new Error('cannot delete the active credential — activate another one first');
  if (cred.keychain_account) await deleteSecret(cred.keychain_account);
  deleteCredential(id);
}

// Used by router.js right before a Claude call — returns the API key to
// inject as ANTHROPIC_API_KEY, or null to use the ambient CLI login as-is.
export async function activeClaudeApiKey() {
  const cred = getActiveCredential('claude');
  if (!cred || cred.type !== 'api_key') return null;
  return getSecret(cred.keychain_account);
}

export async function claudeStatus() {
  try {
    const { stdout } = await execFileAsync('claude', ['auth', 'status']);
    const data = JSON.parse(stdout);
    return { installed: true, loggedIn: Boolean(data.loggedIn), email: data.email, plan: data.subscriptionType };
  } catch (error) {
    return { installed: error.code !== 'ENOENT', loggedIn: false };
  }
}

export async function codexStatus() {
  try {
    // Confirmed empirically: `codex login status` writes its message to
    // stderr, not stdout — reading only stdout silently looked like "not
    // logged in" even when it was.
    const { stdout, stderr } = await execFileAsync('codex', ['login', 'status']);
    const text = `${stdout}${stderr}`.trim();
    const loggedIn = /logged in/i.test(text);
    const method = /chatgpt/i.test(text) ? 'chatgpt' : /api key/i.test(text) ? 'apikey' : null;
    return { installed: true, loggedIn, method, raw: text };
  } catch (error) {
    return { installed: error.code !== 'ENOENT', loggedIn: false };
  }
}
