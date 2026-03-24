/**
 * SARA — Integração com a API de Dados Abertos da Câmara dos Deputados
 * Documentação: https://dadosabertos.camara.leg.br/swagger/api.html
 */

const CAMARA_API = 'https://dadosabertos.camara.leg.br/api/v2';

// ─── Utilitários ────────────────────────────────────────────────────────────

/**
 * silent=true → erros vão só pro console, sem toast (para chamadas em background/loop)
 * silent=false → mostra toast de erro (para ações diretas do usuário)
 */
async function fetchCamara(endpoint, params = {}, silent = false) {
  const query = new URLSearchParams({ ...params, itens: params.itens || 20 }).toString();
  const url = `${CAMARA_API}${endpoint}?${query}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    });
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const json = await res.json();
    return json.dados;
  } catch (err) {
    console.warn('[SARA API]', endpoint, err.message);
    if (!silent) showToast('⚠️ Erro ao conectar com a API da Câmara. Verifique sua conexão.');
    return null;
  }
}


// Wrapper silencioso para chamadas em loop (ex: gastos de cada deputado na tabela)
async function buscarDespesasDeputadoSilent(id, filtros = {}) {
  const params = { itens: 50, ...filtros };
  return await fetchCamara(`/deputados/${id}/despesas`, params, true);
}

function formatCurrency(value) {
  return value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'R$ 0,00';
}

function getInitials(name) {
  return name?.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '??';
}

function siglaToUF(sigla) {
  return sigla || '—';
}

// ─── Deputados ───────────────────────────────────────────────────────────────

/**
 * Busca lista de deputados com filtros opcionais.
 * @param {object} filtros - { nome, siglaPartido, siglaUf, ordem, ordenarPor }
 */
async function buscarDeputados(filtros = {}) {
  const params = {
    ordem: 'ASC',
    ordenarPor: 'nome',
    itens: 50,
    ...filtros
  };
  return await fetchCamara('/deputados', params);
}

/**
 * Busca detalhes completos de um deputado pelo ID.
 * @param {number|string} id
 */
async function buscarDeputadoPorId(id) {
  try {
    const res = await fetch(`${CAMARA_API}/deputados/${id}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const json = await res.json();
    return json.dados;
  } catch (err) {
    console.error('[SARA API]', err.message);
    showToast('⚠️ Erro ao buscar detalhes do deputado.');
    return null;
  }
}

/**
 * Busca as despesas (gastos) de um deputado.
 * @param {number|string} id
 * @param {object} filtros - { ano, mes, itens }
 */
async function buscarDespesasDeputado(id, filtros = {}) {
  const params = { itens: 50, ...filtros };
  return await fetchCamara(`/deputados/${id}/despesas`, params);
}

/**
 * Busca os discursos de um deputado.
 * @param {number|string} id
 */
async function buscarDiscursosDeputado(id) {
  return await fetchCamara(`/deputados/${id}/discursos`, { itens: 10 });
}

/**
 * Busca os eventos (reuniões, votações) de um deputado.
 * @param {number|string} id
 */
async function buscarEventosDeputado(id) {
  return await fetchCamara(`/deputados/${id}/eventos`, { itens: 10 });
}

// ─── Partidos ────────────────────────────────────────────────────────────────

/**
 * Busca todos os partidos com representação na Câmara.
 */
async function buscarPartidos() {
  return await fetchCamara('/partidos', { itens: 50, ordenarPor: 'sigla' });
}

// ─── Renderização — Tabela de Políticos ──────────────────────────────────────

