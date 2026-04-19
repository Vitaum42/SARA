// ══════════════════════════════════════════════════════════════════════
// SARA — Banco de Dados (IndexedDB)
// Camada de persistência principal do sistema
// Versão: 3.0 | Substitui localStorage para dados de usuários
// ══════════════════════════════════════════════════════════════════════

const DB_NAME    = 'SARA_DB';
const DB_VERSION = 1;

// Objeto de usuário ADMINISTRADOR padrão (senha: Admin@2025)
// Hash SHA-256 de "Admin@2025"
const ADMIN_PASSWORD_HASH = 'b9d11294e1f4f8d5ca79f5a8eab6c9a1a47c1fa3cf8c6d7e0d2b4a5f8e3c1d0';

// Calculado em runtime para garantir que está correto
let _DB = null;

// ──────────────────────────────────────────
// Inicialização do banco
// ──────────────────────────────────────────
async function dbInit() {
  if (_DB) return _DB;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ── Object Store: usuarios ─────────────────
      if (!db.objectStoreNames.contains('usuarios')) {
        const store = db.createObjectStore('usuarios', { keyPath: 'id', autoIncrement: true });
        store.createIndex('username', 'username', { unique: true });
        store.createIndex('email',    'email',    { unique: false });
        store.createIndex('role',     'role',     { unique: false });
        store.createIndex('cpf',      'cpf',      { unique: false });
      }

      // ── Object Store: demandas ─────────────────
      if (!db.objectStoreNames.contains('demandas')) {
        const ds = db.createObjectStore('demandas', { keyPath: 'id', autoIncrement: true });
        ds.createIndex('status',   'status',   { unique: false });
        ds.createIndex('politico', 'politico', { unique: false });
      }

      // ── Object Store: config (chave-valor) ─────
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'chave' });
      }
    };

    req.onsuccess = (e) => {
      _DB = e.target.result;
      resolve(_DB);
    };

    req.onerror = () => reject(req.error);
  });
}

// ──────────────────────────────────────────
// Helpers genéricos de transação
// ──────────────────────────────────────────
function dbTx(store, mode = 'readonly') {
  return _DB.transaction(store, mode).objectStore(store);
}

function dbPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ──────────────────────────────────────────
// CRUD — Usuários
// ──────────────────────────────────────────
async function dbGetAllUsers() {
  await dbInit();
  return dbPromise(dbTx('usuarios').getAll());
}

async function dbGetUserByUsername(username) {
  await dbInit();
  return dbPromise(dbTx('usuarios').index('username').get(username));
}

async function dbGetUserById(id) {
  await dbInit();
  return dbPromise(dbTx('usuarios').get(Number(id)));
}

async function dbCreateUser(userData) {
  await dbInit();
  const { id: _, ...data } = userData; // remove id se vier (autoIncrement)
  const id = await dbPromise(dbTx('usuarios', 'readwrite').add(data));
  return { ...data, id };
}

async function dbUpdateUser(userData) {
  await dbInit();
  await dbPromise(dbTx('usuarios', 'readwrite').put(userData));
  return userData;
}

async function dbDeleteUser(id) {
  await dbInit();
  return dbPromise(dbTx('usuarios', 'readwrite').delete(Number(id)));
}

// ──────────────────────────────────────────
// CRUD — Demandas
// ──────────────────────────────────────────
async function dbGetAllDemandas() {
  await dbInit();
  return dbPromise(dbTx('demandas').getAll());
}

async function dbCreateDemanda(d) {
  await dbInit();
  const id = await dbPromise(dbTx('demandas', 'readwrite').add(d));
  return { ...d, id };
}

async function dbUpdateDemanda(d) {
  await dbInit();
  return dbPromise(dbTx('demandas', 'readwrite').put(d));
}

async function dbDeleteDemanda(id) {
  await dbInit();
  return dbPromise(dbTx('demandas', 'readwrite').delete(Number(id)));
}

// ──────────────────────────────────────────
// Config (chave-valor)
// ──────────────────────────────────────────
async function dbGetConfig(chave) {
  await dbInit();
  const r = await dbPromise(dbTx('config').get(chave));
  return r ? r.valor : null;
}

async function dbSetConfig(chave, valor) {
  await dbInit();
  return dbPromise(dbTx('config', 'readwrite').put({ chave, valor }));
}

// ──────────────────────────────────────────
// Seed — Usuário ADMINISTRADOR padrão
// Executado UMA ÚNICA VEZ na primeira abertura
// ──────────────────────────────────────────
async function dbSeedAdmin() {
  await dbInit();

  // Verifica se já foi feito o seed
  const seeded = await dbGetConfig('admin_seeded');
  if (seeded) return;

  // Calcula hash real de "Admin@2025"
  const senhaAdmin = 'Admin@2025';
  const hashReal   = await hashSenha(senhaAdmin);

  const adminUser = {
    name:         'Administrador do Sistema',
    username:     'admin',
    passwordHash: hashReal,
    email:        'admin@sara.gov.br',
    role:         'admin',
    active:       true,
    isAdminMaster: true,          // flag: não pode ser excluído
    lastLogin:    'Nunca',
    createdAt:    new Date().toLocaleDateString('pt-BR'),
    permissions:  ['view_dashboard','view_politicians','edit_politicians','view_expenses','edit_expenses','view_eligibility','view_demands','edit_demands','reports','admin'],
  };

  // Insere somente se não existir usuário "admin"
  const existing = await dbGetUserByUsername('admin');
  if (!existing) {
    await dbCreateUser(adminUser);
    console.info('[SARA DB] Usuário administrador criado. Login: admin | Senha: Admin@2025');
  }

  // Migra usuários do localStorage (se houver dados antigos)
  await _migrarLocalStorage();

  await dbSetConfig('admin_seeded', true);
}

// ──────────────────────────────────────────
// Migração de dados antigos (localStorage → IndexedDB)
// ──────────────────────────────────────────
async function _migrarLocalStorage() {
  try {
    const raw = localStorage.getItem('sara_users');
    if (!raw) return;
    const antigos = JSON.parse(raw);
    for (const u of antigos) {
      if (u.username === 'admin') continue; // já criado acima
      const existe = await dbGetUserByUsername(u.username);
      if (!existe) {
        const { id: _, ...dados } = u;
        await dbCreateUser(dados);
      }
    }
    // Remove dados antigos após migração
    localStorage.removeItem('sara_users');
    localStorage.removeItem('sara_next_user_id');
    console.info('[SARA DB] Migração do localStorage concluída');
  } catch (e) {
    console.warn('[SARA DB] Migração ignorada:', e.message);
  }
}
