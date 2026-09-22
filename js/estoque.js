/* ==========================================================================
   FertGrow CMMS — Estoque de Peças
   Modelo alinhado à planilha exportada do ERP: Produto, Armazém, Descrição,
   Saldo Atual, Sld.Atu. (saldo valorizado), Custo Unitário, Custo Unit. FIFO1,
   Grupo, Cód. Produto, Status Sld. Ver Importacao.abrirModalImportEstoque.
   Cada coluna da tabela tem um filtro estilo Excel (clique no ícone de funil
   no cabeçalho): lista de valores únicos com busca + ordenação A→Z / Z→A.
   ========================================================================== */

const ESTOQUE_COLS = [
  { key: 'codigo', label: 'Produto' },
  { key: 'armazem', label: 'Armazém' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'grupo', label: 'Grupo' },
  { key: 'qtdAtual', label: 'Saldo Atual' },
  { key: 'saldoAtualizado', label: 'Sld. Atualizado', money: true },
  { key: 'custoUnitario', label: 'C. Unitário', money: true },
  { key: 'custoUnitarioFifo1', label: 'C. Unit. FIFO1', money: true },
  { key: 'statusSaldo', label: 'Status Sld.' },
];

let _estFiltros = {};     // { [colKey]: Set<string> de chaves selecionadas } — ausente = sem filtro
let _estOrdenacao = null; // { key, dir: 'asc'|'desc' }
let _estBusca = '';       // busca livre por descrição ou código
let _estSelecionados = new Set(); // ids marcados para Solicitação de Compra
let _estAba = 'itens';             // 'itens' | 'solicitacoes' — sub-abas da tela de Estoque
let _estBuscaTimer = null;         // debounce da busca — evita reconstruir a tabela a cada tecla
const TIPOS_SC = ['Material Novo', 'Parada de Manutenção', 'Manutenção Programada', 'Projeto', 'Locação', 'Laudo/Engenharia'];

// Filtro/ordenação sobrevivem a um reload da página (ficam salvos no navegador).
const ESTOQUE_FILTROS_KEY = 'fertgrow_estoque_filtros_v1';
(function carregarFiltrosSalvos() {
  try {
    const raw = localStorage.getItem(ESTOQUE_FILTROS_KEY);
    if (!raw) return;
    const salvo = JSON.parse(raw);
    Object.entries(salvo.filtros || {}).forEach(([k, arr]) => { _estFiltros[k] = new Set(arr); });
    _estOrdenacao = salvo.ordenacao || null;
  } catch (e) { console.warn('Falha ao carregar filtros salvos do estoque.', e); }
})();
function salvarFiltros() {
  const filtros = {};
  Object.entries(_estFiltros).forEach(([k, set]) => { filtros[k] = [...set]; });
  localStorage.setItem(ESTOQUE_FILTROS_KEY, JSON.stringify({ filtros, ordenacao: _estOrdenacao }));
}

