  const ROLE_LABELS_HOME = { admin: 'Administrador', viewer: 'Visualizador' };

  // ─── Topbar: data/hora atualizada ─────────────────────────────────────────
  function atualizarDateTime() {
    const el = document.getElementById('topbar-datetime');
    if (!el) return;
    const agora = new Date();
    const opcoes = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    el.textContent = agora.toLocaleDateString('pt-BR', opcoes);
  }
  atualizarDateTime();
  setInterval(atualizarDateTime, 30000);

  // ─── Sidebar toggle (mobile) ──────────────────────────────────────────────
  function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
  }

  // ─── Demandas — com persistência localStorage ─────────────────────────────

  const DEMANDAS_PADRAO = [
    { id: 'DEM-001', titulo: 'Ampliação da UBS Jardim das Flores', area: 'Saúde', politico: 'Ana Souza', regiao: 'São Paulo — SP', prioridade: 'Alta', status: 'Em Andamento', data: '12/01/2025', solicitante: 'Solicitado por moradores do bairro' },
    { id: 'DEM-002', titulo: 'Pavimentação da Rua 7 de Setembro', area: 'Infraestrutura', politico: 'Rodrigo Costa', regiao: 'Belo Horizonte — MG', prioridade: 'Média', status: 'Em Andamento', data: '15/01/2025', solicitante: 'Associação de moradores' },
    { id: 'DEM-003', titulo: 'Iluminação pública no Setor Norte', area: 'Obras', politico: 'Maria Ferreira', regiao: 'Brasília — DF', prioridade: 'Baixa', status: 'Concluída', data: '05/02/2025', solicitante: 'Conselho comunitário' },
    { id: 'DEM-004', titulo: 'Construção de creche no bairro Vila Nova', area: 'Educação', politico: 'Carlos Pinto', regiao: 'Porto Alegre — RS', prioridade: 'Média', status: 'Aberta', data: '20/02/2025', solicitante: 'Pais e responsáveis' },
    { id: 'DEM-005', titulo: 'Reforma da Escola Municipal Centro', area: 'Educação', politico: 'Ana Souza', regiao: 'Recife — PE', prioridade: 'Alta', status: 'Aberta', data: '01/03/2025', solicitante: 'Comunidade escolar' },
  ];

  const DEMANDAS = carregarDoStorage(STORAGE_KEYS.DEMANDAS) || [...DEMANDAS_PADRAO];

  function persistirDemandas() {
    salvarNoStorage(STORAGE_KEYS.DEMANDAS, DEMANDAS);
  }

  const PRIORIDADE_COLOR = { Alta: '#ef4444', Média: '#eab308', Baixa: '#3a7a3e' };
  const STATUS_BADGE = {
    'Em Andamento': 'badge-yellow',
    'Concluída': 'badge-green',
    'Aberta': 'badge-gray',
  };
  const DOT_COLOR = { Alta: 'dot-red', Média: 'dot-yellow', Baixa: 'dot-green', Concluída: 'dot-green' };

  // ─── Renderiza o card "Demandas Recentes" no dashboard (com sanitização) ──
  function renderDashboardDemandas() {
    const container = document.querySelector('#page-dashboard .card:last-child .card-header');
    if (!container) return;
    const card = container.closest('.card');

    card.querySelectorAll('.demand-item').forEach(el => el.remove());

    const recentes = [...DEMANDAS].slice(0, 5);
    recentes.forEach(d => {
      const dotClass = d.status === 'Concluída' ? 'dot-green' : d.prioridade === 'Alta' ? 'dot-red' : 'dot-yellow';
      const el = document.createElement('div');
      el.className = 'demand-item';
      el.innerHTML = `
        <div class="demand-dot ${dotClass}"></div>
        <div>
          <div class="demand-text">${escapeHtml(d.titulo)}</div>
          <div class="demand-meta">${escapeHtml(d.area)} · ${escapeHtml(d.regiao)} · ${escapeHtml(d.prioridade)} prioridade</div>
        </div>`;
      card.appendChild(el);
    });

    const abertas = DEMANDAS.filter(d => d.status === 'Aberta' || d.status === 'Em Andamento').length;
    const resolvidas = DEMANDAS.filter(d => d.status === 'Concluída').length;
    const elStat = document.getElementById('dash-demandas-abertas');
    const elSub  = document.getElementById('dash-sub-demandas');
    if (elStat) elStat.textContent = abertas;
    if (elSub)  elSub.textContent  = `${resolvidas} resolvida${resolvidas !== 1 ? 's' : ''}`;

    const badges = document.querySelectorAll('.nav-badge');
    if (badges[1]) badges[1].textContent = DEMANDAS.filter(d => d.status !== 'Concluída').length;
  }

  // ─── Renderiza a tabela na aba "Demandas Públicas" (com sanitização) ──────
  function renderTabelaDemandas(lista) {
    const tbody = document.querySelector('#page-demands .demands-table tbody');
    if (!tbody) return;
    const AREA_BADGE = { Saúde: 'badge-green', Educação: 'badge-green', Infraestrutura: 'badge-gray', Obras: 'badge-gray', Segurança: 'badge-gray' };
    tbody.innerHTML = lista.map(d => `
      <tr>
        <td style="color:var(--text-light);font-size:.78rem">${escapeHtml(d.id)}</td>
        <td><strong>${escapeHtml(d.titulo)}</strong><br><span style="font-size:.75rem;color:var(--text-light)">${escapeHtml(d.solicitante)}</span></td>
        <td><span class="badge ${AREA_BADGE[d.area] || 'badge-gray'}">${escapeHtml(d.area)}</span></td>
        <td>${escapeHtml(d.politico)}</td>
        <td>${escapeHtml(d.regiao)}</td>
        <td><span class="priority-dot" style="background:${PRIORIDADE_COLOR[d.prioridade] || '#aaa'}"></span>${escapeHtml(d.prioridade)}</td>
        <td><span class="badge ${STATUS_BADGE[d.status] || 'badge-gray'}">${escapeHtml(d.status)}</span></td>
        <td style="font-size:.78rem">${escapeHtml(d.data)}</td>
        <td><button class="action-btn">Ver</button></td>
      </tr>`).join('');
  }

  // ─── Salva nova demanda e sincroniza dashboard + tabela ──────────────────
  function registrarNovaDemanda(dados) {
    const novoId = 'DEM-' + String(DEMANDAS.length + 1).padStart(3, '0');
    const hoje = new Date().toLocaleDateString('pt-BR');
    DEMANDAS.unshift({ id: novoId, ...dados, data: hoje });
    persistirDemandas();
    renderDashboardDemandas();
    renderTabelaDemandas(DEMANDAS);
  }

  // ─── Renderiza "Políticos Recentes" no dashboard com dados da API ────────
  function renderDashboardPoliticos(deputados) {
    const container = document.querySelector('#page-dashboard .dashboard-grid .card:first-child');
    if (!container) return;

    container.querySelectorAll('.politician-row').forEach(el => el.remove());

    if (!deputados || deputados.length === 0) {
      const row = document.createElement('div');
      row.style.cssText = 'text-align:center;padding:30px;color:var(--text-light);font-size:.85rem';
      row.textContent = 'Nenhum político encontrado na API.';
      container.appendChild(row);
      return;
    }

    const cinco = deputados.slice(0, 5);
    cinco.forEach(dep => {
      const initials = dep.nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
      const fotoUrl = dep.urlFoto || `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`;
      const row = document.createElement('div');
      row.className = 'politician-row';
      row.innerHTML = `
        <img class="avatar-photo" src="${fotoUrl}" alt="${escapeHtml(dep.nome)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="avatar" style="display:none">${escapeHtml(initials)}</div>
        <div>
          <div class="pol-name">${escapeHtml(dep.nome)}</div>
          <div class="pol-info">${escapeHtml(dep.siglaPartido || '—')} · ${escapeHtml(dep.siglaUf || '—')} — Dep. Federal</div>
        </div>
        <div class="pol-right"><span class="badge badge-green">Ativo</span></div>`;
      container.appendChild(row);
    });
  }

  function loadSidebarUser() {
    try {
      const stored = sessionStorage.getItem('saraCurrentUser');
      if (!stored) return;
      const user = JSON.parse(stored);
      const initials = user.name.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
      document.getElementById('sidebar-avatar').textContent = initials;
      document.getElementById('sidebar-user-name').textContent = user.name;
      document.getElementById('sidebar-user-role').textContent = ROLE_LABELS_HOME[user.role] || user.role;
    } catch(e) {}
  }

  function sidebarLogout() {
    sessionStorage.removeItem('saraCurrentUser');
    window.location.href = 'login.html';
  }

  loadSidebarUser();

  const titles = {
    dashboard: 'Painel Geral',
    politicians: 'Políticos Cadastrados',
    register: 'Novo Cadastro',
    expenses: 'Gastos Públicos',
    eligibility: 'Verificação de Elegibilidade',
    demands: 'Demandas Públicas',
    legislative: 'Atuação Legislativa',
    reports: 'Relatórios'
  };

  function navigate(page, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    if (el) el.classList.add('active');
    document.getElementById('topbar-title').textContent = titles[page] || page;
  }

  // Form tabs
  let currentTab = 'dados';
  const tabOrder = ['dados', 'partido', 'mandato'];
  function switchTab(tab) {
    document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('section-' + tab).classList.add('active');
    currentTab = tab;
    const idx = tabOrder.indexOf(tab);
    document.getElementById('reg-progress').style.width = ((idx+1)/3*100) + '%';
    document.getElementById('step-indicator').textContent = `Etapa ${idx+1} de 3`;
    document.getElementById('btn-prev').style.visibility = idx === 0 ? 'hidden' : 'visible';
    document.getElementById('btn-next').textContent = idx === 2 ? 'Salvar Cadastro' : 'Próximo';
  }

  function nextTab() {
    const idx = tabOrder.indexOf(currentTab);

    // Validação antes de avançar
    if (idx === 0 && !validarEtapaDados()) return;
    if (idx === 1 && !validarEtapaPartido()) return;

    if (idx < 2) switchTab(tabOrder[idx+1]);
    else {
      showToast('Político cadastrado com sucesso!');
      navigate('politicians', document.querySelector('[onclick*=politicians]'));
      setTimeout(()=>switchTab('dados'),500);
    }
  }
  function prevTab() {
    const idx = tabOrder.indexOf(currentTab);
    if (idx > 0) switchTab(tabOrder[idx-1]);
  }

  // ─── Validação de etapas do formulário de cadastro ───────────────────────
  function validarEtapaDados() {
    const section = document.getElementById('section-dados');
    const nomeInput = section.querySelector('input[type="text"]');
    const cpfInput = section.querySelectorAll('input[type="text"]')[2];

    if (nomeInput && !nomeInput.value.trim()) {
      nomeInput.focus();
      nomeInput.style.borderColor = '#ef4444';
      showToast('Preencha o nome completo', true);
      setTimeout(() => nomeInput.style.borderColor = '', 3000);
      return false;
    }
    if (cpfInput && cpfInput.value.trim()) {
      const cpfLimpo = cpfInput.value.replace(/\D/g, '');
      if (cpfLimpo.length > 0 && !validarCPF(cpfLimpo)) {
        cpfInput.focus();
        cpfInput.style.borderColor = '#ef4444';
        showToast('CPF inválido', true);
        setTimeout(() => cpfInput.style.borderColor = '', 3000);
        return false;
      }
    }
    return true;
  }

  function validarEtapaPartido() {
    const section = document.getElementById('section-partido');
    const partidoSelect = section.querySelector('select');
    if (partidoSelect && !partidoSelect.value) {
      partidoSelect.focus();
      partidoSelect.style.borderColor = '#ef4444';
      showToast('Selecione um partido', true);
      setTimeout(() => partidoSelect.style.borderColor = '', 3000);
      return false;
    }
    return true;
  }

  // Eligibility
  function updateEligibility(val) {
    const score = document.getElementById('elig-score');
    const bar = document.getElementById('elig-bar-fill');
    const label = document.getElementById('elig-status-label');
    if (val === 'ok') {
      score.textContent = '9/10'; bar.style.width = '90%';
      label.textContent = 'Candidatura Aprovada — Todos os critérios principais atendidos';
    } else if (val === 'pending') {
      score.textContent = '6/10'; bar.style.width = '60%';
      label.textContent = 'Pendente — Alguns critérios requerem atenção';
    } else {
      score.textContent = '3/10'; bar.style.width = '30%';
      label.textContent = 'Candidatura Irregular — Critérios essenciais não atendidos';
    }
  }

  // Modal
  function openModal() {
    document.getElementById('demand-modal').classList.add('open');
  }
  function closeModal() {
    document.getElementById('demand-modal').classList.remove('open');
  }
  document.getElementById('demand-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  function saveDemand() {
    const inputs = document.querySelectorAll('#demand-modal input, #demand-modal select, #demand-modal textarea');
    const titulo    = inputs[0]?.value?.trim() || '';
    const area      = inputs[1]?.value || 'Outros';
    const prioridade = inputs[2]?.value || 'Média';
    const politico  = inputs[3]?.value || '—';
    const regiao    = inputs[4]?.value?.trim() || '—';

    // Validação
    if (!titulo) {
      showToast('Preencha o título da demanda', true);
      if (inputs[0]) inputs[0].focus();
      return;
    }

    registrarNovaDemanda({ titulo, area, prioridade, politico, regiao, status: 'Aberta', solicitante: 'Registrado pelo sistema' });
    closeModal();
    showToast('Demanda registrada com sucesso!');
  }

  // Filtros de demandas
  function initDemandFilters() {
    const filterInputs = document.querySelectorAll('#page-demands .pol-filters input, #page-demands .pol-filters select');
    filterInputs.forEach(input => {
      input.addEventListener('input', filtrarDemandas);
      input.addEventListener('change', filtrarDemandas);
    });
  }

  function filtrarDemandas() {
    const filters = document.querySelectorAll('#page-demands .pol-filters input, #page-demands .pol-filters select');
    const texto = filters[0]?.value?.toLowerCase() || '';
    const area = filters[1]?.value || '';
    const status = filters[2]?.value || '';
    const prioridade = filters[3]?.value || '';

    const filtered = DEMANDAS.filter(d => {
      const matchTexto = !texto || d.titulo.toLowerCase().includes(texto) || d.politico.toLowerCase().includes(texto);
      const matchArea = !area || area === 'Todas as áreas' || d.area === area;
      const matchStatus = !status || status === 'Todos os Status' || d.status === status;
      const matchPrioridade = !prioridade || prioridade === 'Toda Prioridade' || d.prioridade === prioridade;
      return matchTexto && matchArea && matchStatus && matchPrioridade;
    });
    renderTabelaDemandas(filtered);
  }

  // Toasts
  function showToast(msg, isError) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ─── Inicialização ───────────────────────────────────────────────────────
  document.addEventListener('sara:deputadosCarregados', function(e) {
    renderDashboardPoliticos(e.detail);
  });

  document.addEventListener('DOMContentLoaded', function() {
    renderDashboardDemandas();
    renderTabelaDemandas(DEMANDAS);
    initDemandFilters();

    // Aplicar máscaras nos campos de CPF e telefone do formulário de cadastro
    const cpfInputs = document.querySelectorAll('input[placeholder*="000.000"]');
    cpfInputs.forEach(input => {
      input.addEventListener('input', function() {
        this.value = mascaraCPF(this.value);
      });
      input.setAttribute('maxlength', '14');
    });

    const telInputs = document.querySelectorAll('input[type="tel"]');
    telInputs.forEach(input => {
      input.addEventListener('input', function() {
        this.value = mascaraTelefone(this.value);
      });
      input.setAttribute('maxlength', '15');
    });
  });

