import { mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const attachmentsDir = path.join(__dirname, '..', 'data', 'attachments');

// Moves an ephemeral upload (from data/uploads/, deleted after routing) into
// permanent per-session storage so past chat sessions still show their
// images when reopened. Returns a URL the frontend can load directly.
export function persistAttachment(sessionId, uploadedFile) {
  const dir = path.join(attachmentsDir, String(sessionId));
  mkdirSync(dir, { recursive: true });
  const filename = path.basename(uploadedFile.path);
  const dest = path.join(dir, filename);
  renameSync(uploadedFile.path, dest);
  return `/attachments/${sessionId}/${filename}`;
}
