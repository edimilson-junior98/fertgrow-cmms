/* ==========================================================================
   FertGrow CMMS — Serviços
   Cadastro de serviços (mão de obra, terceirização, manutenção contratada...)
   que não fazem parte do estoque de peças. Mesmo padrão de tela do Estoque
   (busca, filtro estilo Excel por coluna, seleção + Solicitar Compra), mas
   sem saldo/quantidade em estoque — e a solicitação de compra de serviço
   exige Centro de Custo e Conta sempre, independente do tipo escolhido
   (ver abrirModalSolicitacaoCompra em estoque.js, chamada aqui com
   ccContaObrigatoria: true).
   ========================================================================== */

const SERVICO_COLS = [
  { key: 'codigo', label: 'Código' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'grupo', label: 'Grupo' },
  { key: 'unidade', label: 'Unidade' },
  { key: 'custoUnitario', label: 'Custo Unitário', money: true },
];

let _servFiltros = {};
let _servOrdenacao = null;
let _servBusca = '';
let _servSelecionados = new Set();
let _servBuscaTimer = null;

const SERVICOS_FILTROS_KEY = 'fertgrow_servicos_filtros_v1';
(function carregarFiltrosSalvosServicos() {
  try {
    const raw = localStorage.getItem(SERVICOS_FILTROS_KEY);
    if (!raw) return;
    const salvo = JSON.parse(raw);
    Object.entries(salvo.filtros || {}).forEach(([k, arr]) => { _servFiltros[k] = new Set(arr); });
    _servOrdenacao = salvo.ordenacao || null;
  } catch (e) { console.warn('Falha ao carregar filtros salvos de serviços.', e); }
})();
function salvarFiltrosServicos() {
  const filtros = {};
  Object.entries(_servFiltros).forEach(([k, set]) => { filtros[k] = [...set]; });
  localStorage.setItem(SERVICOS_FILTROS_KEY, JSON.stringify({ filtros, ordenacao: _servOrdenacao }));
}

