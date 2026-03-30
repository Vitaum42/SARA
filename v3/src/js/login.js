// ══════════════════════════════════════════
// DATA — users store (editable at runtime)
// ══════════════════════════════════════════
const PERMISSIONS_LIST = [
  { key: 'view_dashboard',   label: 'Painel Geral',       desc: 'Visualizar estatísticas' },
  { key: 'view_politicians', label: 'Ver Políticos',       desc: 'Listar e buscar' },
  { key: 'edit_politicians', label: 'Editar Políticos',    desc: 'Cadastrar e alterar' },
  { key: 'view_expenses',    label: 'Ver Gastos',          desc: 'Consultar despesas' },
  { key: 'edit_expenses',    label: 'Lançar Gastos',       desc: 'Inserir e editar' },
  { key: 'view_eligibility', label: 'Elegibilidade',       desc: 'Verificar critérios' },
  { key: 'view_demands',     label: 'Ver Demandas',        desc: 'Listar demandas' },
  { key: 'edit_demands',     label: 'Registrar Demandas',  desc: 'Criar e atualizar' },
  { key: 'reports',          label: 'Relatórios',          desc: 'Gerar relatórios' },
  { key: 'admin',            label: 'Administração',       desc: 'Gerenciar usuários' },
];

const ROLE_DEFAULTS = {
  admin:    ['view_dashboard','view_politicians','edit_politicians','view_expenses','edit_expenses','view_eligibility','view_demands','edit_demands','reports','admin'],
  viewer:   ['view_dashboard','view_politicians','view_expenses','view_eligibility','view_demands'],
};

const ROLE_LABELS = { admin:'Administrador', viewer:'Visualizador' };

let users = [
  { id:1, name:'Administrador do Sistema', username:'admin',    password:'admin123',   email:'admin@sisgov.br',    role:'admin',    active:true,  lastLogin:'Hoje, 09:14', createdAt:'01/01/2025', permissions:[...ROLE_DEFAULTS.admin] },
  { id:4, name:'Visualizador Público',     username:'viewer',   password:'viewer123',  email:'viewer@sisgov.br',   role:'viewer',   active:true, lastLogin:'05/03/2025',  createdAt:'01/02/2025', permissions:[...ROLE_DEFAULTS.viewer] },
];

let nextId = 5;
let selectedUserId = null;
let deleteTargetId = null;
let currentUser = null;

// ══════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════
function fillDemo(role) {
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('selected'));
  event.target.classList.add('selected');
  const u = users.find(x => x.role === role && x.active);
  if (u) {
    document.getElementById('login-user').value = u.username;
    document.getElementById('login-pass').value = u.password;
  }
}

function togglePass() {
  const inp = document.getElementById('login-pass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function forgotPass() {
  showToast('📧 Contate o administrador do sistema para redefinir sua senha.', false);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('screen-login').style.display !== 'none') doLogin();
});