// ─── DARK MODE ──────────────────────────────────────────────────────────────
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('sara_dark_mode', isDark ? '1' : '0');
  document.getElementById('icon-sun').style.display = isDark ? 'none' : '';
  document.getElementById('icon-moon').style.display = isDark ? '' : 'none';
  // Update charts colors if they exist
  updateChartsTheme();
}
(function initDarkMode() {
  if (localStorage.getItem('sara_dark_mode') === '1') {
    document.body.classList.add('dark');
    const sun = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');
    if (sun) sun.style.display = 'none';
    if (moon) moon.style.display = '';
  }
})();

// ─── GLOBAL SEARCH ──────────────────────────────────────────────────────────
(function initGlobalSearch() {
  const input = document.getElementById('global-search');
  const results = document.getElementById('global-search-results');
  if (!input || !results) return;

  input.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    if (q.length < 2) { results.classList.remove('open'); return; }

    let html = '';

    // Search politicians
    if (typeof todosDeputados !== 'undefined' && todosDeputados.length) {
      const matches = todosDeputados.filter(d =>
        d.nome.toLowerCase().includes(q) ||
        (d.siglaPartido || '').toLowerCase().includes(q) ||
        (d.siglaUf || '').toLowerCase().includes(q)
      ).slice(0, 5);
      if (matches.length) {
        html += '<div class="search-result-group"><div class="search-result-group-title">Politicos</div>';
        matches.forEach(d => {
          html += `<div class="search-result-item" onclick="navigate('politicians', document.querySelector('[onclick*=politicians]'));document.getElementById('global-search-results').classList.remove('open');document.getElementById('global-search').value='';">
            <div><div>${escapeHtml(d.nome)}</div><div class="sr-sub">${escapeHtml(d.siglaPartido||'')} - ${escapeHtml(d.siglaUf||'')}</div></div>
          </div>`;
        });
        html += '</div>';
      }
    }

    // Search demands
    if (typeof DEMANDAS !== 'undefined') {
      const dMatches = DEMANDAS.filter(d =>
        d.titulo.toLowerCase().includes(q) ||
        d.area.toLowerCase().includes(q) ||
        d.politico.toLowerCase().includes(q)
      ).slice(0, 5);
      if (dMatches.length) {
        html += '<div class="search-result-group"><div class="search-result-group-title">Demandas</div>';
        dMatches.forEach(d => {
          html += `<div class="search-result-item" onclick="navigate('demands', document.querySelector('[onclick*=demands]'));document.getElementById('global-search-results').classList.remove('open');document.getElementById('global-search').value='';">
            <div><div>${escapeHtml(d.titulo)}</div><div class="sr-sub">${escapeHtml(d.area)} - ${escapeHtml(d.status)}</div></div>
          </div>`;
        });
        html += '</div>';
      }
    }

    if (!html) {
      html = '<div class="search-no-results">Nenhum resultado encontrado</div>';
    }

    results.innerHTML = html;
    results.classList.add('open');
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.global-search-wrap')) {
      results.classList.remove('open');
    }
  });
})();

