import exp from 'express'
import { verifyToken } from '../middlewares/auth.js'
import { uploader } from '../middlewares/upload.js'

export const uploadApp = exp.Router()

// POST /upload-api  (multipart/form-data, field name "files", up to 5 files, 5MB each)
// Returns paths like "/uploads/<random>.jpg". Store these strings on documents / evidence / cases.
uploadApp.post('/', verifyToken, (req, res, next) => {
  uploader.array('files', 5)(req, res, (err) => {
    if (err) return next(err)
    if (!req.files?.length) return res.status(400).json({ message: 'No file received' })
    res.status(201).json({
      files: req.files.map((f) => ({
        url: `/uploads/${f.filename}`,
        name: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
      })),
    })
  })
})
