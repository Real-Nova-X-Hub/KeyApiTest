const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

function defaultDb() {
  return { users: [], keys: [], uploads: [] };
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    writeDb(defaultDb());
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return defaultDb();
  }
}

// Ghi tuần tự để tránh ghi đè khi có nhiều request cùng lúc.
let writeChain = Promise.resolve();
function writeDb(data) {
  writeChain = writeChain.then(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  });
  return writeChain;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function randomId(length = 8) {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

module.exports = { readDb, writeDb, randomId, FILES_DIR };