// ─── BREADCRUMB ─────────────────────────────────────────────────────────────
function updateBreadcrumb(page) {
  const el = document.getElementById('breadcrumb-current');
  if (el) el.textContent = titles[page] || page;
}

// ─── HASH ROUTING ───────────────────────────────────────────────────────────
function initHashRouting() {
  function handleHash() {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && titles[hash]) {
      const navItem = document.querySelector(`.nav-item[onclick*="${hash}"]`);
      navigate(hash, navItem);
    }
  }
  window.addEventListener('hashchange', handleHash);
  if (window.location.hash) handleHash();
}
initHashRouting();

// Patch navigate to update hash and breadcrumb
const _origNavigate = navigate;
navigate = function(page, el) {
  _origNavigate(page, el);
  window.location.hash = '#/' + page;
  updateBreadcrumb(page);
  // Close sidebar on mobile
  document.querySelector('.sidebar')?.classList.remove('open');
};

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { title: 'Demanda com prazo vencido', desc: 'Ampliacao da UBS Jardim das Flores - prazo expirado', time: 'Hoje, 09:30', type: 'warning' },
  { title: 'Novo politico cadastrado via API', desc: '3 novos deputados detectados na base da Camara', time: 'Hoje, 08:15', type: 'info' },
  { title: 'Gasto acima do limite', desc: 'Publicidade institucional: R$ 35.000 excede teto de R$ 30.000', time: 'Ontem, 17:45', type: 'alert' },
];