Views.estoque = {
  title: 'Estoque',
  render() {
    const todos = Store.all('estoque');
    const idsValidos = new Set(todos.map(i => i.id));
    _estSelecionados.forEach(id => { if (!idsValidos.has(id)) _estSelecionados.delete(id); }); // limpa seleção de itens excluídos
    const itens = aplicarFiltrosOrdenacao(todos);
    // Desenhar milhares de linhas de uma vez é o que deixa a tela lenta pra reconstruir
    // (ex.: ao apagar a busca e o resultado voltar a ficar perto do total). Mostra só as
    // primeiras N e pede pra refinar a busca/filtro em vez de travar redesenhando tudo.
    const LIMITE_LINHAS_ESTOQUE = 300;
    const itensExibidos = itens.slice(0, LIMITE_LINHAS_ESTOQUE);
    const semSaldo = Store.estoqueSemSaldo();
    const valorTotal = itens.reduce((s, i) => s + i.qtdAtual * i.custoUnitario, 0);
    const temFiltro = Object.keys(_estFiltros).length > 0 || !!_estOrdenacao || !!_estBusca;
    // As abas Solicitações/Projetos precisam de dados montados/ordenados (mapa código→custo
    // varrendo estoque + serviços inteiros, e as duas listas ordenadas) — isso só é montado
    // quando alguma dessas abas está ativa. Na aba "Itens" (onde é feita a busca), usa as
    // listas cruas só pra contar nas etiquetas das abas, sem gastar tempo montando o resto a
    // cada letra digitada.
    const precisaDadosPesados = _estAba !== 'itens';
    const solicitacoes = precisaDadosPesados
      ? [...Store.all('solicitacoesCompra')].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || 0) - (a.criadoEm || 0))
      : Store.all('solicitacoesCompra');
    const projetos = precisaDadosPesados
      ? [...Store.all('projetos')].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      : Store.all('projetos');
    const custoPorCodigo = new Map();
    if (precisaDadosPesados) {
      todos.forEach(i => { if (i.codigo) custoPorCodigo.set(i.codigo, i.custoUnitario || 0); });
      Store.all('servicos').forEach(s => { if (s.codigo) custoPorCodigo.set(s.codigo, s.custoUnitario || 0); });
    }

    return `
      <div class="view-head">
        <div><h1>Estoque de Peças</h1><div class="sub">${itens.length}${itens.length !== todos.length ? ' de ' + todos.length : ''} itens · valor total imobilizado ${App.fmtMoney(valorTotal)}</div></div>
        <div class="view-actions">
          ${temFiltro ? `<button class="btn btn-sm" id="btnLimparFiltrosEstoque">${Icon('x',14)} Limpar filtros</button>` : ''}
          <button class="btn" id="btnImportEstoque">${Icon('upload',15)} Importar Planilha</button>
          <button class="btn btn-accent" id="btnSolicitarCompra" ${_estSelecionados.size ? '' : 'disabled'}>${Icon('mail',15)} Solicitar Compra${_estSelecionados.size ? ` (${_estSelecionados.size})` : ''}</button>
          <button class="btn btn-primary" id="btnNovoItem">${Icon('plus',15)} Novo Item</button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${_estAba === 'itens' ? 'active' : ''}" data-estaba="itens">Itens em Estoque</div>
        <div class="tab ${_estAba === 'solicitacoes' ? 'active' : ''}" data-estaba="solicitacoes">Solicitações de Compra${solicitacoes.length ? ` (${solicitacoes.length})` : ''}</div>
        <div class="tab ${_estAba === 'projetos' ? 'active' : ''}" data-estaba="projetos">Projetos${projetos.length ? ` (${projetos.length})` : ''}</div>
      </div>

      <div id="pane-est-itens" class="${_estAba === 'itens' ? '' : 'hidden'}">
        <div class="field" style="position:relative;max-width:380px;margin-bottom:16px;">
          <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);display:flex;">${Icon('search',14)}</span>
          <input id="estBusca" placeholder="Buscar por descrição ou código..." value="${escapeHtml(_estBusca)}"
            style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:9px 12px 9px 34px;color:var(--text);font-size:13px;box-sizing:border-box;">
        </div>

        ${semSaldo.length ? `<div class="card" style="margin-bottom:16px;border-color:rgba(242,73,92,.4);">
          <div class="flex" style="gap:10px;align-items:center;color:var(--danger);font-weight:600;font-size:13px;">${Icon('alert',18)} ${semSaldo.length} item(ns) sem saldo em estoque</div>
        </div>` : ''}

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:34px;"><input type="checkbox" id="estSelAll" ${itensExibidos.length && itensExibidos.every(i => _estSelecionados.has(i.id)) ? 'checked' : ''}></th>
              ${ESTOQUE_COLS.map(c => `<th>${thColuna(c)}</th>`).join('')}<th></th></tr></thead>
            <tbody>
              ${itensExibidos.map(i => `
                <tr class="${_estSelecionados.has(i.id) ? 'row-selected' : ''}">
                  <td><input type="checkbox" class="row-check" data-check-item="${i.id}" ${_estSelecionados.has(i.id) ? 'checked' : ''}></td>
                  <td class="cell-tag">
                    <span class="flex" style="gap:6px;align-items:center;">
                      ${i.codigo}
                      <button type="button" class="btn btn-sm" style="padding:3px 6px;" data-copiar-codigo="${escapeHtml(i.codigo)}" title="Copiar código">${Icon('clipboard', 12)}</button>
                    </span>
                  </td>
                  <td>${i.armazem || '—'}</td>
                  <td><strong>${i.descricao}</strong></td>
                  <td class="cell-tag">${i.grupo || '—'}</td>
                  <td>${saldoBadge(i)}</td>
                  <td>${App.fmtMoney(i.saldoAtualizado || 0)}</td>
                  <td>${App.fmtMoney(i.custoUnitario)}</td>
                  <td>${i.custoUnitarioFifo1 ? App.fmtMoney(i.custoUnitarioFifo1) : '—'}</td>
                  <td>${i.statusSaldo || '—'}</td>
                  <td><div class="row-actions">
                    <button class="btn btn-sm" data-solicitar-item="${i.id}" title="Solicitar compra deste item">${Icon('mail',14)}</button>
                    <button class="btn btn-sm" data-edit-item="${i.id}">${Icon('edit',14)}</button>
                    <button class="btn btn-sm btn-danger" data-del-item="${i.id}">${Icon('trash',14)}</button>
                  </div></td>
                </tr>`).join('') || `<tr><td colspan="${ESTOQUE_COLS.length + 2}"><div class="empty">${Icon('layers',30)}<span>${todos.length ? 'Nenhum item corresponde aos filtros aplicados.' : 'Nenhum item cadastrado. Importe a planilha do ERP ou cadastre manualmente.'}</span></div></td></tr>`}
            </tbody>
          </table>
        </div>
        ${itens.length > LIMITE_LINHAS_ESTOQUE ? `<div class="text-muted" style="font-size:12px;margin-top:8px;">Mostrando ${LIMITE_LINHAS_ESTOQUE} de ${itens.length} itens — refine a busca ou os filtros para ver o restante.</div>` : ''}
      </div>

      <div id="pane-est-solicitacoes" class="${_estAba === 'solicitacoes' ? '' : 'hidden'}">
        ${_estAba === 'solicitacoes' ? renderPaneSolicitacoes(solicitacoes, custoPorCodigo) : ''}
      </div>

      <div id="pane-est-projetos" class="${_estAba === 'projetos' ? '' : 'hidden'}">
        ${_estAba === 'projetos' ? renderPaneProjetos(projetos, solicitacoes, custoPorCodigo) : ''}
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnNovoItem').addEventListener('click', () => abrirFormItem());
    document.getElementById('btnImportEstoque').addEventListener('click', () => Importacao.abrirModalImportEstoque());
    document.getElementById('btnLimparFiltrosEstoque')?.addEventListener('click', () => {
      _estFiltros = {}; _estOrdenacao = null; _estBusca = '';
      salvarFiltros();
      App.navigate('estoque', true);
    });
    document.getElementById('estBusca').addEventListener('input', (e) => {
      _estBusca = e.target.value;
      clearTimeout(_estBuscaTimer);
      // Só reconstrói a tabela depois de uma pequena pausa na digitação — assim
      // apagar o texto e digitar outro nome não refaz a lista inteira a cada tecla.
      _estBuscaTimer = setTimeout(() => {
        App.navigate('estoque', true);
        const inp = document.getElementById('estBusca');
        if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
      }, 500);
    });
    document.querySelectorAll('[data-colfilter]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirPopoverFiltro(b.dataset.colfilter, b);
    }));
    document.querySelectorAll('[data-copiar-codigo]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copiarTextoSimples(b.dataset.copiarCodigo);
      App.toast(ok ? `Código "${b.dataset.copiarCodigo}" copiado.` : 'Não foi possível copiar o código.', ok ? 'success' : 'danger');
    }));
    document.querySelectorAll('[data-edit-item]').forEach(b => b.addEventListener('click', () => abrirFormItem(b.dataset.editItem)));
    document.querySelectorAll('[data-del-item]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir este item do estoque?', () => { Store.remove('estoque', b.dataset.delItem); App.toast('Item excluído.', 'success'); });
    }));

    document.querySelectorAll('[data-solicitar-item]').forEach(b => b.addEventListener('click', () => abrirModalSolicitacaoCompra([b.dataset.solicitarItem])));
    document.getElementById('btnSolicitarCompra')?.addEventListener('click', () => abrirModalSolicitacaoCompra([..._estSelecionados]));

    document.querySelectorAll('.row-check').forEach(cb => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.checkItem;
      if (e.target.checked) _estSelecionados.add(id); else _estSelecionados.delete(id);
      e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
      atualizarBarraSelecaoEstoque();
    }));
    document.getElementById('estSelAll')?.addEventListener('change', (e) => {
      document.querySelectorAll('.row-check').forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) _estSelecionados.add(cb.dataset.checkItem); else _estSelecionados.delete(cb.dataset.checkItem);
        cb.closest('tr').classList.toggle('row-selected', e.target.checked);
      });
      atualizarBarraSelecaoEstoque();
    });

    document.querySelectorAll('[data-estaba]').forEach(t => t.addEventListener('click', () => {
      _estAba = t.dataset.estaba;
      App.navigate('estoque', true);
    }));
    document.querySelectorAll('.scNumeroInput').forEach(inp => inp.addEventListener('change', (e) => {
      Store.update('solicitacoesCompra', e.target.dataset.scId, { numeroSC: e.target.value.trim() });
      App.toast('Nº da SC salvo.', 'success');
    }));
    document.querySelectorAll('[data-informar-sc-solic]').forEach(b => b.addEventListener('click', () => abrirInformarSCSolicitacao(b.dataset.informarScSolic)));
    document.querySelectorAll('[data-ver-sc]').forEach(b => b.addEventListener('click', () => abrirDetalheSC(b.dataset.verSc)));
    document.querySelectorAll('[data-del-sc]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir este registro de solicitação de compra? Isso não afeta um e-mail já enviado.', () => {
        Store.remove('solicitacoesCompra', b.dataset.delSc);
        App.toast('Registro excluído.', 'success');
      });
    }));

    document.getElementById('btnNovoProjeto')?.addEventListener('click', () => abrirFormProjeto());
    document.querySelectorAll('[data-edit-projeto]').forEach(b => b.addEventListener('click', () => abrirFormProjeto(b.dataset.editProjeto)));
    document.querySelectorAll('[data-del-projeto]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir este projeto? Solicitações já registradas com ele mantêm os dados que já foram salvos.', () => {
        Store.remove('projetos', b.dataset.delProjeto);
        App.toast('Projeto excluído.', 'success');
      });
    }));
  },
};

// Atualiza só o botão "Solicitar Compra" (contador/estado), sem refazer a tabela inteira.
function atualizarBarraSelecaoEstoque() {
  const btn = document.getElementById('btnSolicitarCompra');
  if (!btn) return;
  const n = _estSelecionados.size;
  btn.disabled = n === 0;
  btn.innerHTML = `${Icon('mail', 15)} Solicitar Compra${n ? ` (${n})` : ''}`;
}

// ------------------------------------------------- Projetos e valor solicitado
// Valor de uma solicitação = soma de (qtde × custo unitário ATUAL do item no
// estoque). É uma estimativa pelo preço de hoje, não o preço no momento em
// que a solicitação foi feita (o app não guarda histórico de preço por item).
function custoItemPorCodigo(codigo, cache) {
  if (cache) return cache.get(codigo) || 0;
  const item = Store.all('estoque').find(e => e.codigo === codigo) || Store.all('servicos').find(e => e.codigo === codigo);
  return item ? (item.custoUnitario || 0) : 0;
}
function valorSolicitacao(s, cache) {
  return (s.itens || []).reduce((soma, it) => soma + (Number(it.qtde) || 0) * custoItemPorCodigo(it.codigo, cache), 0);
}
function nomeProjetoDaSolicitacao(s) {
  if (s.tipo !== 'Projeto') return '—';
  if (s.projetoId) { const p = Store.get('projetos', s.projetoId); if (p) return p.nome; }
  return s.centroCusto || s.conta ? 'Projeto não cadastrado' : '—';
}

// Texto da coluna "Referência" na lista de solicitações — mostra Centro de
// Custo/Conta sempre que preenchidos (ex: "Projeto", "Parada de Manutenção"
// ou uma solicitação de Serviço, que exige os dois campos independente do tipo).
function referenciaSolicitacao(s) {
  if (!s.centroCusto && !s.conta && !s.projetoId) return '—';
  const partes = [];
  if (s.tipo === 'Projeto') partes.push(nomeProjetoDaSolicitacao(s));
  if (s.centroCusto) partes.push(`CC ${s.centroCusto}`);
  if (s.conta) partes.push(`Conta ${s.conta}`);
  return escapeHtml(partes.join(' · '));
}

// Painel com o valor total solicitado, quebrado por "Projeto" e "Parada de
// Manutenção" (as duas categorias com conta/centro de custo) e, dentro de
// "Projeto", comparando o Valor Orçado (cadastrado no projeto) com o Valor
// Solicitado até agora — para saber quanto do orçamento já foi usado.
function renderResumoSolicitacoes(solicitacoesTodas, cache) {
  const solicitacoes = solicitacoesTodas.filter(sc => sc.tipo === 'Projeto' || sc.tipo === 'Parada de Manutenção');
  const projetos = Store.all('projetos');
  if (!solicitacoes.length && !projetos.length) return '';

  const valorGeral = solicitacoes.reduce((s, sc) => s + valorSolicitacao(sc, cache), 0);
  const valorOrcadoTotal = projetos.reduce((s, p) => s + (p.valorOrcado || 0), 0);

  const porTipo = {};
  solicitacoes.forEach(sc => {
    const chave = sc.tipo || '—';
    if (!porTipo[chave]) porTipo[chave] = { qtd: 0, valor: 0 };
    porTipo[chave].qtd++;
    porTipo[chave].valor += valorSolicitacao(sc, cache);
  });

  // Começa com todos os projetos cadastrados (mostra o orçamento mesmo antes
  // da primeira solicitação) e soma o que já foi pedido com cada projetoId.
  // Solicitações do tipo "Projeto" sem projeto cadastrado (escolheram "Outro")
  // entram como linhas extras, sem orçamento para comparar.
  const porProjeto = {};
  projetos.forEach(p => { porProjeto[p.id] = { nome: p.nome, qtd: 0, valor: 0, orcado: p.valorOrcado || 0 }; });
  solicitacoes.filter(sc => sc.tipo === 'Projeto').forEach(sc => {
    const chave = sc.projetoId || `livre:${sc.centroCusto}|${sc.conta}|${sc.codigoValor}`;
    if (!porProjeto[chave]) porProjeto[chave] = { nome: nomeProjetoDaSolicitacao(sc), qtd: 0, valor: 0, orcado: null };
    porProjeto[chave].qtd++;
    porProjeto[chave].valor += valorSolicitacao(sc, cache);
  });
  const listaProjetos = Object.values(porProjeto).sort((a, b) => b.valor - a.valor);

  return `
    <div class="section-title">Painel de Solicitações</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="card" style="padding:14px;">
        <div class="kpi-label">Valor Total Orçado</div>
        <div class="kpi-value" style="font-size:21px;">${App.fmtMoney(valorOrcadoTotal)}</div>
        <div class="text-muted" style="font-size:11px;margin-top:2px;">${projetos.length} projeto(s) cadastrado(s)</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="kpi-label">Valor Total Solicitado</div>
        <div class="kpi-value" style="font-size:21px;">${App.fmtMoney(valorGeral)}</div>
        <div class="text-muted" style="font-size:11px;margin-top:2px;">${solicitacoes.length} solicitação(ões)</div>
      </div>
      ${Object.entries(porTipo).map(([tipo, dado]) => `
        <div class="card" style="padding:14px;">
          <div class="kpi-label">${escapeHtml(tipo)}</div>
          <div class="kpi-value" style="font-size:18px;">${App.fmtMoney(dado.valor)}</div>
          <div class="text-muted" style="font-size:11px;margin-top:2px;">${dado.qtd} solicitação(ões)</div>
        </div>`).join('')}
    </div>
    ${listaProjetos.length ? `
      <div class="section-title">Orçamento por Projeto</div>
      <div class="table-wrap" style="margin-bottom:22px;">
        <table>
          <thead><tr><th>Projeto</th><th>Nº de Solicitações</th><th>Valor Orçado</th><th>Valor Solicitado</th><th>Saldo</th></tr></thead>
          <tbody>${listaProjetos.map(p => {
            const temOrcado = p.orcado !== null;
            const saldo = temOrcado ? p.orcado - p.valor : null;
            const saldoHtml = !temOrcado ? '<span class="text-muted">—</span>'
              : saldo < 0 ? `<span class="badge badge-danger">Estourado em ${App.fmtMoney(Math.abs(saldo))}</span>`
              : App.fmtMoney(saldo);
            return `<tr>
              <td><strong>${escapeHtml(p.nome)}</strong></td>
              <td>${p.qtd}</td>
              <td>${temOrcado ? App.fmtMoney(p.orcado) : '<span class="text-muted">—</span>'}</td>
              <td>${App.fmtMoney(p.valor)}</td>
              <td>${saldoHtml}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : ''}
  `;
}

// Conteúdo das abas "Solicitações" e "Projetos" só é montado quando a aba
// está de fato visível — evita recalcular tudo isso a cada letra digitada
// na busca da aba "Itens" (que dispara um render completo da view).
function renderPaneSolicitacoes(solicitacoes, cache) {
  return `
    <div class="section-title">Histórico de Solicitações</div>
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">Cada solicitação enviada por e-mail fica registrada aqui. Preencha o <strong>Nº da SC</strong> quando o número sair no ERP — o campo salva automaticamente.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Nº da SC</th><th>Tipo</th><th>Referência</th><th>Itens</th><th>Valor</th><th>Solicitante</th><th></th></tr></thead>
        <tbody>
          ${solicitacoes.map(s => `
            <tr>
              <td style="white-space:nowrap;">${App.fmtDate(s.data)}</td>
              <td><input type="text" class="scNumeroInput" data-sc-id="${s.id}" value="${escapeHtml(s.numeroSC || '')}" placeholder="preencher depois"
                style="width:130px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12.5px;box-sizing:border-box;"></td>
              <td><span class="badge badge-accent">${escapeHtml(s.tipo || '—')}</span></td>
              <td class="text-muted" style="font-size:12px;">${referenciaSolicitacao(s)}</td>
              <td>${(s.itens || []).map(it => `<span class="cell-tag">${escapeHtml(it.codigo)}</span>`).join(' ')}
                <span class="text-muted" style="font-size:11.5px;">(${(s.itens || []).length} ${(s.itens || []).length === 1 ? 'item' : 'itens'})</span></td>
              <td>${App.fmtMoney(valorSolicitacao(s, cache))}</td>
              <td>${escapeHtml(s.solicitante || '—')}</td>
              <td><div class="row-actions">
                <button class="btn btn-sm" data-informar-sc-solic="${s.id}" title="Informar SC / Fornecedor">${Icon('mail',14)}</button>
                <button class="btn btn-sm" data-ver-sc="${s.id}" title="Ver detalhes">${Icon('eye',14)}</button>
                <button class="btn btn-sm btn-danger" data-del-sc="${s.id}" title="Excluir registro">${Icon('trash',14)}</button>
              </div></td>
            </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('mail',30)}<span>Nenhuma solicitação de compra registrada ainda. Use o botão "Solicitar Compra" na aba de Itens.</span></div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderPaneProjetos(projetos, solicitacoes, cache) {
  return `
    ${renderResumoSolicitacoes(solicitacoes, cache)}
    <div class="section-title">Projetos Cadastrados</div>
    <div class="view-actions" style="justify-content:flex-end;margin-bottom:16px;">
      <button class="btn btn-primary" id="btnNovoProjeto">${Icon('plus',15)} Novo Projeto</button>
    </div>
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">Cadastre aqui os projetos com sua Conta, Centro de Custo e Código de Valor — ao solicitar compra do tipo "Projeto", basta escolher o projeto na lista, sem digitar tudo de novo.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Projeto</th><th>Centro de Custo</th><th>Conta</th><th>Código de Valor</th><th>Valor Orçado</th><th></th></tr></thead>
        <tbody>
          ${projetos.map(p => `
            <tr>
              <td><strong>${escapeHtml(p.nome)}</strong></td>
              <td class="cell-tag">${escapeHtml(p.centroCusto || '—')}</td>
              <td class="cell-tag">${escapeHtml(p.conta || '—')}</td>
              <td class="cell-tag">${escapeHtml(p.codigoValor || '—')}</td>
              <td>${App.fmtMoney(p.valorOrcado || 0)}</td>
              <td><div class="row-actions">
                <button class="btn btn-sm" data-edit-projeto="${p.id}">${Icon('edit',14)}</button>
                <button class="btn btn-sm btn-danger" data-del-projeto="${p.id}">${Icon('trash',14)}</button>
              </div></td>
            </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${Icon('layers',30)}<span>Nenhum projeto cadastrado ainda.</span></div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function thColuna(col) {
  const ativo = !!_estFiltros[col.key] || (_estOrdenacao && _estOrdenacao.key === col.key);
  return `<span style="display:inline-flex;align-items:center;gap:4px;">${col.label}
    <button type="button" class="th-filter-btn" data-colfilter="${col.key}" title="Filtrar / ordenar"
      style="background:none;border:none;padding:2px;cursor:pointer;line-height:0;color:${ativo ? 'var(--accent)' : 'var(--text-muted)'};">${Icon('filter', 12)}</button>
  </span>`;
}

function saldoBadge(i) {
  const cls = i.qtdAtual <= 0 ? 'danger' : 'success';
  return `<span class="badge badge-${cls}">${i.qtdAtual} ${i.unidade || 'un'}</span>`;
}

// ------------------------------------------------------- Filtro estilo Excel
function valorChave(col, item) {
  return String(item[col.key] ?? '');
}
function formatarValorColuna(col, item) {
  const v = item[col.key];
  if (v === undefined || v === null || v === '') return '(vazio)';
  if (col.key === 'qtdAtual') return `${v} ${item.unidade || 'un'}`;
  if (col.money) return App.fmtMoney(v);
  return String(v);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Padroniza a capitalização de um texto digitado livremente (ex: descrição
// real do serviço, tipo de solicitação digitado manualmente) — evita que
// texto em CAIXA ALTA ou minúsculo demais vá pro assunto/corpo do e-mail
// sem padrão. Preposições/artigos comuns ficam em minúsculo, exceto na
// primeira palavra. Não corrige acentuação ausente — só a caixa das letras.
const PALAVRAS_MINUSCULAS_TITULO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'à', 'às']);
function capitalizarFrase(s) {
  if (!s) return s;
  return s.trim().toLowerCase().split(/\s+/).map((palavra, i) => {
    if (i > 0 && PALAVRAS_MINUSCULAS_TITULO.has(palavra)) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}

function aplicarFiltrosOrdenacao(itens) {
  let out = itens;
  const busca = _estBusca.trim().toLowerCase();
  if (busca) {
    out = out.filter(i => (i.descricao || '').toLowerCase().includes(busca)
      || (i.codigo || '').toLowerCase().includes(busca)
      || (i.codProduto || '').toLowerCase().includes(busca));
  }
  out = out.filter(i => ESTOQUE_COLS.every(c => {
    const set = _estFiltros[c.key];
    return !set || set.has(valorChave(c, i));
  }));
  if (_estOrdenacao) {
    const col = ESTOQUE_COLS.find(c => c.key === _estOrdenacao.key);
    const dir = _estOrdenacao.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const va = a[_estOrdenacao.key], vb = b[_estOrdenacao.key];
      const cmp = (col && col.key !== 'codigo' && col.key !== 'armazem' && col.key !== 'descricao' && col.key !== 'grupo' && col.key !== 'statusSaldo')
        ? (va || 0) - (vb || 0)
        : String(va || '').localeCompare(String(vb || ''), 'pt-BR');
      return cmp * dir;
    });
  }
  return out;
}

function fecharPopoverFiltro() {
  document.getElementById('colFilterPopover')?.remove();
}

function abrirPopoverFiltro(colKey, btnEl) {
  fecharPopoverFiltro();
  const col = ESTOQUE_COLS.find(c => c.key === colKey);
  if (!col) return;

  // Valores possíveis considerando os filtros já aplicados nas OUTRAS colunas
  // (assim o dropdown só mostra o que ainda pode aparecer na tabela).
  const baseItens = Store.all('estoque').filter(i => ESTOQUE_COLS.every(c => {
    if (c.key === colKey) return true;
    const set = _estFiltros[c.key];
    return !set || set.has(valorChave(c, i));
  }));
  const mapaValores = new Map();
  baseItens.forEach(i => { const ch = valorChave(col, i); if (!mapaValores.has(ch)) mapaValores.set(ch, formatarValorColuna(col, i)); });
  const todasChaves = [...mapaValores.keys()].sort((a, b) => (mapaValores.get(a) || '').localeCompare(mapaValores.get(b) || '', 'pt-BR'));
  const selecionadas = _estFiltros[colKey] ? new Set([..._estFiltros[colKey]].filter(ch => mapaValores.has(ch))) : new Set(todasChaves);

  const pop = document.createElement('div');
  pop.id = 'colFilterPopover';
  const rect = btnEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 256);
  pop.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${Math.max(8, left)}px;width:240px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-2);z-index:200;font-size:13px;`;
  pop.innerHTML = `
    <div style="padding:8px;border-bottom:1px solid var(--border-soft);display:flex;gap:6px;">
      <button class="btn btn-sm" data-sort="asc" style="flex:1;">A → Z</button>
      <button class="btn btn-sm" data-sort="desc" style="flex:1;">Z → A</button>
    </div>
    <div style="padding:8px;">
      <input type="text" id="colFilterSearch" placeholder="Buscar valor..." style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12.5px;box-sizing:border-box;">
    </div>
    <div style="max-height:220px;overflow-y:auto;padding:0 8px;">
      <label style="display:flex;gap:6px;align-items:center;padding:5px 2px;border-bottom:1px solid var(--border-soft);font-weight:600;cursor:pointer;">
        <input type="checkbox" id="colFilterAll" ${selecionadas.size === todasChaves.length ? 'checked' : ''}> (Selecionar Tudo)
      </label>
      <div id="colFilterList">
        ${todasChaves.map(ch => `<label data-label="${escapeHtml((mapaValores.get(ch) || '').toLowerCase())}" style="display:flex;gap:6px;align-items:center;padding:4px 2px;cursor:pointer;">
          <input type="checkbox" class="colFilterItem" value="${escapeHtml(ch)}" ${selecionadas.has(ch) ? 'checked' : ''}>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(mapaValores.get(ch))}</span>
        </label>`).join('') || '<div class="text-muted" style="padding:8px 2px;font-size:12px;">Nenhum valor disponível.</div>'}
      </div>
    </div>
    <div style="padding:8px;border-top:1px solid var(--border-soft);display:flex;gap:6px;justify-content:space-between;">
      <button class="btn btn-sm" id="colFilterClear">Limpar</button>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm" id="colFilterCancel">Cancelar</button>
        <button class="btn btn-sm btn-primary" id="colFilterOk">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(pop);
  renderIcons(pop);

  pop.querySelector('#colFilterSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    pop.querySelectorAll('#colFilterList label[data-label]').forEach(l => {
      l.style.display = l.dataset.label.includes(q) ? 'flex' : 'none';
    });
  });
  pop.querySelector('#colFilterAll').addEventListener('change', (e) => {
    pop.querySelectorAll('.colFilterItem').forEach(cb => { cb.checked = e.target.checked; });
  });
  pop.querySelectorAll('.colFilterItem').forEach(cb => cb.addEventListener('change', () => {
    const todas = pop.querySelectorAll('.colFilterItem');
    pop.querySelector('#colFilterAll').checked = [...todas].every(c => c.checked);
  }));
  pop.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
    _estOrdenacao = { key: colKey, dir: b.dataset.sort };
    salvarFiltros();
    fecharPopoverFiltro();
    App.navigate('estoque', true);
  }));
  pop.querySelector('#colFilterClear').addEventListener('click', () => {
    delete _estFiltros[colKey];
    salvarFiltros();
    fecharPopoverFiltro();
    App.navigate('estoque', true);
  });
  pop.querySelector('#colFilterCancel').addEventListener('click', fecharPopoverFiltro);
  pop.querySelector('#colFilterOk').addEventListener('click', () => {
    const marcadas = [...pop.querySelectorAll('.colFilterItem:checked')].map(cb => cb.value);
    if (marcadas.length === todasChaves.length) delete _estFiltros[colKey];
    else _estFiltros[colKey] = new Set(marcadas);
    salvarFiltros();
    fecharPopoverFiltro();
    App.navigate('estoque', true);
  });

  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!pop.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
      pop.remove();
      document.removeEventListener('click', h);
    }
  }), 0);
}

function abrirFormItem(id) {
  const item = id ? Store.get('estoque', id) : null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Produto</label><input id="eCodigo" value="${item?.codigo || ''}" placeholder="Código do produto (ex: MC0008)"></div>
      <div class="field"><label>Cód. Produto</label><input id="eCodProduto" value="${item?.codProduto || ''}"></div>
      <div class="field"><label>Armazém</label><input id="eArmazem" value="${item?.armazem || ''}"></div>
      <div class="field"><label>Grupo</label><input id="eGrupo" value="${item?.grupo || ''}"></div>
      <div class="field field-span-2"><label>Descrição</label><input id="eDesc" value="${item?.descricao || ''}"></div>
      <div class="field"><label>Unidade</label><input id="eUn" value="${item?.unidade || 'un'}"></div>
      <div class="field"><label>Saldo Atual</label><input type="number" id="eQtd" value="${item?.qtdAtual || 0}"></div>
      <div class="field"><label>Custo Unitário (R$)</label><input type="number" id="eCusto" value="${item?.custoUnitario || 0}"></div>
      <div class="field"><label>Custo Unit. FIFO1 (R$)</label><input type="number" id="eCustoFifo" value="${item?.custoUnitarioFifo1 || 0}"></div>
      <div class="field"><label>Status Sld.</label><input id="eStatus" value="${item?.statusSaldo || ''}"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelIt">Cancelar</button><button class="btn btn-primary" id="saveIt">${Icon('check',15)} Salvar Item</button>`;
  App.openModal({ title: item ? 'Editar Item' : 'Novo Item de Estoque', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelIt').onclick = App.closeModal;
  document.getElementById('saveIt').onclick = () => {
    const qtdAtual = Number(val('eQtd'));
    const custoUnitario = Number(val('eCusto'));
    const data = {
      codigo: val('eCodigo'), codProduto: val('eCodProduto'), armazem: val('eArmazem'), grupo: val('eGrupo'),
      descricao: val('eDesc'), unidade: val('eUn'), qtdAtual, custoUnitario,
      custoUnitarioFifo1: Number(val('eCustoFifo')) || null, statusSaldo: val('eStatus'),
      saldoAtualizado: Math.round(qtdAtual * custoUnitario * 100) / 100,
    };
    if (!data.codigo) { App.toast('Informe o código do produto.', 'danger'); return; }
    if (!data.descricao) { App.toast('Informe a descrição do item.', 'danger'); return; }
    if (item) { Store.update('estoque', item.id, data); App.toast('Item atualizado.', 'success'); }
    else { Store.add('estoque', data); App.toast('Item cadastrado.', 'success'); }
    App.closeModal();
  };
}

// ------------------------------------------------------------------ Projetos
function abrirFormProjeto(id, onSaved) {
  const projeto = id ? Store.get('projetos', id) : null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field field-span-2"><label>Nome do Projeto</label><input id="pjNome" value="${escapeHtml(projeto?.nome || '')}" placeholder="Ex: Ampliação da Granulação"></div>
      <div class="field"><label>Centro de Custo</label><input id="pjCentroCusto" value="${escapeHtml(projeto?.centroCusto || '')}" placeholder="Ex: CC-3020"></div>
      <div class="field"><label>Conta</label><input id="pjConta" value="${escapeHtml(projeto?.conta || '')}" placeholder="Ex: 4.1.2.05"></div>
      <div class="field"><label>Código de Valor</label><input id="pjCodValor" value="${escapeHtml(projeto?.codigoValor || '')}" placeholder="Ex: CV-1234"></div>
      <div class="field"><label>Valor Total Orçado (R$)</label><input type="number" step="0.01" id="pjValorOrcado" value="${projeto?.valorOrcado || 0}" placeholder="0,00"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelPj">Cancelar</button><button class="btn btn-primary" id="savePj">${Icon('check',15)} Salvar Projeto</button>`;
  App.openModal({ title: projeto ? 'Editar Projeto' : 'Novo Projeto', body, footer });
  renderIcons();
  document.getElementById('cancelPj').onclick = App.closeModal;
  document.getElementById('savePj').onclick = () => {
    const nome = document.getElementById('pjNome').value.trim();
    if (!nome) { App.toast('Informe o nome do projeto.', 'danger'); return; }
    const data = {
      nome,
      centroCusto: document.getElementById('pjCentroCusto').value.trim(),
      conta: document.getElementById('pjConta').value.trim(),
      codigoValor: document.getElementById('pjCodValor').value.trim(),
      valorOrcado: Number(document.getElementById('pjValorOrcado').value) || 0,
    };
    let salvo;
    if (projeto) { Store.update('projetos', projeto.id, data); salvo = { ...projeto, ...data }; App.toast('Projeto atualizado.', 'success'); }
    else { salvo = Store.add('projetos', data); App.toast('Projeto cadastrado.', 'success'); }
    App.closeModal();
    if (onSaved) onSaved(salvo);
  };
}

// --------------------------------------------------- Solicitação de Compra
// Abre o Outlook (ou o programa de e-mail padrão) direto, via mailto: —
// código, descrição e unidade vêm direto do item já cadastrado no estoque,
// só a quantidade é digitada na hora. O mailto: só aceita texto puro, então
// o e-mail inteiro (saudação + tabela + assinatura), já formatado e com
// fonte fixa, é copiado para a área de transferência ao mesmo tempo — o
// usuário só precisa colar (Ctrl+V) por cima do texto simples que abriu.
const FONTE_EMAIL = "'Segoe UI', Arial, Helvetica, sans-serif"; // fonte nativa do Windows/Outlook — não depende de fonte customizada do site, então nunca muda ao colar em outro lugar

function abrirModalSolicitacaoCompra(ids, opts = {}) {
  const {
    colecao = 'estoque',
    ccContaObrigatoria = false,
    rotuloSingular = 'Material',
    rotuloPlural = 'materiais',
    aoConcluir = (idsProcessados) => idsProcessados.forEach(id => _estSelecionados.delete(id)),
  } = opts;
  const linhas = [...new Set(ids)].map(id => Store.get(colecao, id)).filter(Boolean)
    .map(it => ({ id: it.id, codigo: it.codigo, descricao: it.descricao, unidade: (it.unidade || 'un').toUpperCase(), qtde: '' }));
  if (!linhas.length) { App.toast('Nenhum item válido selecionado.', 'danger'); return; }

  const linhaHtml = (l, idx) => `
    <tr data-linha-idx="${idx}">
      <td style="width:120px;"><input type="number" min="1" step="1" class="scQtde" data-idx="${idx}" value="${l.qtde}" placeholder="Qtde"
        style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:7px 9px;color:var(--text);font-size:13px;box-sizing:border-box;"></td>
      <td style="width:64px;">${l.unidade}</td>
      <td class="cell-tag">${l.codigo}</td>
      <td><strong>${escapeHtml(l.descricao)}</strong></td>
      <td style="width:38px;"><button type="button" class="btn btn-sm btn-danger" data-remove-linha="${idx}" title="Remover">${Icon('x', 13)}</button></td>
    </tr>`;

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">Confira os itens e informe a quantidade solicitada de cada um. Ao confirmar, o Outlook abre direto com a solicitação — e o e-mail inteiro, já formatado, vai para a área de transferência: é só colar (Ctrl+V) dentro do corpo do e-mail.</p>

    <div class="form-grid" style="margin-bottom:14px;">
      <div class="field"><label>Tipo de Solicitação</label>
        <select id="scTipo">${TIPOS_SC.map(t => `<option value="${t}">${t}</option>`).join('')}<option value="__outro__">Outro (digitar manualmente)</option></select>
      </div>
      <div class="field hidden" id="scTipoOutroWrap"><label>Qual?</label><input id="scTipoOutro" placeholder="Digite o tipo de solicitação"></div>
    </div>
    ${ccContaObrigatoria ? `
    <div class="form-grid" style="margin-bottom:14px;">
      <div class="field"><label>Nº da SC (se já existir)</label><input id="scNumeroSC" placeholder="Preencher só se a SC já foi aberta em outro sistema"></div>
      <div class="field"><label>Proposta</label><input id="scProposta" placeholder="Nº/referência da proposta do fornecedor"></div>
      <div class="field field-span-2"><label>Descrição real do serviço</label>
        <input id="scDescricaoServico" placeholder="Ex: manutenção do motor elétrico 25 CV, 18 kW, 220/380V, 4 polos, carcaça 160L, V1" value="${escapeHtml(linhas.length === 1 ? linhas[0].descricao : '')}">
      </div>
    </div>
    <p class="text-muted" style="font-size:11px;margin:-8px 0 14px;">A descrição acima é a real do serviço solicitado — diferente do código/descrição do catálogo mostrado na tabela abaixo. O nº da SC só precisa ser preenchido aqui se ela já tiver sido criada em outro sistema antes deste e-mail — senão, dá pra preencher depois na aba "Solicitações de Compra".</p>` : ''}
    <div class="${ccContaObrigatoria ? '' : 'hidden'}" id="scProjetoFields" style="margin-bottom:14px;">
      <div class="form-grid hidden" id="scProjetoSelWrap" style="margin-bottom:10px;">
        <div class="field field-span-2"><label>Projeto</label>
          <select id="scProjetoSel">
            <option value="">— Selecione um projeto cadastrado —</option>
            ${Store.all('projetos').map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}
            <option value="__outro__">Outro (não cadastrado / preencher manualmente)</option>
          </select>
        </div>
      </div>
      <div class="form-grid cols-3">
        <div class="field"><label>Centro de Custo${ccContaObrigatoria ? ' *' : ''}</label><input id="scCentroCusto" placeholder="Ex: CC-3020" ${ccContaObrigatoria ? 'disabled' : ''}></div>
        <div class="field${ccContaObrigatoria ? ' field-span-2' : ''}"><label>Conta${ccContaObrigatoria ? ' Contábil *' : ''}</label>
          ${ccContaObrigatoria ? `
          <select id="scConta">
            <option value="">— Selecione —</option>
            ${Store.all('contasContabeis').map(c => `<option value="${c.id}">${escapeHtml(c.conta)}</option>`).join('')}
          </select>` : `<input id="scConta" placeholder="Ex: 4.1.2.05">`}
        </div>
        <div class="field hidden" id="scCodValorWrap"><label>Código de Valor</label><input id="scCodValor" placeholder="Ex: CV-1234"></div>
      </div>
      ${ccContaObrigatoria ? `
      <div style="margin-top:10px;">
        <button type="button" class="btn btn-sm" id="scNovaContaBtn">${Icon('plus',13)} Cadastrar nova conta contábil</button>
        <div class="hidden" id="scNovaContaInline" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:8px;">
          <div class="form-grid">
            <div class="field"><label>Conta Contábil</label><input id="scNcConta" placeholder="Ex: 4.1.2.05"></div>
            <div class="field"><label>Centro de Custo</label><input id="scNcCC" placeholder="Ex: CC-3020"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button type="button" class="btn btn-sm" id="scNcCancelar">Cancelar</button>
            <button type="button" class="btn btn-sm btn-primary" id="scNcSalvar">${Icon('check',13)} Salvar Conta</button>
          </div>
        </div>
      </div>` : ''}
      <p class="text-muted ${ccContaObrigatoria ? '' : 'hidden'}" id="scParadaObsHint" style="font-size:11px;margin:6px 0 0;">
        ${ccContaObrigatoria ? 'Centro de Custo e Conta são obrigatórios.' : 'Centro de Custo e Conta são opcionais para Parada de Manutenção.'}
      </p>
      <div class="hidden" id="scNovoProjetoWrap">
        <button type="button" class="btn btn-sm" id="scNovoProjetoBtn" style="margin-top:10px;">${Icon('plus',13)} Cadastrar novo projeto</button>
        <div class="hidden" id="scNovoProjetoInline" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:8px;">
          <div class="form-grid">
            <div class="field field-span-2"><label>Nome do novo projeto</label><input id="scNpNome" placeholder="Ex: Ampliação da Granulação"></div>
            <div class="field"><label>Centro de Custo</label><input id="scNpCC" placeholder="Ex: CC-3020"></div>
            <div class="field"><label>Conta</label><input id="scNpConta" placeholder="Ex: 4.1.2.05"></div>
            <div class="field"><label>Código de Valor</label><input id="scNpCodValor" placeholder="Ex: CV-1234"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button type="button" class="btn btn-sm" id="scNpCancelar">Cancelar</button>
            <button type="button" class="btn btn-sm btn-primary" id="scNpSalvar">${Icon('check',13)} Salvar Projeto</button>
          </div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Qtde Solicitada</th><th>UN</th><th>Código</th><th>${escapeHtml(rotuloSingular)}</th><th></th></tr></thead>
        <tbody id="scTbody">${linhas.map(linhaHtml).join('')}</tbody>
      </table>
    </div>

    <div class="section-title" style="margin-top:18px;">Prévia do e-mail (é isto que vai ser copiado)</div>
    <div id="scPreview" title="Clique para selecionar tudo" style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;cursor:pointer;padding:16px;background:#fff;"></div>
    <p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">"Abrir no Outlook" já copia este e-mail inteiro sozinho — só colar (Ctrl+V) no lugar do texto simples que abrir. Se a cópia automática não funcionar, clique na prévia acima (ela já vem selecionada) e aperte Ctrl+C, ou use o botão "Copiar E-mail".</p>`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;flex-wrap:wrap;';
  footer.innerHTML = `<button class="btn" id="scCancel">Cancelar</button>
    <button class="btn btn-accent" id="scCopiar" title="Copia o e-mail formatado para colar dentro de um e-mail já aberto">${Icon('clipboard', 15)} Copiar E-mail</button>
    <button class="btn btn-primary" id="scConfirm" title="Abre o Outlook e já copia o e-mail formatado para você colar">${Icon('mail', 15)} Abrir no Outlook</button>`;

  App.openModal({ title: `Solicitação de Compra${linhas.length > 1 ? ` — ${linhas.length} itens` : ''}`, body, footer, size: 'lg' });
  renderIcons();

  function coletarMeta() {
    const tipoSel = document.getElementById('scTipo').value;
    const tipo = tipoSel === '__outro__' ? (capitalizarFrase(document.getElementById('scTipoOutro').value.trim()) || 'Outro') : tipoSel;
    const numeroSC = ccContaObrigatoria ? document.getElementById('scNumeroSC').value.trim() : '';
    const proposta = ccContaObrigatoria ? document.getElementById('scProposta').value.trim() : '';
    const descricaoServico = ccContaObrigatoria ? capitalizarFrase(document.getElementById('scDescricaoServico').value.trim()) : '';
    const contaContabilId = ccContaObrigatoria ? (contaSelecionadaCatalogo()?.id || '') : '';
    if (tipoSel === 'Parada de Manutenção' || (ccContaObrigatoria && tipoSel !== 'Projeto')) {
      return {
        tipo, numeroSC, proposta, descricaoServico, contaContabilId,
        centroCusto: document.getElementById('scCentroCusto').value.trim(),
        conta: contaTexto(),
        codigoValor: '',
        projetoId: '',
        projetoNome: '',
      };
    }
    if (tipoSel !== 'Projeto') return { tipo, numeroSC, proposta, descricaoServico, contaContabilId, centroCusto: '', conta: '', codigoValor: '', projetoId: '', projetoNome: '' };
    const selVal = document.getElementById('scProjetoSel').value;
    const projetoId = (selVal && selVal !== '__outro__') ? selVal : '';
    const projeto = projetoId ? Store.get('projetos', projetoId) : null;
    return {
      tipo, numeroSC, proposta, descricaoServico, contaContabilId,
      centroCusto: document.getElementById('scCentroCusto').value.trim(),
      conta: contaTexto(),
      codigoValor: document.getElementById('scCodValor').value.trim(),
      projetoId,
      projetoNome: projeto ? projeto.nome : '',
    };
  }
  function renderPreview() {
    document.getElementById('scPreview').innerHTML = construirCorpoHtmlSolicitacao(linhas, coletarMeta(), rotuloPlural);
  }

  // Conta Contábil, quando ccContaObrigatoria, vem de um cadastro vinculado a
  // Centro de Custo (mesmo padrão de Projeto) em vez de texto livre — ver
  // também abrirInformarSCSolicitacao, que usa o mesmo cadastro depois.
  function contaSelecionadaCatalogo() {
    if (!ccContaObrigatoria) return null;
    const id = document.getElementById('scConta').value;
    return Store.all('contasContabeis').find(c => c.id === id) || null;
  }
  function contaTexto() {
    if (ccContaObrigatoria) { const c = contaSelecionadaCatalogo(); return c ? c.conta : ''; }
    return document.getElementById('scConta').value.trim();
  }
  function atualizarCentroCustoServ() {
    if (!ccContaObrigatoria) return;
    const c = contaSelecionadaCatalogo();
    document.getElementById('scCentroCusto').value = c ? c.centroCusto : '';
  }

  // Escolher um projeto cadastrado preenche Conta/CC/Código de Valor
  // automaticamente (o usuário ainda pode ajustar à mão se precisar).
  // "Outro" só limpa os campos para preencher manualmente do zero.
  function preencherCamposProjeto(selVal) {
    const p = (selVal && selVal !== '__outro__') ? Store.get('projetos', selVal) : null;
    document.getElementById('scCodValor').value = p?.codigoValor || '';
    if (ccContaObrigatoria) {
      const match = p ? Store.all('contasContabeis').find(c => c.conta === p.conta) : null;
      document.getElementById('scConta').value = match ? match.id : '';
      atualizarCentroCustoServ();
    } else {
      document.getElementById('scCentroCusto').value = p?.centroCusto || '';
      document.getElementById('scConta').value = p?.conta || '';
    }
  }

  // "Projeto" mostra o seletor de projeto + Código de Valor (tudo
  // obrigatório); "Parada de Manutenção" mostra só Centro de Custo/Conta,
  // e ambos opcionais; os demais tipos não mostram nada disso — exceto
  // quando ccContaObrigatoria (ex: Serviços), que mantém Centro de
  // Custo/Conta sempre visíveis e obrigatórios, para qualquer tipo.
  function atualizarCamposTipo() {
    const tipo = document.getElementById('scTipo').value;
    document.getElementById('scTipoOutroWrap').classList.toggle('hidden', tipo !== '__outro__');
    const ehProjeto = tipo === 'Projeto';
    const ehParada = tipo === 'Parada de Manutenção';
    const mostrarCC = ehProjeto || ehParada || ccContaObrigatoria;
    document.getElementById('scProjetoFields').classList.toggle('hidden', !mostrarCC);
    document.getElementById('scProjetoSelWrap').classList.toggle('hidden', !ehProjeto);
    document.getElementById('scCodValorWrap').classList.toggle('hidden', !ehProjeto);
    document.getElementById('scNovoProjetoWrap').classList.toggle('hidden', !ehProjeto);
    document.getElementById('scParadaObsHint').classList.toggle('hidden', ccContaObrigatoria ? false : !ehParada);
    if (!ehProjeto) {
      document.getElementById('scProjetoSel').value = '';
      document.getElementById('scCodValor').value = '';
    }
    if (!ehProjeto && !ehParada && !ccContaObrigatoria) {
      document.getElementById('scCentroCusto').value = '';
      document.getElementById('scConta').value = '';
    }
  }
  document.getElementById('scTipo').addEventListener('change', () => {
    atualizarCamposTipo();
    renderPreview();
  });
  document.getElementById('scTipoOutro').addEventListener('input', renderPreview);
  document.getElementById('scProjetoSel').addEventListener('change', (e) => {
    preencherCamposProjeto(e.target.value);
    renderPreview();
  });
  ['scCentroCusto', 'scCodValor'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderPreview);
  });
  if (ccContaObrigatoria) {
    document.getElementById('scConta').addEventListener('change', () => { atualizarCentroCustoServ(); renderPreview(); });
  } else {
    document.getElementById('scConta').addEventListener('input', renderPreview);
  }
  document.getElementById('scNumeroSC')?.addEventListener('input', renderPreview);
  document.getElementById('scProposta')?.addEventListener('input', renderPreview);
  document.getElementById('scDescricaoServico')?.addEventListener('input', renderPreview);
  document.getElementById('scNovaContaBtn')?.addEventListener('click', () => {
    document.getElementById('scNovaContaInline').classList.remove('hidden');
  });
  document.getElementById('scNcCancelar')?.addEventListener('click', () => {
    document.getElementById('scNovaContaInline').classList.add('hidden');
  });
  document.getElementById('scNcSalvar')?.addEventListener('click', () => {
    const conta = document.getElementById('scNcConta').value.trim();
    const centroCusto = document.getElementById('scNcCC').value.trim();
    if (!conta) { App.toast('Informe a conta contábil.', 'danger'); return; }
    const novo = Store.add('contasContabeis', { conta, centroCusto });
    const sel = document.getElementById('scConta');
    const opt = document.createElement('option');
    opt.value = novo.id; opt.textContent = novo.conta;
    sel.appendChild(opt);
    sel.value = novo.id;
    document.getElementById('scNovaContaInline').classList.add('hidden');
    atualizarCentroCustoServ();
    renderPreview();
    App.toast('Conta contábil cadastrada.', 'success');
  });
  document.getElementById('scNovoProjetoBtn').addEventListener('click', () => {
    document.getElementById('scNovoProjetoInline').classList.remove('hidden');
  });
  document.getElementById('scNpCancelar').addEventListener('click', () => {
    document.getElementById('scNovoProjetoInline').classList.add('hidden');
  });
  document.getElementById('scNpSalvar').addEventListener('click', () => {
    const nome = document.getElementById('scNpNome').value.trim();
    if (!nome) { App.toast('Informe o nome do novo projeto.', 'danger'); return; }
    const novo = Store.add('projetos', {
      nome,
      centroCusto: document.getElementById('scNpCC').value.trim(),
      conta: document.getElementById('scNpConta').value.trim(),
      codigoValor: document.getElementById('scNpCodValor').value.trim(),
    });
    const sel = document.getElementById('scProjetoSel');
    const opt = document.createElement('option');
    opt.value = novo.id; opt.textContent = novo.nome;
    sel.insertBefore(opt, sel.querySelector('option[value="__outro__"]'));
    sel.value = novo.id;
    preencherCamposProjeto(novo.id);
    document.getElementById('scNovoProjetoInline').classList.add('hidden');
    App.toast('Projeto cadastrado e selecionado.', 'success');
    renderPreview();
  });

  function ligarEventosLinhas() {
    body.querySelectorAll('.scQtde').forEach(inp => inp.addEventListener('input', (e) => {
      linhas[Number(e.target.dataset.idx)].qtde = e.target.value;
      renderPreview();
    }));
    body.querySelectorAll('[data-remove-linha]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.dataset.removeLinha);
      linhas.splice(idx, 1); // remove só da lista de trabalho do modal — a seleção na tabela não é alterada aqui
      if (!linhas.length) { App.closeModal(); return; }
      document.getElementById('scTbody').innerHTML = linhas.map(linhaHtml).join('');
      renderIcons();
      ligarEventosLinhas();
      renderPreview();
    }));
  }
  ligarEventosLinhas();
  atualizarCamposTipo();
  atualizarCentroCustoServ();
  renderPreview();
  document.getElementById('scPreview').addEventListener('click', () => selecionarConteudo(document.getElementById('scPreview')));

  function validarESelecionar() {
    const validas = linhas.filter(l => Number(l.qtde) > 0);
    if (!validas.length) { App.toast('Informe a quantidade de ao menos um item.', 'danger'); return null; }
    const meta = coletarMeta();
    if (meta.tipo === 'Projeto' && (!meta.centroCusto || !meta.conta || !meta.codigoValor)) {
      App.toast('Para o tipo "Projeto", informe Centro de Custo, Conta e Código de Valor.', 'danger');
      return null;
    }
    if (ccContaObrigatoria && (!meta.centroCusto || !meta.conta)) {
      App.toast('Informe Centro de Custo e Conta.', 'danger');
      return null;
    }
    return { validas, meta };
  }

  document.getElementById('scCancel').onclick = App.closeModal;

  document.getElementById('scCopiar').onclick = async () => {
    const resultado = validarESelecionar();
    if (!resultado) return;
    await copiarEmailSolicitacao(resultado.validas, resultado.meta, rotuloPlural);
  };

  document.getElementById('scConfirm').onclick = async () => {
    const resultado = validarESelecionar();
    if (!resultado) return;
    const { validas, meta } = resultado;
    const prefixoAssunto = colecao === 'servicos' ? 'Solicitação de Compra' : assuntoPrefixo(meta.tipo);
    const scPrefixo = meta.numeroSC ? `SC nº ${meta.numeroSC} — ` : '';
    const referenciaAssunto = meta.descricaoServico || meta.tipo;
    const assunto = `${scPrefixo}${prefixoAssunto} — ${referenciaAssunto}${validas.length > 1 ? ` (${validas.length} itens)` : ` — ${validas[0].codigo}`}`;
    const nomeSolicitante = (typeof AuthProfile !== 'undefined' && AuthProfile && AuthProfile.nome) ? AuthProfile.nome : '';

    const html = construirCorpoHtmlSolicitacao(validas, meta, rotuloPlural);
    const texto = montarCorpoEmailSolicitacao(validas, meta, false, rotuloPlural);
    const copiado = await copiarHtmlParaClipboard(html, texto);
    if (!copiado) selecionarConteudo(document.getElementById('scPreview'));
    const corpo = montarCorpoEmailSolicitacao(validas, meta, copiado, rotuloPlural);

    aoConcluir(validas.map(l => l.id)); // limpa a seleção ANTES de salvar, pois o Store dispara um re-render automático da tela
    Store.add('solicitacoesCompra', {
      numeroSC: meta.numeroSC || '',
      data: new Date().toISOString().slice(0, 10),
      criadoEm: Date.now(),
      tipo: meta.tipo,
      origem: colecao,
      projetoId: meta.projetoId || '',
      centroCusto: meta.centroCusto,
      conta: meta.conta,
      codigoValor: meta.codigoValor,
      proposta: meta.proposta || '',
      descricaoServico: meta.descricaoServico || '',
      contaContabilId: meta.contaContabilId || '',
      solicitante: nomeSolicitante,
      itens: validas.map(l => ({ codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, qtde: Number(l.qtde) })),
    });

    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    App.closeModal();
    App.toast(copiado
      ? 'Outlook aberto — o e-mail formatado já foi copiado, é só colar (Ctrl+V) por cima do texto simples.'
      : 'Outlook aberto. Não deu para copiar automaticamente — use o botão "Copiar E-mail" antes de tentar de novo, ou monte a solicitação de novo e clique na prévia + Ctrl+C.', 'success');
  };
}

