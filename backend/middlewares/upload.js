import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// Only these types are accepted; the stored extension is derived from the
// (server-checked) mimetype, never from the user-supplied filename.
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // unguessable name: files are served statically, so the name is the capability
  filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${ALLOWED[file.mimetype]}`),
})

export const uploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true)
    const err = new Error('Only JPG, PNG, WEBP images and PDF documents are allowed')
    err.status = 400
    cb(err)
  },
})
