// ══════════════════════════════════════════════════════════════════════
// SARA — Login, Registro & Painel de Administração
// Banco de dados: IndexedDB (database.js) | Senhas: SHA-256
// Acessos: ADMIN (painel + sistema) | VIEWER (somente sistema)
// ══════════════════════════════════════════════════════════════════════

// ─── Configuração de Permissões ─────────────────────────────────────
const PERMISSIONS_LIST = [
  { key: 'view_dashboard',   label: 'Painel Geral',      desc: 'Visualizar estatísticas' },
  { key: 'view_politicians', label: 'Ver Políticos',      desc: 'Listar e buscar' },
  { key: 'edit_politicians', label: 'Editar Políticos',   desc: 'Cadastrar e alterar' },
  { key: 'view_expenses',    label: 'Ver Gastos',         desc: 'Consultar despesas' },
  { key: 'edit_expenses',    label: 'Lançar Gastos',      desc: 'Inserir e editar' },
  { key: 'view_eligibility', label: 'Elegibilidade',      desc: 'Verificar critérios' },
  { key: 'view_demands',     label: 'Ver Demandas',       desc: 'Listar demandas' },
  { key: 'edit_demands',     label: 'Editar Demandas',    desc: 'Criar e atualizar' },
  { key: 'reports',          label: 'Relatórios',         desc: 'Gerar relatórios' },
  { key: 'admin',            label: 'Administração',      desc: 'Gerenciar usuários' },
];

const ROLE_DEFAULTS = {
  admin:  ['view_dashboard','view_politicians','edit_politicians','view_expenses',
           'edit_expenses','view_eligibility','view_demands','edit_demands','reports','admin'],
  viewer: ['view_dashboard','view_politicians','view_expenses','view_eligibility','view_demands'],
};

// Permissões que VIEWER não tem (escondidas no sistema)
const ADMIN_ONLY_PERMS = ['edit_politicians','edit_expenses','edit_demands','reports','admin'];
const ADMIN_ONLY_NAV   = ['register','expenses','demands','reports']; // nav items ocultos para viewer

const ROLE_LABELS = { admin: 'Administrador', viewer: 'Visualizador' };

// ─── Estado ─────────────────────────────────────────────────────────
let currentUser    = null;
let selectedUserId = null;
let deleteTargetId = null;
let _allUsers      = [];
let _regStep       = 1;
const _regRole = 'viewer'; // Cadastro público sempre cria Visualizador

// ─── Boot: inicializa DB ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await dbInit();
    await dbSeedAdmin();
  } catch (e) {
    console.error('[SARA] Erro ao inicializar banco:', e);
    showToast('Erro ao inicializar banco de dados. Recarregue a página.', true);
  }
});

// ══════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════
function getInitials(name) {
  return (name || '').split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase() || '?';
}

function calcularIdade(dataNasc) {
  const hoje = new Date();
  const nasc = new Date(dataNasc + 'T00:00:00');
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return { idade, maior: idade >= 18 };
}

function mascaraCPFInput(input) {
  let v = input.value.replace(/\D/g,'').slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2')
       .replace(/(\d{3})(\d)/,'$1.$2')
       .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  input.value = v;
}

function mascaraTelefoneInput(input) {
  let v = input.value.replace(/\D/g,'').slice(0,11);
  if (v.length <= 10) v = v.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2');
  else                v = v.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
  input.value = v;
}

function slugifyUsername(input) {
  input.value = input.value.toLowerCase()
    .replace(/\s+/g,'.').replace(/[^a-z0-9.]/g,'');
}

function showToast(msg, isError = false) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

async function reloadUsers() {
  _allUsers = await dbGetAllUsers();
}

function ageBadgeHTML(maior, idade) {
  return maior
    ? `<span class="age-tag maior">✓ Maior de idade · ${idade} anos</span>`
    : `<span class="age-tag menor">⚠ Menor de idade · ${idade} anos</span>`;
}

// ══════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════
function togglePass() {
  const inp  = document.getElementById('login-pass');
  const show = document.getElementById('eye-open');
  const hide = document.getElementById('eye-closed');
  if (inp.type === 'password') {
    inp.type = 'text';
    if (show) show.style.display = 'none';
    if (hide) hide.style.display = '';
  } else {
    inp.type = 'password';
    if (show) show.style.display = '';
    if (hide) hide.style.display = 'none';
  }
}

function forgotPass() {
  showToast('Contate o administrador do sistema para redefinir sua senha.');
}

document.addEventListener('keydown', e => {
  const ls = document.getElementById('screen-login');
  if (e.key === 'Enter' && ls && ls.style.display !== 'none') doLogin();
});