function renderTabelaPoliticos(deputados) {
  const tbody = document.querySelector('#page-politicians .pol-table tbody');
  if (!tbody) return;

  if (!deputados || deputados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-light)">Nenhum político encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = deputados.map(dep => `
    <tr>
      <td>
        <div class="pol-name-cell">
          <div class="avatar">${getInitials(dep.nome)}</div>
          <div>
            <div style="font-weight:500">${dep.nome}</div>
            <div style="font-size:.74rem;color:var(--text-light)">ID: ${dep.id}</div>
          </div>
        </div>
      </td>
      <td>Deputado(a) Federal</td>
      <td>${dep.siglaPartido || '—'}</td>
      <td>${dep.siglaUf || '—'}</td>
      <td class="expense-amount" id="gasto-${dep.id}">Carregando…</td>
      <td><span class="badge badge-green">Ativo</span></td>
      <td style="display:flex;gap:6px">
        <button class="action-btn" onclick="abrirDetalhes(${dep.id}, '${dep.nome.replace(/'/g, "\\'")}')">Ver</button>
      </td>
    </tr>
  `).join('');

  // Carrega gastos do ano atual para cada deputado (em background)
  const anoAtual = new Date().getFullYear();
  deputados.forEach(dep => {
    buscarDespesasDeputadoSilent(dep.id, { ano: anoAtual, itens: 100 }).then(despesas => {
      const cell = document.getElementById(`gasto-${dep.id}`);
      if (!cell) return;
      if (!despesas) { cell.textContent = '—'; return; }
      const total = despesas.reduce((acc, d) => acc + (d.valorLiquido || 0), 0);
      cell.textContent = formatCurrency(total);
    });
  });
}

// ─── Renderização — Gastos ───────────────────────────────────────────────────

function renderGastos(despesas, nomeDeputado) {
  const container = document.querySelector('#page-expenses .card:last-child');
  if (!container || !despesas) return;

  const total = despesas.reduce((acc, d) => acc + (d.valorLiquido || 0), 0);

  const rows = despesas.slice(0, 20).map(d => `
    <div class="expense-row">
      <span>${d.descricao || d.tipoDespesa || 'Sem descrição'}</span>
      <span><span class="badge badge-gray">${d.tipoDespesa || '—'}</span></span>
      <span>${d.dataDocumento?.substring(0, 10) || '—'}</span>
      <span class="expense-amount">${formatCurrency(d.valorLiquido)}</span>
      <div style="display:flex;gap:6px">
        ${d.urlDocumento ? `<a class="action-btn" href="${d.urlDocumento}" target="_blank">📄</a>` : '<span></span>'}
      </div>
    </div>
  `).join('');

  container.querySelector('.card-title').textContent =
    `Registro de Gastos — ${nomeDeputado} · ${new Date().getFullYear()}`;

  // Remove linhas antigas e insere as novas
  container.querySelectorAll('.expense-row, .btn-add-row').forEach(el => el.remove());
  container.querySelector('.expense-header').insertAdjacentHTML('afterend', rows);

  container.querySelector('.expense-total-value').textContent = formatCurrency(total);
  container.querySelector('.expense-total .expense-total-label').textContent =
    `Total registrado em ${new Date().getFullYear()}`;
  container.querySelector('.expense-total div div:last-child').textContent =
    `${despesas.length} lançamentos · Atualizado agora`;
}

// ─── Painel (Dashboard) ───────────────────────────────────────────────────────

async function atualizarDashboard(deputados) {
  if (!deputados) return;

  const statCards = document.querySelectorAll('.stat-card');
  if (statCards[0]) {
    statCards[0].querySelector('.stat-value').textContent = deputados.length;
    statCards[0].querySelector('.stat-change').textContent = `Câmara Federal`;
  }
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

async function popularFiltroPartidos() {
  const selects = document.querySelectorAll('.filter-select, #page-expenses select');
  const partidos = await buscarPartidos();
  if (!partidos) return;

  const options = partidos.map(p => `<option value="${p.sigla}">${p.sigla}</option>`).join('');
  selects.forEach(sel => {
    if (sel.options[0]?.text?.includes('Partido')) {
      sel.innerHTML = `<option value="">Todos os Partidos</option>${options}`;
    }
  });
}

async function popularSelectDeputados() {
  const selects = document.querySelectorAll('#page-expenses select:first-child, #page-eligibility select:first-child');
  if (selects.length === 0) return;

  const deps = await buscarDeputados({ itens: 100 });
  if (!deps) return;

  const options = deps.map(d =>
    `<option value="${d.id}" data-nome="${d.nome}">${d.nome} (${d.siglaPartido} — ${d.siglaUf})</option>`
  ).join('');

  selects.forEach(sel => {
    sel.innerHTML = options;
  });

  // Ao mudar seleção de gastos, recarrega despesas
  const selectGastos = document.querySelector('#page-expenses select');
  if (selectGastos) {
    selectGastos.addEventListener('change', async function () {
      const id = this.value;
      const nome = this.options[this.selectedIndex]?.dataset.nome || '';
      const anoAtual = new Date().getFullYear();
      showToast(`🔄 Carregando gastos de ${nome}…`);
      const despesas = await buscarDespesasDeputado(id, { ano: anoAtual, itens: 100 });
      renderGastos(despesas || [], nome);
    });

    // Carrega o primeiro deputado automaticamente
    selectGastos.dispatchEvent(new Event('change'));
  }
}

// ─── Modal de Detalhes ────────────────────────────────────────────────────────

async function abrirDetalhes(id, nome) {
  showToast(`🔍 Carregando dados de ${nome}…`);
  const [detalhes, despesas, discursos] = await Promise.all([
    buscarDeputadoPorId(id),
    buscarDespesasDeputado(id, { ano: new Date().getFullYear(), itens: 20 }),
    buscarDiscursosDeputado(id)
  ]);

  if (!detalhes) return;

  const info = detalhes.ultimoStatus || {};
  const totalGastos = (despesas || []).reduce((a, d) => a + (d.valorLiquido || 0), 0);

  const modal = document.getElementById('demand-modal');
  modal.innerHTML = `
    <div class="modal-box" style="max-width:700px">
      <div class="modal-header">
        <div class="modal-title">
          <div class="avatar" style="width:48px;height:48px;font-size:1.1rem">${getInitials(info.nome || nome)}</div>
          <div>
            <h2 style="margin:0;font-size:1.1rem">${info.nomeEleitoral || nome}</h2>
            <span style="font-size:.8rem;color:var(--text-light)">${info.siglaPartido || ''} · ${info.siglaUf || ''} · ${info.descricaoStatus || ''}</span>
          </div>
        </div>
        <button onclick="closeModal()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-light)">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0">
        <div class="stat-card" style="margin:0">
          <div class="stat-label">Gabinete</div>
          <div class="stat-value" style="font-size:1rem">${info.gabinete?.nome || '—'}</div>
          <div class="stat-change">Sala ${info.gabinete?.sala || '—'} · ${info.gabinete?.predio || '—'}</div>
        </div>
        <div class="stat-card" style="margin:0">
          <div class="stat-label">Gastos (${new Date().getFullYear()})</div>
          <div class="stat-value" style="font-size:1rem">${formatCurrency(totalGastos)}</div>
          <div class="stat-change">${(despesas || []).length} lançamentos</div>
        </div>
      </div>

      ${info.email ? `<p style="font-size:.85rem;color:var(--text-light);margin:0 0 12px">📧 <a href="mailto:${info.email}">${info.email}</a></p>` : ''}

      ${discursos && discursos.length > 0 ? `
        <div style="margin-top:12px">
          <div style="font-weight:600;font-size:.85rem;margin-bottom:8px">🎤 Últimos Discursos</div>
          ${discursos.slice(0, 3).map(d => `
            <div style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;font-size:.8rem">
              <strong>${d.dataHoraInicio?.substring(0, 10) || '—'}</strong> · ${d.sumario || d.tipoDiscurso || 'Sem resumo'}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="text-align:right;margin-top:16px">
        <button class="btn-outline" onclick="closeModal()">Fechar</button>
        <a class="btn-primary" style="text-decoration:none;padding:8px 18px;border-radius:8px"
           href="https://www.camara.leg.br/deputados/${id}" target="_blank">
          Ver no site da Câmara ↗
        </a>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

// ─── Busca na tabela de políticos ─────────────────────────────────────────────

let todosDeputados = [];

function filtrarTabelaLocal(texto, partido, uf) {
  const filtered = todosDeputados.filter(dep => {
    const matchNome = !texto || dep.nome.toLowerCase().includes(texto.toLowerCase());
    const matchPartido = !partido || dep.siglaPartido === partido;
    const matchUF = !uf || dep.siglaUf === uf;
    return matchNome && matchPartido && matchUF;
  });
  renderTabelaPoliticos(filtered);
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initAPI() {
  showToast('🔄 Conectando com a API da Câmara…');

  const [deputados, partidos] = await Promise.all([
    buscarDeputados({ itens: 50 }),
    buscarPartidos()
  ]);

  if (deputados) {
    todosDeputados = deputados;
    renderTabelaPoliticos(deputados);
    atualizarDashboard(deputados);
    showToast('✅ API da Câmara conectada com sucesso!');
  } else {
    showToast('❌ Não foi possível conectar à API da Câmara. Os dados estáticos serão exibidos.');
  }

  // Filtros dinâmicos na tabela de políticos
  const filterInputs = document.querySelectorAll('#page-politicians .pol-filters input, #page-politicians .pol-filters select');
  filterInputs.forEach(input => {
    input.addEventListener('input', () => {
      const [nomeFiltro, partidoFiltro, ufFiltro] = [...filterInputs].map(i => i.value);
      filtrarTabelaLocal(nomeFiltro, partidoFiltro, ufFiltro);
    });
  });

  // Popular selects de partidos e deputados
  if (partidos) {
    const selectsPartido = document.querySelectorAll('#page-politicians .filter-select:nth-child(2)');
    selectsPartido.forEach(sel => {
      sel.innerHTML = `<option value="">Todos os Partidos</option>` +
        partidos.map(p => `<option value="${p.sigla}">${p.sigla}</option>`).join('');
    });
  }

  await popularSelectDeputados();

  // Atualiza badge de políticos na sidebar
  const badge = document.querySelector('.nav-item [onclick*=politicians] .nav-badge, .nav-item.active + .nav-item .nav-badge');
  const allBadges = document.querySelectorAll('.nav-badge');
  if (allBadges[0] && deputados) allBadges[0].textContent = deputados.length;
}

// Inicia após o DOM estar pronto
document.addEventListener('DOMContentLoaded', initAPI);

// ─────────────────────────────────────────────────────────────────────────────
// ATUAÇÃO LEGISLATIVA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca proposições de autoria de um deputado.
 */
async function buscarProposicoesDeputado(id, ano) {
  return await fetchCamara('/proposicoes', {
    idDeputadoAutor: id,
    ano,
    itens: 30,
    ordenarPor: 'ano',
    ordem: 'DESC'
  });
}

/**
 * Busca votações de um deputado.
 */
async function buscarVotacoesDeputado(id, ano) {
  return await fetchCamara(`/deputados/${id}/votacoes`, {
    ano,
    itens: 30,
    ordem: 'DESC',
    ordenarPor: 'dataHoraVoto'
  });
}

/**
 * Busca frentes parlamentares de um deputado.
 */
async function buscarFrentesDeputado(id) {
  return await fetchCamara(`/deputados/${id}/frentes`, { itens: 30 });
}

// ─── Switch de abas ───────────────────────────────────────────────────────────

const legTabPanels = ['prop', 'vot', 'disc', 'frentes'];

function switchLegTab(tab) {
  legTabPanels.forEach(t => {
    const panel = document.getElementById(`leg-panel-${t}`);
    const btn   = document.getElementById(`leg-tab-${t}`);
    if (!panel || !btn) return;
    const active = t === tab;
    panel.style.display = active ? 'block' : 'none';
    btn.style.borderBottom = active ? '2px solid var(--primary)' : 'none';
    btn.style.color        = active ? 'var(--primary)' : 'var(--text-light)';
    btn.style.fontWeight   = active ? '600' : '500';
  });
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderLoading(containerId, msg = 'Carregando…') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light)">${msg}</div>`;
}

function renderEmpty(containerId, msg = 'Nenhum registro encontrado.') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light)">📭 ${msg}</div>`;
}