// Monta o corpo do e-mail em texto puro (para o mailto:, que não aceita
// HTML), com a lista de materiais alinhada em colunas — usado só como
// conteúdo inicial da janela do Outlook, para ser substituído pelo Ctrl+V.
function montarCorpoEmailSolicitacao(itens, meta, copiado, rotuloPlural = 'materiais') {
  const saudacao = saudacaoPorHorario();

  const cabecalho = ['QTDE', 'UN', 'CÓDIGO', rotuloPlural.toUpperCase()];
  const linhasDados = itens.map(it => [String(Number(it.qtde)), it.unidade, it.codigo, it.descricao]);
  const larguras = cabecalho.map((h, ci) => Math.max(h.length, ...linhasDados.map(l => l[ci].length)));
  const montarLinha = (cols) => cols.map((c, ci) => c.padEnd(larguras[ci])).join('  |  ');
  const separador = larguras.map(l => '-'.repeat(l)).join('--+--');
  const tabela = [montarLinha(cabecalho), separador, ...linhasDados.map(montarLinha)].join('\r\n');

  const infoTipo = [`Tipo de solicitação: ${meta.tipo}`];
  if (meta.numeroSC) infoTipo.push(`SC nº: ${meta.numeroSC}`);
  if (meta.descricaoServico) infoTipo.push(`Descrição real do serviço: ${meta.descricaoServico}`);
  if (meta.proposta) infoTipo.push(`Proposta: ${meta.proposta}`);
  if (meta.centroCusto || meta.conta || meta.codigoValor || meta.projetoNome) {
    const partes = [];
    if (meta.projetoNome) partes.push(`Projeto: ${meta.projetoNome}`);
    if (meta.centroCusto) partes.push(`Centro de Custo: ${meta.centroCusto}`);
    if (meta.conta) partes.push(`Conta: ${meta.conta}`);
    if (meta.codigoValor) partes.push(`Código de Valor: ${meta.codigoValor}`);
    infoTipo.push(partes.join('    '));
  }

  const nomeSolicitante = (typeof AuthProfile !== 'undefined' && AuthProfile && AuthProfile.nome) ? AuthProfile.nome : '';
  const assinatura = nomeSolicitante ? `\r\n\r\nAtenciosamente,\r\n${nomeSolicitante}` : '';

  return [
    'Prezados,',
    `${saudacao}.`,
    '',
    `Venho, por meio deste, encaminhar a lista de ${rotuloPlural} abaixo. Solicito, por gentileza, que seja realizada a abertura da solicitação de compra dos itens relacionados:`,
    '',
    ...infoTipo,
    '',
    tabela,
    '',
    ...(copiado ? ['(O e-mail formatado foi copiado para a área de transferência — cole aqui com Ctrl+V no lugar deste texto simples, se preferir.)'] : []),
  ].join('\r\n') + assinatura;
}

