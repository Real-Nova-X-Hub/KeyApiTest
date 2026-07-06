const API = ''; // cùng domain với frontend khi deploy lên Render
let token = localStorage.getItem('getkey_token') || null;
let username = localStorage.getItem('getkey_username') || null;

const $ = id => document.getElementById(id);

function showToast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function authHeaders(){
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function api(path, options = {}){
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    throw new Error(data.error || 'Đã có lỗi xảy ra.');
  }
  return data;
}

/* ---------- AUTH UI ---------- */
$('tabLoginBtn').onclick = () => switchAuthTab('login');
$('tabRegisterBtn').onclick = () => switchAuthTab('register');

function switchAuthTab(tab){
  $('tabLoginBtn').classList.toggle('active', tab==='login');
  $('tabRegisterBtn').classList.toggle('active', tab==='register');
  $('loginForm').classList.toggle('hidden', tab!=='login');
  $('registerForm').classList.toggle('hidden', tab!=='register');
}

$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('regError');
  err.textContent = '';
  const user = $('regUser').value.trim();
  const pass = $('regPass').value;
  const pass2 = $('regPass2').value;

  if(pass !== pass2){ err.textContent = 'Mật khẩu xác nhận không khớp.'; return; }

  try{
    await api('/api/auth/register', { method:'POST', body: JSON.stringify({ username:user, password:pass }) });
    showToast('Đăng ký thành công! Hãy đăng nhập.');
    $('regUser').value=''; $('regPass').value=''; $('regPass2').value='';
    switchAuthTab('login');
    $('loginUser').value = user;
  }catch(ex){
    err.textContent = ex.message;
  }
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('loginError');
  err.textContent = '';
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  try{
    const data = await api('/api/auth/login', { method:'POST', body: JSON.stringify({ username:user, password:pass }) });
    token = data.token;
    username = data.username;
    localStorage.setItem('getkey_token', token);
    localStorage.setItem('getkey_username', username);
    enterApp();
  }catch(ex){
    err.textContent = ex.message;
  }
});

$('logoutBtn').onclick = () => {
  token = null; username = null;
  localStorage.removeItem('getkey_token');
  localStorage.removeItem('getkey_username');
  $('appScreen').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  $('loginPass').value = '';
};

function enterApp(){
  $('userLabel').innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(username);
  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  loadKeyHistory();
  loadPasteHistory();
}

if(token && username){
  enterApp();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- TABS ---------- */
document.querySelectorAll('nav.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
    ['generate','paste','history'].forEach(t => {
      $('tab-'+t).classList.toggle('hidden', t !== tab);
    });
    if(tab === 'history'){ loadKeyHistory(); loadPasteHistory(); }
  });
});

/* ---------- COPY BUTTONS ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if(!btn) return;
  const targetId = btn.dataset.copyTarget;
  const value = targetId ? $(targetId).value : btn.dataset.copyValue;
  navigator.clipboard.writeText(value).then(()=> showToast('Đã copy!'))
    .catch(()=> showToast('Không thể copy, vui lòng copy thủ công.'));
});

/* ---------- GENERATE KEY ---------- */
function durationLabel(ms){
  const map = { 3600000:'1 giờ', 21600000:'6 giờ', 43200000:'12 giờ', 86400000:'24 giờ', 259200000:'3 ngày', 604800000:'7 ngày', 2592000000:'30 ngày' };
  return map[ms] || (Math.round(ms/3600000) + ' giờ');
}
function fmtDate(ts){ return new Date(ts).toLocaleString('vi-VN'); }

$('generateBtn').addEventListener('click', async () => {
  const durationMs = Number($('durationSelect').value);
  try{
    const rec = await api('/api/keys/generate', { method:'POST', body: JSON.stringify({ durationMs }) });
    $('genKeyValue').value = rec.key;
    $('genDurationLabel').textContent = durationLabel(rec.durationMs);
    $('genExpiryLabel').textContent = fmtDate(rec.expiresAt);
    $('genResult').classList.add('show');
    showToast('Đã tạo key mới!');
    loadKeyHistory();
  }catch(ex){
    showToast(ex.message);
  }
});

function statusBadge(expiresAt){
  const active = expiresAt > Date.now();
  return active
    ? '<span class="badge ok"><i class="fa-solid fa-circle-check"></i> Còn hiệu lực</span>'
    : '<span class="badge bad"><i class="fa-solid fa-circle-xmark"></i> Đã hết hạn</span>';
}