function renderProposicoes(proposicoes) {
  const el = document.getElementById('leg-list-prop');
  if (!el) return;
  document.getElementById('leg-stat-prop').textContent = proposicoes?.length ?? '—';

  if (!proposicoes || proposicoes.length === 0) { renderEmpty('leg-list-prop', 'Nenhuma proposição encontrada.'); return; }

  el.innerHTML = proposicoes.map(p => `
    <div style="padding:14px;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1">
        <div style="font-weight:600;font-size:.88rem;margin-bottom:4px">
          <span style="background:var(--bg-alt,#f4f4f5);padding:2px 8px;border-radius:12px;font-size:.75rem;margin-right:8px">${p.siglaTipo || '—'} ${p.numero || ''}/${p.ano || ''}</span>
          ${p.ementa || 'Sem ementa.'}
        </div>
        <div style="font-size:.76rem;color:var(--text-light);margin-top:4px">
          🗂 ${p.descricaoTipo || '—'} · Situação: ${p.descricaoSituacao || 'Em tramitação'}
        </div>
      </div>
      <a href="https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}"
         target="_blank" class="action-btn" style="white-space:nowrap;text-decoration:none">Ver ↗</a>
    </div>
  `).join('');
}

function renderVotacoes(votacoes) {
  const el = document.getElementById('leg-list-vot');
  if (!el) return;
  document.getElementById('leg-stat-vot').textContent = votacoes?.length ?? '—';

  if (!votacoes || votacoes.length === 0) { renderEmpty('leg-list-vot', 'Nenhuma votação encontrada.'); return; }

  el.innerHTML = votacoes.map(v => {
    const voto = v.tipoVoto || v.vote || '';
    const colorMap = { Sim: '#16a34a', Não: '#dc2626', Abstenção: '#ca8a04', Obstrução: '#7c3aed' };
    const cor = colorMap[voto] || '#6b7280';
    return `
      <div style="padding:14px;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem;margin-bottom:4px">${v.proposicaoObjeto || v.descricao || v.siglaOrgao || 'Votação em plenário'}</div>
          <div style="font-size:.76rem;color:var(--text-light)">
            📅 ${v.dataHoraVoto?.substring(0,10) || v.dataHoraRegistro?.substring(0,10) || '—'}
            · ${v.siglaOrgao || ''}
          </div>
        </div>
        <span style="font-weight:700;font-size:.82rem;padding:4px 12px;border-radius:20px;background:${cor}18;color:${cor};border:1px solid ${cor}40">
          ${voto || '—'}
        </span>
      </div>
    `;
  }).join('');
}

