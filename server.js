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
          sold: 0,
          ownerUsername: 'anhdepzai'
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
    role, // 'member' | 'buys' (seller) | 'owner'
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
      if (user.role === 'member') user.role = 'buys'; // becoming a seller
      saveDB(db);
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    // ---- SELLER (role 'buys' or 'owner'): manage own products only ----
    const sellerMatch = pathname.match(/^\/api\/seller\/products\/([^/]+)$/);

    if (pathname === '/api/seller/products' && req.method === 'GET') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'buys' && user.role !== 'owner') {
        return sendJSON(res, 403, { error: 'Ban chua co quyen ban hang' });
      }
      const mine = db.products.filter(p => p.ownerUsername === user.username);
      return sendJSON(res, 200, { products: mine });
    }

    if (pathname === '/api/seller/products' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'buys' && user.role !== 'owner') {
        return sendJSON(res, 403, { error: 'Ban chua co quyen ban hang' });
      }
      const { name, category, price, image } = await readBody(req);
      if (!name || !price) return sendJSON(res, 400, { error: 'Thieu thong tin san pham' });
      const product = {
        id: 'p' + crypto.randomBytes(4).toString('hex'),
        name,
        category: category || 'acc',
        status: 'Con hang',
        price: Number(price),
        image: image || '',
        sold: 0,
        ownerUsername: user.username
      };
      db.products.push(product);
      saveDB(db);
      return sendJSON(res, 201, { product });
    }

    if (sellerMatch && req.method === 'PUT') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const product = db.products.find(p => p.id === sellerMatch[1]);
      if (!product) return sendJSON(res, 404, { error: 'San pham khong ton tai' });
      const isOwnerRole = user.role === 'owner';
      const ownsThisProduct = product.ownerUsername === user.username;
      if (!isOwnerRole && !ownsThisProduct) {
        return sendJSON(res, 403, { error: 'Ban khong the chinh sua san pham cua nguoi khac' });
      }
      const { name, category, price, image, status } = await readBody(req);
      if (name !== undefined) product.name = name;
      if (category !== undefined) product.category = category;
      if (price !== undefined) product.price = Number(price);
      if (image !== undefined) product.image = image;
      if (status !== undefined) product.status = status; // e.g. mark "Het hang" (expired/out of stock)
      saveDB(db);
      return sendJSON(res, 200, { product });
    }

    if (sellerMatch && req.method === 'DELETE') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      const idx = db.products.findIndex(p => p.id === sellerMatch[1]);
      if (idx === -1) return sendJSON(res, 404, { error: 'San pham khong ton tai' });
      const product = db.products[idx];
      const isOwnerRole = user.role === 'owner';
      const ownsThisProduct = product.ownerUsername === user.username;
      if (!isOwnerRole && !ownsThisProduct) {
        return sendJSON(res, 403, { error: 'Ban khong the xoa san pham cua nguoi khac' });
      }
      db.products.splice(idx, 1);
      saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- OWNER-ONLY routes (normal, transparent role check: user.role === 'owner') ----
    const adminMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);

    if (pathname === '/api/admin/products' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const { name, category, price, image, status } = await readBody(req);
      if (!name || !price) return sendJSON(res, 400, { error: 'Thieu thong tin san pham' });
      const product = {
        id: 'p' + crypto.randomBytes(4).toString('hex'),
        name,
        category: category || 'acc',
        status: status || 'Con hang',
        price: Number(price),
        image: image || '',
        sold: 0,
        ownerUsername: user.username
      };
      db.products.push(product);
      saveDB(db);
      return sendJSON(res, 201, { product });
    }

    if (adminMatch && req.method === 'PUT') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const product = db.products.find(p => p.id === adminMatch[1]);
      if (!product) return sendJSON(res, 404, { error: 'San pham khong ton tai' });
      const { name, category, price, image, status } = await readBody(req);
      if (name !== undefined) product.name = name;
      if (category !== undefined) product.category = category;
      if (price !== undefined) product.price = Number(price);
      if (image !== undefined) product.image = image;
      if (status !== undefined) product.status = status;
      saveDB(db);
      return sendJSON(res, 200, { product });
    }

    if (adminMatch && req.method === 'DELETE') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const idx = db.products.findIndex(p => p.id === adminMatch[1]);
      if (idx === -1) return sendJSON(res, 404, { error: 'San pham khong ton tai' });
      db.products.splice(idx, 1);
      saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/members' && req.method === 'GET') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const members = db.users.map(u => ({
        username: u.username,
        role: u.role,
        balance: u.balance,
        ownsShop: u.ownsShop
      }));
      return sendJSON(res, 200, { members });
    }

    if (pathname === '/api/admin/transactions' && req.method === 'GET') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      return sendJSON(res, 200, { transactions: db.transactions });
    }

    // ---- OWNER-ONLY: grant / deduct balance ----
    if (pathname === '/api/admin/grant' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const { username, amount } = await readBody(req);
      const target = db.users.find(u => u.username === username);
      if (!target) return sendJSON(res, 404, { error: 'Khong tim thay nguoi dung' });
      const amt = Number(amount);
      if (!amt || amt <= 0) return sendJSON(res, 400, { error: 'So tien khong hop le' });
      target.balance += amt;
      db.transactions.push({
        id: crypto.randomBytes(8).toString('hex'),
        username: target.username,
        type: 'grant',
        amount: amt,
        by: user.username,
        date: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { member: { username: target.username, balance: target.balance } });
    }

    if (pathname === '/api/admin/deduct' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const { username, amount } = await readBody(req);
      const target = db.users.find(u => u.username === username);
      if (!target) return sendJSON(res, 404, { error: 'Khong tim thay nguoi dung' });
      const amt = Number(amount);
      if (!amt || amt <= 0) return sendJSON(res, 400, { error: 'So tien khong hop le' });
      target.balance = Math.max(0, target.balance - amt);
      db.transactions.push({
        id: crypto.randomBytes(8).toString('hex'),
        username: target.username,
        type: 'deduct',
        amount: amt,
        by: user.username,
        date: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { member: { username: target.username, balance: target.balance } });
    }

    // ---- OWNER-ONLY: change a member's role (member / buys / owner) ----
    if (pathname === '/api/admin/set-role' && req.method === 'POST') {
      const user = getSessionUser(db, req);
      if (!user) return sendJSON(res, 401, { error: 'Vui long dang nhap' });
      if (user.role !== 'owner') return sendJSON(res, 403, { error: 'Chi owner moi co quyen nay' });
      const { username, role } = await readBody(req);
      if (!['member', 'buys', 'owner'].includes(role)) {
        return sendJSON(res, 400, { error: 'Role khong hop le' });
      }
      const target = db.users.find(u => u.username === username);
      if (!target) return sendJSON(res, 404, { error: 'Khong tim thay nguoi dung' });
      target.role = role;
      if (role === 'buys' || role === 'owner') target.ownsShop = true;
      saveDB(db);
      return sendJSON(res, 200, { member: { username: target.username, role: target.role, ownsShop: target.ownsShop } });
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
