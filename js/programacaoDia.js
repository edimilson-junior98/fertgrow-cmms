/* ==========================================================================
   FertGrow CMMS — Programação do Dia (Painel Diário por Executante)

   Visão só-leitura sobre as Ordens de Serviço já sincronizadas do Melvin
   (Store.all('ordens') filtradas por melvinId + dataProgramada, mesmo
   critério que sincronizarProgramacao em js/melvinSync.js já usa) — agrupa o
   dia selecionado por executante, pra cada técnico ver sua carga do dia.

   IMPORTANTE — "Atualizar" aqui NUNCA chama o Melvin. Só reconstrói a tela a
   partir do que já está salvo no Store (os dados que a sincronização
   automática por hora, via GitHub Actions, ou o botão "Sincronizar Melvin"
   nas telas de Ordens/Ativos/Solicitações/Planos, já deixaram ali) e
   atualiza o relógio de "tela carregada às". Buscar dado novo de verdade no
   Melvin continua só por esses outros caminhos — ver js/melvinSync.js.
   ========================================================================== */

const PD_SEM_EXECUTANTE = 'Sem executante definido';

// Mapeamento de cor/rótulo SÓ para esta tela: o app já tem App.badgeForStatus
// (js/app.js) pra colorir status em outras telas, mas a paleta pedida aqui é
// diferente da dele (lá 'Aberta' é info/azul e 'Em Andamento' é warning/
// âmbar; aqui o pedido é o oposto: Pendente=âmbar, Em execução=azul) —
// reaproveitar/alterar App.badgeForStatus mudaria a cor das OS já existentes
// em Ordens de Serviço e no Dashboard, então este mapa fica local, só pra
// remapear o RÓTULO e a COR exibidos nesta grade (o campo `status` salvo na
// OS continua intacto, com o vocabulário de sempre).
const PD_STATUS_INFO = {
  'Concluída': { label: 'Concluída', cor: 'success', dot: '✓' },
  'Em Andamento': { label: 'Em execução', cor: 'info', dot: '▶' },
  'Aberta': { label: 'Pendente', cor: 'warning', dot: '•' },
  'Cancelada': { label: 'Impedida', cor: 'danger', dot: '⚠' },
};
function pdStatusInfo(status) {
  return PD_STATUS_INFO[status] || { label: status || '—', cor: 'neutral', dot: '•' };
}

const PD_DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function pdDiaAbrev(dataISO) {
  return PD_DIAS_ABREV[new Date(dataISO + 'T00:00:00').getDay()];
}

function pdOrdensComDia() {
  return Store.all('ordens').filter(o => o.melvinId && o.dataProgramada);
}

function pdDiasDisponiveis() {
  return [...new Set(pdOrdensComDia().map(o => o.dataProgramada))].sort();
}

// Dia padrão ao abrir a tela: hoje, se tiver OS programada; senão o dia
// disponível mais recente que já passou; senão o primeiro dia disponível
// (dados só no futuro); senão hoje mesmo (sem dado nenhum — mostra o estado
// vazio em vez de inventar um dia qualquer).
function pdDiaPadrao() {
  const dias = pdDiasDisponiveis();
  const hoje = new Date().toISOString().slice(0, 10);
  if (!dias.length) return hoje;
  if (dias.includes(hoje)) return hoje;
  const anteriores = dias.filter(d => d <= hoje);
  return anteriores.length ? anteriores[anteriores.length - 1] : dias[0];
}

let _pdFiltro = { dia: null, planta: '', executante: '', status: '', busca: '' };
let _pdBuscaTimer = null;