// "Bom dia" / "Boa tarde" / "Boa noite" conforme o horário local no momento do clique.
function saudacaoPorHorario() {
  const hora = new Date().getHours();
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
}

// Prefixo do título do e-mail: "Parada de Manutenção" e "Projeto" são
// solicitações que vão para Compras como "Solicitação de Compra"; os demais
// tipos são pedidos de rotina ao estoque e vão como "Solicitação de Almoxarifado".
function assuntoPrefixo(tipo) {
  return (tipo === 'Parada de Manutenção' || tipo === 'Projeto') ? 'Solicitação de Compra' : 'Solicitação de Almoxarifado';
}

// Monta o e-mail inteiro em HTML — saudação, texto de abertura, referência
// do tipo de solicitação, tabela e assinatura — tudo com a mesma fonte fixa
// (FONTE_EMAIL), para ficar idêntico independentemente de onde for colado.
// Usado tanto na prévia dentro do modal quanto na cópia para a área de
// transferência, para os dois ficarem sempre iguais.
function construirCorpoHtmlSolicitacao(itens, meta, rotuloPlural = 'materiais') {
  const saudacao = saudacaoPorHorario();

  let infoTipo = `<p style="margin:0 0 4px;"><strong>Tipo de solicitação:</strong> ${escapeHtml(meta.tipo)}</p>`;
  if (meta.numeroSC) infoTipo += `<p style="margin:0 0 4px;"><strong>SC nº:</strong> ${escapeHtml(meta.numeroSC)}</p>`;
  if (meta.descricaoServico) infoTipo += `<p style="margin:0 0 4px;"><strong>Descrição real do serviço:</strong> ${escapeHtml(meta.descricaoServico)}</p>`;
  if (meta.proposta) infoTipo += `<p style="margin:0 0 4px;"><strong>Proposta:</strong> ${escapeHtml(meta.proposta)}</p>`;
  const temReferencia = meta.centroCusto || meta.conta || meta.codigoValor || meta.projetoNome;
  if (temReferencia) {
    const partes = [];
    if (meta.projetoNome) partes.push(`<strong>Projeto:</strong> ${escapeHtml(meta.projetoNome)}`);
    if (meta.centroCusto) partes.push(`<strong>Centro de Custo:</strong> ${escapeHtml(meta.centroCusto)}`);
    if (meta.conta) partes.push(`<strong>Conta:</strong> ${escapeHtml(meta.conta)}`);
    if (meta.codigoValor) partes.push(`<strong>Código de Valor:</strong> ${escapeHtml(meta.codigoValor)}`);
    infoTipo += `<p style="margin:0 0 16px;">${partes.join(' &nbsp;&nbsp; ')}</p>`;
  } else {
    infoTipo += `<div style="margin-bottom:12px;"></div>`;
  }

  const nomeSolicitante = (typeof AuthProfile !== 'undefined' && AuthProfile && AuthProfile.nome) ? AuthProfile.nome : '';
  const assinatura = nomeSolicitante ? `<p style="margin-top:20px;">Atenciosamente,<br>${escapeHtml(nomeSolicitante)}</p>` : '';

  return `<div style="font-family:${FONTE_EMAIL};font-size:14px;color:#222222;line-height:1.5;">
    <p style="margin:0 0 4px;">Prezados,<br>${saudacao}.</p>
    <p>Venho, por meio deste, encaminhar a lista de ${escapeHtml(rotuloPlural)} abaixo. Solicito, por gentileza, que seja realizada a abertura da solicitação de compra dos itens relacionados:</p>
    ${infoTipo}
    ${construirHtmlTabelaSolicitacao(itens, rotuloPlural)}
    ${assinatura}
  </div>`;
}