function renderDiscursosLeg(discursos) {
  const el = document.getElementById('leg-list-disc');
  if (!el) return;
  document.getElementById('leg-stat-disc').textContent = discursos?.length ?? '—';

  if (!discursos || discursos.length === 0) { renderEmpty('leg-list-disc', 'Nenhum discurso encontrado.'); return; }

  el.innerHTML = discursos.map(d => `
    <div style="padding:14px;border:1px solid var(--border);border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-weight:600;font-size:.85rem">🎤 ${d.tipoDiscurso || 'Discurso'}</span>
        <span style="font-size:.76rem;color:var(--text-light)">📅 ${d.dataHoraInicio?.substring(0,10) || '—'} · ${d.faseEvento?.titulo || d.sumario?.substring(0,40) || ''}</span>
      </div>
      <p style="font-size:.82rem;color:var(--text-secondary,#444);margin:0;line-height:1.5">
        ${d.sumario || 'Sem resumo disponível.'}
      </p>
      ${d.urlTexto ? `<a href="${d.urlTexto}" target="_blank" style="font-size:.78rem;color:var(--primary);margin-top:6px;display:inline-block">📄 Ver texto completo</a>` : ''}
    </div>
  `).join('');
}

function renderFrente(frentes) {
  const el = document.getElementById('leg-list-frentes');
  if (!el) return;
  document.getElementById('leg-stat-frentes').textContent = frentes?.length ?? '—';

  if (!frentes || frentes.length === 0) { renderEmpty('leg-list-frentes', 'Nenhuma frente parlamentar encontrada.'); return; }

  el.innerHTML = frentes.map(f => `
    <div style="padding:14px;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <div style="font-weight:600;font-size:.88rem">${f.titulo || f.nome || 'Frente Parlamentar'}</div>
        <div style="font-size:.76rem;color:var(--text-light);margin-top:3px">
          📅 Legislatura ${f.idLegislatura || '—'}
          ${f.situacao ? ' · ' + f.situacao : ''}
        </div>
      </div>
      ${f.urlDocumento ? `<a href="${f.urlDocumento}" target="_blank" class="action-btn" style="text-decoration:none;white-space:nowrap">Ver ↗</a>` : ''}
    </div>
  `).join('');
}