function pdRenderOsItem(o) {
  const info = pdStatusInfo(o.status);
  const ativoLabel = [o.tagAtivo, o.nomeAtivo].filter(Boolean).join(' · ') || '—';
  return `
    <div style="padding:10px 0;border-bottom:1px solid var(--border-soft);">
      <div class="flex-between" style="gap:8px;flex-wrap:wrap;">
        <span class="cell-tag">${escapeHtml(o.numero || '')}</span>
        ${o.planta ? `<span class="badge badge-neutral">${escapeHtml(o.planta)}</span>` : ''}
      </div>
      <div style="font-size:13px;margin:4px 0;">${escapeHtml(o.descricao || '')}</div>
      <div class="flex-between" style="gap:8px;flex-wrap:wrap;">
        <span class="cell-tag">${escapeHtml(ativoLabel)}</span>
        <span class="cell-tag">${o.horasPrevistas || 0}h</span>
      </div>
      <div style="margin-top:6px;"><span class="badge badge-${info.cor}">${info.label}</span></div>
    </div>`;
}

function pdRenderCardExecutante(nome, ordensDoExecutante) {
  const contagem = { 'Concluída': 0, 'Em Andamento': 0, 'Aberta': 0, 'Cancelada': 0 };
  ordensDoExecutante.forEach(o => { if (contagem[o.status] !== undefined) contagem[o.status]++; });
  return `
    <div class="card">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(nome)}</h3>
          <div class="cell-tag">${ordensDoExecutante.length} OS no dia</div>
        </div>
      </div>
      <div class="flex gap-8" style="margin-bottom:10px;flex-wrap:wrap;font-size:12px;">
        <span style="color:var(--success);">✓ ${contagem['Concluída']}</span>
        <span style="color:var(--info);">▶ ${contagem['Em Andamento']}</span>
        <span style="color:var(--warning);">• ${contagem['Aberta']}</span>
        <span style="color:var(--danger);">⚠ ${contagem['Cancelada']}</span>
      </div>
      <div>${ordensDoExecutante.map(pdRenderOsItem).join('')}</div>
    </div>`;
}

function pdKpiCard(label, value, sub) {
  return `<div class="card" style="padding:12px 14px;">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" style="font-size:22px;">${value}</div>
    ${sub ? `<div class="text-muted" style="font-size:11.5px;margin-top:2px;">${sub}</div>` : ''}
  </div>`;
}