async function doLogin() {
  const uInput = document.getElementById('login-user');
  const pInput = document.getElementById('login-pass');
  const errU   = document.getElementById('err-user');
  const errP   = document.getElementById('err-pass');
  const btn    = document.getElementById('btn-login');
  const loader = document.getElementById('login-loader');
  const btnTxt = document.getElementById('btn-login-text');

  // Reset visual
  [uInput, pInput].forEach(i => i.classList.remove('error'));
  [errU, errP].forEach(e => { e.textContent = ''; e.classList.remove('show'); });

  const username = uInput.value.trim();
  const password = pInput.value;

  if (!username) {
    uInput.classList.add('error');
    errU.textContent = 'Preencha o nome de usuário.';
    errU.classList.add('show');
    uInput.focus(); return;
  }
  if (!password) {
    pInput.classList.add('error');
    errP.textContent = 'Preencha a senha.';
    errP.classList.add('show');
    pInput.focus(); return;
  }

  btn.disabled = true;
  loader.style.display = 'inline-block';
  btnTxt.textContent = 'Verificando...';

  try {
    const senhaHash = await hashSenha(password);
    const user      = await dbGetUserByUsername(username);

    if (!user || user.passwordHash !== senhaHash) {
      loader.style.display = 'none'; btnTxt.textContent = 'Entrar no Sistema'; btn.disabled = false;
      if (!user) {
        uInput.classList.add('error'); errU.textContent = 'Usuário não encontrado.'; errU.classList.add('show');
      } else {
        pInput.classList.add('error'); errP.textContent = 'Senha incorreta. Tente novamente.'; errP.classList.add('show');
      }
      const card = document.querySelector('#screen-login .login-card');
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 400);
      return;
    }

    if (!user.active) {
      loader.style.display = 'none'; btnTxt.textContent = 'Entrar no Sistema'; btn.disabled = false;
      uInput.classList.add('error');
      errU.textContent = 'Conta desativada. Contate o administrador.';
      errU.classList.add('show'); return;
    }

    // Atualiza lastLogin
    user.lastLogin = new Date().toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
    await dbUpdateUser(user);
    currentUser = user;

    // Salva sessão
    sessionStorage.setItem('saraCurrentUser', JSON.stringify({
      id: user.id, name: user.name, username: user.username,
      role: user.role, email: user.email, permissions: user.permissions,
    }));

    btnTxt.textContent = 'Acesso autorizado ✓';

    // Redireciona conforme perfil:
    // ADMIN  → painel de administração (gerenciar usuários)
    // VIEWER → sistema diretamente (sem painel admin)
    setTimeout(() => {
      document.getElementById('screen-login').style.display = 'none';
      if (user.role === 'admin') {
        openAdminPanel();
      } else {
        goToSystem();
      }
    }, 500);

  } catch (err) {
    console.error('[SARA] Erro no login:', err);
    loader.style.display = 'none'; btnTxt.textContent = 'Entrar no Sistema'; btn.disabled = false;
    showToast('Erro interno. Tente novamente.', true);
  }
}

// ══════════════════════════════════════════
// CADASTRO DE NOVO USUÁRIO (3 passos)
// ══════════════════════════════════════════
function openRegisterScreen() {
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-register').style.display = 'flex';
  resetRegisterForm();
}

function closeRegisterScreen() {
  document.getElementById('screen-register').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';
}