function doLogin() {
  const uInput = document.getElementById('login-user');
  const pInput = document.getElementById('login-pass');
  const errU   = document.getElementById('err-user');
  const errP   = document.getElementById('err-pass');
  const btn    = document.getElementById('btn-login');
  const loader = document.getElementById('login-loader');
  const btnTxt = document.getElementById('btn-login-text');

  // reset
  [uInput, pInput].forEach(i => i.classList.remove('error'));
  [errU, errP].forEach(e => e.classList.remove('show'));

  const username = uInput.value.trim();
  const password = pInput.value;

  if (!username) { uInput.classList.add('error'); errU.textContent = 'Preencha o nome de usuário.'; errU.classList.add('show'); uInput.focus(); return; }
  if (!password) { pInput.classList.add('error'); errP.textContent = 'Preencha a senha.'; errP.classList.add('show'); pInput.focus(); return; }

  // simulate async
  btn.disabled = true;
  loader.style.display = 'block';
  btnTxt.textContent = 'Verificando...';

  setTimeout(() => {
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      loader.style.display = 'none';
      btnTxt.textContent = 'Entrar no Sistema';
      btn.disabled = false;
      const exists = users.find(u => u.username === username);
      if (!exists) { uInput.classList.add('error'); errU.classList.add('show'); errU.textContent = 'Usuário não encontrado.'; }
      else { pInput.classList.add('error'); errP.classList.add('show'); }
      document.querySelector('.login-card').classList.add('shake');
      setTimeout(() => document.querySelector('.login-card').classList.remove('shake'), 400);
      return;
    }
    if (!user.active) {
      loader.style.display = 'none';
      btnTxt.textContent = 'Entrar no Sistema';
      btn.disabled = false;
      uInput.classList.add('error');
      errU.textContent = 'Este usuário está desativado. Contate o administrador.';
      errU.classList.add('show');
      return;
    }

    user.lastLogin = 'Agora mesmo';
    currentUser = user;
    sessionStorage.setItem('saraCurrentUser', JSON.stringify({ name: user.name, username: user.username, role: user.role, email: user.email }));
    btnTxt.textContent = '✓ Acesso autorizado';

    setTimeout(() => {
      document.getElementById('screen-login').style.display = 'none';
      if (user.role === 'admin') {
        openAdminPanel();
      } else {
        goToSystem();
      }
    }, 600);
  }, 900);
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function openAdminPanel() {
  const panel = document.getElementById('screen-admin');
  panel.style.display = 'flex';
  document.getElementById('admin-user-label').textContent = currentUser.name + ' (' + ROLE_LABELS[currentUser.role] + ')';
  renderUserList();
}

function goToSystem() {
  // Redirect to main system
  window.location.href = 'home.html';
}

function doLogout() {
  currentUser = null;
  selectedUserId = null;
  sessionStorage.removeItem('saraCurrentUser');
  document.getElementById('screen-admin').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('btn-login').disabled = false;
  document.getElementById('login-loader').style.display = 'none';
  document.getElementById('btn-login-text').textContent = 'Entrar no Sistema';
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('selected'));
  document.getElementById('admin-detail').innerHTML = `<div class="detail-empty"><div class="big-icon">👥</div><p>Selecione um usuário para<br>visualizar e editar suas permissões</p></div>`;
}

// ══════════════════════════════════════════
// USER LIST
// ══════════════════════════════════════════
function getInitials(name) { return name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase(); }

function renderUserList(filter='') {
  const list = document.getElementById('user-list');
  const filtered = users.filter(u => u.name.toLowerCase().includes(filter.toLowerCase()) || u.username.toLowerCase().includes(filter.toLowerCase()));
  document.getElementById('user-count').textContent = users.length + ' usuário' + (users.length !== 1 ? 's' : '') + ' cadastrado' + (users.length !== 1 ? 's' : '');
  list.innerHTML = filtered.map(u => `
    <div class="user-item ${u.id === selectedUserId ? 'active' : ''}" onclick="selectUser(${u.id})">
      <div class="user-avatar avatar-${u.role}">${getInitials(u.name)}</div>
      <div class="user-item-info">
        <div class="user-item-name">${u.name}</div>
        <div class="user-item-role">${ROLE_LABELS[u.role]} · @${u.username}</div>
      </div>
      <div class="user-status-dot ${u.active ? 'dot-active' : 'dot-inactive'}" title="${u.active ? 'Ativo' : 'Inativo'}"></div>
    </div>
  `).join('');
}

function filterUsers(val) { renderUserList(val); }

function selectUser(id) {
  selectedUserId = id;
  renderUserList(document.querySelector('.user-search input').value);
  renderDetail();
}