Views.programacaoDia = {
  title: 'Programação do Dia',
  render() {
    const dias = pdDiasDisponiveis();
    const diaAtual = (_pdFiltro.dia && dias.includes(_pdFiltro.dia)) ? _pdFiltro.dia : pdDiaPadrao();
    const idx = dias.indexOf(diaAtual);
    const temAnterior = idx > 0;
    const temProximo = idx >= 0 && idx < dias.length - 1;

    const ordensDoDia = pdOrdensComDia().filter(o => o.dataProgramada === diaAtual);

    // Opções dos dois dropdowns — só os valores que de fato aparecem neste dia.
    const plantas = [...new Set(ordensDoDia.map(o => o.planta).filter(Boolean))].sort();
    const temSemExecutante = ordensDoDia.some(o => !o.executante);
    const executantesOpts = [...new Set(ordensDoDia.map(o => o.executante).filter(Boolean))].sort();
    if (temSemExecutante) executantesOpts.push(PD_SEM_EXECUTANTE);

    // KPIs e "Avanço do dia" são sobre o dia INTEIRO (não sofrem os filtros
    // de busca/pill/planta/executante abaixo — representam a "foto do dia";
    // os filtros abaixo servem só pra achar uma OS específica dentro dele).
    const total = ordensDoDia.length;
    const contagemDia = { 'Concluída': 0, 'Em Andamento': 0, 'Aberta': 0, 'Cancelada': 0 };
    ordensDoDia.forEach(o => { if (contagemDia[o.status] !== undefined) contagemDia[o.status]++; });
    const pct = n => total ? Math.round((n / total) * 100) : 0;
    const avanco = pct(contagemDia['Concluída']);

    // Filtros combinados (planta / executante / status / busca), todos em
    // AND — mesmo idioma de _osFiltro/_solFiltro (js/ordens.js, js/solicitacoes.js).
    const busca = (_pdFiltro.busca || '').trim().toLowerCase();
    const ordensFiltradas = ordensDoDia.filter(o => {
      if (_pdFiltro.planta && (o.planta || '') !== _pdFiltro.planta) return false;
      const exec = o.executante || PD_SEM_EXECUTANTE;
      if (_pdFiltro.executante && exec !== _pdFiltro.executante) return false;
      if (_pdFiltro.status && o.status !== _pdFiltro.status) return false;
      if (busca) {
        const alvo = `${o.numero || ''} ${o.nomeAtivo || ''} ${o.tagAtivo || ''}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });

    // Agrupa (já filtrado) por executante — "Sem executante definido" sempre por último.
    const porExecutante = {};
    ordensFiltradas.forEach(o => {
      const chave = o.executante || PD_SEM_EXECUTANTE;
      (porExecutante[chave] = porExecutante[chave] || []).push(o);
    });
    const executantesExibidos = Object.keys(porExecutante).sort((a, b) => {
      if (a === PD_SEM_EXECUTANTE) return 1;
      if (b === PD_SEM_EXECUTANTE) return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    const statusPillOpts = ['Aberta', 'Em Andamento', 'Concluída', 'Cancelada'];

    // "Tela carregada às HH:MM" — a tela não finge saber quando o Melvin
    // sincronizou de verdade pela última vez (isso só existe no log do
    // GitHub Actions); o que dá pra mostrar honestamente é o horário em que
    // ESTE render aconteceu, que é recalculado toda vez que "Atualizar" roda.
    const horaCarregamento = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="view-head">
        <div>
          <h1>Programação de Manutenção</h1>
          <div class="sub">Painel Diário por Executante</div>
        </div>
        <div class="view-actions">
          <button class="btn" id="btnAtualizarProgDia">${Icon('refresh', 15)} Atualizar</button>
        </div>
      </div>

      <div class="card" style="padding:12px 16px;margin-bottom:18px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
          <div class="flex" style="gap:10px;align-items:center;">
            <button class="btn btn-sm" id="btnPdDiaAnterior" ${temAnterior ? '' : 'disabled'}>${Icon('arrow-left', 14)}</button>
            <div style="font-weight:700;font-size:14px;min-width:160px;">${dias.length ? `${App.fmtDate(diaAtual)} (${pdDiaAbrev(diaAtual)})` : 'Nenhum dia com OS programada'}</div>
            <button class="btn btn-sm" id="btnPdDiaProximo" ${temProximo ? '' : 'disabled'}>${Icon('arrow-right', 14)}</button>
          </div>
          <div class="flex" style="gap:8px;flex-wrap:wrap;">
            <select id="pdFiltroPlanta" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:12.5px;">
              <option value="">Todas as plantas</option>
              ${plantas.map(p => `<option value="${escapeHtml(p)}" ${_pdFiltro.planta === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
            </select>
            <select id="pdFiltroExecutante" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:12.5px;">
              <option value="">Todos os executantes</option>
              ${executantesOpts.map(e => `<option value="${escapeHtml(e)}" ${_pdFiltro.executante === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:18px;">
        ${pdKpiCard('Total de OS', total)}
        ${pdKpiCard('Concluídas', contagemDia['Concluída'], `${pct(contagemDia['Concluída'])}% do dia`)}
        ${pdKpiCard('Em execução', contagemDia['Em Andamento'], `${pct(contagemDia['Em Andamento'])}% do dia`)}
        ${pdKpiCard('Pendentes', contagemDia['Aberta'], `${pct(contagemDia['Aberta'])}% do dia`)}
        ${pdKpiCard('Impedidas', contagemDia['Cancelada'], `${pct(contagemDia['Cancelada'])}% do dia`)}
      </div>

      <div class="card" style="margin-bottom:22px;">
        <div class="flex-between" style="margin-bottom:8px;">
          <div class="kpi-label">Avanço do dia</div>
          <span style="font-weight:700;font-size:18px;color:var(--success);">${total ? avanco + '%' : '—'}</span>
        </div>
        <div class="progress"><div class="progress-bar success" style="width:${avanco}%;"></div></div>
        <div class="cell-tag" style="margin-top:8px;">${total ? `${contagemDia['Concluída']} de ${total} OS concluídas` : 'Nenhuma OS programada para este dia'}</div>
      </div>

      <div class="view-head" style="margin-bottom:12px;">
        <div><h3 style="font-size:16px;">Ordens de Serviço por Executante</h3></div>
      </div>

      <div class="field" style="position:relative;max-width:380px;margin-bottom:14px;">
        <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);display:flex;">${Icon('search', 14)}</span>
        <input id="pdBusca" placeholder="Pesquisar OS, equipamento ou tag..." value="${escapeHtml(_pdFiltro.busca)}"
          style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:9px 12px 9px 34px;color:var(--text);font-size:13px;box-sizing:border-box;">
      </div>

      <div class="pill-filter" style="margin-bottom:18px;">
        <span class="pill ${!_pdFiltro.status ? 'active' : ''}" data-pd-status="">Todos</span>
        ${statusPillOpts.map(s => `<span class="pill ${_pdFiltro.status === s ? 'active' : ''}" data-pd-status="${s}">${pdStatusInfo(s).label}</span>`).join('')}
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-bottom:20px;">
        ${executantesExibidos.length
          ? executantesExibidos.map(nome => pdRenderCardExecutante(nome, porExecutante[nome])).join('')
          : `<div class="empty">${Icon('clipboard', 30)}<span>Nenhuma OS encontrada para os filtros aplicados.</span></div>`}
      </div>

      <div class="card">
        <div class="flex-between" style="flex-wrap:wrap;gap:14px;">
          <div style="font-size:13px;font-weight:600;">${Icon('target', 15)} Objetivo do dia: Executar ${total} OS programada${total === 1 ? '' : 's'}</div>
          <div class="legend">
            <div class="legend-item"><span class="legend-dot" style="background:var(--success)"></span>Concluída</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--info)"></span>Em execução</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--warning)"></span>Pendente</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--danger)"></span>Impedida</div>
          </div>
          <div class="cell-tag">Tela carregada às ${horaCarregamento}</div>
        </div>
      </div>
    `;
  },
  afterRender() {
    const dias = pdDiasDisponiveis();
    const diaAtual = (_pdFiltro.dia && dias.includes(_pdFiltro.dia)) ? _pdFiltro.dia : pdDiaPadrao();
    const idx = dias.indexOf(diaAtual);

    document.getElementById('btnAtualizarProgDia').addEventListener('click', () => App.navigate('programacaoDia', true));

    document.getElementById('btnPdDiaAnterior')?.addEventListener('click', () => {
      if (idx > 0) { _pdFiltro.dia = dias[idx - 1]; App.navigate('programacaoDia', true); }
    });
    document.getElementById('btnPdDiaProximo')?.addEventListener('click', () => {
      if (idx >= 0 && idx < dias.length - 1) { _pdFiltro.dia = dias[idx + 1]; App.navigate('programacaoDia', true); }
    });

    document.getElementById('pdFiltroPlanta').addEventListener('change', (e) => {
      _pdFiltro.planta = e.target.value;
      App.navigate('programacaoDia', true);
    });
    document.getElementById('pdFiltroExecutante').addEventListener('change', (e) => {
      _pdFiltro.executante = e.target.value;
      App.navigate('programacaoDia', true);
    });

    document.querySelectorAll('[data-pd-status]').forEach(p => p.addEventListener('click', () => {
      _pdFiltro.status = p.dataset.pdStatus;
      App.navigate('programacaoDia', true);
    }));

    document.getElementById('pdBusca').addEventListener('input', (e) => {
      _pdFiltro.busca = e.target.value;
      clearTimeout(_pdBuscaTimer);
      // Mesma pausa de digitação usada em Estoque (js/estoque.js #estBusca) —
      // evita refazer a grade inteira a cada tecla.
      _pdBuscaTimer = setTimeout(() => {
        App.navigate('programacaoDia', true);
        const inp = document.getElementById('pdBusca');
        if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
      }, 400);
    });
  },
};
