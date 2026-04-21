/**
 * SARA — Integração com a API de Dados Abertos da Câmara dos Deputados
 * Documentação: https://dadosabertos.camara.leg.br/swagger/api.html
 */

const CAMARA_API = 'https://dadosabertos.camara.leg.br/api/v2';

// ─── Rate Limiter ──────────────────────────────────────────────────────────
const _rateLimiter = {
  queue: [],
  running: 0,
  maxConcurrent: 5,
  delayMs: 200,
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._process();
    });
  },
  async _process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    this.running++;
    const { fn, resolve, reject } = this.queue.shift();
    try {
      const result = await fn();
      resolve(result);
    } catch (e) { reject(e); }
    finally {
      this.running--;
      if (this.delayMs > 0) await new Promise(r => setTimeout(r, this.delayMs));
      this._process();
    }
  }
};

// ─── Utilitários ────────────────────────────────────────────────────────────

/**
 * silent=true → erros vão só pro console, sem toast (para chamadas em background/loop)
 * silent=false → mostra toast de erro (para ações diretas do usuário)
 */
async function fetchCamara(endpoint, params = {}, silent = false) {
  const query = new URLSearchParams({ ...params, itens: params.itens || 20 }).toString();
  const url = `${CAMARA_API}${endpoint}?${query}`;
  try {
    const res = await fetchComRetry(url, {
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    }, 3, 1000);
    const json = await res.json();
    return json.dados;
  } catch (err) {
    console.warn('[SARA API]', endpoint, err.message);
    if (!silent) showToast('Erro ao conectar com a API da Câmara. Verifique sua conexão.');
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
 * Usa itens=100 por pagina e busca multiplas paginas para pegar todos (~513 deputados).
 */
async function buscarDeputados(filtros = {}) {
  const params = {
    ordem: 'ASC',
    ordenarPor: 'nome',
    itens: 100,
    ...filtros
  };
  return await fetchCamara('/deputados', params);
}

/**
 * Busca TODOS os deputados, paginando automaticamente.
 */
async function buscarTodosDeputados() {
  let todos = [];
  let pagina = 1;
  while (true) {
    const lote = await fetchCamara('/deputados', {
      ordem: 'ASC', ordenarPor: 'nome', itens: 100, pagina
    }, true);
    if (!lote || lote.length === 0) break;
    todos = todos.concat(lote);
    if (lote.length < 100) break; // ultima pagina
    pagina++;
  }
  return todos.length > 0 ? todos : null;
}

// ─── Senadores (API do Senado) ──────────────────────────────────────────────

const SENADO_API = 'https://legis.senado.leg.br/dadosabertos';

/**
 * Busca lista de senadores em exercicio.
 * Retorna array normalizado com mesma estrutura dos deputados.
 */
async function buscarSenadores() {
  try {
    const res = await fetchComRetry(`${SENADO_API}/senador/lista/atual`, {
      headers: { 'Accept': 'application/json' }
    }, 3, 1000);
    const json = await res.json();
    const lista = json?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar;
    if (!lista || !Array.isArray(lista)) return [];
    return lista.map(s => {
      const id = s.IdentificacaoParlamentar;
      return {
        id: 'S' + (id?.CodigoParlamentar || ''),
        nome: id?.NomeParlamentar || id?.NomeCompletoParlamentar || '—',
        siglaPartido: id?.SiglaPartidoParlamentar || '—',
        siglaUf: id?.UfParlamentar || '—',
        urlFoto: id?.UrlFotoParlamentar || '',
        cargo: 'Senador(a)',
        _tipo: 'senador',
      };
    });
  } catch (err) {
    console.warn('[SARA Senado]', err.message);
    return [];
  }
}

/**
 * Busca detalhes completos de um deputado pelo ID.
 * @param {number|string} id
 */
async function buscarDeputadoPorId(id) {
  try {
    const res = await fetchComRetry(`${CAMARA_API}/deputados/${id}`, {
      headers: { 'Accept': 'application/json' }
    }, 3, 1000);
    const json = await res.json();
    return json.dados;
  } catch (err) {
    console.error('[SARA API]', err.message);
    showToast('Erro ao buscar detalhes do deputado.');
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
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="empty-state-title">Nenhum politico encontrado</div>
        <div class="empty-state-desc">Tente ajustar os filtros ou aguarde o carregamento da API da Camara.</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = deputados.map(dep => {
    const gastoCache = _gastosCache[dep.id];
    const gastoHtml  = gastoCache !== undefined
      ? `<span style="font-weight:600">${formatCurrency(gastoCache)}</span>`
      : `<span style="color:var(--text-light);font-size:.82rem">carregando…</span>`;

    const nomeEsc = escapeHtml(dep.nome);
    const partidoEsc = escapeHtml(dep.siglaPartido || '');
    const ufEsc = escapeHtml(dep.siglaUf || '');
    const nomeAttr = escapeHtml(dep.nome.replace(/'/g, "\\'"));
    const isSenador = dep._tipo === 'senador';
    const fotoUrl = dep.urlFoto || (isSenador ? '' : `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`);
    const cargoLabel = escapeHtml(dep.cargo || (isSenador ? 'Senador(a)' : 'Deputado(a) Federal'));
    const depIdClean = String(dep.id).replace('S', '');
    const perfilUrl = isSenador
      ? `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${depIdClean}`
      : `https://www.camara.leg.br/deputados/${dep.id}`;
    const perfilLabel = isSenador ? 'Senado' : 'Camara';
    const cargoBadge = isSenador ? 'badge-yellow' : 'badge-green';

    return `
    <tr data-nome="${nomeEsc}" data-partido="${partidoEsc}" data-estado="${ufEsc}" data-status="Ativo" data-tipo="${dep._tipo || 'deputado'}">
      <td data-label="Politico">
        <div class="pol-name-cell">
          ${fotoUrl ? `<img class="avatar-photo" src="${fotoUrl}" alt="${nomeEsc}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="avatar" style="display:none">${escapeHtml(getInitials(dep.nome))}</div>` : `<div class="avatar">${escapeHtml(getInitials(dep.nome))}</div>`}
          <div>
            <div style="font-weight:600">${nomeEsc}</div>
            <div style="font-size:.74rem;color:var(--text-light)">${partidoEsc} · ${ufEsc}</div>
          </div>
        </div>
      </td>
      <td data-label="Cargo"><span class="badge ${cargoBadge}">${cargoLabel}</span></td>
      <td data-label="Partido">${partidoEsc || '—'}</td>
      <td data-label="Regiao">${ufEsc || '—'}</td>
      <td data-label="Gastos" class="expense-amount" id="gasto-${dep.id}">${gastoHtml}</td>
      <td data-label="Status"><span class="badge badge-green">Ativo</span></td>
      <td data-label="Acoes" style="white-space:nowrap">
        ${!isSenador ? `<button class="action-btn" onclick="abrirDetalhes(${dep.id}, '${nomeAttr}')">Ver</button>
        <button class="action-btn" style="margin-left:6px;background:#f0fdf4;color:#16a34a;border-color:#bbf7d0"
          onclick="abrirGastosDeputado(${dep.id}, '${nomeAttr}')">Gastos</button>` : ''}
        <a class="action-btn" style="margin-left:6px;background:#eff6ff;color:#3b82f6;border-color:#bfdbfe;text-decoration:none;display:inline-flex;align-items:center;gap:4px"
          href="${perfilUrl}" target="_blank" rel="noopener">${perfilLabel} ↗</a>
      </td>
    </tr>`;
  }).join('');
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

// Cache de gastos individuais: { [id]: number }
const _gastosCache = {};

async function atualizarDashboard(deputados) {
  if (!deputados) return;

  const anoAtual = new Date().getFullYear();

  // ── Card: total de políticos ──
  const elPoliticos = document.getElementById('dash-total-politicos');
  const elSubPol    = document.getElementById('dash-sub-politicos');
  if (elPoliticos) elPoliticos.textContent = deputados.length;
  if (elSubPol)    elSubPol.textContent    = `Câmara Federal · ${anoAtual}`;

  // ── Card: gastos registrados ──
  // Busca despesas de cada deputado em paralelo (silencioso)
  // e vai atualizando o total progressivamente conforme chegam
  const elGastos    = document.getElementById('dash-total-gastos');
  const elSubGastos = document.getElementById('dash-sub-gastos');

  let totalAcumulado = 0;
  let concluidos     = 0;
  const total        = deputados.length;

  // Função que formata o total de forma compacta (ex: R$ 3,2M)
  function formatCompact(val) {
    if (val >= 1_000_000) return 'R$' + (val / 1_000_000).toFixed(1).replace('.', ',') + 'M';
    if (val >= 1_000)     return 'R$' + (val / 1_000).toFixed(0) + 'k';
    return formatCurrency(val);
  }

  function atualizarCardGastos() {
    if (elGastos)    elGastos.textContent    = formatCompact(totalAcumulado);
    if (elSubGastos) elSubGastos.textContent =
      concluidos < total
        ? `Carregando… ${concluidos}/${total} deputados`
        : `Soma de ${total} deputados · ${anoAtual}`;
  }

  // Dispara buscas com rate limiting
  deputados.forEach(dep =>
    _rateLimiter.add(() =>
      buscarDespesasDeputadoSilent(dep.id, { ano: anoAtual, itens: 100 })
        .then(despesas => {
          const subtotal = (despesas || []).reduce((acc, d) => acc + (d.valorLiquido || 0), 0);
          _gastosCache[dep.id] = subtotal;
          totalAcumulado += subtotal;
          concluidos++;
          atualizarCardGastos();

          // Atualiza também a célula individual na tabela de políticos
          const cell = document.getElementById('gasto-' + dep.id);
          if (cell) cell.textContent = formatCurrency(subtotal);

          // Atualiza chart de gastos a cada 10 deputados carregados
          if (concluidos % 10 === 0 || concluidos === total) {
            if (typeof initChartTopGastos === 'function') initChartTopGastos();
          }
        })
    )
  );

  // Mostra progresso imediato
  atualizarCardGastos();
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
  const selects = document.querySelectorAll('#page-expenses select:first-child, #elig-select-dep, #leg-select-dep');
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

function filtrarTabelaLocal(texto, partido, uf, status) {
  const filtered = todosDeputados.filter(dep => {
    const matchNome = !texto || dep.nome.toLowerCase().includes(texto.toLowerCase());
    const matchPartido = !partido || dep.siglaPartido === partido;
    const matchUF = !uf || dep.siglaUf === uf;
    let matchStatus = true;
    if (status === 'deputado') matchStatus = dep._tipo !== 'senador';
    else if (status === 'senador') matchStatus = dep._tipo === 'senador';
    else if (status && status !== 'Ativo' && status !== '') matchStatus = true;
    return matchNome && matchPartido && matchUF && matchStatus;
  });
  // Integrate with pagination if available
  if (typeof polFilteredList !== 'undefined' && typeof polUpdatePagination === 'function') {
    polFilteredList = filtered;
    polCurrentPage = 1;
    polUpdatePagination();
  } else {
    renderTabelaPoliticos(filtered);
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initAPI() {
  showToast('Conectando com as APIs da Camara e Senado...');

  const [deputados, senadores, partidos] = await Promise.all([
    buscarTodosDeputados(),
    buscarSenadores(),
    buscarPartidos()
  ]);

  // Marca deputados com _tipo para diferenciar na tabela
  const deps = (deputados || []).map(d => ({ ...d, _tipo: d._tipo || 'deputado', cargo: 'Deputado(a) Federal' }));
  const sens = senadores || [];
  const todosParlamentares = [...deps, ...sens];

  if (todosParlamentares.length > 0) {
    todosDeputados = todosParlamentares;

    const totalDeps = deps.length;
    const totalSens = sens.length;
    showToast(`Conectado! ${totalDeps} deputados + ${totalSens} senadores carregados.`);

    // Use pagination if available
    if (typeof polFilteredList !== 'undefined' && typeof polUpdatePagination === 'function') {
      polFilteredList = todosParlamentares;
      polUpdatePagination();
    } else {
      renderTabelaPoliticos(todosParlamentares);
    }

    // Dashboard only uses deputados (senado nao tem API de despesas compativel)
    atualizarDashboard(deps);

    // Dispatch event for charts
    document.dispatchEvent(new CustomEvent('sara:deputadosCarregados', { detail: todosParlamentares }));
  } else {
    showToast('Nao foi possivel conectar as APIs. Os dados estaticos serao exibidos.', true);
  }

  // Filtros dinâmicos na tabela de políticos
  const polSearch  = document.getElementById('pol-search');
  const polPartido = document.getElementById('pol-filter-partido');
  const polEstado  = document.getElementById('pol-filter-estado');
  const polStatus  = document.getElementById('pol-filter-status');

  function aplicarFiltros() {
    filtrarTabelaLocal(
      polSearch?.value  || '',
      polPartido?.value || '',
      polEstado?.value  || '',
      polStatus?.value  || ''
    );
  }

  [polSearch, polPartido, polEstado, polStatus].forEach(el => {
    if (el) el.addEventListener('input', aplicarFiltros);
  });

  // Popular selects de partidos e deputados
  if (partidos) {
    const selPartido = document.getElementById('pol-filter-partido');
    if (selPartido) {
      selPartido.innerHTML = `<option value="">Todos os Partidos</option>` +
        partidos.map(p => `<option value="${p.sigla}">${p.sigla}</option>`).join('');
    }
  }

  if (todosParlamentares.length > 0) {
    const ufs = [...new Set(todosParlamentares.map(d => d.siglaUf).filter(Boolean))].sort();
    const selEstado = document.getElementById('pol-filter-estado');
    if (selEstado) {
      selEstado.innerHTML = `<option value="">Todos os Estados</option>` +
        ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');
    }
    const selStatus = document.getElementById('pol-filter-status');
    if (selStatus) {
      selStatus.innerHTML = `<option value="">Todos (Deputados + Senadores)</option>
        <option value="deputado">Apenas Deputados</option>
        <option value="senador">Apenas Senadores</option>`;
    }
  }

  await popularSelectDeputados();

  // Atualiza badge de políticos na sidebar
  const allBadges = document.querySelectorAll('.nav-badge');
  if (allBadges[0]) allBadges[0].textContent = todosParlamentares.length;
}

// Inicia após o DOM estar pronto
document.addEventListener('DOMContentLoaded', initAPI);

// ─────────────────────────────────────────────────────────────────────────────
// ATUAÇÃO LEGISLATIVA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca proposições de autoria de um deputado e enriquece cada uma
 * com a situação real via /proposicoes/{id} em paralelo.
 */
async function buscarProposicoesDeputado(id, ano) {
  const lista = await fetchCamara('/proposicoes', {
    idDeputadoAutor: id,
    ano,
    itens: 30,
    ordenarPor: 'ano',
    ordem: 'DESC'
  });

  if (!lista || lista.length === 0) return lista;

  // Busca detalhes em paralelo — situação real fica em statusProposicao
  const detalhes = await Promise.allSettled(
    lista.map(p => fetchCamara('/proposicoes/' + p.id, {}, true))
  );

  return lista.map((p, i) => {
    const det    = detalhes[i].status === 'fulfilled' ? detalhes[i].value : null;
    const status = det?.statusProposicao || {};
    return {
      ...p,
      descricaoSituacao: status.descricaoSituacao  || p.descricaoSituacao  || null,
      descricaoTipo:     det?.descricaoTipo         || p.descricaoTipo      || null,
      urlInteiroTeor:    det?.urlInteiroTeor         || null,
      _orgaoSituacao:    status.siglaOrgao           || null,
      _dataUltAtu:       status.dataHora             || null,
    };
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

function _situacaoBadge(sit) {
  if (!sit) return '<span class="prop-sit prop-sit-default">Carregando…</span>';
  const s = sit.toLowerCase();
  if (s.includes('aprovad') || s.includes('transform') || s.includes('sancion'))
    return '<span class="prop-sit prop-sit-green">' + escapeHtml(sit) + '</span>';
  if (s.includes('arquivad') || s.includes('rejeitad') || s.includes('prejudicad'))
    return '<span class="prop-sit prop-sit-red">' + escapeHtml(sit) + '</span>';
  if (s.includes('plen') || s.includes('votac') || s.includes('pauta'))
    return '<span class="prop-sit prop-sit-yellow">' + escapeHtml(sit) + '</span>';
  return '<span class="prop-sit prop-sit-default">' + escapeHtml(sit) + '</span>';
}

function renderProposicoes(proposicoes) {
  const el = document.getElementById('leg-list-prop');
  if (!el) return;
  document.getElementById('leg-stat-prop').textContent = proposicoes?.length ?? '—';

  if (!proposicoes || proposicoes.length === 0) { renderEmpty('leg-list-prop', 'Nenhuma proposição encontrada.'); return; }

  el.innerHTML = proposicoes.map(p => {
    const dataAtu = p._dataUltAtu ? p._dataUltAtu.substring(0, 10).split('-').reverse().join('/') : null;
    const orgao   = p._orgaoSituacao || null;
    const meta    = [p.descricaoTipo, orgao, dataAtu ? 'Atualizado em ' + dataAtu : null].filter(Boolean).join(' · ');
    const teor    = p.urlInteiroTeor ? ` <a href="${escapeHtml(p.urlInteiroTeor)}" target="_blank" class="action-btn" style="white-space:nowrap;text-decoration:none;margin-left:6px">📄 Texto</a>` : '';
    return `
    <div style="padding:14px;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.88rem;margin-bottom:6px;line-height:1.4">
          <span class="leg-tipo-badge">${escapeHtml(p.siglaTipo || '—')} ${p.numero || ''}/${p.ano || ''}</span>
          ${escapeHtml(p.ementa || 'Sem ementa.')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:.76rem;color:var(--text-light)">
          ${_situacaoBadge(p.descricaoSituacao)}
          ${meta ? '<span>' + escapeHtml(meta) + '</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <a href="https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}"
           target="_blank" class="action-btn" style="white-space:nowrap;text-decoration:none">Ver ↗</a>${teor}
      </div>
    </div>`;
  }).join('');
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

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE GASTOS DETALHADO — GET /deputados/{id}/despesas
// ─────────────────────────────────────────────────────────────────────────────

async function abrirGastosDeputado(id, nome) {
  // Abre modal com loading
  const modal = document.getElementById('demand-modal');
  modal.innerHTML = `
    <div class="modal-box" style="max-width:900px;min-height:220px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
      <div style="font-size:2.2rem">💰</div>
      <div style="font-weight:700;font-size:1rem">Carregando gastos de ${nome}…</div>
      <div style="font-size:.82rem;color:var(--text-light)">Buscando em GET /deputados/${id}/despesas</div>
    </div>`;
  modal.classList.add('open');
  modal.onclick = e => { if (e.target === modal) closeModal(); };

  const anoAtual = new Date().getFullYear();
  const anoAnt   = anoAtual - 1;

  // Busca até 100 despesas do ano atual + 100 do ano anterior
  const [despesasAno, despesasAnt] = await Promise.all([
    buscarDespesasDeputado(id, { ano: anoAtual, itens: 100 }),
    buscarDespesasDeputado(id, { ano: anoAnt,   itens: 100 })
  ]);

  const despesas  = despesasAno || [];
  const despAnt   = despesasAnt || [];
  const total     = despesas.reduce((a, d) => a + (d.valorLiquido || 0), 0);
  const totalAnt  = despAnt.reduce((a, d) => a + (d.valorLiquido || 0), 0);
  const varPct    = totalAnt > 0 ? (((total - totalAnt) / totalAnt) * 100).toFixed(1) : null;

  // ── Agrupamento por tipo de despesa ─────────────────────────────────────
  const porTipo = {};
  despesas.forEach(d => {
    const tipo = d.tipoDespesa || 'Outros';
    if (!porTipo[tipo]) porTipo[tipo] = { total: 0, count: 0 };
    porTipo[tipo].total += d.valorLiquido || 0;
    porTipo[tipo].count++;
  });
  const tiposOrdenados = Object.entries(porTipo).sort((a, b) => b[1].total - a[1].total);
  const maxTipo        = tiposOrdenados[0]?.[1].total || 1;

  // ── Agrupamento por mês ──────────────────────────────────────────────────
  const porMes = {};
  despesas.forEach(d => {
    const mes = (d.dataDocumento || '').substring(0, 7);
    if (mes) porMes[mes] = (porMes[mes] || 0) + (d.valorLiquido || 0);
  });
  const mesesOrd  = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMes    = Math.max(...mesesOrd.map(m => m[1]), 1);
  const mesNomes  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // ── HTML: gráfico de barras mensal ───────────────────────────────────────
  const barrasHtml = mesesOrd.map(([mes, val]) => {
    const [, m] = mes.split('-');
    const pct   = Math.round((val / maxMes) * 100);
    const label = (val >= 1000)
      ? (val / 1000).toFixed(0) + 'k'
      : val.toFixed(0);
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:28px">
        <span style="font-size:.62rem;color:var(--primary);font-weight:700">${label}</span>
        <div style="width:100%;background:#f0f9f0;border-radius:4px 4px 0 0;height:64px;display:flex;align-items:flex-end;overflow:hidden">
          <div style="width:100%;background:var(--primary);border-radius:3px 3px 0 0;height:${pct}%;transition:height .5s ease"></div>
        </div>
        <span style="font-size:.62rem;color:var(--text-light)">${mesNomes[parseInt(m)-1]||mes}</span>
      </div>`;
  }).join('');

  // ── HTML: barras por categoria ───────────────────────────────────────────
  const catHtml = tiposOrdenados.map(([tipo, data]) => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:.78rem;font-weight:500;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tipo}">${tipo}</span>
        <span style="font-size:.78rem;font-weight:700;color:var(--primary)">${formatCurrency(data.total)}</span>
      </div>
      <div style="background:#f3f4f6;border-radius:6px;height:7px;overflow:hidden">
        <div style="height:100%;background:var(--primary);border-radius:6px;width:${(data.total/maxTipo*100).toFixed(1)}%"></div>
      </div>
      <div style="font-size:.68rem;color:var(--text-light);margin-top:2px">${data.count} lançamento${data.count>1?'s':''}</div>
    </div>`).join('');

  // ── HTML: tabela completa ────────────────────────────────────────────────
  const linhasHtml = despesas.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-light)">📭 Nenhuma despesa encontrada para ${anoAtual}.</td></tr>`
    : despesas.map((d, i) => {
        const valorPos = (d.valorLiquido || 0) >= 0;
        return `
        <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'#fff':'#fafafa'}">
          <td style="padding:7px 10px;color:var(--text-light);white-space:nowrap">${(d.dataDocumento||'—').substring(0,10)}</td>
          <td style="padding:7px 10px">
            <span style="background:#eff6ff;color:#1d4ed8;padding:2px 7px;border-radius:10px;font-size:.68rem;font-weight:600;white-space:nowrap">${d.tipoDespesa||'—'}</span>
          </td>
          <td style="padding:7px 10px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem" title="${d.nomeFornecedor||''}">${d.nomeFornecedor||'—'}</td>
          <td style="padding:7px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem" title="${d.descricao||''}">${d.descricao||d.tipoDespesa||'—'}</td>
          <td style="padding:7px 10px;text-align:right;font-weight:700;white-space:nowrap;color:${valorPos?'#16a34a':'#dc2626'}">${formatCurrency(d.valorLiquido)}</td>
          <td style="padding:7px 10px;text-align:center">
            ${d.urlDocumento
              ? `<a href="${d.urlDocumento}" target="_blank" title="Ver documento" style="font-size:.72rem;color:var(--primary);text-decoration:none;border:1px solid var(--border);padding:2px 6px;border-radius:4px">📄</a>`
              : `<span style="color:#ccc;font-size:.75rem">—</span>`}
          </td>
        </tr>`;
      }).join('');

  // ── Monta o modal completo ────────────────────────────────────────────────
  modal.innerHTML = `
    <div class="modal-box" style="max-width:920px;padding:0;overflow:hidden;border-radius:12px">

      <!-- Cabeçalho verde -->
      <div style="background:linear-gradient(135deg,#14532d,#166534);padding:18px 24px;color:#fff;display:flex;align-items:center;gap:14px">
        <div style="font-size:2rem">💰</div>
        <div style="flex:1">
          <div style="font-size:1.05rem;font-weight:700">${nome}</div>
          <div style="font-size:.78rem;opacity:.8;margin-top:2px">
            Cota para Exercício da Atividade Parlamentar (CEAP) · ${anoAtual}
          </div>
          <div style="font-size:.72rem;opacity:.6;margin-top:2px">
            Fonte: GET /deputados/${id}/despesas — API Dados Abertos Câmara
          </div>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;flex-shrink:0">✕</button>
      </div>

      <div style="max-height:72vh;overflow-y:auto;padding:20px 24px">

        <!-- Cards de resumo -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px">
          <div class="stat-card" style="margin:0;padding:14px 16px">
            <div class="stat-label">Total ${anoAtual}</div>
            <div class="stat-value" style="font-size:1.3rem;line-height:1.2">${formatCurrency(total)}</div>
            <div class="stat-change">${despesas.length} lançamentos</div>
          </div>
          <div class="stat-card" style="margin:0;padding:14px 16px">
            <div class="stat-label">Variação vs. ${anoAnt}</div>
            <div class="stat-value" style="font-size:1.3rem;line-height:1.2;color:${varPct!==null?(parseFloat(varPct)>0?'#dc2626':'#16a34a'):'inherit'}">
              ${varPct !== null ? (parseFloat(varPct)>0?'↑':'↓')+Math.abs(varPct)+'%' : '—'}
            </div>
            <div class="stat-change">${totalAnt>0?formatCurrency(totalAnt)+' em '+anoAnt:'Sem dados do ano anterior'}</div>
          </div>
          <div class="stat-card" style="margin:0;padding:14px 16px">
            <div class="stat-label">Média Mensal</div>
            <div class="stat-value" style="font-size:1.3rem;line-height:1.2">
              ${formatCurrency(mesesOrd.length > 0 ? total / mesesOrd.length : 0)}
            </div>
            <div class="stat-change">${tiposOrdenados.length} categoria${tiposOrdenados.length!==1?'s':''}</div>
          </div>
        </div>

        <!-- Gráfico mensal -->
        ${mesesOrd.length > 0 ? `
        <div style="margin-bottom:22px">
          <div style="font-weight:700;font-size:.85rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
            <span> Evolução Mensal — ${anoAtual}</span>
            <span style="font-weight:400;font-size:.75rem;color:var(--text-light)">${mesesOrd.length} mese${mesesOrd.length!==1?'s':''} com lançamentos</span>
          </div>
          <div style="display:flex;gap:4px;align-items:flex-end;padding:4px 0">
            ${barrasHtml}
          </div>
        </div>` : ''}

        <!-- Categorias + destaque -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px">
          <div>
            <div style="font-weight:700;font-size:.85rem;margin-bottom:12px"> Por Categoria de Despesa</div>
            ${catHtml || '<div style="color:var(--text-light);font-size:.82rem">Sem dados.</div>'}
          </div>
          <div>
            <div style="font-weight:700;font-size:.85rem;margin-bottom:12px"> Destaques</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
                <div style="font-size:.68rem;color:#16a34a;font-weight:700;letter-spacing:.04em">MAIOR CATEGORIA</div>
                <div style="font-size:.82rem;margin-top:3px;font-weight:500">${tiposOrdenados[0]?.[0]||'—'}</div>
                <div style="font-size:.9rem;font-weight:700;color:#16a34a">${formatCurrency(tiposOrdenados[0]?.[1].total||0)}</div>
              </div>
              <div style="padding:12px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe">
                <div style="font-size:.68rem;color:#1d4ed8;font-weight:700;letter-spacing:.04em">MAIOR GASTO ÚNICO</div>
                ${(() => {
                  const maior = [...despesas].sort((a,b)=>(b.valorLiquido||0)-(a.valorLiquido||0))[0];
                  return maior
                    ? `<div style="font-size:.78rem;margin-top:3px;font-weight:500">${maior.nomeFornecedor||maior.tipoDespesa||'—'}</div>
                       <div style="font-size:.9rem;font-weight:700;color:#1d4ed8">${formatCurrency(maior.valorLiquido)}</div>
                       <div style="font-size:.68rem;color:var(--text-light)">${(maior.dataDocumento||'').substring(0,10)}</div>`
                    : '<div style="font-size:.82rem;color:var(--text-light)">—</div>';
                })()}
              </div>
            </div>
          </div>
        </div>

        <!-- Tabela detalhada -->
        <div>
          <div style="font-weight:700;font-size:.85rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
            <span> Detalhamento Completo — ${despesas.length} registros</span>
            <a href="https://www.camara.leg.br/deputados/${id}/despesas" target="_blank"
               style="font-size:.75rem;color:var(--primary);text-decoration:none">Ver no site ↗</a>
          </div>
          <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px">
            <table style="width:100%;border-collapse:collapse;font-size:.78rem">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:9px 10px;font-weight:600;white-space:nowrap">Data</th>
                  <th style="text-align:left;padding:9px 10px;font-weight:600">Tipo</th>
                  <th style="text-align:left;padding:9px 10px;font-weight:600">Fornecedor</th>
                  <th style="text-align:left;padding:9px 10px;font-weight:600">Descrição</th>
                  <th style="text-align:right;padding:9px 10px;font-weight:600;white-space:nowrap">Valor (R$)</th>
                  <th style="text-align:center;padding:9px 10px;font-weight:600">Doc</th>
                </tr>
              </thead>
              <tbody>${linhasHtml}</tbody>
            </table>
          </div>
        </div>

      </div><!-- /scroll -->

      <!-- Rodapé -->
      <div style="padding:12px 24px;border-top:1px solid var(--border);background:#fafafa;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.72rem;color:var(--text-light)">
          API: GET /deputados/${id}/despesas · ${new Date().toLocaleDateString('pt-BR')}
        </span>
        <div style="display:flex;gap:8px">
          <button class="btn-outline" onclick="closeModal()">Fechar</button>
          <a class="btn-primary" style="text-decoration:none;padding:8px 16px;border-radius:8px;font-size:.82rem"
             href="https://www.camara.leg.br/deputados/${id}/despesas" target="_blank">
            Ver no site da Câmara ↗
          </a>
        </div>
      </div>

    </div>`;
}