function renderNotifications() {
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if (!list) return;

  if (NOTIFICATIONS.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:.84rem">Nenhuma notificacao</div>';
    if (badge) badge.textContent = '';
    return;
  }

  list.innerHTML = NOTIFICATIONS.map(n => `
    <div class="notif-item">
      <div class="notif-item-title">${escapeHtml(n.title)}</div>
      <div class="notif-item-desc">${escapeHtml(n.desc)}</div>
      <div class="notif-item-time">${escapeHtml(n.time)}</div>
    </div>
  `).join('');

  if (badge) badge.textContent = NOTIFICATIONS.length;
}

function toggleNotifications() {
  const dd = document.getElementById('notif-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.notif-wrap')) {
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.remove('open');
  }
});

renderNotifications();

// ─── CHARTS ─────────────────────────────────────────────────────────────────
let chartPartidos = null;
let chartDemandasStatus = null;
let chartTopGastos = null;

function getChartColors() {
  const isDark = document.body.classList.contains('dark');
  return {
    text: isDark ? '#b0c8b2' : '#3d5c3e',
    grid: isDark ? '#1a2a1a' : '#e4f0e5',
    bg: isDark ? '#161e16' : '#ffffff',
  };
}

function initChartPartidos(deputados) {
  const ctx = document.getElementById('chart-partidos');
  if (!ctx || !deputados) return;

  const partidos = {};
  deputados.forEach(d => {
    const p = d.siglaPartido || 'Outros';
    partidos[p] = (partidos[p] || 0) + 1;
  });

  const sorted = Object.entries(partidos).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const colors = ['#3b82f6','#16a34a','#d97706','#ef4444','#8b5cf6','#06b6d4','#f43f5e','#84cc16','#f97316','#6366f1'];
  const theme = getChartColors();

  if (chartPartidos) chartPartidos.destroy();
  chartPartidos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{ data: sorted.map(s => s[1]), backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: theme.text, font: { size: 11, family: 'DM Sans' }, padding: 12 } }
      }
    }
  });
}

