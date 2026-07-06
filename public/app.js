const state = {
  token: localStorage.getItem('pixel_token') || null,
  user: null,
  tab: 'auth',
  products: []
};

const content = document.getElementById('content');
const avatarEl = document.getElementById('avatarInitial');

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    render();
  });
});

async function api(pathName, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api/' + pathName, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Loi khong xac dinh');
  return data;
}

async function refreshMe() {
  if (!state.token) { state.user = null; return; }
  try {
    const data = await api('me');
    state.user = data.user;
  } catch (e) {
    state.user = null;
    state.token = null;
    localStorage.removeItem('pixel_token');
  }
  avatarEl.textContent = state.user ? state.user.username[0].toUpperCase() : '?';
}

function money(n) { return Number(n).toLocaleString('vi-VN') + ' VND'; }

// ---------------- render router ----------------
async function render() {
  await refreshMe();
  if (state.tab === 'auth') return renderAuth();
  if (state.tab === 'shop') return renderShop();
  if (state.tab === 'history') return renderHistory();
  if (state.tab === 'info') return renderInfo();
  if (state.tab === 'nap') return renderNap();
  if (state.tab === 'myshop') return renderMyShop();
}

// ---------------- AUTH tab ----------------
function renderAuth() {
  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">🔒</span> Dang nhap</h2>
      <div id="authMsg"></div>
      <label>Ten dang nhap</label>
      <input id="loginUser" placeholder="Nhap username..." />
      <label>Mat khau</label>
      <input id="loginPass" type="password" placeholder="Nhap mat khau..." />
      <div class="btn-row">
        <button class="btn btn-secondary" id="registerBtn">Dang ky</button>
        <button class="btn btn-primary" id="loginBtn">Dang nhap</button>
      </div>
      <button class="btn btn-danger" id="logoutBtn">Dang xuat</button>
    </div>

    <div class="card">
      <h2><span class="icon-box">👤</span> Thong tin tai khoan</h2>
      ${state.user ? `
        <label>Nguoi dung</label>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span></span><b>${state.user.username}${state.user.role === 'owner' ? '<span class="owner-tag">OWNER</span>' : ''}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-dim)">Role</span>
          <span class="badge ${state.user.role === 'owner' ? 'instock' : 'cat'}">${state.user.role.toUpperCase()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;">
          <span style="color:var(--text-dim)">So du</span><b style="color:var(--accent)">${money(state.user.balance)}</b>
        </div>
      ` : `<p class="hint">Chua dang nhap.</p>`}
    </div>
  `;

  document.getElementById('loginBtn').onclick = async () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    try {
      const data = await api('login', { method: 'POST', body: JSON.stringify({ username, password }) });
      state.token = data.token;
      localStorage.setItem('pixel_token', data.token);
      state.user = data.user;
      render();
    } catch (e) {
      showMsg('authMsg', e.message, 'error');
    }
  };

  document.getElementById('registerBtn').onclick = async () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    try {
      const data = await api('register', { method: 'POST', body: JSON.stringify({ username, password }) });
      state.token = data.token;
      localStorage.setItem('pixel_token', data.token);
      state.user = data.user;
      render();
    } catch (e) {
      showMsg('authMsg', e.message, 'error');
    }
  };

  document.getElementById('logoutBtn').onclick = async () => {
    try { await api('logout', { method: 'POST' }); } catch (e) {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('pixel_token');
    render();
  };
}

function showMsg(id, text, type) {
  document.getElementById(id).innerHTML = `<div class="msg ${type}">${text}</div>`;
}

// ---------------- SHOP tab ----------------
async function renderShop() {
  content.innerHTML = `<div class="card"><h2><span class="icon-box">🛍️</span> Danh sach san pham</h2><p class="hint">Dang tai...</p></div>`;
  const data = await api('products');
  state.products = data.products;

  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">🛍️</span> Danh sach san pham</h2>
      <div id="shopMsg"></div>
      ${state.products.map(p => `
        <div class="product">
          <div class="product-head">
            <span class="name">${p.name}</span>
            <span class="badge ${p.status === 'Con hang' ? 'instock' : 'outstock'}">${p.status}</span>
            <span class="badge cat">${p.category}</span>
          </div>
          ${p.image ? `<img class="product-img" src="${p.image}" />` : ''}
          <div class="product-price">${money(p.price)}</div>
          <button class="btn btn-primary" data-buy="${p.id}" ${p.status !== 'Con hang' ? 'disabled' : ''}>Mua ngay</button>
        </div>
      `).join('') || '<p class="empty-msg">Chua co san pham nao.</p>'}
    </div>
  `;

  document.querySelectorAll('[data-buy]').forEach(btn => {
    btn.onclick = async () => {
      if (!state.user) return showMsg('shopMsg', 'Vui long dang nhap truoc khi mua.', 'error');
      try {
        await api('buy', { method: 'POST', body: JSON.stringify({ productId: btn.dataset.buy }) });
        showMsg('shopMsg', 'Mua hang thanh cong!', 'success');
        renderShop();
      } catch (e) {
        showMsg('shopMsg', e.message, 'error');
      }
    };
  });
}