async function loadKeyHistory(){
  const list = $('keyHistoryList');
  try{
    const items = await api('/api/keys/history');
    if(items.length === 0){
      list.innerHTML = '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>Chưa có key nào được tạo.</div>';
      return;
    }
    list.innerHTML = items.map(k => `
      <div class="item-card">
        <div class="top-row">
          <div class="key-text">${escapeHtml(k.key)}</div>
          ${statusBadge(k.expiresAt)}
        </div>
        <div class="item-meta">Tạo lúc: ${fmtDate(k.createdAt)} · Hết hạn: ${fmtDate(k.expiresAt)} · Thời hạn: ${durationLabel(k.durationMs)}</div>
        <div class="item-actions">
          <button class="copy-btn" data-copy-value="${escapeHtml(k.key)}"><i class="fa-regular fa-copy"></i> Copy</button>
          <button onclick="regenerateKey('${k.id}')"><i class="fa-solid fa-rotate"></i> Tạo lại</button>
          <button class="danger" onclick="deleteKeyRec('${k.id}')"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      </div>
    `).join('');
  }catch(ex){
    list.innerHTML = '<div class="empty-state">Không tải được lịch sử.</div>';
  }
}

window.regenerateKey = async (id) => {
  try{
    await api(`/api/keys/${id}/regenerate`, { method:'POST' });
    loadKeyHistory();
    showToast('Đã tạo lại key.');
  }catch(ex){ showToast(ex.message); }
};
window.deleteKeyRec = async (id) => {
  try{
    await api(`/api/keys/${id}`, { method:'DELETE' });
    loadKeyHistory();
    showToast('Đã xóa.');
  }catch(ex){ showToast(ex.message); }
};

/* ---------- PASTE / UPLOAD ---------- */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    const mode = btn.dataset.mode;
    $('modeCode').classList.toggle('hidden', mode !== 'code');
    $('modeFile').classList.toggle('hidden', mode !== 'file');
  });
});

$('saveBtn').addEventListener('click', async () => {
  const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
  const note = $('pasteNote').value.trim();

  try{
    let result;
    if(activeMode === 'code'){
      const content = $('codeContent').value;
      const filename = $('codeFilename').value.trim();
      if(!content.trim()){ showToast('Vui lòng nhập nội dung code.'); return; }
      result = await api('/api/uploads/code', { method:'POST', body: JSON.stringify({ content, filename, note }) });
    } else {
      const fileEl = $('fileInput');
      if(!fileEl.files.length){ showToast('Vui lòng chọn file.'); return; }
      const fd = new FormData();
      fd.append('file', fileEl.files[0]);
      fd.append('note', note);
      result = await api('/api/uploads/file', { method:'POST', body: fd });
    }

    const fullUrl = window.location.origin + result.rawPath;
    $('pasteRawUrl').value = fullUrl;
    $('pasteResult').classList.add('show');
    showToast('Đã lưu! Link raw đã sẵn sàng.');
    $('codeContent').value = '';
    $('codeFilename').value = '';
    $('pasteNote').value = '';
    $('fileInput').value = '';
    loadPasteHistory();
  }catch(ex){
    showToast(ex.message);
  }
});

async function loadPasteHistory(){
  const list = $('pasteHistoryList');
  try{
    const items = await api('/api/uploads/history');
    if(items.length === 0){
      list.innerHTML = '<div class="empty-state"><i class="fa-regular fa-folder-open"></i>Chưa có code/file nào được lưu.</div>';
      return;
    }
    list.innerHTML = items.map(u => {
      const fullUrl = window.location.origin + u.rawPath;
      return `
      <div class="item-card">
        <div class="top-row">
          <div class="key-text"><i class="fa-solid ${u.kind==='file'?'fa-file':'fa-code'}"></i> ${escapeHtml(u.filename)}</div>
          <span class="badge ok">${u.kind==='file'?'File':'Code'}</span>
        </div>
        <div class="item-meta">
          ${u.note ? 'Ghi chú: ' + escapeHtml(u.note) + ' · ' : ''}Lưu lúc: ${fmtDate(u.createdAt)} · ${(u.size/1024).toFixed(1)} KB
        </div>
        <div class="item-actions">
          <button class="copy-btn" data-copy-value="${escapeHtml(fullUrl)}"><i class="fa-regular fa-copy"></i> Copy raw link</button>
          <a href="${escapeHtml(u.rawPath)}" target="_blank" style="text-decoration:none;"><button type="button"><i class="fa-solid fa-eye"></i> Xem</button></a>
          <button class="danger" onclick="deletePaste('${u.id}')"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      </div>`;
    }).join('');
  }catch(ex){
    list.innerHTML = '<div class="empty-state">Không tải được lịch sử.</div>';
  }
}

window.deletePaste = async (id) => {
  try{
    await api(`/api/uploads/${id}`, { method:'DELETE' });
    loadPasteHistory();
    showToast('Đã xóa.');
  }catch(ex){ showToast(ex.message); }
};
