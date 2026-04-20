// ══════════════════════════════════════════════════════════════════════
// SARA — Banco de Dados (Firebase Firestore — SDK Compat v9)
// Carregado via CDN no index.html antes deste arquivo
// ══════════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "AIzaSyBuby3f8-z3rihGlOkWXrPJr87fRrYL2fc",
  authDomain:        "sara-a266d.firebaseapp.com",
  projectId:         "sara-a266d",
  storageBucket:     "sara-a266d.firebasestorage.app",
  messagingSenderId: "480442628820",
  appId:             "1:480442628820:web:67d326cf266216f9bb5941",
  measurementId:     "G-08913ECVJB"
};

// Inicializa Firebase (evita duplicar se já foi inicializado)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const _db = firebase.firestore();

// Coleções
const COL_USERS   = 'usuarios';
const COL_CONFIG  = 'config';
const COL_DEMANDS = 'demandas';

// ──────────────────────────────────────────
// Compatibilidade: dbInit (Firestore não precisa)
// ──────────────────────────────────────────
async function dbInit() { return true; }

// ──────────────────────────────────────────
// CRUD — Usuários
// ──────────────────────────────────────────
async function dbGetAllUsers() {
  const snap = await _db.collection(COL_USERS).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function dbGetUserByUsername(username) {
  const snap = await _db.collection(COL_USERS).where('username', '==', username).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function dbGetUserById(id) {
  const snap = await _db.collection(COL_USERS).doc(String(id)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function dbCreateUser(userData) {
  const { id: _, ...data } = userData;
  const ref = await _db.collection(COL_USERS).add(data);
  return { ...data, id: ref.id };
}

async function dbUpdateUser(userData) {
  const { id, ...data } = userData;
  await _db.collection(COL_USERS).doc(String(id)).set(data);
  return userData;
}

async function dbDeleteUser(id) {
  await _db.collection(COL_USERS).doc(String(id)).delete();
}

// ──────────────────────────────────────────
// CRUD — Demandas
// ──────────────────────────────────────────
async function dbGetAllDemandas() {
  const snap = await _db.collection(COL_DEMANDS).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function dbCreateDemanda(d) {
  const { id: _, ...data } = d;
  const ref = await _db.collection(COL_DEMANDS).add(data);
  return { ...data, id: ref.id };
}

async function dbUpdateDemanda(d) {
  const { id, ...data } = d;
  await _db.collection(COL_DEMANDS).doc(String(id)).set(data);
  return d;
}

async function dbDeleteDemanda(id) {
  await _db.collection(COL_DEMANDS).doc(String(id)).delete();
}

// ──────────────────────────────────────────
// Config (chave-valor)
// ──────────────────────────────────────────
async function dbGetConfig(chave) {
  const snap = await _db.collection(COL_CONFIG).doc(chave).get();
  return snap.exists ? snap.data().valor : null;
}

async function dbSetConfig(chave, valor) {
  await _db.collection(COL_CONFIG).doc(chave).set({ valor });
}

// ──────────────────────────────────────────
// Seed — Admin Master (roda uma única vez)
// ──────────────────────────────────────────
async function dbSeedAdmin() {
  const seeded = await dbGetConfig('admin_seeded');
  if (seeded) return;

  const hashReal = await hashSenha('Admin@2025');

  const existing = await dbGetUserByUsername('admin');
  if (!existing) {
    await dbCreateUser({
      nome:          'Administrador',
      sobrenome:     'do Sistema',
      name:          'Administrador do Sistema',
      username:      'admin',
      passwordHash:  hashReal,
      email:         'admin@sara.gov.br',
      role:          'admin',
      active:        true,
      isAdminMaster: true,
      lastLogin:     'Nunca',
      createdAt:     new Date().toLocaleDateString('pt-BR'),
      permissions:   ['view_dashboard','view_politicians','edit_politicians',
                      'view_expenses','edit_expenses','view_eligibility',
                      'view_demands','edit_demands','reports','admin'],
    });
    console.info('[SARA] Admin criado no Firestore. Login: admin | Senha: Admin@2025');
  }

  await dbSetConfig('admin_seeded', true);
}

// ──────────────────────────────────────────
// Limpeza: remove viewer padrão legado
// ──────────────────────────────────────────
async function _limparViewerPadrao() {
  try {
    const viewer = await dbGetUserByUsername('viewer');
    if (viewer) {
      await dbDeleteUser(viewer.id);
      console.info('[SARA] Usuário "viewer" padrão removido.');
    }
  } catch (e) {
    console.warn('[SARA] Limpeza ignorada:', e.message);
  }
}
