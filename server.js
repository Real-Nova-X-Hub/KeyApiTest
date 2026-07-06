const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const { readDb, writeDb, randomId, FILES_DIR } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-render-env-vars';

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// ---------- AUTH HELPERS ----------
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

// ---------- AUTH ROUTES ----------
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Tên đăng nhập không được để trống.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải từ 6 ký tự trở lên.' });
  }
  const db = readDb();
  const exists = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
  }
  const user = {
    id: randomId(10),
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: Date.now()
  };
  db.users.push(user);
  writeDb(db);
  return res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  const token = signToken(user);
  return res.json({ token, username: user.username });
});

// ---------- KEY GENERATION ROUTES ----------
app.post('/api/keys/generate', authMiddleware, (req, res) => {
  const { durationMs } = req.body || {};
  const allowed = [3600000, 21600000, 43200000, 86400000, 259200000, 604800000, 2592000000];
  const dur = allowed.includes(Number(durationMs)) ? Number(durationMs) : 86400000;

  const now = Date.now();
  const record = {
    id: randomId(10),
    owner: req.user.username,
    key: 'KEY_' + randomId(16).toUpperCase(),
    createdAt: now,
    durationMs: dur,
    expiresAt: now + dur
  };
  const db = readDb();
  db.keys.unshift(record);
  writeDb(db);
  res.json(record);
});

app.get('/api/keys/history', authMiddleware, (req, res) => {
  const db = readDb();
  const items = db.keys.filter(k => k.owner === req.user.username);
  res.json(items);
});

app.post('/api/keys/:id/regenerate', authMiddleware, (req, res) => {
  const db = readDb();
  const rec = db.keys.find(k => k.id === req.params.id && k.owner === req.user.username);
  if (!rec) return res.status(404).json({ error: 'Không tìm thấy key.' });
  const now = Date.now();
  rec.key = 'KEY_' + randomId(16).toUpperCase();
  rec.createdAt = now;
  rec.expiresAt = now + rec.durationMs;
  writeDb(db);
  res.json(rec);
});

app.delete('/api/keys/:id', authMiddleware, (req, res) => {
  const db = readDb();
  db.keys = db.keys.filter(k => !(k.id === req.params.id && k.owner === req.user.username));
  writeDb(db);
  res.json({ ok: true });
});

// ---------- UPLOAD (CODE PASTE OR FILE) ROUTES ----------

// Dán code trực tiếp (JSON body)
app.post('/api/uploads/code', authMiddleware, (req, res) => {
  const { content, filename, note } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Nội dung code không được để trống.' });
  }
  const id = randomId(8);
  const record = {
    id,
    owner: req.user.username,
    kind: 'code',
    filename: (filename && filename.trim()) || 'snippet.txt',
    note: note || '',
    size: Buffer.byteLength(content, 'utf-8'),
    createdAt: Date.now()
  };
  const filePath = path.join(FILES_DIR, id + '.raw');
  fs.writeFileSync(filePath, content, 'utf-8');

  const db = readDb();
  db.uploads.unshift(record);
  writeDb(db);

  res.json({ ...record, rawPath: `/api/upload/${id}/raw` });
});

// Upload file thật (multipart/form-data)
app.post('/api/uploads/file', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Vui lòng chọn file để upload.' });
  }
  const note = (req.body && req.body.note) || '';
  const id = randomId(8);
  const record = {
    id,
    owner: req.user.username,
    kind: 'file',
    filename: req.file.originalname,
    mimetype: req.file.mimetype || 'application/octet-stream',
    note,
    size: req.file.size,
    createdAt: Date.now()
  };
  const filePath = path.join(FILES_DIR, id + '.bin');
  fs.writeFileSync(filePath, req.file.buffer);

  const db = readDb();
  db.uploads.unshift(record);
  writeDb(db);

  res.json({ ...record, rawPath: `/api/upload/${id}/raw` });
});

// Link raw công khai — KHÔNG cần đăng nhập, đây là điểm để chia sẻ.
app.get('/api/upload/:id/raw', (req, res) => {
  const db = readDb();
  const record = db.uploads.find(u => u.id === req.params.id);
  if (!record) return res.status(404).type('text/plain').send('Không tìm thấy nội dung.');

  if (record.kind === 'code') {
    const filePath = path.join(FILES_DIR, record.id + '.raw');
    if (!fs.existsSync(filePath)) return res.status(404).type('text/plain').send('Nội dung đã bị xóa.');
    res.type('text/plain; charset=utf-8').send(fs.readFileSync(filePath, 'utf-8'));
  } else {
    const filePath = path.join(FILES_DIR, record.id + '.bin');
    if (!fs.existsSync(filePath)) return res.status(404).type('text/plain').send('File đã bị xóa.');
    res.type(record.mimetype || 'application/octet-stream').send(fs.readFileSync(filePath));
  }
});

app.get('/api/uploads/history', authMiddleware, (req, res) => {
  const db = readDb();
  const items = db.uploads
    .filter(u => u.owner === req.user.username)
    .map(u => ({ ...u, rawPath: `/api/upload/${u.id}/raw` }));
  res.json(items);
});

app.delete('/api/uploads/:id', authMiddleware, (req, res) => {
  const db = readDb();
  const record = db.uploads.find(u => u.id === req.params.id && u.owner === req.user.username);
  if (record) {
    const ext = record.kind === 'code' ? '.raw' : '.bin';
    const filePath = path.join(FILES_DIR, record.id + ext);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.uploads = db.uploads.filter(u => !(u.id === req.params.id && u.owner === req.user.username));
  writeDb(db);
  res.json({ ok: true });
});

// Fallback: mọi route không khớp API trả về index.html (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Không tìm thấy.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GetKey server đang chạy tại cổng ${PORT}`);
});
