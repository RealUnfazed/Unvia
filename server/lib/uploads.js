// Image uploads to PostFile.
const multer = require('multer');
const { PF, pfH } = require('../config');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const pfDelete = (id) => fetch(`${PF}/files/${id}`, { method: 'DELETE', headers: pfH }).catch(() => {});

async function pfUpload(f) {
  const form = new FormData();
  form.append('file', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
  const r = await fetch(`${PF}/upload`, { method: 'POST', headers: pfH, body: form });
  if (!r.ok) return null;
  const j = await r.json();
  return { url: j.url, fileId: j.file_id };
}

module.exports = { pfDelete, pfUpload, upload };
