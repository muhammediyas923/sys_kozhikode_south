const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'programs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Strict mapping of allowed MIME types to permissible extensions
const ALLOWED_MIME_TO_EXT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
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
      .substring(0, 50);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${uniqueSuffix}-${cleanBase}${rawExt}`);
  },
});

const fileFilter = function (req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Block obvious dangerous extensions regardless of reported MIME type
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return cb(new Error('Uploaded file type is restricted for security reasons.'));
  }

  // Check double extensions (e.g., payload.php.jpg)
  const parts = file.originalname.split('.');
  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i++) {
      if (DANGEROUS_EXTENSIONS.includes(`.${parts[i].toLowerCase()}`)) {
        return cb(new Error('Uploaded file contains prohibited multi-extension format.'));
      }
    }
  }

  // Validate MIME type against allowed whitelist
  const allowedExts = ALLOWED_MIME_TO_EXT[file.mimetype];
  if (!allowedExts || !allowedExts.includes(ext)) {
    return cb(new Error('Unsupported file type or extension mismatch. Allowed: PDF, JPG, PNG, GIF, WEBP, DOC, DOCX.'));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 10
  },
});

module.exports = upload;
