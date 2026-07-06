// Pixel Shop backend - zero external dependencies (Node built-ins only)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const DB_PATH = path.join(__dirname, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// ---------- tiny JSON "database" ----------
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      products: [
        {
          id: 'p1',
          name: 'acc full gear',
          category: 'acc',
          status: 'Con hang',
          price: 36000,
          image: '',
          sold: 0
        }
      ],
      transactions: [],
      sessions: {}
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- password hashing (pbkdf2, built into Node's crypto) ----------
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}
function makeUser(username, password, role = 'member') {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    role, // 'member' | 'owner'
    balance: 0,
    ownsShop: role === 'owner' // seed owner already "owns" the shop
  };
}

// ---------- seed the owner account on first run ----------
function ensureSeedOwner(db) {
  const exists = db.users.find(u => u.username === 'anhdepzai');
  if (!exists) {
    db.users.push(makeUser('anhdepzai', '12345123', 'owner'));
    saveDB(db);
    console.log('Seeded owner account: anhdepzai / 12345123');
  }
}

// ---------- session helpers (simple bearer token, server-side session map) ----------
function createSession(db, username) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { username, createdAt: Date.now() };
  saveDB(db);
  return token;
}
function getSessionUser(db, req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const sess = db.sessions[token];
  if (!sess) return null;
  return db.users.find(u => u.username === sess.username) || null;
}

// ---------- response helpers ----------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// safe user object to send to the client (never leak password hash/salt)
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    balance: u.balance,
    ownsShop: u.ownsShop
  };
}

// ---------- static file serving ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- API routes ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  let db = loadDB();

  try {
    // ---- AUTH ----
    if (pathname === '/api/register' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username || !password) return sendJSON(res, 400, { error: 'Thieu username hoac mat khau' });
      if (db.users.find(u => u.username === username)) {
        return sendJSON(res, 409, { error: 'Username da ton tai' });
      }
      const user = makeUser(username, password, 'member');
      db.users.push(user);
      saveDB(db);
      const token = createSession(db, username);
      return sendJSON(res, 201, { token, user: publicUser(user) });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const user = db.users.find(u => u.username === username);
      if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
        return sendJSON(res, 401, { error: 'Sai username hoac mat khau' });
      }
      const token = createSession(db, username);
      return sendJSON(res, 200, { token, user: publicUser(user) });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      const auth = req.headers['authorization'];
      if (auth && auth.startsWith('Bearer ')) {
        delete db.sessions[auth.slice(7)];
        saveDB(db);
      }
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Chua dang nhap' });
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    // ---- SHOP / PRODUCTS ----
    if (pathname === '/api/products' && req.method === 'GET') {
      return sendJSON(res, 200, { products: db.products });
    }

    if (pathname === '/api/buy' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const { productId } = await readBody(req);
      const product = db.products.find(p => p.id === productId);
      if (!product) return sendJSON(res, 404, { error: 'San pham khong ton tai' });
      if (product.status !== 'Con hang') return sendJSON(res, 400, { error: 'San pham da het hang' });
      if (user.balance < product.price) return sendJSON(res, 400, { error: 'So du khong du' });

      user.balance -= product.price;
      product.status = 'Het hang';
      product.sold += 1;
      db.transactions.push({
        id: crypto.randomBytes(8).toString('hex'),
        username: user.username,
        productId: product.id,
        productName: product.name,
        price: product.price,
        date: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    // ---- HISTORY ----
    if (pathname === '/api/history' && req.method === 'GET') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const tx = db.transactions.filter(t => t.username === user.username);
      return sendJSON(res, 200, { transactions: tx });
    }

    // ---- SHOP INFO ----
    if (pathname === '/api/info' && req.method === 'GET') {
      return sendJSON(res, 200, {
        productCount: db.products.length,
        sold: db.products.reduce((s, p) => s + p.sold, 0),
        members: db.users.length,
        rating: '5/5',
        processingSpeed: '5s'
      });
    }

    // ---- TOP UP (nap the) ----
    if (pathname === '/api/topup' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const { carrier, amount, code, serial } = await readBody(req);
      if (!carrier || !amount || !code || !serial) {
        return sendJSON(res, 400, { error: 'Vui long dien day du thong tin the' });
      }
      // NOTE: this demo just records the top-up request; real card verification
      // requires a licensed card-gateway provider (e.g. the ones used by Vietnamese
      // payment aggregators) which needs its own merchant credentials to integrate.
      db.transactions.push({
        id: crypto.randomBytes(8).toString('hex'),
        username: user.username,
        type: 'topup_pending',
        carrier,
        amount,
        date: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { message: 'Da gui yeu cau nap the, cho xu ly' });
    }

    // ---- MY SHOP ----
    if (pathname === '/api/buy-shop' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const SHOP_PRICE = 50000;
      if (user.ownsShop) return sendJSON(res, 400, { error: 'Ban da so huu shop' });
      if (user.balance < SHOP_PRICE) return sendJSON(res, 400, { error: 'So du khong du' });
      user.balance -= SHOP_PRICE;
      user.ownsShop = true;
      saveDB(db);
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    // ---- OWNER-ONLY: add product (normal, transparent admin check) ----
    if (pathname === '/api/admin/products' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const { name, category, price, image } = await readBody(req);
      if (!name || !price) return sendJSON(res, 400, { error: 'Thieu thong tin san pham' });
      const product = {
        id: 'p' + crypto.randomBytes(4).toString('hex'),
        name,
        category: category || 'acc',
        status: 'Con hang',
        price: Number(price),
        image: image || '',
        sold: 0
      };
      db.products.push(product);
      saveDB(db);
      return sendJSON(res, 201, { product });
    }

    return sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Loi server' });
  }
});

const db = loadDB();
ensureSeedOwner(db);

server.listen(PORT, () => {
  console.log(`Pixel Shop dang chay tai http://localhost:${PORT}`);
});