// ---------------- HISTORY tab ----------------
async function renderHistory() {
  if (!state.user) {
    content.innerHTML = `<div class="card"><h2><span class="icon-box">🕓</span> Lich su mua hang</h2><p class="empty-msg">Vui long dang nhap de xem lich su.</p></div>`;
    return;
  }
  const data = await api('history');
  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">🕓</span> Lich su mua hang</h2>
      <button class="btn btn-secondary" id="refreshHistory">Lam moi</button>
      ${data.transactions.length ? data.transactions.map(t => `
        <div class="product">
          <div class="product-head"><span class="name">${t.productName || t.type}</span></div>
          <div style="color:var(--text-dim); font-size:13px;">${new Date(t.date).toLocaleString('vi-VN')}</div>
          ${t.price ? `<div class="product-price">${money(t.price)}</div>` : ''}
        </div>
      `).join('') : '<p class="empty-msg">Chua co giao dich nao.</p>'}
    </div>
  `;
  document.getElementById('refreshHistory').onclick = renderHistory;
}

// ---------------- INFO tab ----------------
async function renderInfo() {
  const data = await api('info');
  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">ℹ️</span> Thong tin shop</h2>
      <div class="grid-2">
        <div class="stat-box"><div class="num">${data.productCount}</div><div class="lbl">San pham</div></div>
        <div class="stat-box"><div class="num">${data.sold}</div><div class="lbl">Da ban</div></div>
        <div class="stat-box"><div class="num">${data.members}</div><div class="lbl">Thanh vien</div></div>
        <div class="stat-box"><div class="num">${data.rating}</div><div class="lbl">Danh gia</div></div>
      </div>
      <label>Toc do xu ly</label>
      <div style="display:flex;justify-content:space-between;"><span></span><b>${data.processingSpeed}</b></div>
    </div>
    <div class="card">
      <h2><span class="icon-box">💬</span> Lien he & Mang xa hoi</h2>
      <a class="contact-btn" href="#">🎮 Tham gia Discord cua chung toi</a>
    </div>
  `;
}

// ---------------- NAP tab ----------------
function renderNap() {
  const carriers = ['Viettel', 'Mobiphone', 'Vinaphone', 'Vietnamobile', 'Gmobile', 'Reddi'];
  const amounts = [10000, 20000, 50000, 100000, 200000, 500000];
  let selectedCarrier = null, selectedAmount = null;

  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">💳</span> Nap tien qua the cao</h2>
      <div id="napMsg"></div>
      <label>Chon nha mang</label>
      <div class="chip-row">${carriers.map(c => `<div class="chip" data-carrier="${c}">${c}</div>`).join('')}</div>
      <label>Menh gia the</label>
      <div class="grid-2">${amounts.map(a => `<div class="chip" data-amount="${a}">${a.toLocaleString('vi-VN')}</div>`).join('')}</div>
      <label>Ma the</label>
      <input id="cardCode" placeholder="Nhap ma the..." />
      <label>So seri</label>
      <input id="cardSerial" placeholder="Nhap so seri..." />
      <button class="btn btn-primary" id="napBtn">Nap ngay</button>
    </div>
  `;

  document.querySelectorAll('[data-carrier]').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('[data-carrier]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCarrier = chip.dataset.carrier;
    };
  });
  document.querySelectorAll('[data-amount]').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('[data-amount]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedAmount = Number(chip.dataset.amount);
    };
  });

  document.getElementById('napBtn').onclick = async () => {
    if (!state.user) return showMsg('napMsg', 'Vui long dang nhap truoc.', 'error');
    const code = document.getElementById('cardCode').value.trim();
    const serial = document.getElementById('cardSerial').value.trim();
    if (!selectedCarrier || !selectedAmount || !code || !serial) {
      return showMsg('napMsg', 'Vui long dien day du thong tin.', 'error');
    }
    try {
      const data = await api('topup', {
        method: 'POST',
        body: JSON.stringify({ carrier: selectedCarrier, amount: selectedAmount, code, serial })
      });
      showMsg('napMsg', data.message, 'success');
    } catch (e) {
      showMsg('napMsg', e.message, 'error');
    }
  };
}

// ---------------- MY SHOP tab ----------------
function renderMyShop() {
  if (!state.user) {
    content.innerHTML = `<div class="card"><h2><span class="icon-box">🏠</span> Shop cua ban</h2><p class="empty-msg">Vui long dang nhap.</p></div>`;
    return;
  }
  if (state.user.ownsShop) {
    content.innerHTML = `
      <div class="card">
        <h2><span class="icon-box">🏠</span> Shop cua ban</h2>
        <p class="hint">Ban da so huu shop rieng${state.user.role === 'owner' ? ' voi quyen Owner' : ''}. Ban co the quan ly san pham va don hang tai day.</p>
      </div>
    `;
    return;
  }
  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">🏠</span> Shop cua ban</h2>
      <p class="hint">Ban chua so huu shop rieng. Mua shop chi voi 50,000 VND de tu kinh doanh!</p>
      <div id="shopBuyMsg"></div>
      <button class="btn btn-primary" id="buyShopBtn">Mua Shop (50,000 VND)</button>
    </div>
  `;
  document.getElementById('buyShopBtn').onclick = async () => {
    try {
      await api('buy-shop', { method: 'POST' });
      showMsg('shopBuyMsg', 'Mua shop thanh cong!', 'success');
      renderMyShop();
    } catch (e) {
      showMsg('shopBuyMsg', e.message, 'error');
    }
  };
}

render();