// Monta o HTML (com as cores da identidade FertGrow e fonte fixa) da tabela
// de materiais — usado dentro do e-mail completo acima.
function construirHtmlTabelaSolicitacao(itens, rotuloPlural = 'materiais') {
  const linhasHtml = itens.map((it, idx) => `
    <tr style="background:${idx % 2 ? '#F1F3F7' : '#FFFFFF'};">
      <td style="padding:8px 12px;border:1px solid #DFE3EA;text-align:center;">${Number(it.qtde) || 0}</td>
      <td style="padding:8px 12px;border:1px solid #DFE3EA;text-align:center;">${escapeHtml(it.unidade)}</td>
      <td style="padding:8px 12px;border:1px solid #DFE3EA;font-family:'Courier New',monospace;">${escapeHtml(it.codigo)}</td>
      <td style="padding:8px 12px;border:1px solid #DFE3EA;">${escapeHtml(it.descricao)}</td>
    </tr>`).join('');
  return `<table style="border-collapse:collapse;font-family:${FONTE_EMAIL};font-size:13px;width:100%;">
    <thead><tr style="background:#005428;color:#ffffff;">
      <th style="padding:8px 12px;border:1px solid #005428;">QTDE SOLICITADA</th>
      <th style="padding:8px 12px;border:1px solid #005428;">UN</th>
      <th style="padding:8px 12px;border:1px solid #005428;">CÓDIGO</th>
      <th style="padding:8px 12px;border:1px solid #005428;">${escapeHtml(rotuloPlural.toUpperCase())}</th>
    </tr></thead>
    <tbody>${linhasHtml}</tbody>
  </table>`;
}