function resetRegisterForm() {
  _regStep = 1;
  _regRole = 'viewer';

  ['reg-nome','reg-sobrenome','reg-cpf','reg-email','reg-telefone',
   'reg-username','reg-senha','reg-senha2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const nasc = document.getElementById('reg-nascimento');
  if (nasc) { nasc.value = ''; nasc.max = new Date().toISOString().split('T')[0]; }

  document.querySelectorAll('#screen-register .reg-error').forEach(e => {
    e.textContent = ''; e.style.display = 'none';
  });

  const badge = document.getElementById('reg-age-badge');
  if (badge) badge.style.display = 'none';

  const sw = document.getElementById('reg-strength-wrap');
  if (sw) sw.style.display = 'none';

  // Perfil sempre Visualizador — sem reset necessário

  // Mostra nav e back-link
  const nav = document.getElementById('reg-nav');
  if (nav) nav.style.display = '';

  goToRegStep(1);
}

function goToRegStep(step) {
  _regStep = step;
  for (let i = 1; i <= 3; i++) {
    const sec = document.getElementById('rsec-' + i);
    const ind = document.getElementById('rstep-' + i);
    if (sec) sec.classList.toggle('active', i === step);
    if (ind) {
      ind.classList.toggle('active', i === step);
      ind.classList.toggle('done', i < step);
    }
  }
  const back  = document.getElementById('reg-btn-back');
  const nBtn  = document.getElementById('reg-btn-next');
  const nTxt  = document.getElementById('reg-btn-text');
  const ldr   = document.getElementById('reg-loader');
  if (back) back.style.visibility = 'visible';
  if (nBtn) nBtn.disabled = false;
  if (ldr)  ldr.style.display = 'none';
  if (nTxt) nTxt.textContent = step === 3 ? 'Criar Conta' : 'Próximo →';
}

// ── Máscaras ─────────────────────────────
function maskCPFReg(input) { mascaraCPFInput(input); }
function maskTelReg(input)  { mascaraTelefoneInput(input); }

// ── Badge de maioridade ──────────────────
function checkAge() {
  const val   = document.getElementById('reg-nascimento')?.value;
  const badge = document.getElementById('reg-age-badge');
  if (!badge) return;
  if (!val)   { badge.style.display = 'none'; return; }
  const { idade, maior } = calcularIdade(val);
  badge.innerHTML      = ageBadgeHTML(maior, idade);
  badge.style.display  = 'block';
}

function checkModalAge() {
  const val   = document.getElementById('new-nascimento')?.value;
  const badge = document.getElementById('new-age-badge');
  if (!badge) return;
  if (!val)   { badge.style.display = 'none'; return; }
  const { idade, maior } = calcularIdade(val);
  badge.innerHTML     = ageBadgeHTML(maior, idade);
  badge.style.display = 'block';
}

// ── Força de senha ───────────────────────
function checkPasswordStrength(val) {
  const wrap  = document.getElementById('reg-strength-wrap');
  const fill  = document.getElementById('reg-strength-fill');
  const label = document.getElementById('reg-strength-label');
  if (!fill || !label) return;
  if (!val) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = 'flex';
  let score = 0;
  if (val.length >= 6)           score++;
  if (val.length >= 10)          score++;
  if (/[A-Z]/.test(val))         score++;
  if (/\d/.test(val))            score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { w:'20%',  c:'#ef4444', t:'Muito fraca' },
    { w:'40%',  c:'#f97316', t:'Fraca'       },
    { w:'60%',  c:'#eab308', t:'Razoável'    },
    { w:'80%',  c:'#84cc16', t:'Boa'         },
    { w:'100%', c:'#22c55e', t:'Forte'       },
  ];
  const lv = levels[Math.min(score-1, 4)] || levels[0];
  fill.style.width      = lv.w;
  fill.style.background = lv.c;
  label.textContent     = lv.t;
  label.style.color     = lv.c;
}