// ══════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════
function renderDetail() {
  const user = users.find(u => u.id === selectedUserId);
  if (!user) return;

  const permsHtml = PERMISSIONS_LIST.map(p => {
    const has = user.permissions.includes(p.key);
    return `
      <div class="perm-item ${has ? 'checked' : ''}" onclick="togglePerm(${user.id},'${p.key}',this)">
        <div class="perm-checkbox">${has ? '✓' : ''}</div>
        <div class="perm-label">${p.label}<small>${p.desc}</small></div>
      </div>`;
  }).join('');

  const roleBadge = `<span class="badge badge-${user.role}">${ROLE_LABELS[user.role]}</span>`;

  document.getElementById('admin-detail').innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${user.name}</div>
      <div class="detail-actions">
        <button class="btn-outline" onclick="resetToRole(${user.id})">↺ Restaurar Perfil</button>
        <button class="btn-primary" onclick="saveUser(${user.id})">✓ Salvar Alterações</button>
        ${user.id !== currentUser.id ? `<button class="btn-danger" onclick="askDelete(${user.id})">Excluir</button>` : ''}
      </div>
    </div>

    ${user.id === currentUser.id ? `<div class="redirect-banner">ℹ️ <span>Você está editando <strong>seu próprio usuário</strong>. A alteração de perfil terá efeito no próximo login.</span></div>` : ''}

    <div class="card">
      <div class="card-title">👤 Informações do Usuário</div>
      <div class="field-grid">
        <div class="field-group">
          <div class="field-label">Nome Completo</div>
          <input class="field-input" type="text" id="edit-name-${user.id}" value="${user.name}">
        </div>
        <div class="field-group">
          <div class="field-label">Nome de Usuário (login)</div>
          <input class="field-input" type="text" id="edit-username-${user.id}" value="${user.username}">
        </div>
        <div class="field-group">
          <div class="field-label">E-mail</div>
          <input class="field-input" type="email" id="edit-email-${user.id}" value="${user.email}">
        </div>
        <div class="field-group">
          <div class="field-label">Nova Senha <span style="color:var(--text-light);font-weight:300">(deixe vazio para manter)</span></div>
          <input class="field-input" type="password" id="edit-pass-${user.id}" placeholder="••••••••">
        </div>
        <div class="field-group">
          <div class="field-label">Perfil de Acesso</div>
          <select class="field-select" id="edit-role-${user.id}" onchange="applyRoleDefaults(${user.id},this.value)">
            <option value="admin" ${user.role==='admin'?'selected':''}>Administrador</option>
            <option value="viewer" ${user.role==='viewer'?'selected':''}>Visualizador</option>
          </select>
        </div>
        <div class="field-group">
          <div class="field-label">Status da Conta</div>
          <select class="field-select" id="edit-active-${user.id}">
            <option value="true" ${user.active?'selected':''}>✅ Ativo</option>
            <option value="false" ${!user.active?'selected':''}>⛔ Inativo</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔑 Permissões Individuais</div>
      <p style="font-size:.78rem;color:var(--text-light);margin-bottom:14px">Permissões concedidas individualmente. Alterar o perfil acima aplica permissões padrão daquele perfil.</p>
      <div class="perm-grid">${permsHtml}</div>
    </div>

    <div class="card">
      <div class="card-title">📋 Informações do Sistema</div>
      <div class="field-grid">
        <div class="field-group"><div class="field-label">Último Acesso</div><div class="field-value last-login">🕐 ${user.lastLogin}</div></div>
        <div class="field-group"><div class="field-label">Cadastrado em</div><div class="field-value">${user.createdAt}</div></div>
        <div class="field-group"><div class="field-label">Perfil Atual</div><div class="field-value">${roleBadge}</div></div>
        <div class="field-group"><div class="field-label">Status</div><div class="field-value"><span class="badge ${user.active?'badge-active':'badge-inactive'}">${user.active?'Ativo':'Inativo'}</span></div></div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// PERMISSIONS
// ══════════════════════════════════════════
function togglePerm(userId, key, el) {
  const user = users.find(u => u.id === userId);
  const idx = user.permissions.indexOf(key);
  if (idx > -1) {
    user.permissions.splice(idx, 1);
    el.classList.remove('checked');
    el.querySelector('.perm-checkbox').textContent = '';
  } else {
    user.permissions.push(key);
    el.classList.add('checked');
    el.querySelector('.perm-checkbox').textContent = '✓';
  }
}

function applyRoleDefaults(userId, role) {
  const user = users.find(u => u.id === userId);
  user.role = role;
  user.permissions = [...ROLE_DEFAULTS[role]];
  renderDetail();
  showToast(`🔄 Permissões do perfil "${ROLE_LABELS[role]}" aplicadas`);
}

function resetToRole(userId) {
  const user = users.find(u => u.id === userId);
  const role = document.getElementById(`edit-role-${userId}`).value;
  user.permissions = [...ROLE_DEFAULTS[role]];
  renderDetail();
  showToast('↺ Permissões restauradas para o padrão do perfil');
}

// ══════════════════════════════════════════
// SAVE USER
// ══════════════════════════════════════════
function saveUser(userId) {
  const user = users.find(u => u.id === userId);
  const newName     = document.getElementById(`edit-name-${userId}`).value.trim();
  const newUsername = document.getElementById(`edit-username-${userId}`).value.trim();
  const newEmail    = document.getElementById(`edit-email-${userId}`).value.trim();
  const newPass     = document.getElementById(`edit-pass-${userId}`).value;
  const newRole     = document.getElementById(`edit-role-${userId}`).value;
  const newActive   = document.getElementById(`edit-active-${userId}`).value === 'true';

  if (!newName || !newUsername) { showToast('⚠️ Nome e usuário são obrigatórios', true); return; }
  const dup = users.find(u => u.username === newUsername && u.id !== userId);
  if (dup) { showToast('⚠️ Nome de usuário já está em uso', true); return; }

  user.name     = newName;
  user.username = newUsername;
  user.email    = newEmail;
  user.role     = newRole;
  user.active   = newActive;
  if (newPass.length >= 6) user.password = newPass;
  else if (newPass.length > 0 && newPass.length < 6) { showToast('⚠️ A senha deve ter pelo menos 6 caracteres', true); return; }

  renderUserList(document.querySelector('.user-search input').value);
  renderDetail();
  showToast('✅ Usuário atualizado com sucesso!');
}

// ══════════════════════════════════════════
// ADD USER MODAL
// ══════════════════════════════════════════
function openAddModal() {
  document.getElementById('new-name').value = '';
  document.getElementById('new-username').value = '';
  document.getElementById('new-pass').value = '';
  document.getElementById('new-email').value = '';
  document.getElementById('add-modal').classList.add('open');
}
function closeAddModal() { document.getElementById('add-modal').classList.remove('open'); }

function saveNewUser() {
  const name     = document.getElementById('new-name').value.trim();
  const username = document.getElementById('new-username').value.trim();
  const pass     = document.getElementById('new-pass').value;
  const email    = document.getElementById('new-email').value.trim();
  const role     = document.getElementById('new-role').value;

  if (!name || !username || !pass) { showToast('⚠️ Preencha todos os campos obrigatórios', true); return; }
  if (pass.length < 6) { showToast('⚠️ A senha deve ter pelo menos 6 caracteres', true); return; }
  if (users.find(u => u.username === username)) { showToast('⚠️ Nome de usuário já está em uso', true); return; }

  const now = new Date();
  const created = now.toLocaleDateString('pt-BR');
  users.push({
    id: nextId++, name, username, password: pass, email,
    role, active: true,
    lastLogin: 'Nunca', createdAt: created,
    permissions: [...ROLE_DEFAULTS[role]]
  });

  closeAddModal();
  renderUserList(document.querySelector('.user-search input').value);
  showToast(`✅ Usuário "${name}" criado com sucesso!`);
}

// ══════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════
function askDelete(id) {
  deleteTargetId = id;
  const user = users.find(u => u.id === id);
  document.getElementById('del-name-label').textContent = user.name;
  document.getElementById('del-modal').classList.add('open');
}
function closeDelModal() { document.getElementById('del-modal').classList.remove('open'); deleteTargetId = null; }
function confirmDelete() {
  users = users.filter(u => u.id !== deleteTargetId);
  selectedUserId = null;
  closeDelModal();
  renderUserList(document.querySelector('.user-search input').value);
  document.getElementById('admin-detail').innerHTML = `<div class="detail-empty"><div class="big-icon">👥</div><p>Selecione um usuário para<br>visualizar e editar suas permissões</p></div>`;
  showToast('🗑 Usuário excluído com sucesso');
}

// Modals — close on overlay click
['add-modal','del-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) document.getElementById(id).classList.remove('open'); });
});

// ══════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════
function showToast(msg, isError=false) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