// Seleciona todo o conteúdo de um elemento visível na tela — usado como
// último recurso: se a cópia automática falhar, o usuário só precisa
// clicar na prévia (já vem selecionada) e apertar Ctrl+C.
function selecionarConteudo(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Copia um texto simples (ex: código do produto) para a área de
// transferência — mesmo fallback via execCommand usado em copiarHtmlParaClipboard,
// necessário porque o app roda em file:// (navigator.clipboard exige contexto seguro).
async function copiarTextoSimples(texto) {
  const temp = document.createElement('textarea');
  temp.value = texto;
  temp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(temp);
  temp.select();
  let copiado = false;
  try { copiado = document.execCommand('copy'); } catch (e) { copiado = false; }
  document.body.removeChild(temp);

  if (!copiado && navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(texto); copiado = true; } catch (e) { copiado = false; }
  }
  return copiado;
}

// Copia HTML (com fallback em texto puro) para a área de transferência.
// navigator.clipboard.write() com HTML só funciona em contexto seguro
// (https/localhost); como este app roda direto do arquivo (file://), o
// navegador bloqueia essa chamada. Por isso o método principal aqui é o
// mais antigo (execCommand + seleção de um elemento oculto), que funciona
// em qualquer origem. Retorna true/false, sem mostrar toast — quem chama
// decide a mensagem.
async function copiarHtmlParaClipboard(html, texto) {
  const temp = document.createElement('div');
  temp.contentEditable = 'true';
  temp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  temp.innerHTML = html;
  document.body.appendChild(temp);
  selecionarConteudo(temp);

  let copiado = false;
  try { copiado = document.execCommand('copy'); } catch (e) { copiado = false; }
  window.getSelection().removeAllRanges();
  document.body.removeChild(temp);

  if (!copiado && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) }),
      ]);
      copiado = true;
    } catch (e) { copiado = false; }
  }
  return copiado;
}

