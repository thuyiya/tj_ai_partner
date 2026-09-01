import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.has(file.mimetype))
});

// Applies multer only when the request is actually multipart (image attached);
// plain JSON requests (CLI, no attachment) skip it entirely.
export function maybeUpload(req, res, next) {
  if (req.is('multipart/form-data')) {
    return upload.array('images', 4)(req, res, next);
  }
  next();
}

// Project sources: any file type, original filename preserved (moved into
// the project's own folder afterward — see projectAssets.js), larger limit
// since these can be real reference documents, not just chat attachments.
export const uploadAsset = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});
