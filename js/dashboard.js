/* ==========================================================================
   FertGrow CMMS — Dashboard
   ========================================================================== */

Views.dashboard = {
  title: 'Dashboard',
  render() {
    const k = Store.calcKPIs();
    const cfg = Store.config;

    return `
      <div class="view-head">
        <div>
          <h1>Painel Geral</h1>
          <div class="sub">Semana operacional ${cfg.semanaAtual} de 52 · Ano base ${cfg.anoBase}</div>
        </div>
        <div class="view-actions">
          <button class="btn" id="btnRefreshDash">${Icon('refresh',15)} Atualizar</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px;">
        ${gaugeCard('Ativos Cadastrados', k.totalAtivos, '', k.ativosOperando + ' operando · ' + k.ativosParados + ' parados/manut.', pct(k.ativosOperando, k.totalAtivos), 'box')}
        ${gaugeCard('OS Abertas', k.osAbertas, '', k.osTotal + ' OS no total do ano', pct(k.osAbertas, k.osTotal || 1), 'clipboard')}
        ${gaugeCard('Disponibilidade', k.disponibilidade.toFixed(1), '%', 'MTBF ' + k.mtbf.toFixed(0) + 'h · MTTR ' + k.mttr.toFixed(1) + 'h', k.disponibilidade, 'gauge')}
        ${gaugeCard('Backlog', k.backlogSemanas.toFixed(2), ' sem.', k.backlogHoras.toFixed(0) + ' h pendentes na fila', Math.min(100, k.backlogSemanas * 40), 'clock')}
      </div>

      <div class="grid grid-4" style="margin-bottom:20px;">
        ${miniStat('Preventivas', k.preventivas, 'success', 'check')}
        ${miniStat('Corretivas', k.corretivas, 'danger', 'bolt')}
        ${miniStat('Concluídas no ano', k.concluidas, 'info', 'target')}
        ${miniStat('Custo total (MO+Mat.)', App.fmtMoney(k.custoTotal), 'accent', 'coin')}
      </div>

      <div class="grid grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="card-head"><h3>OS por Semana · Planejado vs Concluído</h3><span class="meta">últimas 16 semanas</span></div>
          <canvas id="chartOsSemana" height="220"></canvas>
        </div>
        <div class="card">
          <div class="card-head"><h3>Distribuição por Tipo</h3><span class="meta">ano corrente</span></div>
          <canvas id="chartTipo" height="220"></canvas>
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="card-head"><h3>Custos de Manutenção</h3><span class="meta">mão de obra × materiais</span></div>
          <canvas id="chartCustos" height="220"></canvas>
        </div>
        <div class="card">
          <div class="card-head"><h3>Criticidade dos Ativos</h3><span class="meta">classe A / B / C</span></div>
          <canvas id="chartCriticidade" height="220"></canvas>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3>Itens sem saldo em estoque</h3><span class="meta">${Store.estoqueSemSaldo().length} itens</span></div>
          ${estoqueBaixoList()}
        </div>
        <div class="card">
          <div class="card-head"><h3>Conflitos de programação</h3><span class="meta">${Store.detectConflitos().length} detectados</span></div>
          ${conflitosList()}
        </div>
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnRefreshDash')?.addEventListener('click', () => App.navigate('dashboard'));
    buildCharts();
  },
};

function pct(a, b) { return b > 0 ? Math.min(100, (a / b) * 100) : 0; }

function gaugeCard(label, value, unit, sub, percent, icon) {
  const r = 20, c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return `
    <div class="kpi-card">
      <div class="kpi-top">
        <div>
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${value}<small>${unit}</small></div>
        </div>
        <div class="gauge">
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle class="gauge-bg" cx="26" cy="26" r="${r}"/>
            <circle class="gauge-fg" cx="26" cy="26" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
          </svg>
        </div>
      </div>
      <div class="kpi-trend" style="color:var(--text-muted);margin-top:10px;">${sub}</div>
    </div>`;
}

function miniStat(label, value, color, icon) {
  const colorVar = color === 'accent' ? 'var(--accent)' : `var(--${color})`;
  return `
    <div class="card" style="padding:14px 16px;">
      <div class="flex-between">
        <div>
          <div class="kpi-label">${label}</div>
          <div class="kpi-value" style="font-size:20px;margin-top:4px;">${value}</div>
        </div>
        <div class="kpi-icon" style="color:${colorVar};background:color-mix(in srgb, ${colorVar} 15%, transparent);">${Icon(icon,17)}</div>
      </div>
    </div>`;
}

function estoqueBaixoList() {
  const items = Store.estoqueSemSaldo();
  if (!items.length) return `<div class="empty" style="padding:24px;">${Icon('check',26)}<span>Nenhum item sem saldo em estoque.</span></div>`;
  return `<div>${items.slice(0, 6).map(i => `
    <div class="flex-between" style="padding:9px 0;border-bottom:1px solid var(--border-soft);">
      <div>
        <div style="font-size:13px;font-weight:600;">${i.descricao}</div>
        <div class="cell-tag">${i.codigo} · Armazém ${i.armazem}</div>
      </div>
      <span class="badge badge-danger">${i.qtdAtual} ${i.unidade}</span>
    </div>`).join('')}</div>`;
}

function conflitosList() {
  const conflitos = Store.detectConflitos();
  if (!conflitos.length) return `<div class="empty" style="padding:24px;">${Icon('check',26)}<span>Nenhum conflito de programação detectado.</span></div>`;
  return `<div>${conflitos.slice(0, 6).map(c => `
    <div class="flex-between" style="padding:9px 0;border-bottom:1px solid var(--border-soft);">
      <div>
        <div style="font-size:13px;font-weight:600;">${Store.ativoNome(c.ativoId)}</div>
        <div class="cell-tag">Semana ${c.semana} · ${c.ordens.length} OS com necessidade de parada simultânea</div>
      </div>
      <span class="badge badge-warning">Conflito</span>
    </div>`).join('')}</div>`;
}

let _charts = [];
function buildCharts() {
  _charts.forEach(c => c.destroy());
  _charts = [];
  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue('--text-muted').trim();
  const grid = styles.getPropertyValue('--border-soft').trim();
  const accent = styles.getPropertyValue('--accent').trim();
  const accent2 = styles.getPropertyValue('--accent-2').trim();
  const success = styles.getPropertyValue('--success').trim();
  const warning = styles.getPropertyValue('--warning').trim();
  const danger = styles.getPropertyValue('--danger').trim();
  const info = styles.getPropertyValue('--info').trim();
  Chart.defaults.color = text;
  Chart.defaults.font.family = "'Clash Grotesk','Inter',sans-serif";
  Chart.defaults.font.size = 11;

  const semanas = Store.calcTodasSemanas();
  const cfg = Store.config;
  const janela = semanas.slice(Math.max(0, cfg.semanaAtual - 15), cfg.semanaAtual + 1);
  const planejado = janela.map(s => s.horasPlanejadas);
  const concluido = janela.map(s => s.ordensSemana.filter(o => o.status === 'Concluída').reduce((sum, o) => sum + (o.horasReais || o.horasPrevistas), 0));

  _charts.push(new Chart(document.getElementById('chartOsSemana'), {
    type: 'bar',
    data: {
      labels: janela.map(s => 'S' + s.numero),
      datasets: [
        { label: 'Planejado (h)', data: planejado, backgroundColor: accent + '55', borderColor: accent, borderWidth: 1.5, borderRadius: 4 },
        { label: 'Concluído (h)', data: concluido, backgroundColor: accent2 + '55', borderColor: accent2, borderWidth: 1.5, borderRadius: 4 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { color: grid } }, y: { grid: { color: grid } } } },
  }));

  const ordens = Store.all('ordens');
  const tipos = ['Preventiva', 'Corretiva', 'Preditiva', 'Inspeção'];
  const tipoCounts = tipos.map(t => ordens.filter(o => o.tipo === t).length);
  _charts.push(new Chart(document.getElementById('chartTipo'), {
    type: 'doughnut',
    data: { labels: tipos, datasets: [{ data: tipoCounts, backgroundColor: [success, danger, info, warning], borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '68%' },
  }));

  const k = Store.calcKPIs();
  _charts.push(new Chart(document.getElementById('chartCustos'), {
    type: 'bar',
    data: { labels: ['Mão de Obra', 'Materiais'], datasets: [{ data: [k.custoMO, k.custoMat], backgroundColor: [accent, accent2], borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: grid } }, y: { grid: { display: false } } } },
  }));

  const ativos = Store.all('ativos').filter(a => !a.parentAtivoId);
  const critCounts = ['A', 'B', 'C'].map(c => ativos.filter(a => a.criticidade === c).length);
  _charts.push(new Chart(document.getElementById('chartCriticidade'), {
    type: 'polarArea',
    data: { labels: ['Classe A · Crítico', 'Classe B · Relevante', 'Classe C · Padrão'], datasets: [{ data: critCounts, backgroundColor: [danger + '77', warning + '77', info + '77'] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { r: { grid: { color: grid }, ticks: { display: false } } } },
  }));
}
