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

  const ownerTabBtn = document.getElementById('ownerTabBtn');
  const isOwner = !!(state.user && state.user.role === 'owner');
  ownerTabBtn.style.display = isOwner ? '' : 'none';
  if (!isOwner && state.tab === 'owner') {
    state.tab = 'auth';
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab[data-tab="auth"]').classList.add('active');
  }
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
  if (state.tab === 'owner') return renderOwner();
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
          <span class="badge ${state.user.role === 'owner' || state.user.role === 'buys' ? 'instock' : 'cat'}">${state.user.role.toUpperCase()}</span>
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

// ---------------- MY SHOP tab (seller dashboard for 'buys' / 'owner') ----------------
async function renderMyShop() {
  if (!state.user) {
    content.innerHTML = `<div class="card"><h2><span class="icon-box">🏠</span> Shop cua ban</h2><p class="empty-msg">Vui long dang nhap.</p></div>`;
    return;
  }

  const isSeller = state.user.role === 'buys' || state.user.role === 'owner';

  if (!isSeller) {
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
        showMsg('shopBuyMsg', 'Mua shop thanh cong! Ban da co quyen dang ban.', 'success');
        renderMyShop();
      } catch (e) {
        showMsg('shopBuyMsg', e.message, 'error');
      }
    };
    return;
  }

  content.innerHTML = `<div class="card"><p class="hint">Dang tai san pham cua ban...</p></div>`;
  const data = await api('seller/products');

  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">🏠</span> Shop cua ban${state.user.role === 'owner' ? ' <span class="owner-tag">OWNER</span>' : '<span class="owner-tag">SELLER</span>'}</h2>
      <p class="hint">Ban dang duoc quyen dang san pham. Chi ban moi chinh sua/xoa duoc san pham cua chinh minh.</p>
    </div>

    <div class="card">
      <h2><span class="icon-box">➕</span> Dang san pham moi</h2>
      <div id="myAddMsg"></div>
      <label>Ten san pham</label>
      <input id="myNewName" placeholder="vd: acc full gear" />
      <label>Danh muc</label>
      <input id="myNewCategory" placeholder="vd: acc" />
      <label>Gia (VND)</label>
      <input id="myNewPrice" type="number" placeholder="vd: 36000" />
      <label>Link hinh anh (tuy chon)</label>
      <input id="myNewImage" placeholder="https://..." />
      <button class="btn btn-primary" id="myAddBtn">Dang san pham</button>
    </div>

    <div class="card">
      <h2><span class="icon-box">🛍️</span> San pham cua ban (${data.products.length})</h2>
      <div id="myProductMsg"></div>
      ${data.products.map(p => `
        <div class="product">
          <div class="product-head">
            <span class="name">${p.name}</span>
            <span class="badge ${p.status === 'Con hang' ? 'instock' : 'outstock'}">${p.status}</span>
            <span class="badge cat">${p.category}</span>
          </div>
          <div class="product-price">${money(p.price)} &nbsp;•&nbsp; Da ban: ${p.sold}</div>
          <div class="btn-row">
            <button class="btn btn-secondary" data-my-toggle="${p.id}" data-current="${p.status}">
              ${p.status === 'Con hang' ? 'Danh dau het han' : 'Danh dau con hang'}
            </button>
            <button class="btn btn-danger" data-my-delete="${p.id}">Xoa</button>
          </div>
        </div>
      `).join('') || '<p class="empty-msg">Ban chua dang san pham nao.</p>'}
    </div>
  `;

  document.getElementById('myAddBtn').onclick = async () => {
    const name = document.getElementById('myNewName').value.trim();
    const category = document.getElementById('myNewCategory').value.trim();
    const price = document.getElementById('myNewPrice').value;
    const image = document.getElementById('myNewImage').value.trim();
    if (!name || !price) return showMsg('myAddMsg', 'Vui long nhap ten va gia san pham.', 'error');
    try {
      await api('seller/products', { method: 'POST', body: JSON.stringify({ name, category, price, image }) });
      showMsg('myAddMsg', 'Da dang san pham!', 'success');
      renderMyShop();
    } catch (e) {
      showMsg('myAddMsg', e.message, 'error');
    }
  };

  document.querySelectorAll('[data-my-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const newStatus = btn.dataset.current === 'Con hang' ? 'Het hang' : 'Con hang';
      try {
        await api('seller/products/' + btn.dataset.myToggle, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
        renderMyShop();
      } catch (e) {
        showMsg('myProductMsg', e.message, 'error');
      }
    };
  });

  document.querySelectorAll('[data-my-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Xoa san pham nay?')) return;
      try {
        await api('seller/products/' + btn.dataset.myDelete, { method: 'DELETE' });
        renderMyShop();
      } catch (e) {
        showMsg('myProductMsg', e.message, 'error');
      }
    };
  });
}

// ---------------- OWNER management tab ----------------
async function renderOwner() {
  if (!state.user || state.user.role !== 'owner') {
    content.innerHTML = `<div class="card"><p class="empty-msg">Ban khong co quyen truy cap trang nay.</p></div>`;
    return;
  }

  content.innerHTML = `<div class="card"><p class="hint">Dang tai du lieu quan ly...</p></div>`;

  const [productsData, membersData, txData] = await Promise.all([
    api('products'),
    api('admin/members'),
    api('admin/transactions')
  ]);

  content.innerHTML = `
    <div class="card">
      <h2><span class="icon-box">➕</span> Them san pham moi</h2>
      <div id="ownerAddMsg"></div>
      <label>Ten san pham</label>
      <input id="newName" placeholder="vd: acc full gear" />
      <label>Danh muc</label>
      <input id="newCategory" placeholder="vd: acc" />
      <label>Gia (VND)</label>
      <input id="newPrice" type="number" placeholder="vd: 36000" />
      <label>Link hinh anh (tuy chon)</label>
      <input id="newImage" placeholder="https://..." />
      <button class="btn btn-primary" id="addProductBtn">Them san pham</button>
    </div>

    <div class="card">
      <h2><span class="icon-box">🛍️</span> Quan ly san pham (${productsData.products.length})</h2>
      <div id="ownerProductMsg"></div>
      ${productsData.products.map(p => `
        <div class="product" data-product-card="${p.id}">
          <div class="product-head">
            <span class="name">${p.name}</span>
            <span class="badge ${p.status === 'Con hang' ? 'instock' : 'outstock'}">${p.status}</span>
            <span class="badge cat">${p.category}</span>
          </div>
          <div class="product-price">${money(p.price)} &nbsp;•&nbsp; Da ban: ${p.sold}</div>
          <div class="btn-row">
            <button class="btn btn-secondary" data-toggle-status="${p.id}" data-current="${p.status}">
              ${p.status === 'Con hang' ? 'Danh dau het hang' : 'Danh dau con hang'}
            </button>
            <button class="btn btn-danger" data-delete="${p.id}">Xoa</button>
          </div>
        </div>
      `).join('') || '<p class="empty-msg">Chua co san pham nao.</p>'}
    </div>

    <div class="card">
      <h2><span class="icon-box">💰</span> Tang / Tru tien</h2>
      <div id="ownerMoneyMsg"></div>
      <label>Chon thanh vien</label>
      <select id="moneyUser">
        ${membersData.members.map(m => `<option value="${m.username}">${m.username} (${money(m.balance)})</option>`).join('')}
      </select>
      <label>So tien (VND)</label>
      <input id="moneyAmount" type="number" placeholder="vd: 50000" />
      <div class="btn-row">
        <button class="btn btn-primary" id="grantBtn">Tang tien</button>
        <button class="btn btn-danger" id="deductBtn">Tru tien</button>
      </div>
    </div>

    <div class="card">
      <h2><span class="icon-box">👥</span> Thanh vien (${membersData.members.length})</h2>
      ${membersData.members.map(m => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span>${m.username}${m.role === 'owner' ? '<span class="owner-tag">OWNER</span>' : m.role === 'buys' ? '<span class="badge instock" style="margin-left:8px">SELLER</span>' : ''}</span>
            <span style="color:var(--text-dim)">${money(m.balance)}</span>
          </div>
          ${m.role !== 'owner' ? `
            <div class="btn-row">
              ${m.role === 'buys'
                ? `<button class="btn btn-secondary" data-set-role="${m.username}" data-role="member">Thu hoi quyen ban hang</button>`
                : `<button class="btn btn-secondary" data-set-role="${m.username}" data-role="buys">Cap quyen ban hang (buys)</button>`
              }
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <div class="card">
      <h2><span class="icon-box">🕓</span> Tat ca giao dich (${txData.transactions.length})</h2>
      ${txData.transactions.slice().reverse().map(t => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between">
            <b>${t.username}</b>
            <span style="color:var(--text-dim);font-size:13px">${new Date(t.date).toLocaleString('vi-VN')}</span>
          </div>
          <div style="color:var(--text-dim);font-size:13px">
            ${t.productName ? `Mua: ${t.productName} - ${money(t.price)}` : `Nap the: ${t.carrier} ${money(t.amount)} (cho xu ly)`}
          </div>
        </div>
      `).join('') || '<p class="empty-msg">Chua co giao dich nao.</p>'}
    </div>
  `;

  document.getElementById('addProductBtn').onclick = async () => {
    const name = document.getElementById('newName').value.trim();
    const category = document.getElementById('newCategory').value.trim();
    const price = document.getElementById('newPrice').value;
    const image = document.getElementById('newImage').value.trim();
    if (!name || !price) return showMsg('ownerAddMsg', 'Vui long nhap ten va gia san pham.', 'error');
    try {
      await api('admin/products', { method: 'POST', body: JSON.stringify({ name, category, price, image }) });
      showMsg('ownerAddMsg', 'Da them san pham!', 'success');
      renderOwner();
    } catch (e) {
      showMsg('ownerAddMsg', e.message, 'error');
    }
  };

  document.querySelectorAll('[data-toggle-status]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.toggleStatus;
      const newStatus = btn.dataset.current === 'Con hang' ? 'Het hang' : 'Con hang';
      try {
        await api('admin/products/' + id, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
        renderOwner();
      } catch (e) {
        showMsg('ownerProductMsg', e.message, 'error');
      }
    };
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Xoa san pham nay?')) return;
      try {
        await api('admin/products/' + btn.dataset.delete, { method: 'DELETE' });
        renderOwner();
      } catch (e) {
        showMsg('ownerProductMsg', e.message, 'error');
      }
    };
  });

  document.getElementById('grantBtn').onclick = async () => {
    const username = document.getElementById('moneyUser').value;
    const amount = document.getElementById('moneyAmount').value;
    if (!amount || Number(amount) <= 0) return showMsg('ownerMoneyMsg', 'Vui long nhap so tien hop le.', 'error');
    try {
      await api('admin/grant', { method: 'POST', body: JSON.stringify({ username, amount }) });
      showMsg('ownerMoneyMsg', `Da tang ${money(amount)} cho ${username}.`, 'success');
      renderOwner();
    } catch (e) {
      showMsg('ownerMoneyMsg', e.message, 'error');
    }
  };

  document.getElementById('deductBtn').onclick = async () => {
    const username = document.getElementById('moneyUser').value;
    const amount = document.getElementById('moneyAmount').value;
    if (!amount || Number(amount) <= 0) return showMsg('ownerMoneyMsg', 'Vui long nhap so tien hop le.', 'error');
    try {
      await api('admin/deduct', { method: 'POST', body: JSON.stringify({ username, amount }) });
      showMsg('ownerMoneyMsg', `Da tru ${money(amount)} cua ${username}.`, 'success');
      renderOwner();
    } catch (e) {
      showMsg('ownerMoneyMsg', e.message, 'error');
    }
  };

  document.querySelectorAll('[data-set-role]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api('admin/set-role', { method: 'POST', body: JSON.stringify({ username: btn.dataset.setRole, role: btn.dataset.role }) });
        renderOwner();
      } catch (e) {
        showMsg('ownerMoneyMsg', e.message, 'error');
      }
    };
  });
}

render();