// ─── Carregamento principal ───────────────────────────────────────────────────

async function carregarAtuacaoLegislativa() {
  const selDep = document.getElementById('leg-select-dep');
  const selAno = document.getElementById('leg-select-ano');
  if (!selDep || !selAno) return;

  const id  = selDep.value;
  const ano = selAno.value;
  const nome = selDep.options[selDep.selectedIndex]?.dataset?.nome || 'Deputado';

  if (!id) return;

  showToast(`🏛️ Carregando atuação de ${nome}…`);

  // Indicadores de loading
  ['prop','vot','disc','frentes'].forEach(t => renderLoading(`leg-list-${t}`, `Carregando ${t === 'prop' ? 'proposições' : t === 'vot' ? 'votações' : t === 'disc' ? 'discursos' : 'frentes'}…`));
  ['leg-stat-prop','leg-stat-vot','leg-stat-disc','leg-stat-frentes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '…';
  });

  // Busca paralela de todas as seções
  const [proposicoes, votacoes, discursos, frentes] = await Promise.all([
    buscarProposicoesDeputado(id, ano),
    buscarVotacoesDeputado(id, ano),
    buscarDiscursosDeputado(id),
    buscarFrentesDeputado(id)
  ]);

  renderProposicoes(proposicoes);
  renderVotacoes(votacoes);
  renderDiscursosLeg(discursos);
  renderFrente(frentes);

  showToast(`✅ Atuação de ${nome} carregada!`);
}

// ─── Popular select da página legislativa ─────────────────────────────────────

async function popularSelectLegislativa() {
  const sel = document.getElementById('leg-select-dep');
  if (!sel) return;

  // Reutiliza lista já carregada se disponível
  const deps = todosDeputados.length > 0
    ? todosDeputados
    : await buscarDeputados({ itens: 100 });

  if (!deps) return;

  sel.innerHTML = deps.map(d =>
    `<option value="${d.id}" data-nome="${d.nome}">${d.nome} (${d.siglaPartido} — ${d.siglaUf})</option>`
  ).join('');
}

// (navigate hook unificado no bloco de elegibilidade abaixo)

// ─────────────────────────────────────────────────────────────────────────────
// ELEGIBILIDADE — Análise com dados reais da API
// ─────────────────────────────────────────────────────────────────────────────

// Idade mínima por cargo (Art. 14 §3° CF/88)
const IDADE_MINIMA_CARGO = {
  vereador:          18,
  prefeito:          21,
  deputado_estadual: 21,
  deputado_federal:  21,
  senador:           35,
  governador:        30,
  presidente:        35
};

const CARGO_LABEL = {
  vereador:          'Vereador(a)',
  prefeito:          'Prefeito(a)',
  deputado_estadual: 'Deputado(a) Estadual',
  deputado_federal:  'Deputado(a) Federal',
  senador:           'Senador(a)',
  governador:        'Governador(a)',
  presidente:        'Presidente da República'
};

/**
 * Busca o histórico de ocupações/cargos do deputado para validar mandatos.
 */
async function buscarOcupacoesDeputado(id) {
  return await fetchCamara(`/deputados/${id}/historico`, { itens: 10 }, true);
}

/**
 * Calcula a idade a partir de uma data de nascimento ISO.
 */