Views.servicos = {
  title: 'Serviços',
  render() {
    const todos = Store.all('servicos');
    const idsValidos = new Set(todos.map(i => i.id));
    _servSelecionados.forEach(id => { if (!idsValidos.has(id)) _servSelecionados.delete(id); });
    const itens = servAplicarFiltrosOrdenacao(todos);
    const temFiltro = Object.keys(_servFiltros).length > 0 || !!_servOrdenacao || !!_servBusca;

    return `
      <div class="view-head">
        <div><h1>Serviços</h1><div class="sub">${itens.length}${itens.length !== todos.length ? ' de ' + todos.length : ''} serviço(s) cadastrado(s)</div></div>
        <div class="view-actions">
          ${temFiltro ? `<button class="btn btn-sm" id="btnLimparFiltrosServicos">${Icon('x',14)} Limpar filtros</button>` : ''}
          <button class="btn" id="btnImportServicos">${Icon('upload',15)} Importar Planilha</button>
          <button class="btn btn-accent" id="btnSolicitarCompraServico" ${_servSelecionados.size ? '' : 'disabled'}>${Icon('mail',15)} Solicitar Compra${_servSelecionados.size ? ` (${_servSelecionados.size})` : ''}</button>
          <button class="btn btn-primary" id="btnNovoServico">${Icon('plus',15)} Novo Serviço</button>
        </div>
      </div>

      <div class="field" style="position:relative;max-width:380px;margin-bottom:16px;">
        <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);display:flex;">${Icon('search',14)}</span>
        <input id="servBusca" placeholder="Buscar por descrição ou código..." value="${escapeHtml(_servBusca)}"
          style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:9px 12px 9px 34px;color:var(--text);font-size:13px;box-sizing:border-box;">
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:30px;"></th>
            <th style="width:34px;"><input type="checkbox" id="servSelAll" ${itens.length && itens.every(i => _servSelecionados.has(i.id)) ? 'checked' : ''}></th>
            ${SERVICO_COLS.map(c => `<th>${servThColuna(c)}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${itens.map(i => `
              <tr class="${_servSelecionados.has(i.id) ? 'row-selected' : ''}">
                <td><button type="button" class="btn-fav" data-fav-servico="${i.id}" title="${i.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'}"
                    style="background:none;border:none;padding:2px;cursor:pointer;line-height:0;display:flex;color:${i.favorito ? 'var(--warning)' : 'var(--text-faint)'};">${iconeEstrela(i.favorito)}</button></td>
                <td><input type="checkbox" class="row-check-serv" data-check-servico="${i.id}" ${_servSelecionados.has(i.id) ? 'checked' : ''}></td>
                <td class="cell-tag">${escapeHtml(i.codigo)}</td>
                <td><strong>${escapeHtml(i.descricao)}</strong></td>
                <td class="cell-tag">${i.grupo ? escapeHtml(i.grupo) : '—'}</td>
                <td>${escapeHtml(i.unidade || 'un')}</td>
                <td>${App.fmtMoney(i.custoUnitario || 0)}</td>
                <td><div class="row-actions">
                  <button class="btn btn-sm" data-solicitar-servico="${i.id}" title="Solicitar compra deste serviço">${Icon('mail',14)}</button>
                  <button class="btn btn-sm" data-edit-servico="${i.id}">${Icon('edit',14)}</button>
                  <button class="btn btn-sm btn-danger" data-del-servico="${i.id}">${Icon('trash',14)}</button>
                </div></td>
              </tr>`).join('') || `<tr><td colspan="${SERVICO_COLS.length + 3}"><div class="empty">${Icon('wrench',30)}<span>${todos.length ? 'Nenhum serviço corresponde aos filtros aplicados.' : 'Nenhum serviço cadastrado ainda.'}</span></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnNovoServico').addEventListener('click', () => abrirFormServico());
    document.getElementById('btnImportServicos').addEventListener('click', () => Importacao.abrirModalImportServicos());
    document.getElementById('btnLimparFiltrosServicos')?.addEventListener('click', () => {
      _servFiltros = {}; _servOrdenacao = null; _servBusca = '';
      salvarFiltrosServicos();
      App.navigate('servicos', true);
    });
    document.getElementById('servBusca').addEventListener('input', (e) => {
      _servBusca = e.target.value;
      clearTimeout(_servBuscaTimer);
      _servBuscaTimer = setTimeout(() => {
        App.navigate('servicos', true);
        const inp = document.getElementById('servBusca');
        if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
      }, 220);
    });
    document.querySelectorAll('[data-servcolfilter]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      servAbrirPopoverFiltro(b.dataset.servcolfilter, b);
    }));
    document.querySelectorAll('[data-fav-servico]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.favServico;
      const item = Store.get('servicos', id);
      if (item) Store.update('servicos', id, { favorito: !item.favorito });
    }));
    document.querySelectorAll('[data-edit-servico]').forEach(b => b.addEventListener('click', () => abrirFormServico(b.dataset.editServico)));
    document.querySelectorAll('[data-del-servico]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir este serviço?', () => { Store.remove('servicos', b.dataset.delServico); App.toast('Serviço excluído.', 'success'); });
    }));
    document.querySelectorAll('[data-solicitar-servico]').forEach(b => b.addEventListener('click', () => abrirModalSolicitacaoServico([b.dataset.solicitarServico])));
    document.getElementById('btnSolicitarCompraServico')?.addEventListener('click', () => abrirModalSolicitacaoServico([..._servSelecionados]));

    document.querySelectorAll('.row-check-serv').forEach(cb => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.checkServico;
      if (e.target.checked) _servSelecionados.add(id); else _servSelecionados.delete(id);
      e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
      atualizarBarraSelecaoServicos();
    }));
    document.getElementById('servSelAll')?.addEventListener('change', (e) => {
      document.querySelectorAll('.row-check-serv').forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) _servSelecionados.add(cb.dataset.checkServico); else _servSelecionados.delete(cb.dataset.checkServico);
        cb.closest('tr').classList.toggle('row-selected', e.target.checked);
      });
      atualizarBarraSelecaoServicos();
    });
  },
};

function abrirModalSolicitacaoServico(ids) {
  abrirModalSolicitacaoCompra(ids, {
    colecao: 'servicos',
    ccContaObrigatoria: true,
    rotuloSingular: 'Serviço',
    rotuloPlural: 'serviços',
    aoConcluir: (idsProcessados) => {
      idsProcessados.forEach(id => _servSelecionados.delete(id));
      atualizarBarraSelecaoServicos();
    },
  });
}

function atualizarBarraSelecaoServicos() {
  const btn = document.getElementById('btnSolicitarCompraServico');
  if (!btn) return;
  const n = _servSelecionados.size;
  btn.disabled = n === 0;
  btn.innerHTML = `${Icon('mail', 15)} Solicitar Compra${n ? ` (${n})` : ''}`;
}

// ------------------------------------------------------- Filtro estilo Excel
// Mesmo padrão do Estoque (ver estoque.js), com estado e chaves próprias
// para não interferir no filtro/ordenação da tela de Estoque.
function servValorChave(col, item) {
  return String(item[col.key] ?? '');
}
function servFormatarValorColuna(col, item) {
  const v = item[col.key];
  if (v === undefined || v === null || v === '') return '(vazio)';
  if (col.money) return App.fmtMoney(v);
  return String(v);
}
function servAplicarFiltrosOrdenacao(itens) {
  let out = itens;
  const busca = _servBusca.trim().toLowerCase();
  if (busca) {
    out = out.filter(i => (i.descricao || '').toLowerCase().includes(busca) || (i.codigo || '').toLowerCase().includes(busca));
  }
  out = out.filter(i => SERVICO_COLS.every(c => {
    const set = _servFiltros[c.key];
    return !set || set.has(servValorChave(c, i));
  }));
  const col = _servOrdenacao ? SERVICO_COLS.find(c => c.key === _servOrdenacao.key) : null;
  const dir = _servOrdenacao && _servOrdenacao.dir === 'desc' ? -1 : 1;
  // Favoritos sempre no topo; dentro de cada grupo (favorito / não favorito),
  // aplica a ordenação de coluna escolhida pelo usuário, se houver.
  out = [...out].sort((a, b) => {
    const favA = a.favorito ? 1 : 0, favB = b.favorito ? 1 : 0;
    if (favA !== favB) return favB - favA;
    if (!col) return 0;
    const va = a[_servOrdenacao.key], vb = b[_servOrdenacao.key];
    const cmp = col.money ? (va || 0) - (vb || 0) : String(va || '').localeCompare(String(vb || ''), 'pt-BR');
    return cmp * dir;
  });
  return out;
}

// Estrela de favorito: preenchida (fill) quando favoritado, só o contorno
// quando não — não usa o Icon() global porque este precisa alternar o fill
// por instância, e Icon() sempre gera fill="none".
function iconeEstrela(favorito) {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${favorito ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function servThColuna(col) {
  const ativo = !!_servFiltros[col.key] || (_servOrdenacao && _servOrdenacao.key === col.key);
  return `<span style="display:inline-flex;align-items:center;gap:4px;">${col.label}
    <button type="button" class="th-filter-btn" data-servcolfilter="${col.key}" title="Filtrar / ordenar"
      style="background:none;border:none;padding:2px;cursor:pointer;line-height:0;color:${ativo ? 'var(--accent)' : 'var(--text-muted)'};">${Icon('filter', 12)}</button>
  </span>`;
}

function servFecharPopoverFiltro() {
  document.getElementById('colFilterPopover')?.remove();
}

function servAbrirPopoverFiltro(colKey, btnEl) {
  servFecharPopoverFiltro();
  const col = SERVICO_COLS.find(c => c.key === colKey);
  if (!col) return;

  const baseItens = Store.all('servicos').filter(i => SERVICO_COLS.every(c => {
    if (c.key === colKey) return true;
    const set = _servFiltros[c.key];
    return !set || set.has(servValorChave(c, i));
  }));
  const mapaValores = new Map();
  baseItens.forEach(i => { const ch = servValorChave(col, i); if (!mapaValores.has(ch)) mapaValores.set(ch, servFormatarValorColuna(col, i)); });
  const todasChaves = [...mapaValores.keys()].sort((a, b) => (mapaValores.get(a) || '').localeCompare(mapaValores.get(b) || '', 'pt-BR'));
  const selecionadas = _servFiltros[colKey] ? new Set([..._servFiltros[colKey]].filter(ch => mapaValores.has(ch))) : new Set(todasChaves);

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
    _servOrdenacao = { key: colKey, dir: b.dataset.sort };
    salvarFiltrosServicos();
    servFecharPopoverFiltro();
    App.navigate('servicos', true);
  }));
  pop.querySelector('#colFilterClear').addEventListener('click', () => {
    delete _servFiltros[colKey];
    salvarFiltrosServicos();
    servFecharPopoverFiltro();
    App.navigate('servicos', true);
  });
  pop.querySelector('#colFilterCancel').addEventListener('click', servFecharPopoverFiltro);
  pop.querySelector('#colFilterOk').addEventListener('click', () => {
    const marcadas = [...pop.querySelectorAll('.colFilterItem:checked')].map(cb => cb.value);
    if (marcadas.length === todasChaves.length) delete _servFiltros[colKey];
    else _servFiltros[colKey] = new Set(marcadas);
    salvarFiltrosServicos();
    servFecharPopoverFiltro();
    App.navigate('servicos', true);
  });

  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!pop.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
      pop.remove();
      document.removeEventListener('click', h);
    }
  }), 0);
}

// ------------------------------------------------------------------- CRUD
function abrirFormServico(id) {
  const servico = id ? Store.get('servicos', id) : null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Código</label><input id="svCodigo" value="${servico?.codigo || ''}" placeholder="Ex: SV0001"></div>
      <div class="field"><label>Grupo</label><input id="svGrupo" value="${servico?.grupo || ''}"></div>
      <div class="field field-span-2"><label>Descrição</label><input id="svDesc" value="${servico?.descricao || ''}" placeholder="Ex: Retífica de rolamento"></div>
      <div class="field"><label>Unidade</label><input id="svUn" value="${servico?.unidade || 'un'}" placeholder="Ex: un, hora, serviço"></div>
      <div class="field"><label>Custo Unitário (R$)</label><input type="number" step="0.01" id="svCusto" value="${servico?.custoUnitario || 0}"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelSv">Cancelar</button><button class="btn btn-primary" id="saveSv">${Icon('check',15)} Salvar Serviço</button>`;
  App.openModal({ title: servico ? 'Editar Serviço' : 'Novo Serviço', body, footer });
  renderIcons();
  document.getElementById('cancelSv').onclick = App.closeModal;
  document.getElementById('saveSv').onclick = () => {
    const data = {
      codigo: document.getElementById('svCodigo').value.trim(),
      grupo: document.getElementById('svGrupo').value.trim(),
      descricao: document.getElementById('svDesc').value.trim(),
      unidade: document.getElementById('svUn').value.trim() || 'un',
      custoUnitario: Number(document.getElementById('svCusto').value) || 0,
    };
    if (!data.codigo) { App.toast('Informe o código do serviço.', 'danger'); return; }
    if (!data.descricao) { App.toast('Informe a descrição do serviço.', 'danger'); return; }
    if (servico) { Store.update('servicos', servico.id, data); App.toast('Serviço atualizado.', 'success'); }
    else { Store.add('servicos', data); App.toast('Serviço cadastrado.', 'success'); }
    App.closeModal();
  };
}
