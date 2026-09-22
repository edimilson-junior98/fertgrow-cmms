/* ==========================================================================
   FertGrow CMMS — Plano 52 Semanas
   ========================================================================== */

Views.semanas = {
  title: 'Plano 52 Semanas',
  render() {
    const semanas = Store.calcTodasSemanas();
    const cfg = Store.config;
    const totalPlanejado = semanas.reduce((s, w) => s + w.horasPlanejadas, 0);
    const totalDisponivel = semanas.reduce((s, w) => s + w.horasDisponiveis, 0);
    const sobrecarregadas = semanas.filter(w => w.statusSemana === 'Sobrecarregada').length;
    const paradasPlanejadas = semanas.filter(w => w.paradaPlanta).length;
    const totalHorasParada = semanas.reduce((s, w) => s + w.tempoParadaTotal, 0);

    return `
      <div class="view-head">
        <div><h1>Plano de Manutenção · 52 Semanas</h1><div class="sub">Ano base ${cfg.anoBase} · Equipe de ${cfg.tamanhoEquipe} pessoas · ${cfg.horasDiaPadrao}h/dia · ${cfg.diasUteisSemana}d/semana</div></div>
        <div class="view-actions">
          <button class="btn" id="btnSyncMelvinPlanos">${Icon('refresh',15)} Sincronizar Melvin</button>
          <button class="btn" id="btnConfigEquipe">${Icon('user',15)} Capacidade da Equipe</button>
          <button class="btn" id="btnExportPlano">${Icon('download',15)} Exportar Excel</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:18px;">
        ${miniCard('Horas Planejadas (ano)', totalPlanejado.toFixed(0) + 'h', 'clipboard')}
        ${miniCard('Capacidade Disponível (ano)', totalDisponivel.toFixed(0) + 'h', 'gauge')}
        ${miniCard('Semanas Sobrecarregadas', sobrecarregadas, 'alert')}
        ${miniCard('Paradas de Planta Programadas', paradasPlanejadas + ' sem. · ' + totalHorasParada.toFixed(0) + 'h', 'power')}
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-head"><h3>Planos Preventivos Ativos (Melvin)</h3><span class="meta">${Store.all('planosPreventivos').length} plano(s) iniciado(s)</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>FMP</th><th>Ativo</th><th>Serviço</th><th>Tipo</th><th>Periodicidade</th><th>Oficina</th><th>Início</th><th>Próxima OS</th></tr></thead>
            <tbody>
              ${Store.all('planosPreventivos').map(p => `
                <tr>
                  <td class="cell-tag">${p.tagFmp}</td>
                  <td>${p.ativoId ? Store.ativoNome(p.ativoId) : (p.equipamentoNome || '—')}</td>
                  <td>${p.descricao}</td>
                  <td>${p.tipoManutencao}</td>
                  <td class="cell-tag">${p.periodicidade}</td>
                  <td>${p.oficina}</td>
                  <td class="cell-tag">${p.dataInicio ? App.fmtDate(p.dataInicio) : '—'}</td>
                  <td class="cell-tag">${p.proximaOS ? App.fmtDate(p.proximaOS) : '—'}</td>
                </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('calendar',30)}<span>Nenhum plano preventivo sincronizado ainda.</span></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-head">
          <h3>Mapa de Carga · 52 Semanas</h3>
          <div class="legend">
            <div class="legend-item"><span class="legend-dot" style="background:var(--success)"></span>Normal (&lt;85%)</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--warning)"></span>Atenção (85–99%)</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--danger)"></span>Sobrecarregada (≥100%)</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>Parada de planta</div>
          </div>
        </div>
        <div class="week-board">
          ${semanas.map(w => `
            <div class="week-cell load-${w.statusSemana.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')} ${w.paradaPlanta?'parada':''} ${w.numero===cfg.semanaAtual?'is-current':''}" data-week="${w.numero}" title="Semana ${w.numero} — início ${App.fmtDate(w.dataInicio)} — ${w.cargaPercent.toFixed(0)}% de carga">
              <span class="wk-num">S${w.numero}</span>
              <span class="wk-load">${w.cargaPercent.toFixed(0)}%</span>
              <span class="wk-date">${App.fmtDate(w.dataInicio).slice(0,5)}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-head"><h3>Carga por Planta/Setor · 52 Semanas</h3><span class="meta">horas previstas por semana, agrupadas pelo setor do Melvin de cada ativo</span></div>
        <div class="gantt">
          ${ganttHeaderRow(cfg.anoBase)}
          ${ganttSetoresRows()}
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-head"><h3>Cronograma Gantt · Ordens Programadas</h3><span class="meta">por ativo crítico (classe A)</span></div>
        <div class="gantt">
          ${ganttHeaderRow(cfg.anoBase)}
          ${ganttRows()}
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-head"><h3>Cronograma de Planos Preventivos · 52 Semanas</h3><span class="meta">projeção a partir da periodicidade de cada plano (Melvin)</span></div>
        <div class="gantt">
          ${ganttHeaderRow(cfg.anoBase)}
          ${ganttPlanosRows()}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Detalhamento da Semana</h3><span class="meta" id="detalheSemanaLabel">Selecione uma semana no mapa acima</span></div>
        <div id="detalheSemana"><div class="empty">${Icon('calendar',30)}<span>Clique em uma semana no mapa de carga para ver o detalhamento completo.</span></div></div>
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnConfigEquipe').addEventListener('click', abrirConfigEquipe);
    document.getElementById('btnExportPlano').addEventListener('click', () => Importacao.exportarPlanoExcel(Store.calcTodasSemanas()));
    document.querySelectorAll('.week-cell').forEach(c => c.addEventListener('click', () => mostrarDetalheSemana(Number(c.dataset.week))));
    mostrarDetalheSemana(Store.config.semanaAtual);

    document.getElementById('btnSyncMelvinPlanos')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const antigosNaoMelvin = Store.all('planosPreventivos').filter(p => !p.melvinId);

      const executar = async () => {
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = `${Icon('refresh',15)} Sincronizando…`;
        try {
          const removidos = antigosNaoMelvin.length ? MelvinSync.removerPlanosSemMelvinId() : 0;
          const r = await MelvinSync.sincronizarPlanos();
          App.toast(
            `Melvin sincronizado: ${removidos} plano(s) antigo(s) removido(s), ${r.criados} novo(s), ${r.atualizados} atualizado(s), ${r.encerrados} encerrado(s)/removido(s) da lista.`,
            'success'
          );
          App.navigate('semanas', true);
        } catch (err) {
          App.toast(
            `Falha ao sincronizar com o Melvin: ${err.message}. Confirme que o servidor local está rodando (iniciar-sync-melvin.bat).`,
            'danger'
          );
          btn.disabled = false;
          btn.innerHTML = textoOriginal;
          renderIcons(btn);
        }
      };

      if (antigosNaoMelvin.length) {
        App.confirmAction(
          `Isso vai apagar ${antigosNaoMelvin.length} plano(s) atual(is) (que não vieram do Melvin) e trazer os planos preventivos ativos reais do Melvin no lugar. Continuar?`,
          executar
        );
      } else {
        executar();
      }
    });
  },
};

function miniCard(label, value, icon) {
  return `<div class="card" style="padding:14px 16px;"><div class="flex-between">
    <div><div class="kpi-label">${label}</div><div class="kpi-value" style="font-size:19px;margin-top:4px;">${value}</div></div>
    <div class="kpi-icon">${Icon(icon,17)}</div>
  </div></div>`;
}

// Linha de cabeçalho compartilhada pelos 3 Gantts (Ordens, Planos, Setores) —
// mostra o número da semana em toda coluna, e o mês por extenso na primeira
// semana de cada mês (pra dar uma referência de calendário sem precisar
// passar o mouse em cada célula pra saber a data).
function ganttHeaderRow(anoBase) {
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  let cells = '';
  for (let s = 1; s <= 52; s++) {
    const data = Store.weekToDate(s);
    const d = new Date(data + 'T00:00:00');
    const inicioMes = d.getDate() <= 7;
    const texto = inicioMes ? MESES[d.getMonth()] : ('S' + s);
    cells += `<div class="gantt-head-cell ${inicioMes ? 'mes-inicio' : ''}" title="Semana ${s} — início ${App.fmtDate(data)}">${texto}</div>`;
  }
  return `<div class="gantt-row gantt-header"><div class="gantt-label">Semana / Mês</div>${cells}</div>`;
}

// Sobe até o bem "raiz" (ignora sub-bens) e usa o nome da pasta dele — que é
// exatamente o Setor do Melvin (a sincronização de Ativos grava Filial/Setor
// como Pasta/sub-pasta), pra agrupar a carga por área da planta.
function ativoSetorNome(ativo) {
  let a = ativo;
  while (a && a.parentAtivoId) a = Store.get('ativos', a.parentAtivoId);
  if (!a || !a.pastaId) return null;
  const pasta = Store.get('pastas', a.pastaId);
  return pasta ? pasta.nome : null;
}

// Uma linha por setor/planta, com as horas previstas de OS somadas por
// semana — cor por faixa de horas (não é %, já que não temos capacidade de
// equipe configurada por setor, só a da empresa toda).
function ganttSetoresRows() {
  const ordens = Store.all('ordens');
  const porSetor = {};
  ordens.forEach(o => {
    if (!o.ativoId || o.semana < 1 || o.semana > 52) return;
    const ativo = Store.get('ativos', o.ativoId);
    if (!ativo) return;
    const setor = ativoSetorNome(ativo);
    if (!setor) return;
    if (!porSetor[setor]) porSetor[setor] = Array.from({ length: 52 }, () => 0);
    porSetor[setor][o.semana - 1] += (o.horasPrevistas || 0);
  });
  const setores = Object.keys(porSetor).sort();
  if (!setores.length) {
    return `<div class="empty">${Icon('calendar',30)}<span>Sincronize Ativos e Ordens de Serviço do Melvin para ver a carga por setor.</span></div>`;
  }
  return setores.map((nome) => {
    const horas = porSetor[nome];
    let cells = '';
    for (let s = 1; s <= 52; s++) {
      const h = horas[s - 1];
      const cor = h <= 0 ? '' : h <= 4 ? 'var(--success)' : h <= 8 ? 'var(--warning)' : 'var(--danger)';
      cells += `<div class="gantt-cell" title="${h > 0 ? `${nome} — Semana ${s}: ${h.toFixed(1)}h previstas` : ''}">${h > 0 ? `<div class="gantt-bar" style="background:${cor}"></div>` : ''}</div>`;
    }
    return `<div class="gantt-row"><div class="gantt-label">${nome}</div>${cells}</div>`;
  }).join('');
}

function ganttRows() {
  const criticos = Store.all('ativos').filter(a => a.criticidade === 'A' && !a.parentAtivoId);
  const ordens = Store.all('ordens');
  return criticos.map(a => {
    const osAtivo = ordens.filter(o => o.ativoId === a.id);
    let cells = '';
    for (let s = 1; s <= 52; s++) {
      const has = osAtivo.find(o => o.semana === s);
      const titulo = has ? `${has.numero} · ${has.tipo} — Semana ${s} (${App.fmtDate(Store.weekToDate(s))})` : `Semana ${s} (${App.fmtDate(Store.weekToDate(s))})`;
      cells += `<div class="gantt-cell" title="${titulo}">${has ? `<div class="gantt-bar" style="background:${has.paradaPlanta ? 'var(--danger)' : 'var(--accent)'}"></div>` : ''}</div>`;
    }
    return `<div class="gantt-row"><div class="gantt-label">${a.tag} · ${a.nome}</div>${cells}</div>`;
  }).join('');
}

// Periodicidades vistas nos planos preventivos reais (Melvin) — em dias, pra
// projetar em que semanas do ano cada plano deve se repetir. Qualquer valor
// que não estiver aqui cai em 30 dias (mensal) como padrão razoável.
const PERIODICIDADE_DIAS_PLANO = {
  'Diária': 1, Semanal: 7, Quinzenal: 15, '25 dias': 25, Mensal: 30,
  Trimestral: 90, Semestral: 180, '1 Ano': 365, '2 Anos': 730,
};

// Projeta, a partir da data de início do plano e da sua periodicidade, quais
// semanas (1-52) do ano base ele deveria se repetir — mesma base de cálculo
// que Store.weekToDate usa (1º de janeiro do ano configurado).
function planoSemanasOcorrencia(plano, anoBase) {
  if (!plano.dataInicio) return new Set();
  const intervaloDias = PERIODICIDADE_DIAS_PLANO[plano.periodicidade] || 30;
  const base = new Date(anoBase, 0, 1);
  const fimAno = new Date(anoBase, 11, 31);
  let cursor = new Date(plano.dataInicio + 'T00:00:00');
  const semanas = new Set();
  let protecao = 0; // evita loop infinito se algo vier estranho
  while (cursor < base && protecao < 1000) { cursor = new Date(cursor.getTime() + intervaloDias * 86400000); protecao++; }
  while (cursor <= fimAno && protecao < 1000) {
    const dias = Math.round((cursor - base) / 86400000);
    const semana = Math.floor(dias / 7) + 1;
    if (semana >= 1 && semana <= 52) semanas.add(semana);
    cursor = new Date(cursor.getTime() + intervaloDias * 86400000);
    protecao++;
  }
  return semanas;
}

function ganttPlanosRows() {
  const planos = Store.all('planosPreventivos');
  const anoBase = Store.config.anoBase;
  if (!planos.length) return `<div class="empty">${Icon('calendar',30)}<span>Sincronize os Planos Preventivos do Melvin para ver a projeção aqui.</span></div>`;
  return planos.map(p => {
    const semanas = planoSemanasOcorrencia(p, anoBase);
    const nomeAtivo = p.ativoId ? Store.ativoNome(p.ativoId) : (p.equipamentoNome || '—');
    let cells = '';
    for (let s = 1; s <= 52; s++) {
      const tem = semanas.has(s);
      const titulo = tem ? `${p.tagFmp} · ${p.descricao} — Semana ${s} (${App.fmtDate(Store.weekToDate(s))})` : `Semana ${s} (${App.fmtDate(Store.weekToDate(s))})`;
      cells += `<div class="gantt-cell" title="${titulo}">${tem ? `<div class="gantt-bar" style="background:var(--accent)"></div>` : ''}</div>`;
    }
    return `<div class="gantt-row"><div class="gantt-label">${p.tagFmp} · ${nomeAtivo}</div>${cells}</div>`;
  }).join('');
}

function mostrarDetalheSemana(numero) {
  document.querySelectorAll('.week-cell').forEach(c => c.style.outline = Number(c.dataset.week) === numero ? '2px solid var(--accent)' : '');
  const w = Store.calcSemana(numero);
  document.getElementById('detalheSemanaLabel').textContent = `Semana ${numero} · início ${App.fmtDate(w.dataInicio)}`;
  const el = document.getElementById('detalheSemana');
  el.innerHTML = `
    <div class="grid grid-4" style="margin-bottom:16px;">
      <div class="card" style="padding:12px 14px;"><div class="kpi-label">Carga da Equipe</div><div class="kpi-value" style="font-size:19px;">${w.cargaPercent.toFixed(0)}%</div><div class="progress mt-8"><div class="progress-bar ${w.statusSemana==='Sobrecarregada'?'danger':w.statusSemana==='Atenção'?'warning':'success'}" style="width:${Math.min(100,w.cargaPercent)}%"></div></div></div>
      <div class="card" style="padding:12px 14px;"><div class="kpi-label">Horas Planejadas / Disponíveis</div><div class="kpi-value" style="font-size:19px;">${w.horasPlanejadas.toFixed(1)}h / ${w.horasDisponiveis}h</div></div>
      <div class="card" style="padding:12px 14px;"><div class="kpi-label">Parada de Planta</div><div class="kpi-value" style="font-size:19px;">${w.paradaPlanta ? 'Sim' : 'Não'}</div><div class="text-muted" style="font-size:11.5px;margin-top:2px;">${w.tempoParadaTotal.toFixed(1)}h de parada total</div></div>
      <div class="card" style="padding:12px 14px;"><div class="kpi-label">Ativos Programados</div><div class="kpi-value" style="font-size:19px;">${w.ativosProgramados.length}</div></div>
    </div>

    <div class="grid grid-2">
      <div>
        <h3 style="font-size:13px;margin-bottom:10px;">Ordens de Serviço da Semana</h3>
        ${w.ordensSemana.map(o => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><div><strong>${o.numero}</strong><div class="cell-tag">${Store.ativoNome(o.ativoId)} · ${o.tipo}</div></div><span class="badge badge-${App.badgeForStatus(o.status)}">${o.status}</span></div>`).join('') || '<div class="empty">Nenhuma OS nesta semana.</div>'}
      </div>
      <div>
        <h3 style="font-size:13px;margin-bottom:10px;">Materiais Necessários</h3>
        ${w.materiaisNecessarios.map(m => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><span>${m.item?.descricao || '—'}</span><span class="badge badge-${m.suficiente?'success':'danger'}">${m.qtd} ${m.item?.unidade||''} ${m.suficiente?'':'· insuficiente'}</span></div>`).join('') || '<div class="empty">Nenhum material requisitado.</div>'}
      </div>
    </div>
  `;
}

function abrirConfigEquipe() {
  const cfg = Store.config;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Tamanho da Equipe</label><input type="number" id="cfgEquipe" value="${cfg.tamanhoEquipe}"></div>
      <div class="field"><label>Horas Padrão / Dia</label><input type="number" id="cfgHoras" value="${cfg.horasDiaPadrao}"></div>
      <div class="field"><label>Dias Úteis / Semana</label><input type="number" id="cfgDias" value="${cfg.diasUteisSemana}"></div>
      <div class="field"><label>Custo Médio Hora (R$)</label><input type="number" id="cfgCusto" value="${cfg.custoHoraMedio}"></div>
      <div class="field field-span-2"><label>Semana Atual (1-52)</label><input type="number" id="cfgSemanaAtual" value="${cfg.semanaAtual}"></div>
    </div>
    <p class="text-muted mt-16" style="font-size:12px;">A capacidade semanal (${cfg.tamanhoEquipe * cfg.horasDiaPadrao * cfg.diasUteisSemana}h) é recalculada automaticamente com base nestes parâmetros e usada em todo o plano de 52 semanas.</p>
  `;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelCfg">Cancelar</button><button class="btn btn-primary" id="saveCfg">Salvar Configuração</button>`;
  App.openModal({ title: 'Capacidade da Equipe', body, footer });
  document.getElementById('cancelCfg').onclick = App.closeModal;
  document.getElementById('saveCfg').onclick = () => {
    Store.config = {
      ...cfg,
      tamanhoEquipe: Number(val('cfgEquipe')), horasDiaPadrao: Number(val('cfgHoras')),
      diasUteisSemana: Number(val('cfgDias')), custoHoraMedio: Number(val('cfgCusto')),
      semanaAtual: Number(val('cfgSemanaAtual')),
    };
    App.toast('Capacidade da equipe atualizada.', 'success');
    App.closeModal();
  };
}