function toggleRegPass(id) {
  const inp = document.getElementById(id);
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

// selectProfile removido: perfil público é sempre Visualizador

// ── Validadores por passo ────────────────
function regSetErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function regClearErr(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

async function validateStep1() {
  const nome      = document.getElementById('reg-nome')?.value.trim();
  const sobrenome = document.getElementById('reg-sobrenome')?.value.trim();
  const cpf       = document.getElementById('reg-cpf')?.value.replace(/\D/g,'');
  const nasc      = document.getElementById('reg-nascimento')?.value;

  ['rerr-nome','rerr-sobrenome','rerr-cpf','rerr-nascimento'].forEach(regClearErr);
  let ok = true;

  if (!nome)      { regSetErr('rerr-nome', 'Informe seu nome.'); ok = false; }
  if (!sobrenome) { regSetErr('rerr-sobrenome', 'Informe seu sobrenome.'); ok = false; }
  if (!nasc)      { regSetErr('rerr-nascimento', 'Informe a data de nascimento.'); ok = false; }
  else {
    const { idade } = calcularIdade(nasc);
    if (idade < 0 || idade > 130) { regSetErr('rerr-nascimento', 'Data inválida.'); ok = false; }
  }
  if (!cpf || cpf.length !== 11) {
    regSetErr('rerr-cpf', 'CPF deve ter 11 dígitos.'); ok = false;
  } else if (!validarCPF(cpf)) {
    regSetErr('rerr-cpf', 'CPF inválido. Verifique os dígitos.'); ok = false;
  } else {
    const todos = await dbGetAllUsers();
    if (todos.find(u => (u.cpf||'').replace(/\D/g,'') === cpf)) {
      regSetErr('rerr-cpf', 'CPF já cadastrado no sistema.'); ok = false;
    }
  }
  return ok;
}

async function validateStep2() {
  const email = document.getElementById('reg-email')?.value.trim();
  const tel   = document.getElementById('reg-telefone')?.value;
  ['rerr-email','rerr-telefone'].forEach(regClearErr);
  let ok = true;

  if (!email || !validarEmail(email)) {
    regSetErr('rerr-email', 'Informe um e-mail válido.'); ok = false;
  } else {
    const todos = await dbGetAllUsers();
    if (todos.find(u => u.email === email)) {
      regSetErr('rerr-email', 'E-mail já cadastrado no sistema.'); ok = false;
    }
  }
  if (!tel || !validarTelefone(tel)) {
    regSetErr('rerr-telefone', 'Informe um telefone válido com DDD.'); ok = false;
  }
  return ok;
}

async function validateStep3() {
  const username = document.getElementById('reg-username')?.value.trim();
  const senha    = document.getElementById('reg-senha')?.value;
  const senha2   = document.getElementById('reg-senha2')?.value;
  ['rerr-username','rerr-senha','rerr-senha2'].forEach(regClearErr);
  let ok = true;

  if (!username || username.length < 3) {
    regSetErr('rerr-username', 'Nome de usuário deve ter ao menos 3 caracteres.'); ok = false;
  } else {
    const dup = await dbGetUserByUsername(username);
    if (dup) { regSetErr('rerr-username', 'Nome de usuário já está em uso.'); ok = false; }
  }
  const sc = validarSenhaForte(senha);
  if (!sc.valido) { regSetErr('rerr-senha', sc.msg); ok = false; }
  if (senha !== senha2) { regSetErr('rerr-senha2', 'As senhas não conferem.'); ok = false; }
  return ok;
}

// ── Navegação ────────────────────────────
async function regNext() {
  if (_regStep === 1) { const ok = await validateStep1(); if (!ok) return; }
  if (_regStep === 2) { const ok = await validateStep2(); if (!ok) return; }
  if (_regStep === 3) { await submitRegister(); return; }

  // Ao chegar no passo 3: foca no campo de username para o usuário digitar
  if (_regStep === 2) {
    setTimeout(() => document.getElementById('reg-username')?.focus(), 100);
  }
  goToRegStep(_regStep + 1);
}

function regBack() {
  if (_regStep > 1) {
    goToRegStep(_regStep - 1);
  } else {
    closeRegisterScreen();
  }
}

async function submitRegister() {
  const ok = await validateStep3();
  if (!ok) return;

  const nBtn  = document.getElementById('reg-btn-next');
  const ldr   = document.getElementById('reg-loader');
  const nTxt  = document.getElementById('reg-btn-text');
  if (nBtn) nBtn.disabled = true;
  if (ldr)  ldr.style.display = 'inline-block';
  if (nTxt) nTxt.textContent  = 'Criando conta...';

  try {
    const nome       = document.getElementById('reg-nome')?.value.trim();
    const sobrenome  = document.getElementById('reg-sobrenome')?.value.trim();
    const cpf        = document.getElementById('reg-cpf')?.value;
    const nascimento = document.getElementById('reg-nascimento')?.value;
    const email      = document.getElementById('reg-email')?.value.trim();
    const telefone   = document.getElementById('reg-telefone')?.value;
    const username   = document.getElementById('reg-username')?.value.trim();
    const senha      = document.getElementById('reg-senha')?.value;

    const { idade, maior: maiorDeIdade } = calcularIdade(nascimento);
    const passwordHash = await hashSenha(senha);

    await dbCreateUser({
      nome, sobrenome,
      name: nome + ' ' + sobrenome,
      username, email, telefone, cpf, nascimento, idade, maiorDeIdade,
      passwordHash,
      role:         _regRole,
      active:       true,
      isAdminMaster: false,
      lastLogin:    'Nunca',
      createdAt:    new Date().toLocaleDateString('pt-BR'),
      permissions:  [...ROLE_DEFAULTS[_regRole]],
    });

    showRegisterSuccess({ nome, sobrenome, username, email, cpf, idade, maiorDeIdade, role: _regRole });

  } catch (err) {
    console.error('[SARA] Erro ao cadastrar:', err);
    if (nBtn) nBtn.disabled = false;
    if (ldr)  ldr.style.display = 'none';
    if (nTxt) nTxt.textContent  = 'Criar Conta';
    showToast('Erro ao criar conta. Tente novamente.', true);
  }
}

function showRegisterSuccess(data) {
  // Oculta passos, nav e back-link
  for (let i = 1; i <= 3; i++) {
    const s = document.getElementById('rsec-' + i); if (s) s.classList.remove('active');
    const d = document.getElementById('rstep-' + i); if (d) { d.classList.remove('active'); d.classList.add('done'); }
  }
  const nav = document.getElementById('reg-nav');    if (nav) nav.style.display = 'none';


  const sc = document.getElementById('rsec-success');
  if (!sc) return;

  sc.innerHTML = `
    <div class="reg-success">
      <div class="reg-success-icon">✓</div>
      <h3>Conta criada com sucesso!</h3>
      <p>Seus dados foram registrados no banco de dados.<br>Você já pode fazer login no sistema.</p>
      <div class="reg-success-card">
        <div class="rsc-row"><span class="rsc-label">Nome</span><span class="rsc-val">${escapeHtml(data.nome + ' ' + data.sobrenome)}</span></div>
        <div class="rsc-row"><span class="rsc-label">Usuário</span><span class="rsc-val"><code>@${escapeHtml(data.username)}</code></span></div>
        <div class="rsc-row"><span class="rsc-label">E-mail</span><span class="rsc-val">${escapeHtml(data.email)}</span></div>
        <div class="rsc-row"><span class="rsc-label">CPF</span><span class="rsc-val">${escapeHtml(data.cpf)} ${ageBadgeHTML(data.maiorDeIdade, data.idade)}</span></div>
        <div class="rsc-row"><span class="rsc-label">Perfil</span><span class="rsc-val"><span class="age-tag maior" style="margin-left:0">👁 Visualizador</span></span></div>
      </div>
      <button class="btn-login" onclick="closeRegisterScreen()" style="margin-top:22px;width:100%;justify-content:center">
        Ir para o Login
      </button>
    </div>
  `;
  sc.classList.add('active');
}

// ══════════════════════════════════════════
// NAVEGAÇÃO GLOBAL
// ══════════════════════════════════════════
async function openAdminPanel() {
  document.getElementById('screen-admin').style.display = 'flex';
  document.getElementById('admin-user-label').textContent =
    escapeHtml(currentUser.name) + ' (' + ROLE_LABELS[currentUser.role] + ')';
  await reloadUsers();
  renderUserList();
}

function goToSystem() {
  window.location.href = 'home.html';
}

function doLogout() {
  currentUser = null; selectedUserId = null; _allUsers = [];
  sessionStorage.removeItem('saraCurrentUser');

  document.getElementById('screen-admin').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';

  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('btn-login').disabled = false;
  document.getElementById('login-loader').style.display = 'none';
  document.getElementById('btn-login-text').textContent = 'Entrar no Sistema';

  // Reset olho
  const eo = document.getElementById('eye-open');   if (eo) eo.style.display = '';
  const ec = document.getElementById('eye-closed'); if (ec) ec.style.display = 'none';

  const detail = document.getElementById('admin-detail');
  if (detail) detail.innerHTML = '<div class="detail-empty"><div class="big-icon">👥</div><p>Selecione um usuário para<br>visualizar e editar suas informações</p></div>';
}

// ══════════════════════════════════════════
// PAINEL ADMIN — LISTA DE USUÁRIOS
// ══════════════════════════════════════════
function renderUserList(filter = '') {
  const list = document.getElementById('user-list');
  if (!list) return;
  const f = filter.toLowerCase();
  const filtered = _allUsers.filter(u =>
    (u.name||'').toLowerCase().includes(f) ||
    (u.username||'').toLowerCase().includes(f) ||
    (u.email||'').toLowerCase().includes(f)
  );
  const cnt = document.getElementById('user-count');
  if (cnt) cnt.textContent = _allUsers.length + ' usuário' + (_allUsers.length !== 1 ? 's' : '') + ' cadastrado' + (_allUsers.length !== 1 ? 's' : '');

  list.innerHTML = filtered.map(u => `
    <div class="user-item ${u.id === selectedUserId ? 'active' : ''}" onclick="selectUser('${escapeHtml(String(u.id))}')">
      <div class="user-avatar avatar-${escapeHtml(u.role)}">${escapeHtml(getInitials(u.name))}</div>
      <div class="user-item-info">
        <div class="user-item-name">${escapeHtml(u.name)}${u.isAdminMaster ? ' <span class="master-badge">MASTER</span>' : ''}</div>
        <div class="user-item-role">${ROLE_LABELS[u.role]||escapeHtml(u.role)} · @${escapeHtml(u.username)}</div>
      </div>
      <div class="user-status-dot ${u.active?'dot-active':'dot-inactive'}" title="${u.active?'Ativo':'Inativo'}"></div>
    </div>
  `).join('') || '<div style="padding:20px;text-align:center;font-size:.82rem;color:#999">Nenhum usuário encontrado</div>';
}

function filterUsers(val) { renderUserList(val); }
function selectUser(id)   { selectedUserId = String(id); renderUserList(document.querySelector('.user-search input')?.value||''); renderDetail(); }

// ══════════════════════════════════════════
// PAINEL ADMIN — DETALHE / EDIÇÃO
// ══════════════════════════════════════════
function maskCPF(cpf) {
  if (!cpf) return '—';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length < 3) return cpf;
  const first3 = digits.slice(0, 3);
  // Format: 456.xxx.xxx-xx
  return first3 + '.xxx.xxx-xx';
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '—';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return visible + '•'.repeat(Math.max(2, local.length - 2)) + '@' + domain;
}

function renderDetail() {
  const user = _allUsers.find(u => String(u.id) === String(selectedUserId));
  if (!user) return;

  const isSelf   = currentUser && String(user.id) === String(currentUser.id);
  const isMaster = !!user.isAdminMaster;
  const uid      = String(user.id);

  const permsHtml = PERMISSIONS_LIST.map(p => {
    const has = (user.permissions||[]).includes(p.key);
    return `<div class="perm-item ${has?'checked':''}" onclick="togglePerm('${uid}','${p.key}',this)">
      <div class="perm-checkbox">${has?'✓':''}</div>
      <div class="perm-label">${escapeHtml(p.label)}<small>${escapeHtml(p.desc)}</small></div>
    </div>`;
  }).join('');

  document.getElementById('admin-detail').innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        ${escapeHtml(user.name)}
        ${isMaster ? '<span class="master-badge-lg">ADMIN MASTER</span>' : ''}
      </div>
      <div class="detail-actions">
        ${!isMaster && !isSelf ? `<button class="btn-danger" onclick="askDelete('${uid}')">Excluir</button>` : ''}
      </div>
    </div>

    ${isMaster ? '<div class="redirect-banner" style="background:rgba(26,26,46,.06);border-color:#e2c97e"><span>🔐 <strong>Administrador Master</strong> — conta protegida. Não pode ser excluída nem rebaixada de perfil.</span></div>' : ''}
    ${isSelf && !isMaster ? '<div class="redirect-banner"><span>Este é <strong>seu próprio perfil</strong>.</span></div>' : ''}

    <div class="card">
      <div class="card-title">Dados do Perfil</div>
      <div class="detail-info-grid">
        <div class="detail-info-item"><span class="detail-info-label">Nome completo</span><span class="detail-info-value">${escapeHtml(user.name||'—')}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Usuário (login)</span><span class="detail-info-value">@${escapeHtml(user.username||'—')}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">E-mail</span><span class="detail-info-value">${escapeHtml(maskEmail(user.email))}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Telefone</span><span class="detail-info-value">${escapeHtml(user.telefone||'—')}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">CPF</span><span class="detail-info-value detail-censored">${escapeHtml(maskCPF(user.cpf))}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Senha</span><span class="detail-info-value detail-censored">••••••••</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Nascimento</span><span class="detail-info-value">${escapeHtml(user.nascimento||'—')}${user.idade ? ' <em style="color:var(--text-light);font-size:.8rem">('+user.idade+' anos)</em>' : ''}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Último acesso</span><span class="detail-info-value">${escapeHtml(user.lastLogin||'—')}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Cadastrado em</span><span class="detail-info-value">${escapeHtml(user.createdAt||'—')}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Permissões de Acesso ao Sistema</div>
      <p style="font-size:.78rem;color:var(--text-light);margin-bottom:14px">
        Clique para ativar ou desativar cada permissão. As alterações são salvas imediatamente.
        O usuário precisa fazer <strong>logout e login</strong> para as mudanças valerem no sistema.
      </p>
      <div class="perm-grid">${permsHtml}</div>
    </div>
  `;
}

function updateDetailAge(userId) {
  const val  = document.getElementById(`ed-nasc-${userId}`)?.value;
  const wrap = document.getElementById(`ed-age-${userId}`);
  if (!wrap || !val) return;
  const { idade, maior } = calcularIdade(val);
  wrap.innerHTML = ageBadgeHTML(maior, idade);
}

// ══════════════════════════════════════════
// PERMISSÕES
// ══════════════════════════════════════════
async function togglePerm(userId, key, el) {
  const user = _allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;
  if (!user.permissions) user.permissions = [];
  const idx = user.permissions.indexOf(key);
  // Atualiza visualmente e em memória imediatamente
  if (idx > -1) {
    user.permissions.splice(idx, 1);
    el.classList.remove('checked');
    el.querySelector('.perm-checkbox').textContent = '';
  } else {
    user.permissions.push(key);
    el.classList.add('checked');
    el.querySelector('.perm-checkbox').textContent = '✓';
  }
  // Persiste no Firestore sem recarregar _allUsers (evita condição de corrida)
  try {
    await dbUpdateUser(user);
  } catch(e) {
    // Reverte se falhou
    if (idx > -1) { user.permissions.push(key); el.classList.add('checked'); el.querySelector('.perm-checkbox').textContent='✓'; }
    else { user.permissions.splice(-1,1); el.classList.remove('checked'); el.querySelector('.perm-checkbox').textContent=''; }
    showToast('Erro ao salvar permissão. Tente novamente.', true);
  }
}

async function applyRoleDefaults(userId, role) {
  const user = _allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;
  user.role = role; user.permissions = [...ROLE_DEFAULTS[role]];
  await dbUpdateUser(user);
  await reloadUsers();
  renderUserList(document.querySelector('.user-search input')?.value||'');
  renderDetail();
  showToast(`Permissões de "${ROLE_LABELS[role]}" aplicadas com sucesso`);
}

async function saveRoleAndStatus(userId) {
  const user = _allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;
  const newRole   = document.getElementById('role-select-'+userId)?.value   || user.role;
  const newActive = document.getElementById('active-select-'+userId)?.value === 'true';
  const roleMudou = newRole !== user.role;
  user.role    = newRole;
  user.active  = newActive;
  // Aplica permissões padrão do novo perfil quando o papel muda
  if (roleMudou) user.permissions = [...ROLE_DEFAULTS[newRole]];
  await dbUpdateUser(user);
  await reloadUsers();
  renderUserList(document.querySelector('.user-search input')?.value||'');
  renderDetail();
  const msg = roleMudou
    ? `Perfil alterado para ${ROLE_LABELS[newRole]}. O usuário deve fazer logout e login para as mudanças valerem.`
    : 'Status atualizado com sucesso.';
  showToast(msg);
}

async function resetToRole(userId) {
  const user = _allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;
  const role = document.getElementById(`ed-role-${userId}`)?.value || user.role;
  user.permissions = [...ROLE_DEFAULTS[role]];
  await dbUpdateUser(user); renderDetail();
  showToast('Permissões restauradas para o padrão do perfil');
}

// ══════════════════════════════════════════
// SALVAR USUÁRIO
// ══════════════════════════════════════════
async function saveUser(userId) {
  const user = _allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;

  const newNome      = document.getElementById(`ed-nome-${userId}`)?.value.trim();
  const newSobrenome = document.getElementById(`ed-sobrenome-${userId}`)?.value.trim()||'';
  const newUsername  = document.getElementById(`ed-user-${userId}`)?.value.trim();
  const newEmail     = document.getElementById(`ed-email-${userId}`)?.value.trim();
  const newTel       = document.getElementById(`ed-tel-${userId}`)?.value||'';
  const newCpf       = document.getElementById(`ed-cpf-${userId}`)?.value||'';
  const newNasc      = document.getElementById(`ed-nasc-${userId}`)?.value||'';
  const newPass      = document.getElementById(`ed-pass-${userId}`)?.value;
  const newRole      = document.getElementById(`ed-role-${userId}`)?.value||user.role;
  const newActive    = document.getElementById(`ed-active-${userId}`)?.value === 'true';

  document.querySelectorAll('.field-error').forEach(e => { e.textContent=''; e.classList.remove('show'); });

  if (!newNome || !newUsername) { showToast('Nome e usuário são obrigatórios', true); return; }
  if (newEmail && !validarEmail(newEmail)) {
    const el = document.getElementById(`err-ed-email-${userId}`);
    if (el) { el.textContent='E-mail inválido'; el.classList.add('show'); }
    showToast('E-mail inválido', true); return;
  }
  const dup = _allUsers.find(u => u.username === newUsername && String(u.id) !== String(userId));
  if (dup) { showToast('Nome de usuário já está em uso', true); return; }

  if (newPass && newPass.length > 0) {
    const ck = validarSenhaForte(newPass);
    if (!ck.valido) {
      const el = document.getElementById(`err-ed-pass-${userId}`);
      if (el) { el.textContent=ck.msg; el.classList.add('show'); }
      showToast(ck.msg, true); return;
    }
    user.passwordHash = await hashSenha(newPass);
  }

  user.nome      = newNome;
  user.sobrenome = newSobrenome;
  user.name      = newNome + (newSobrenome ? ' '+newSobrenome : '');
  user.email     = newEmail;
  user.telefone  = newTel;
  user.nascimento = newNasc;
  if (newNasc) { const info = calcularIdade(newNasc); user.idade = info.idade; user.maiorDeIdade = info.maior; }
  if (!user.isAdminMaster) { user.cpf=newCpf; user.username=newUsername; user.role=newRole; user.active=newActive; }

  await dbUpdateUser(user);
  await reloadUsers();
  renderUserList(document.querySelector('.user-search input')?.value||'');
  renderDetail();
  showToast('Usuário atualizado com sucesso!');
}

// ══════════════════════════════════════════
// MODAL — ADICIONAR USUÁRIO
// ══════════════════════════════════════════
function openAddModal() {
  ['new-nome','new-sobrenome','new-username','new-email','new-telefone','new-cpf','new-pass','new-pass2'].forEach(id => {
    const el=document.getElementById(id); if(el) el.value='';
  });
  const nasc=document.getElementById('new-nascimento'); if(nasc) nasc.value='';
  document.querySelectorAll('#add-modal .field-error').forEach(e=>{e.textContent='';e.classList.remove('show');});
  const badge=document.getElementById('new-age-badge'); if(badge) badge.style.display='none';
  document.getElementById('add-modal').classList.add('open');
}
function closeAddModal() { document.getElementById('add-modal').classList.remove('open'); }

async function saveNewUser() {
  const nome      = document.getElementById('new-nome')?.value.trim();
  const sobrenome = document.getElementById('new-sobrenome')?.value.trim();
  const username  = document.getElementById('new-username')?.value.trim();
  const email     = document.getElementById('new-email')?.value.trim();
  const telefone  = document.getElementById('new-telefone')?.value;
  const cpf       = document.getElementById('new-cpf')?.value;
  const nascimento= document.getElementById('new-nascimento')?.value;
  const role      = document.getElementById('new-role')?.value||'viewer';
  const pass      = document.getElementById('new-pass')?.value;
  const pass2     = document.getElementById('new-pass2')?.value;

  document.querySelectorAll('#add-modal .field-error').forEach(e=>{e.textContent='';e.classList.remove('show');});
  const setErr = (id,msg) => { const el=document.getElementById(id); if(el){el.textContent=msg;el.classList.add('show');} };

  let ok = true;
  if (!nome)      { setErr('err-new-nome','Nome obrigatório'); ok=false; }
  if (!sobrenome) { setErr('err-new-sobrenome','Sobrenome obrigatório'); ok=false; }
  if (!username||username.length<3) { setErr('err-new-username','Mínimo 3 caracteres'); ok=false; }
  if (!email||!validarEmail(email)) { setErr('err-new-email','E-mail inválido'); ok=false; }
  if (!telefone||!validarTelefone(telefone)) { setErr('err-new-tel','Telefone inválido'); ok=false; }
  if (!nascimento) { setErr('err-new-nasc','Informe a data'); ok=false; }

  const cpfL=(cpf||'').replace(/\D/g,'');
  if (cpfL.length!==11)      { setErr('err-new-cpf','CPF deve ter 11 dígitos'); ok=false; }
  else if (!validarCPF(cpfL)){ setErr('err-new-cpf','CPF inválido'); ok=false; }

  const sc=validarSenhaForte(pass);
  if (!sc.valido)   { setErr('err-new-pass',sc.msg); ok=false; }
  if (pass !== pass2){ setErr('err-new-pass2','As senhas não conferem'); ok=false; }
  if (!ok) return;

  const todos = await dbGetAllUsers();
  if (await dbGetUserByUsername(username)) { setErr('err-new-username','Usuário já em uso'); return; }
  if (todos.find(u=>(u.cpf||'').replace(/\D/g,'')=== cpfL)) { setErr('err-new-cpf','CPF já cadastrado'); return; }
  if (email && todos.find(u=>u.email===email)) { setErr('err-new-email','E-mail já cadastrado'); return; }

  const { idade, maior:maiorDeIdade } = calcularIdade(nascimento);
  const passwordHash = await hashSenha(pass);
  await dbCreateUser({ nome, sobrenome, name:nome+' '+sobrenome, username, email, telefone, cpf, nascimento, idade, maiorDeIdade, passwordHash, role, active:true, isAdminMaster:false, lastLogin:'Nunca', createdAt:new Date().toLocaleDateString('pt-BR'), permissions:[...ROLE_DEFAULTS[role]] });
  await reloadUsers();
  closeAddModal();
  renderUserList(document.querySelector('.user-search input')?.value||'');
  showToast(`Usuário "${escapeHtml(nome+' '+sobrenome)}" criado com sucesso!`);
}

// ══════════════════════════════════════════
// EXCLUIR USUÁRIO
// ══════════════════════════════════════════
function askDelete(id) {
  const user=_allUsers.find(u=>String(u.id)===String(id));
  if (!user) return;
  if (user.isAdminMaster) { showToast('O Administrador Master não pode ser excluído.', true); return; }
  deleteTargetId=String(id);
  document.getElementById('del-name-label').textContent=user.name;
  document.getElementById('del-modal').classList.add('open');
}
function closeDelModal() { document.getElementById('del-modal').classList.remove('open'); deleteTargetId=null; }
async function confirmDelete() {
  if (!deleteTargetId) return;
  const user=_allUsers.find(u=>String(u.id)===String(deleteTargetId));
  if (user?.isAdminMaster) { showToast('O Administrador Master não pode ser excluído.', true); closeDelModal(); return; }
  await dbDeleteUser(deleteTargetId);
  selectedUserId=null;
  await reloadUsers();
  closeDelModal();
  renderUserList(document.querySelector('.user-search input')?.value||'');
  const d=document.getElementById('admin-detail');
  if (d) d.innerHTML='<div class="detail-empty"><div class="big-icon">👥</div><p>Selecione um usuário para<br>visualizar e editar suas informações</p></div>';
  showToast('Usuário excluído com sucesso');
}

// Fecha modais clicando no overlay
['add-modal','del-modal'].forEach(id => {
  const el=document.getElementById(id);
  if (el) el.addEventListener('click', e => { if(e.target.id===id) el.classList.remove('open'); });
});