function calcularIdade(dataNasc) {
  if (!dataNasc) return null;
  const hoje = new Date();
  const nasc  = new Date(dataNasc);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

/**
 * Calcula anos de filiação a partir de dataFiliacaoPartido.
 */
function anosFiliacaoPartido(dataFiliacao) {
  if (!dataFiliacao) return null;
  const hoje = new Date();
  const fil  = new Date(dataFiliacao);
  const anos = (hoje - fil) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(anos * 10) / 10; // 1 casa decimal
}

/**
 * Monta os critérios de elegibilidade com base nos dados reais do deputado.
 * Retorna array de objetos { icone, titulo, desc, status, detalhe, fonte }
 * status: 'ok' | 'pending' | 'fail' | 'info'
 */
function avaliarCriterios(deputado, cargo) {
  const info     = deputado.ultimoStatus || {};
  const idadeMin = IDADE_MINIMA_CARGO[cargo] || 21;
  const cargoLabel = CARGO_LABEL[cargo] || cargo;
  const criterios = [];

  // ── 1. Situação do mandato (ativo/inativo) ──────────────────────────────
  const situacao = info.situacao || info.descricaoStatus || '';
  const ativo = ['Exercício', 'Em exercício', 'Titularidade'].some(s => situacao.includes(s));
  criterios.push({
    icone: '💼',
    titulo: 'Situação na Câmara',
    desc: 'Mandato em exercício ou situação regular',
    status: ativo ? 'ok' : (situacao ? 'pending' : 'info'),
    detalhe: situacao || 'Não informado',
    fonte: 'API /deputados (ultimoStatus.situacao)'
  });

  // ── 2. Partido ──────────────────────────────────────────────────────────
  const partido = info.siglaPartido || '';
  const dataFil = deputado.dataFiliacaoPartido || info.dataFiliacaoPartido || '';
  const anosFil = anosFiliacaoPartido(dataFil);
  const filOk   = anosFil !== null ? anosFil >= 0.5 : null;
  criterios.push({
    icone: '📋',
    titulo: 'Filiação Partidária',
    desc: 'Filiado ao partido há mais de 6 meses (art. 9° Lei 9.504/97)',
    status: filOk === true ? 'ok' : filOk === false ? 'fail' : 'info',
    detalhe: partido
      ? `${partido}${dataFil ? ' · Filiado em ' + dataFil.substring(0, 10) : ''}${anosFil !== null ? ' (' + anosFil + ' anos)' : ''}`
      : 'Partido não identificado',
    fonte: 'API /deputados (siglaPartido + dataFiliacaoPartido)'
  });

  // ── 3. Idade mínima ─────────────────────────────────────────────────────
  const dataNasc = deputado.dataNascimento || '';
  const idade    = calcularIdade(dataNasc);
  criterios.push({
    icone: '🎂',
    titulo: 'Idade Mínima',
    desc: `${idadeMin} anos para ${cargoLabel} (art. 14 §3° CF/88)`,
    status: idade !== null ? (idade >= idadeMin ? 'ok' : 'fail') : 'info',
    detalhe: idade !== null
      ? `${idade} anos (nascido em ${dataNasc.substring(0, 10)})`
      : 'Data de nascimento não informada pela API',
    fonte: 'API /deputados (dataNascimento)'
  });

  // ── 4. Naturalidade / Nacionalidade ─────────────────────────────────────
  const naturalidade = deputado.municipioNascimento || '';
  const ufNasc       = deputado.ufNascimento || '';
  criterios.push({
    icone: '🇧🇷',
    titulo: 'Nacionalidade Brasileira',
    desc: 'Cidadão brasileiro nato ou naturalizado (art. 12 CF/88)',
    status: (naturalidade || ufNasc) ? 'ok' : 'info',
    detalhe: (naturalidade && ufNasc)
      ? `Natural de ${naturalidade} — ${ufNasc}`
      : 'Naturalidade não informada pela API',
    fonte: 'API /deputados (municipioNascimento + ufNascimento)'
  });

  // ── 5. Domicílio eleitoral ───────────────────────────────────────────────
  const ufAtuacao = info.siglaUf || '';
  const municipio = info.municipio || '';
  criterios.push({
    icone: '🏠',
    titulo: 'Domicílio Eleitoral',
    desc: 'Domicílio na circunscrição por pelo menos 6 meses antes da eleição',
    status: ufAtuacao ? 'ok' : 'info',
    detalhe: (municipio && ufAtuacao)
      ? `${municipio} — ${ufAtuacao}`
      : ufAtuacao || 'Não informado pela API',
    fonte: 'API /deputados (ultimoStatus.municipio + siglaUf)'
  });

  // ── 6. Escolaridade / formação ───────────────────────────────────────────
  const escolaridade = deputado.escolaridade || '';
  criterios.push({
    icone: '🎓',
    titulo: 'Escolaridade',
    desc: 'Grau de instrução declarado ao TSE',
    status: escolaridade ? 'ok' : 'info',
    detalhe: escolaridade || 'Não informada pela API',
    fonte: 'API /deputados (escolaridade)'
  });

  // ── 7. Sexo / perfil ────────────────────────────────────────────────────
  const sexo   = deputado.sexo || '';
  const cpf    = deputado.cpf || '';
  criterios.push({
    icone: '🪪',
    titulo: 'Identificação Civil',
    desc: 'CPF e dados civis registrados no TSE',
    status: cpf ? 'ok' : 'info',
    detalhe: cpf
      ? `CPF: •••.•••.${cpf.slice(-5, -2)}-${cpf.slice(-2)} · ${sexo === 'M' ? 'Masculino' : sexo === 'F' ? 'Feminino' : sexo || '—'}`
      : 'CPF não exposto pela API (protegido por LGPD)',
    fonte: 'API /deputados (cpf + sexo)'
  });

  // ── 8. Gabinete / contato institucional ─────────────────────────────────
  const gabinete = info.gabinete || {};
  const email    = info.email || '';
  criterios.push({
    icone: '🏛️',
    titulo: 'Registro Institucional',
    desc: 'Gabinete e contato registrados na Câmara',
    status: (gabinete.nome || email) ? 'ok' : 'info',
    detalhe: gabinete.nome
      ? `${gabinete.nome} · Sala ${gabinete.sala || '—'} · Prédio ${gabinete.predio || '—'}${email ? ' · ' + email : ''}`
      : 'Gabinete não informado',
    fonte: 'API /deputados (ultimoStatus.gabinete + email)'
  });

  // ── 9. URL da foto (comprovante de registro) ─────────────────────────────
  const urlFoto = info.urlFoto || deputado.urlFoto || '';
  criterios.push({
    icone: '📸',
    titulo: 'Foto Oficial Cadastrada',
    desc: 'Registro fotográfico oficial na Câmara dos Deputados',
    status: urlFoto ? 'ok' : 'pending',
    detalhe: urlFoto ? 'Foto registrada no sistema da Câmara' : 'Foto não encontrada no cadastro',
    fonte: 'API /deputados (ultimoStatus.urlFoto)',
    urlFoto
  });

  // ── 10. Exercício de direitos políticos (status geral) ───────────────────
  const condicaoEleitoral = info.condicaoEleitoral || '';
  criterios.push({
    icone: '⚖️',
    titulo: 'Condição Eleitoral',
    desc: 'Situação junto à Justiça Eleitoral (Ficha Limpa)',
    status: condicaoEleitoral
      ? (condicaoEleitoral.toLowerCase().includes('titular') || condicaoEleitoral.toLowerCase().includes('exercício') ? 'ok' : 'pending')
      : 'info',
    detalhe: condicaoEleitoral || 'Condição eleitoral não informada pela API — verificar TSE',
    fonte: 'API /deputados (ultimoStatus.condicaoEleitoral)'
  });

  return criterios;
}

/**
 * Renderiza os critérios no grid e atualiza score e barra.
 */
function renderElegibilidade(criterios, deputado, cargo) {
  const grid    = document.getElementById('eligibility-grid');
  const score   = document.getElementById('elig-score');
  const label   = document.getElementById('elig-status-label');
  const barFill = document.getElementById('elig-bar-fill');
  const wrap    = document.getElementById('elig-summary-wrap');
  const loading = document.getElementById('elig-loading');
  const obsWrap = document.getElementById('elig-obs-wrap');
  const obsContent = document.getElementById('elig-obs-content');

  if (!grid) return;

  // Mostra seção e esconde loading
  if (wrap)    wrap.style.display   = 'block';
  if (loading) loading.style.display = 'none';

  // Conta aprovados e com falha
  const total   = criterios.length;
  const ok      = criterios.filter(c => c.status === 'ok').length;
  const fail    = criterios.filter(c => c.status === 'fail').length;
  const pct     = Math.round((ok / total) * 100);

  // Score e barra
  if (score)   score.textContent   = `${ok}/${total}`;
  if (barFill) barFill.style.width = `${pct}%`;

  // Label de status global
  let statusLabel = '';
  if (fail > 0) {
    statusLabel = `❌ Impedimento Identificado — ${fail} critério(s) não atendido(s)`;
    if (barFill) barFill.style.background = '#dc2626';
  } else if (pct >= 80) {
    statusLabel = `✅ Apto para candidatura — ${ok} de ${total} critérios confirmados`;
    if (barFill) barFill.style.background = '';
  } else {
    statusLabel = `⚠️ Verificação Parcial — ${ok} de ${total} critérios confirmados pela API`;
    if (barFill) barFill.style.background = '#ca8a04';
  }
  if (label) label.textContent = statusLabel;

  // Renderiza cards
  const classMap  = { ok: 'criterion-ok', pending: 'criterion-pending', fail: 'criterion-fail', info: 'criterion-info' };
  const statusMap = {
    ok:      txt => `<div class="crit-status status-ok">✓ ${txt}</div>`,
    pending: txt => `<div class="crit-status status-pending">⚠ ${txt}</div>`,
    fail:    txt => `<div class="crit-status" style="color:#dc2626;font-size:.75rem;margin-top:4px;font-weight:600">✕ ${txt}</div>`,
    info:    txt => `<div class="crit-status" style="color:#6b7280;font-size:.75rem;margin-top:4px">ℹ ${txt}</div>`
  };

  grid.innerHTML = criterios.map(c => `
    <div class="criterion-card ${classMap[c.status] || 'criterion-info'}" title="Fonte: ${c.fonte}">
      <div class="crit-icon">${c.icone}</div>
      <div style="flex:1">
        <div class="crit-title">${c.titulo}</div>
        <div class="crit-desc">${c.desc}</div>
        ${(statusMap[c.status] || statusMap.info)(c.detalhe)}
        <div style="font-size:.68rem;color:var(--text-light);margin-top:5px;opacity:.7">🔗 ${c.fonte}</div>
      </div>
    </div>
  `).join('');

  // Observações adicionais da API
  const info  = deputado.ultimoStatus || {};
  const obsLines = [];
  if (info.urlFoto) obsLines.push(`📸 <a href="${info.urlFoto}" target="_blank" style="color:var(--primary)">Ver foto oficial na Câmara</a>`);
  if (deputado.urlWebsite) obsLines.push(`🌐 Site oficial: <a href="${deputado.urlWebsite}" target="_blank" style="color:var(--primary)">${deputado.urlWebsite}</a>`);
  if (deputado.redeSocial?.length) {
    obsLines.push(`📱 Redes sociais: ${deputado.redeSocial.map(r => `<a href="${r}" target="_blank" style="color:var(--primary)">${r.replace(/https?:\/\/(www\.)?/,'').split('/')[0]}</a>`).join(', ')}`);
  }
  obsLines.push(`🕐 Análise gerada em ${new Date().toLocaleString('pt-BR')} com dados da API pública da Câmara dos Deputados.`);
  obsLines.push(`⚠️ Esta análise é baseada nas informações disponíveis na API e <strong>não substitui a consulta oficial ao TSE</strong>.`);

  if (obsWrap && obsContent) {
    obsContent.innerHTML = obsLines.join('<br>');
    obsWrap.style.display = 'block';
  }
}

// ─── Carregamento principal ───────────────────────────────────────────────────

async function carregarElegibilidade() {
  const selDep   = document.getElementById('elig-select-dep');
  const selCargo = document.getElementById('elig-select-cargo');
  if (!selDep || !selCargo) return;

  const id    = selDep.value;
  const cargo = selCargo.value;
  const nome  = selDep.options[selDep.selectedIndex]?.dataset?.nome || 'Deputado';

  if (!id) return;

  // Mostra loading
  const loading = document.getElementById('elig-loading');
  const wrap    = document.getElementById('elig-summary-wrap');
  if (loading) { loading.style.display = 'block'; loading.innerHTML = `<div style="font-size:2rem;margin-bottom:12px">⏳</div><div style="font-weight:600">Analisando elegibilidade de ${nome}…</div><div style="font-size:.82rem;color:var(--text-light);margin-top:6px">Buscando dados reais na API da Câmara…</div>`; }
  if (wrap) wrap.style.display = 'none';

  const deputado = await buscarDeputadoPorId(id);
  if (!deputado) {
    if (loading) loading.innerHTML = `<div style="font-size:2rem">⚠️</div><div>Erro ao carregar dados do deputado.</div>`;
    return;
  }

  const criterios = avaliarCriterios(deputado, cargo);
  renderElegibilidade(criterios, deputado, cargo);
}

// ─── Popular select da página de elegibilidade ────────────────────────────────

async function popularSelectElegibilidade() {
  const sel = document.getElementById('elig-select-dep');
  if (!sel) return;

  const deps = todosDeputados.length > 0
    ? todosDeputados
    : await buscarDeputados({ itens: 100 });

  if (!deps) return;

  sel.innerHTML = `<option value="">— Selecione um deputado —</option>` +
    deps.map(d =>
      `<option value="${d.id}" data-nome="${d.nome}">${d.nome} (${d.siglaPartido} — ${d.siglaUf})</option>`
    ).join('');
}

// Hook na navigate para popular quando a página abrir
document.addEventListener('DOMContentLoaded', () => {
  const navOrig = window.navigate;
  window.navigate = function(page, el) {
    if (typeof navOrig === 'function') navOrig(page, el);
    if (page === 'eligibility') popularSelectElegibilidade();
    if (page === 'legislative') popularSelectLegislativa();
  };
});
