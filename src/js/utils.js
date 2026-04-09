// ══════════════════════════════════════════
// SARA — Utilitários de Segurança e Validação
// ══════════════════════════════════════════

// ─── Sanitização XSS ────────────────────────────────────────────────────────

/**
 * Escapa caracteres HTML para prevenir XSS.
 * Usar em qualquer dado dinâmico inserido via innerHTML.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Validação de Campos ─────────────────────────────────────────────────────

/**
 * Valida CPF brasileiro (11 dígitos, com verificação de dígitos).
 */
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(cpf[10]);
}

/**
 * Valida formato de e-mail.
 */
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos).
 */
function validarTelefone(tel) {
  const digits = tel.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

/**
 * Valida força da senha (mínimo 6 chars, pelo menos 1 letra e 1 número).
 */
function validarSenhaForte(senha) {
  if (senha.length < 6) return { valido: false, msg: 'A senha deve ter pelo menos 6 caracteres' };
  if (!/[a-zA-Z]/.test(senha)) return { valido: false, msg: 'A senha deve conter pelo menos uma letra' };
  if (!/\d/.test(senha)) return { valido: false, msg: 'A senha deve conter pelo menos um número' };
  return { valido: true, msg: '' };
}

// ─── Máscara de Campos ──────────────────────────────────────────────────────

function mascaraCPF(valor) {
  return valor.replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function mascaraTelefone(valor) {
  const digits = valor.replace(/\D/g, '');
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

// ─── Hash de Senha (SHA-256 via Web Crypto API) ─────────────────────────────

async function hashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Persistência localStorage ──────────────────────────────────────────────

const STORAGE_KEYS = {
  USERS: 'sara_users',
  DEMANDAS: 'sara_demandas',
  NEXT_ID: 'sara_next_user_id',
};

function salvarNoStorage(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
  } catch (e) {
    console.warn('[SARA Storage] Erro ao salvar:', e.message);
  }
}

function carregarDoStorage(chave) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[SARA Storage] Erro ao carregar:', e.message);
    return null;
  }
}

// ─── Retry para chamadas de API ─────────────────────────────────────────────

async function fetchComRetry(url, options = {}, tentativas = 3, delay = 1000) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === tentativas - 1) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}
