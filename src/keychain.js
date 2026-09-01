import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE = 'com.tj.ai-partner';

// macOS Keychain via the built-in `security` CLI — no extra dependency, and
// the same trust boundary as every other credential already on this Mac.
// The secret is never written to our own DB or logs; only a keychain
// "account" reference is persisted (see credentials.js).
export async function setSecret(account, secret) {
  await execFileAsync('security', ['add-generic-password', '-a', account, '-s', SERVICE, '-w', secret, '-U']);
}

export async function getSecret(account) {
  try {
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-a', account, '-s', SERVICE, '-w']);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function deleteSecret(account) {
  try {
    await execFileAsync('security', ['delete-generic-password', '-a', account, '-s', SERVICE]);
  } catch {
    // Already gone — fine.
  }
}