// Copia o e-mail formatado inteiro (HTML) para a área de transferência,
// para o usuário colar (Ctrl+V) dentro do e-mail já aberto pelo mailto: —
// que por si só só aceita texto puro, sem cores, tabela ou fonte fixa.
// Usado pelo botão "Copiar E-mail" (mostra o próprio toast de sucesso/falha).
async function copiarEmailSolicitacao(itens, meta, rotuloPlural = 'materiais') {
  const html = construirCorpoHtmlSolicitacao(itens, meta, rotuloPlural);
  const texto = montarCorpoEmailSolicitacao(itens, meta, false, rotuloPlural);
  const copiado = await copiarHtmlParaClipboard(html, texto);

  if (copiado) {
    App.toast('E-mail formatado copiado — cole (Ctrl+V) dentro do corpo do e-mail.', 'success');
  } else {
    const preview = document.getElementById('scPreview');
    if (preview) selecionarConteudo(preview);
    App.toast('Não copiou automaticamente. A prévia já está selecionada — clique nela e aperte Ctrl+C.', 'danger');
  }
}

// ------------------------------------------- Informar SC / Fornecedor
// Mesmo passo usado em Manutenção Externa de Motores (ver motores.js —
// construirEmailInformarSC/montarTextoInformarSC são definidas lá e
// reaproveitadas aqui), só que aplicado a qualquer Solicitação de Compra
// (de Estoque ou de Serviços): depois de enviada a solicitação, registra o
// fornecedor escolhido, a proposta e a conta contábil/centro de custo
// definitivos, e gera o e-mail de confirmação para Compras.
function abrirInformarSCSolicitacao(scId) {
  const s = Store.get('solicitacoesCompra', scId);
  if (!s) return;
  const itens = s.itens || [];
  const descricaoPadrao = itens.map(it => it.descricao).join(', ');
  const referencia = itens.length === 1
    ? `aquisição/contratação de ${itens[0].descricao}`
    : `solicitação de compra de ${App.fmtDate(s.data)} (${itens.length} itens)`;

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">Preencha os dados da SC e do fornecedor escolhido para gerar o e-mail de confirmação para Compras.</p>
    <div class="form-grid">
      <div class="field"><label>Nº da SC</label><input id="scsNumero" placeholder="Preencher quando o número saír" value="${escapeHtml(s.numeroSC || '')}"></div>
      <div class="field"><label>Proposta</label><input id="scsProposta" placeholder="Nº/referência da proposta" value="${escapeHtml(s.proposta || '')}"></div>
      <div class="field field-span-2"><label>Fornecedor</label>
        <select id="scsFornecedor">
          <option value="">— Selecione um prestador cadastrado —</option>
          ${Store.all('prestadores').map(p => `<option value="${p.id}" ${s.fornecedorId === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field field-span-2"><label>Descrição do Serviço/Itens</label>
        <input id="scsDescricao" value="${escapeHtml(s.descricaoServico || descricaoPadrao)}">
      </div>
      <div class="field"><label>Valor da Proposta (R$)</label><input type="number" step="0.01" id="scsValor" value="${s.valorProposta ?? Math.round(valorSolicitacao(s) * 100) / 100}"></div>
      <div class="field"><label>Conta Contábil</label>
        <select id="scsConta">
          <option value="">— Selecione —</option>
          ${Store.all('contasContabeis').map(c => `<option value="${c.id}" ${s.contaContabilId === c.id ? 'selected' : ''}>${escapeHtml(c.conta)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Centro de Custo</label><input id="scsCentroCusto" disabled></div>
    </div>
    <div style="margin-top:10px;">
      <button type="button" class="btn btn-sm" id="scsNovaContaBtn">${Icon('plus', 13)} Cadastrar nova conta contábil</button>
      <div class="hidden" id="scsNovaContaInline" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:8px;">
        <div class="form-grid">
          <div class="field"><label>Conta Contábil</label><input id="scsNcConta" placeholder="Ex: 4.1.2.05"></div>
          <div class="field"><label>Centro de Custo</label><input id="scsNcCC" placeholder="Ex: CC-3020"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button type="button" class="btn btn-sm" id="scsNcCancelar">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" id="scsNcSalvar">${Icon('check', 13)} Salvar Conta</button>
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top:18px;">Prévia do e-mail</div>
    <div id="scsPreview" title="Clique para selecionar tudo" style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;cursor:pointer;padding:16px;background:#fff;"></div>
    <p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">"Abrir no Outlook" já copia este e-mail inteiro sozinho — só colar (Ctrl+V) no lugar do texto simples que abrir.</p>`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;flex-wrap:wrap;';
  footer.innerHTML = `<button class="btn" id="scsCancelarInf">Cancelar</button>
    <button class="btn" id="scsSalvarInf">${Icon('check', 15)} Salvar</button>
    <button class="btn btn-accent" id="scsCopiarInf">${Icon('clipboard', 15)} Copiar E-mail</button>
    <button class="btn btn-primary" id="scsAbrirInf">${Icon('mail', 15)} Abrir no Outlook</button>`;
  App.openModal({ title: 'Informar SC / Fornecedor', body, footer, size: 'lg' });
  renderIcons();

  function contaSelecionada() {
    const id = document.getElementById('scsConta').value;
    return Store.all('contasContabeis').find(c => c.id === id) || null;
  }
  function atualizarCentroCusto() {
    const c = contaSelecionada();
    document.getElementById('scsCentroCusto').value = c ? c.centroCusto : '';
  }
  function coletarDados() {
    const fornecedor = Store.get('prestadores', document.getElementById('scsFornecedor').value);
    const conta = contaSelecionada();
    return {
      numeroSC: document.getElementById('scsNumero').value.trim(),
      proposta: document.getElementById('scsProposta').value.trim(),
      descricaoServico: capitalizarFrase(document.getElementById('scsDescricao').value.trim()),
      referencia,
      valorAprovado: Number(document.getElementById('scsValor').value) || 0,
      conta: conta ? conta.conta : '',
      centroCusto: conta ? conta.centroCusto : '',
      nomeFantasia: fornecedor ? (fornecedor.nomeFantasia || fornecedor.nome) : '',
      razaoSocial: fornecedor ? fornecedor.nome : '',
      cnpj: fornecedor ? fornecedor.cnpj : '',
      fornecedorId: fornecedor ? fornecedor.id : '',
      contaContabilId: conta ? conta.id : '',
    };
  }
  function renderPreview() {
    document.getElementById('scsPreview').innerHTML = construirEmailInformarSC(coletarDados());
  }

  atualizarCentroCusto();
  renderPreview();
  document.getElementById('scsPreview').addEventListener('click', () => selecionarConteudo(document.getElementById('scsPreview')));
  ['scsNumero', 'scsProposta', 'scsDescricao', 'scsValor'].forEach(id => document.getElementById(id).addEventListener('input', renderPreview));
  document.getElementById('scsFornecedor').addEventListener('change', renderPreview);
  document.getElementById('scsConta').addEventListener('change', () => { atualizarCentroCusto(); renderPreview(); });

  document.getElementById('scsNovaContaBtn').addEventListener('click', () => {
    document.getElementById('scsNovaContaInline').classList.remove('hidden');
  });
  document.getElementById('scsNcCancelar').addEventListener('click', () => {
    document.getElementById('scsNovaContaInline').classList.add('hidden');
  });
  document.getElementById('scsNcSalvar').addEventListener('click', () => {
    const conta = document.getElementById('scsNcConta').value.trim();
    const centroCusto = document.getElementById('scsNcCC').value.trim();
    if (!conta) { App.toast('Informe a conta contábil.', 'danger'); return; }
    const novo = Store.add('contasContabeis', { conta, centroCusto });
    const sel = document.getElementById('scsConta');
    const opt = document.createElement('option');
    opt.value = novo.id; opt.textContent = novo.conta;
    sel.appendChild(opt);
    sel.value = novo.id;
    document.getElementById('scsNovaContaInline').classList.add('hidden');
    atualizarCentroCusto();
    renderPreview();
    App.toast('Conta contábil cadastrada.', 'success');
  });

  function salvarDados() {
    const dados = coletarDados();
    Store.update('solicitacoesCompra', scId, {
      numeroSC: dados.numeroSC, proposta: dados.proposta, descricaoServico: dados.descricaoServico,
      valorProposta: dados.valorAprovado, fornecedorId: dados.fornecedorId, contaContabilId: dados.contaContabilId,
      conta: dados.conta || s.conta, centroCusto: dados.centroCusto || s.centroCusto,
    });
    return dados;
  }

  document.getElementById('scsCancelarInf').onclick = App.closeModal;
  document.getElementById('scsSalvarInf').onclick = () => {
    salvarDados();
    App.toast('Dados da SC salvos.', 'success');
    App.closeModal();
  };
  document.getElementById('scsCopiarInf').onclick = async () => {
    const dados = salvarDados();
    const html = construirEmailInformarSC(dados);
    const texto = montarTextoInformarSC(dados, false);
    const copiado = await copiarHtmlParaClipboard(html, texto);
    if (copiado) App.toast('E-mail copiado — cole (Ctrl+V) dentro do corpo do e-mail.', 'success');
    else { selecionarConteudo(document.getElementById('scsPreview')); App.toast('Não copiou automaticamente. Clique na prévia e aperte Ctrl+C.', 'danger'); }
  };
  document.getElementById('scsAbrirInf').onclick = async () => {
    const dados = salvarDados();
    const assunto = `Solicitação de Compra — SC ${dados.numeroSC || 'a informar'}`;
    const html = construirEmailInformarSC(dados);
    const texto = montarTextoInformarSC(dados, false);
    const copiado = await copiarHtmlParaClipboard(html, texto);
    if (!copiado) selecionarConteudo(document.getElementById('scsPreview'));
    const corpo = montarTextoInformarSC(dados, copiado);
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    App.toast(copiado ? 'Outlook aberto — e-mail copiado, cole com Ctrl+V.' : 'Outlook aberto. Copie manualmente pela prévia.', 'success');
    App.closeModal();
  };
}

// Abre um modal simples de leitura com todos os dados de uma solicitação já
// registrada (itens, quantidades, tipo e referência de projeto quando houver).
function abrirDetalheSC(id) {
  const s = Store.get('solicitacoesCompra', id);
  if (!s) return;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid" style="margin-bottom:14px;">
      <div class="field"><label>Data</label><div>${App.fmtDate(s.data)}</div></div>
      <div class="field"><label>Nº da SC</label><div>${escapeHtml(s.numeroSC) || '<span class="text-muted">ainda não preenchido</span>'}</div></div>
      <div class="field"><label>Tipo</label><div><span class="badge badge-accent">${escapeHtml(s.tipo || '—')}</span></div></div>
      <div class="field"><label>Solicitante</label><div>${escapeHtml(s.solicitante) || '—'}</div></div>
      ${s.tipo === 'Projeto' ? `
        <div class="field field-span-2"><label>Projeto</label><div>${escapeHtml(nomeProjetoDaSolicitacao(s))}</div></div>
        <div class="field"><label>Centro de Custo</label><div>${escapeHtml(s.centroCusto) || '—'}</div></div>
        <div class="field"><label>Conta</label><div>${escapeHtml(s.conta) || '—'}</div></div>
        <div class="field"><label>Código de Valor</label><div>${escapeHtml(s.codigoValor) || '—'}</div></div>` : ''}
      ${s.tipo !== 'Projeto' && (s.centroCusto || s.conta) ? `
        <div class="field"><label>Centro de Custo</label><div>${escapeHtml(s.centroCusto) || '—'}</div></div>
        <div class="field"><label>Conta</label><div>${escapeHtml(s.conta) || '—'}</div></div>` : ''}
      <div class="field"><label>Valor Total (estimado pelo preço atual)</label><div><strong>${App.fmtMoney(valorSolicitacao(s))}</strong></div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Qtde</th><th>UN</th><th>Código</th><th>Material</th></tr></thead>
        <tbody>${(s.itens || []).map(it => `<tr><td>${it.qtde}</td><td>${escapeHtml(it.unidade)}</td><td class="cell-tag">${escapeHtml(it.codigo)}</td><td>${escapeHtml(it.descricao)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="fecharDetalheSC">Fechar</button>`;
  App.openModal({ title: 'Detalhes da Solicitação de Compra', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('fecharDetalheSC').onclick = App.closeModal;
}
