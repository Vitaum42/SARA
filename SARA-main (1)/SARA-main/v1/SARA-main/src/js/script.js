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
    document.getElementById('btn-next').textContent = idx === 2 ? '✓ Salvar Cadastro' : 'Próximo →';
  }
  function nextTab() {
    const idx = tabOrder.indexOf(currentTab);
    if (idx < 2) switchTab(tabOrder[idx+1]);
    else { showToast('✅ Político cadastrado com sucesso!'); navigate('politicians', document.querySelector('[onclick*=politicians]')); setTimeout(()=>switchTab('dados'),500); }
  }
  function prevTab() {
    const idx = tabOrder.indexOf(currentTab);
    if (idx > 0) switchTab(tabOrder[idx-1]);
  }

  // Eligibility
  function updateEligibility(val) {
    const grid = document.getElementById('eligibility-grid');
    const score = document.getElementById('elig-score');
    const bar = document.getElementById('elig-bar-fill');
    const label = document.getElementById('elig-status-label');
    if (val === 'ok') {
      score.textContent = '9/10'; bar.style.width = '90%';
      label.textContent = '✅ Candidatura Aprovada — Todos os critérios principais atendidos';
    } else if (val === 'pending') {
      score.textContent = '6/10'; bar.style.width = '60%';
      label.textContent = '⚠️ Pendente — Alguns critérios requerem atenção';
    } else {
      score.textContent = '3/10'; bar.style.width = '30%';
      label.textContent = '❌ Candidatura Irregular — Critérios essenciais não atendidos';
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
    closeModal();
    showToast('📋 Demanda registrada com sucesso!');
  }

  // Toasts
  function showToast(msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
