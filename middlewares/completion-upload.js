const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'completions');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Strict image MIME to extension mapping for completion evidence
const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

const DANGEROUS_EXTENSIONS = [
  '.exe', '.sh', '.bat', '.cmd', '.js', '.mjs', '.php', '.phtml',
  '.html', '.htm', '.xhtml', '.svg', '.xml', '.jsp', '.asp', '.aspx',
  '.py', '.rb', '.pl', '.cgi', '.dll', '.jar', '.vbs', '.ps1'
];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, rawExt)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 40);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${uniqueSuffix}-${cleanBase}${rawExt}`);
  },
});

const fileFilter = function (req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Block dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return cb(new Error('Uploaded file type is restricted.'));
  }

  // Check double extensions
  const parts = file.originalname.split('.');
  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i++) {
      if (DANGEROUS_EXTENSIONS.includes(`.${parts[i].toLowerCase()}`)) {
        return cb(new Error('Uploaded file contains prohibited multi-extension format.'));
      }
    }
  }

  // Validate allowed image types
  const allowedExts = ALLOWED_MIME_TO_EXT[file.mimetype];
  if (!allowedExts || !allowedExts.includes(ext)) {
    return cb(new Error('Only JPG, PNG, and WEBP images are allowed for completion evidence.'));
  }

  cb(null, true);
};

const completionUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per image
    files: 5
  },
});

module.exports = completionUpload;