function initChartDemandasStatus() {
  const ctx = document.getElementById('chart-demandas-status');
  if (!ctx || typeof DEMANDAS === 'undefined') return;

  const statusCount = { 'Aberta': 0, 'Em Andamento': 0, 'Concluida': 0 };
  DEMANDAS.forEach(d => {
    const s = d.status === 'Concluída' ? 'Concluida' : d.status;
    statusCount[s] = (statusCount[s] || 0) + 1;
  });

  const theme = getChartColors();
  const colors = ['#6b7280', '#d97706', '#16a34a'];

  if (chartDemandasStatus) chartDemandasStatus.destroy();
  chartDemandasStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCount),
      datasets: [{ data: Object.values(statusCount), backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: theme.text, font: { size: 11, family: 'DM Sans' }, padding: 12 } }
      }
    }
  });
}

function initChartTopGastos() {
  const ctx = document.getElementById('chart-top-gastos');
  if (!ctx || typeof _gastosCache === 'undefined') return;
  if (typeof todosDeputados === 'undefined' || !todosDeputados.length) return;

  const items = todosDeputados
    .filter(d => _gastosCache[d.id] !== undefined && _gastosCache[d.id] > 0)
    .map(d => ({ nome: d.nome.split(' ').slice(0, 2).join(' '), gasto: _gastosCache[d.id] }))
    .sort((a, b) => b.gasto - a.gasto)
    .slice(0, 10);

  if (items.length === 0) return;

  const theme = getChartColors();

  if (chartTopGastos) chartTopGastos.destroy();
  chartTopGastos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: items.map(i => i.nome),
      datasets: [{
        label: 'Gastos (R$)',
        data: items.map(i => i.gasto),
        backgroundColor: '#3b82f680',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return 'R$ ' + ctx.raw.toLocaleString('pt-BR', {minimumFractionDigits:2});
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: theme.text, callback: v => 'R$' + (v/1000).toFixed(0) + 'k' }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.text, font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function updateChartsTheme() {
  if (typeof todosDeputados !== 'undefined') initChartPartidos(todosDeputados);
  initChartDemandasStatus();
  initChartTopGastos();
}

// Listen for deputies loaded to init charts
document.addEventListener('sara:deputadosCarregados', function(e) {
  initChartPartidos(e.detail);
  initChartDemandasStatus();
});

// ─── PAGINATION ─────────────────────────────────────────────────────────────
let polCurrentPage = 1;
const POL_PER_PAGE = 15;
let polFilteredList = [];

function polUpdatePagination() {
  const totalPages = Math.max(1, Math.ceil(polFilteredList.length / POL_PER_PAGE));
  polCurrentPage = Math.min(polCurrentPage, totalPages);

  const start = (polCurrentPage - 1) * POL_PER_PAGE;
  const pageItems = polFilteredList.slice(start, start + POL_PER_PAGE);

  if (typeof renderTabelaPoliticos === 'function') {
    renderTabelaPoliticos(pageItems);
  }

  const info = document.getElementById('pol-page-info');
  const prev = document.getElementById('pol-prev-page');
  const next = document.getElementById('pol-next-page');
  if (info) info.textContent = `Pagina ${polCurrentPage} de ${totalPages} (${polFilteredList.length} deputados)`;
  if (prev) prev.disabled = polCurrentPage <= 1;
  if (next) next.disabled = polCurrentPage >= totalPages;
}

function polNextPage() {
  polCurrentPage++;
  polUpdatePagination();
}

function polPrevPage() {
  polCurrentPage--;
  polUpdatePagination();
}

// ─── PDF GENERATION ─────────────────────────────────────────────────────────
function gerarPDFGastos() {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    showToast('Biblioteca jsPDF ainda carregando...', true);
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(26, 46, 26);
  doc.text('SARA - Relatorio de Gastos', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(107, 143, 110);
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' - Sistema de Acompanhamento Regional', 14, 30);
  doc.setDrawColor(228, 240, 229);
  doc.line(14, 34, 196, 34);

  if (typeof todosDeputados !== 'undefined' && todosDeputados.length) {
    const rows = todosDeputados
      .filter(d => _gastosCache[d.id] !== undefined)
      .sort((a, b) => (_gastosCache[b.id] || 0) - (_gastosCache[a.id] || 0))
      .slice(0, 30)
      .map(d => [
        d.nome,
        d.siglaPartido || '-',
        d.siglaUf || '-',
        'R$ ' + (_gastosCache[d.id] || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})
      ]);

    doc.autoTable({
      startY: 40,
      head: [['Deputado', 'Partido', 'UF', 'Total Gastos']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [45, 96, 48], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [242, 248, 242] },
    });
  }

  doc.save('SARA_Relatorio_Gastos.pdf');
  showToast('PDF de gastos gerado com sucesso!');
}

function gerarPDFElegibilidade() {
  if (typeof window.jspdf === 'undefined') {
    showToast('Biblioteca jsPDF ainda carregando...', true);
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(26, 46, 26);
  doc.text('SARA - Relatorio de Elegibilidade', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(107, 143, 110);
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 30);
  doc.line(14, 34, 196, 34);

  if (typeof todosDeputados !== 'undefined' && todosDeputados.length) {
    const rows = todosDeputados.slice(0, 40).map(d => [
      d.nome,
      d.siglaPartido || '-',
      d.siglaUf || '-',
      'Deputado(a) Federal',
      'Ativo'
    ]);

    doc.autoTable({
      startY: 40,
      head: [['Deputado', 'Partido', 'UF', 'Cargo', 'Situacao']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [45, 96, 48], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [242, 248, 242] },
    });
  }

  doc.save('SARA_Relatorio_Elegibilidade.pdf');
  showToast('PDF de elegibilidade gerado com sucesso!');
}

function gerarPDFDemandas() {
  if (typeof window.jspdf === 'undefined') {
    showToast('Biblioteca jsPDF ainda carregando...', true);
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(26, 46, 26);
  doc.text('SARA - Relatorio de Demandas', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(107, 143, 110);
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 30);
  doc.line(14, 34, 196, 34);

  if (typeof DEMANDAS !== 'undefined') {
    const rows = DEMANDAS.map(d => [
      d.id,
      d.titulo,
      d.area,
      d.politico,
      d.prioridade,
      d.status,
      d.data
    ]);

    doc.autoTable({
      startY: 40,
      head: [['ID', 'Titulo', 'Area', 'Politico', 'Prioridade', 'Status', 'Data']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [45, 96, 48], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [242, 248, 242] },
      columnStyles: { 1: { cellWidth: 50 } },
    });
  }

  doc.save('SARA_Relatorio_Demandas.pdf');
  showToast('PDF de demandas gerado com sucesso!');
}
