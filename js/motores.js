/* ==========================================================================
   FertGrow CMMS — Motores
   ========================================================================== */

// Cada coluna da tabela tem um filtro estilo Excel (clique no ícone de funil no
// cabeçalho): lista de valores únicos com busca + ordenação A→Z / Z→A — mesmo padrão já
// usado em Estoque (js/estoque.js). `valor(m)` é opcional — colunas sem ele usam m[key]
// direto; colunas com valor computado (Equipamento, Potência, Depreciação etc.) precisam dele.
// Um Motor e um Redutor que compartilham o mesmo Equipamento formam um
// "Motorredutor" (conjunto) — não é um valor gravado no cadastro, é
// calculado comparando com o restante da lista. Usado tanto no filtro da
// coluna Tipo quanto no atalho rápido, pra dar pra filtrar só os conjuntos.
// Só pareia quando o equipamento tem EXATAMENTE um Motor e um Redutor — se
// houver mais de um de qualquer um dos dois (ex: um motor reserva também
// vinculado ao mesmo equipamento), não dá pra saber com certeza qual motor
// forma o par com qual redutor, então NENHUM dos dois é agrupado (todos
// aparecem avulsos). Isso evita o bug de um registro "sumir" da tabela por
// ter sido escondido dentro de um par errado escolhido arbitrariamente.
function chaveEquipMotor(m) { return m.ativoId || (m.ativoTexto ? `txt:${m.ativoTexto}` : null); }
function motorParPareado(m) {
  const k = chaveEquipMotor(m);
  if (!k) return null;
  const doGrupo = Store.all('motores').filter(x => chaveEquipMotor(x) === k);
  const motoresDoGrupo = doGrupo.filter(x => x.tipo !== 'Redutor');
  const redutoresDoGrupo = doGrupo.filter(x => x.tipo === 'Redutor');
  if (motoresDoGrupo.length === 1 && redutoresDoGrupo.length === 1) {
    return { motor: motoresDoGrupo[0], redutor: redutoresDoGrupo[0] };
  }
  return null;
}
function tipoEfetivoMotor(m) { return motorParPareado(m) ? 'Motorredutor' : (m.tipo || 'Motor'); }

const MOTORES_COLS = [
  { key: 'tag', label: 'TAG' },
  { key: 'codigoInterno', label: 'Código Interno' },
  { key: 'tipo', label: 'Tipo', valor: m => tipoEfetivoMotor(m) },
  { key: 'equipamento', label: 'Equipamento', valor: m => motorAtivoNome(m) },
  { key: 'setor', label: 'Setor', valor: m => motorSetorNome(m) || '—' },
  { key: 'fabricanteModelo', label: 'Fabricante/Modelo', valor: m => `${m.fabricante || ''} · ${m.modelo || ''}` },
  { key: 'potencia', label: 'Potência', valor: m => m.tipo === 'Redutor' ? (m.relacaoReducao != null ? `${m.relacaoReducao}:1` : '') : (m.potenciaCV != null ? String(m.potenciaCV) : '') },
  { key: 'status', label: 'Status' },
  { key: 'statusManutencao', label: 'Manutenção', valor: m => m.statusManutencao || '—' },
  { key: 'depreciacao', label: 'Depreciação', valor: m => Store.validadeMotor(m).status },
  { key: 'localAtual', label: 'Local' },
  { key: 'docs', label: 'Docs', valor: m => String((m.documentos || []).length) },
];

let _motFiltros = {};     // { [colKey]: Set<string> de chaves selecionadas } — ausente = sem filtro
let _motOrdenacao = null; // { key, dir: 'asc'|'desc' }

const MOTORES_FILTROS_KEY = 'fertgrow_motores_filtros_v1';
(function carregarFiltrosMotoresSalvos() {
  try {
    const raw = localStorage.getItem(MOTORES_FILTROS_KEY);
    if (!raw) return;
    const salvo = JSON.parse(raw);
    Object.entries(salvo.filtros || {}).forEach(([k, arr]) => { _motFiltros[k] = new Set(arr); });
    _motOrdenacao = salvo.ordenacao || null;
  } catch (e) { console.warn('Falha ao carregar filtros salvos de motores.', e); }
})();
function salvarFiltrosMotores() {
  const filtros = {};
  Object.entries(_motFiltros).forEach(([k, set]) => { filtros[k] = [...set]; });
  localStorage.setItem(MOTORES_FILTROS_KEY, JSON.stringify({ filtros, ordenacao: _motOrdenacao }));
}
function motValorChave(col, item) {
  const v = col.valor ? col.valor(item) : item[col.key];
  return String(v ?? '');
}
function motFormatarValorColuna(col, item) {
  const v = col.valor ? col.valor(item) : item[col.key];
  return (v === undefined || v === null || v === '') ? '(vazio)' : String(v);
}
function motAplicarFiltrosOrdenacao(itens) {
  let out = itens.filter(m => MOTORES_COLS.every(c => {
    const set = _motFiltros[c.key];
    return !set || set.has(motValorChave(c, m));
  }));
  if (_motOrdenacao) {
    const dir = _motOrdenacao.dir === 'desc' ? -1 : 1;
    const col = MOTORES_COLS.find(c => c.key === _motOrdenacao.key);
    out = [...out].sort((a, b) => motValorChave(col, a).localeCompare(motValorChave(col, b), 'pt-BR') * dir);
  }
  return out;
}
function thColunaMotor(col) {
  const ativo = !!_motFiltros[col.key] || (_motOrdenacao && _motOrdenacao.key === col.key);
  return `<span style="display:inline-flex;align-items:center;gap:4px;">${col.label}
    <button type="button" class="th-filter-btn" data-motcolfilter="${col.key}" title="Filtrar / ordenar"
      style="background:none;border:none;padding:2px;cursor:pointer;line-height:0;color:${ativo ? 'var(--accent)' : 'var(--text-muted)'};">${Icon('filter', 12)}</button>
  </span>`;
}
function fecharPopoverFiltroMotor() {
  document.getElementById('motColFilterPopover')?.remove();
}
function abrirPopoverFiltroMotor(colKey, btnEl) {
  fecharPopoverFiltroMotor();
  const col = MOTORES_COLS.find(c => c.key === colKey);
  if (!col) return;
  const baseItens = Store.all('motores').filter(m => MOTORES_COLS.every(c => {
    if (c.key === colKey) return true;
    const set = _motFiltros[c.key];
    return !set || set.has(motValorChave(c, m));
  }));
  const mapaValores = new Map();
  baseItens.forEach(m => { const ch = motValorChave(col, m); if (!mapaValores.has(ch)) mapaValores.set(ch, motFormatarValorColuna(col, m)); });
  const todasChaves = [...mapaValores.keys()].sort((a, b) => (mapaValores.get(a) || '').localeCompare(mapaValores.get(b) || '', 'pt-BR'));
  const selecionadas = _motFiltros[colKey] ? new Set([..._motFiltros[colKey]].filter(ch => mapaValores.has(ch))) : new Set(todasChaves);

  const pop = document.createElement('div');
  pop.id = 'motColFilterPopover';
  const rect = btnEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 256);
  pop.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${Math.max(8, left)}px;width:240px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-2);z-index:200;font-size:13px;`;
  pop.innerHTML = `
    <div style="padding:8px;border-bottom:1px solid var(--border-soft);display:flex;gap:6px;">
      <button class="btn btn-sm" data-sort="asc" style="flex:1;">A → Z</button>
      <button class="btn btn-sm" data-sort="desc" style="flex:1;">Z → A</button>
    </div>
    <div style="padding:8px;">
      <input type="text" id="motColFilterSearch" placeholder="Buscar valor..." style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12.5px;box-sizing:border-box;">
    </div>
    <div style="max-height:220px;overflow-y:auto;padding:0 8px;">
      <label style="display:flex;gap:6px;align-items:center;padding:5px 2px;border-bottom:1px solid var(--border-soft);font-weight:600;cursor:pointer;">
        <input type="checkbox" id="motColFilterAll" ${selecionadas.size === todasChaves.length ? 'checked' : ''}> (Selecionar Tudo)
      </label>
      <div id="motColFilterList">
        ${todasChaves.map(ch => `<label data-label="${(mapaValores.get(ch) || '').toLowerCase()}" style="display:flex;gap:6px;align-items:center;padding:4px 2px;cursor:pointer;">
          <input type="checkbox" class="motColFilterItem" value="${ch}" ${selecionadas.has(ch) ? 'checked' : ''}>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${mapaValores.get(ch)}</span>
        </label>`).join('') || '<div class="text-muted" style="padding:8px 2px;font-size:12px;">Nenhum valor disponível.</div>'}
      </div>
    </div>
    <div style="padding:8px;border-top:1px solid var(--border-soft);display:flex;gap:6px;justify-content:space-between;">
      <button class="btn btn-sm" id="motColFilterClear">Limpar</button>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm" id="motColFilterCancel">Cancelar</button>
        <button class="btn btn-sm btn-primary" id="motColFilterOk">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(pop);
  renderIcons(pop);

  pop.querySelector('#motColFilterSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    pop.querySelectorAll('#motColFilterList label[data-label]').forEach(l => {
      l.style.display = l.dataset.label.includes(q) ? 'flex' : 'none';
    });
  });
  pop.querySelector('#motColFilterAll').addEventListener('change', (e) => {
    pop.querySelectorAll('.motColFilterItem').forEach(cb => { cb.checked = e.target.checked; });
  });
  pop.querySelectorAll('.motColFilterItem').forEach(cb => cb.addEventListener('change', () => {
    const todas = pop.querySelectorAll('.motColFilterItem');
    pop.querySelector('#motColFilterAll').checked = [...todas].every(c => c.checked);
  }));
  pop.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
    _motOrdenacao = { key: colKey, dir: b.dataset.sort };
    salvarFiltrosMotores();
    fecharPopoverFiltroMotor();
    App.navigate('motores', true);
  }));
  pop.querySelector('#motColFilterClear').addEventListener('click', () => {
    delete _motFiltros[colKey];
    salvarFiltrosMotores();
    fecharPopoverFiltroMotor();
    App.navigate('motores', true);
  });
  pop.querySelector('#motColFilterCancel').addEventListener('click', fecharPopoverFiltroMotor);
  pop.querySelector('#motColFilterOk').addEventListener('click', () => {
    const marcadas = [...pop.querySelectorAll('.motColFilterItem:checked')].map(cb => cb.value);
    if (marcadas.length === todasChaves.length) delete _motFiltros[colKey];
    else _motFiltros[colKey] = new Set(marcadas);
    salvarFiltrosMotores();
    fecharPopoverFiltroMotor();
    App.navigate('motores', true);
  });

  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!pop.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
      pop.remove();
      document.removeEventListener('click', h);
    }
  }), 0);
}

let _saidaSelecionados = new Set(); // chaves "motorId:comp" com manutenção externa "Aguardando Saída" selecionadas

Views.motores = {
  title: 'Motores',
  render() {
    const motoresTodos = Store.all('motores');
    const porStatus = s => motoresTodos.filter(m => m.status === s).length;
    const comValidade = motoresTodos.map(m => ({ m, v: Store.validadeMotor(m) }));
    const vencidos = comValidade.filter(x => x.v.status === 'Vencido');
    const proximos = comValidade.filter(x => x.v.status === 'Próximo do Vencimento');
    const alertaValidade = [...vencidos, ...proximos];
    const casosExternos = [];
    motoresTodos.forEach(m => {
      ['motor', 'redutor'].forEach(comp => {
        const caso = m.manutencaoExterna?.[comp];
        if (caso) casosExternos.push({ m, comp, caso });
      });
    });

    const motores = motAplicarFiltrosOrdenacao(motoresTodos);
    const temFiltroMotores = Object.keys(_motFiltros).length > 0 || !!_motOrdenacao;

    // Atalhos rápidos pros filtros mais usados — atuam sobre o mesmo _motFiltros do funil
    // de coluna (linkados: escolher aqui equivale a marcar só aquele valor lá).
    const setoresMotores = [...new Set(motoresTodos.map(m => motorSetorNome(m)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const locaisMotores = [...new Set(motoresTodos.map(m => m.localAtual).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const equipamentosMotores = [...new Set(motoresTodos.map(m => motorAtivoNome(m)).filter(v => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'pt'));
    const cvsMotores = [...new Set(motoresTodos.map(m => m.potenciaCV).filter(cv => cv !== null && cv !== undefined))].sort((a, b) => a - b);
    const valorUnicoFiltro = key => (_motFiltros[key] && _motFiltros[key].size === 1) ? [..._motFiltros[key]][0] : '';

    // "Conjunto motorredutor" não é um tipo de registro — é só um Motor e um Redutor
    // compartilhando o mesmo Equipamento. Quando os dois existem pro mesmo Equipamento, a
    // tabela mostra UMA linha "Motorredutor" no lugar das duas; "Ver" abre os dois separados.
    const chaveEquip = chaveEquipMotor;
    const porEquip = new Map();
    motores.forEach(m => {
      const k = chaveEquip(m);
      if (!k) return;
      if (!porEquip.has(k)) porEquip.set(k, []);
      porEquip.get(k).push(m);
    });
    const linhasTabela = [];
    const jaListado = new Set();
    motores.forEach(m => {
      if (jaListado.has(m.id)) return;
      const k = chaveEquip(m);
      const grupo = k ? (porEquip.get(k) || []) : [];
      // Só forma o par quando há exatamente 1 Motor + 1 Redutor visíveis neste
      // equipamento (mesma regra de motorParPareado, mas sobre a lista já
      // filtrada) — com mais de um de qualquer um dos dois, não dá pra saber
      // qual é o par certo, então nenhum vira "Motorredutor" (evita esconder
      // um registro dentro de um par escolhido arbitrariamente).
      const motoresDoGrupo = grupo.filter(x => x.tipo !== 'Redutor');
      const redutoresDoGrupo = grupo.filter(x => x.tipo === 'Redutor');
      const motorDoGrupo = motoresDoGrupo.length === 1 ? motoresDoGrupo[0] : null;
      const redutorDoGrupo = redutoresDoGrupo.length === 1 ? redutoresDoGrupo[0] : null;
      if (motorDoGrupo && redutorDoGrupo && !jaListado.has(motorDoGrupo.id) && !jaListado.has(redutorDoGrupo.id)) {
        jaListado.add(motorDoGrupo.id); jaListado.add(redutorDoGrupo.id);
        linhasTabela.push({ conjunto: true, motor: motorDoGrupo, redutor: redutorDoGrupo });
      } else {
        jaListado.add(m.id);
        linhasTabela.push({ conjunto: false, m });
      }
    });

    return `
      <div class="view-head">
        <div><h1>Controle de Motores</h1><div class="sub">${motoresTodos.length} motores cadastrados</div></div>
        <div class="view-actions">
          ${temFiltroMotores ? `<button class="btn btn-sm" id="btnLimparFiltrosMotores">${Icon('x',14)} Limpar filtros</button>` : ''}
          <button class="btn" id="btnExportarPdfMotores">${Icon('print',15)} Exportar PDF</button>
          <button class="btn btn-primary" id="btnNovoMotor">${Icon('plus',15)} Novo Motor</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:18px;">
        ${miniStatMotor('Operação', porStatus('Operação'), 'success', 'power')}
        ${miniStatMotor('Reserva', porStatus('Reserva'), 'info', 'refresh')}
        ${miniStatMotor('Oficina', porStatus('Oficina'), 'danger', 'wrench')}
        ${miniStatMotor('Estoque', porStatus('Estoque'), 'neutral', 'package')}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid cols-auto">
          <div class="field"><label>Filtrar por Tipo</label><select id="fMotTipo"><option value="">Todos</option>${['Motor','Redutor','Motorredutor'].map(t => `<option ${valorUnicoFiltro('tipo')===t?'selected':''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Filtrar por Setor</label><select id="fMotSetor"><option value="">Todos</option>${setoresMotores.map(s => `<option ${valorUnicoFiltro('setor')===s?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Filtrar por Local</label><select id="fMotLocal"><option value="">Todos</option>${locaisMotores.map(l => `<option ${valorUnicoFiltro('localAtual')===l?'selected':''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Filtrar por Equipamento</label><select id="fMotEquipamento"><option value="">Todos</option>${equipamentosMotores.map(eq => `<option ${valorUnicoFiltro('equipamento')===eq?'selected':''}>${eq}</option>`).join('')}</select></div>
          <div class="field"><label>Filtrar por CV</label><select id="fMotCV"><option value="">Todos</option>${cvsMotores.map(cv => `<option value="${cv}" ${valorUnicoFiltro('potencia')===String(cv)?'selected':''}>${cv} CV</option>`).join('')}</select></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;${casosExternos.length ? 'border-color:rgba(242,73,92,.4);' : ''}">
        <div class="flex-between" style="flex-wrap:wrap;gap:10px;">
          <div class="flex" style="gap:10px;align-items:center;color:${casosExternos.length ? 'var(--danger)' : 'var(--text-muted)'};font-weight:600;font-size:13px;">
            ${Icon('wrench',18)} ${casosExternos.length} item(ns) com manutenção externa em andamento
          </div>
          ${[..._saidaSelecionados].filter(k => casosExternos.some(x => `${x.m.id}:${x.comp}` === k)).length ? `<button class="btn btn-sm btn-primary" id="btnSolicitarSaidaLote">${Icon('check',13)} Solicitar Saída em Lote (${[..._saidaSelecionados].filter(k => casosExternos.some(x => `${x.m.id}:${x.comp}` === k)).length})</button>` : ''}
        </div>
        ${casosExternos.length ? `<div class="mt-8">
          ${casosExternos.map(({ m, comp, caso }) => { const chave = `${m.id}:${comp}`; return `<div class="flex-between" style="padding:7px 0;border-top:1px solid var(--border-soft);font-size:12.5px;">
            <span class="flex" style="gap:8px;align-items:center;cursor:pointer;" data-view-motor="${m.id}">
              ${caso.status === 'Aguardando Saída' ? `<input type="checkbox" class="chk-saida-lote" value="${chave}" ${_saidaSelecionados.has(chave) ? 'checked' : ''} onclick="event.stopPropagation()">` : ''}
              ${m.tag}${m.codigoInterno ? ' · '+m.codigoInterno : ''} — ${motorAtivoNome(m)} <span class="badge badge-neutral" style="margin-left:4px;">${comp === 'motor' ? 'Motor' : 'Redutor'}</span>
            </span>
            <span class="badge badge-${caso.status === 'Aguardando Saída' ? 'info' : 'warning'}">${caso.status}${caso.empresaEscolhida ? ' · '+caso.empresaEscolhida : ''}</span>
          </div>`; }).join('')}
        </div>` : ''}
      </div>

      ${alertaValidade.length ? `<div class="card" style="margin-bottom:16px;border-color:rgba(242,183,5,.4);">
        <div class="flex-between" style="flex-wrap:wrap;gap:10px;">
          <div class="flex" style="gap:10px;align-items:center;color:var(--warning);font-weight:600;font-size:13px;">
            ${Icon('alert',18)} ${alertaValidade.length} motor(es) com validade de depreciação vencida ou próxima do vencimento
          </div>
        </div>
        <div class="mt-8">
          ${alertaValidade.map(x => `<div class="flex-between" style="padding:6px 0;border-top:1px solid var(--border-soft);font-size:12.5px;">
            <span>${x.m.tag} — ${Store.ativoNome(x.m.ativoId)}</span>
            <span class="badge badge-${x.v.status==='Vencido'?'danger':'warning'}">${x.v.status} · ${x.v.dataValidade ? App.fmtDate(x.v.dataValidade) : '—'}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="table-wrap">
        <table>
          <thead><tr>${MOTORES_COLS.map(c => `<th>${thColunaMotor(c)}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${linhasTabela.map(linha => {
              if (linha.conjunto) {
                const { motor, redutor } = linha;
                return `
              <tr>
                <td class="cell-tag">${motor.tag} + ${redutor.tag}</td>
                <td class="cell-tag">${motor.codigoInterno || '—'}</td>
                <td><span class="badge badge-success">Motorredutor</span></td>
                <td>${motorAtivoNome(motor)}</td>
                <td>${motorSetorNome(motor) || '—'}</td>
                <td>${motor.fabricante} · ${motor.modelo}</td>
                <td>${motor.potenciaCV} CV · ${redutor.relacaoReducao ? redutor.relacaoReducao + ':1' : '—'}</td>
                <td>${motor.status === redutor.status ? `<span class="badge badge-${App.badgeForStatus(motor.status)}">${motor.status}</span>` : `<span class="badge badge-${App.badgeForStatus(motor.status)}">${motor.status}</span> <span class="badge badge-${App.badgeForStatus(redutor.status)}">${redutor.status}</span>`}</td>
                <td>—</td>
                <td>—</td>
                <td>${motor.localAtual}</td>
                <td>—</td>
                <td><div class="row-actions">
                  <button class="btn btn-sm" data-ver-conjunto="${motor.id}:${redutor.id}" title="Ver Motor e Redutor">${Icon('eye',14)}</button>
                </div></td>
              </tr>`;
              }
              const m = linha.m;
              const v = Store.validadeMotor(m);
              return `
              <tr>
                <td class="cell-tag">${m.tag}</td>
                <td class="cell-tag">${m.codigoInterno || '—'}</td>
                <td><span class="badge badge-${badgeTipo(m.tipo)}">${m.tipo || 'Motor'}</span></td>
                <td>${motorAtivoNome(m)}</td>
                <td>${motorSetorNome(m) || '—'}</td>
                <td>${m.fabricante} · ${m.modelo}</td>
                <td>${m.tipo === 'Redutor' ? (m.relacaoReducao ? `${m.relacaoReducao}:1` : '—') : `${m.potenciaCV} CV · ${m.rpm} RPM`}</td>
                <td><span class="badge badge-${App.badgeForStatus(m.status)}">${m.status}</span></td>
                <td><span class="badge badge-${badgeManutencao(m.statusManutencao)}">${m.statusManutencao || '—'}</span></td>
                <td><span class="badge badge-${badgeValidade(v.status)}">${v.status}</span></td>
                <td>${m.localAtual}</td>
                <td>${(m.documentos||[]).length ? `<span class="cell-tag">${Icon('paperclip',12)} ${(m.documentos||[]).length}</span>` : '—'}</td>
                <td><div class="row-actions">
                  <button class="btn btn-sm" data-view-motor="${m.id}" title="Ver">${Icon('eye',14)}</button>
                  <button class="btn btn-sm" data-edit-motor="${m.id}" title="Editar">${Icon('edit',14)}</button>
                  <button class="btn btn-sm" data-dup-motor="${m.id}" title="Duplicar">${Icon('package',14)}</button>
                  <button class="btn btn-sm" data-swap-motor="${m.id}" title="Trocar status">${Icon('refresh',14)}</button>
                  <button class="btn btn-sm" data-mover-motor="${m.id}" title="Mover para outro equipamento">${Icon('arrow-right',14)}</button>
                  <button class="btn btn-sm btn-danger" data-del-motor="${m.id}" title="Excluir">${Icon('trash',14)}</button>
                </div></td>
              </tr>`; }).join('') || `<tr><td colspan="12"><div class="empty">${Icon('bolt',30)}<span>${motoresTodos.length ? 'Nenhum motor encontrado com os filtros atuais.' : 'Nenhum motor cadastrado.'}</span></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnNovoMotor').addEventListener('click', () => abrirFormMotor());
    document.getElementById('btnExportarPdfMotores').addEventListener('click', () => Importacao.exportarPdf('motores'));
    document.querySelectorAll('[data-view-motor]').forEach(b => b.addEventListener('click', () => verMotor(b.dataset.viewMotor)));
    document.querySelectorAll('[data-ver-conjunto]').forEach(b => b.addEventListener('click', () => {
      const [motorId, redutorId] = b.dataset.verConjunto.split(':');
      verConjuntoMotorredutor(motorId, redutorId);
    }));
    document.querySelectorAll('[data-edit-motor]').forEach(b => b.addEventListener('click', () => abrirFormMotor(b.dataset.editMotor)));
    document.querySelectorAll('[data-dup-motor]').forEach(b => b.addEventListener('click', () => duplicarMotor(b.dataset.dupMotor)));
    document.querySelectorAll('[data-swap-motor]').forEach(b => b.addEventListener('click', () => abrirTrocaMotor(b.dataset.swapMotor)));
    document.querySelectorAll('[data-mover-motor]').forEach(b => b.addEventListener('click', () => abrirMoverMotor(b.dataset.moverMotor)));
    document.querySelectorAll('[data-del-motor]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir este motor do cadastro?', () => { Store.remove('motores', b.dataset.delMotor); App.toast('Motor excluído.', 'success'); });
    }));

    document.querySelectorAll('[data-motcolfilter]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirPopoverFiltroMotor(b.dataset.motcolfilter, b);
    }));
    document.getElementById('btnLimparFiltrosMotores')?.addEventListener('click', () => {
      _motFiltros = {}; _motOrdenacao = null;
      salvarFiltrosMotores();
      App.navigate('motores', true);
    });

    function ligarFiltroRapido(id, chave) {
      document.getElementById(id).addEventListener('change', (e) => {
        if (e.target.value) _motFiltros[chave] = new Set([e.target.value]);
        else delete _motFiltros[chave];
        salvarFiltrosMotores();
        App.navigate('motores', true);
      });
    }
    ligarFiltroRapido('fMotTipo', 'tipo');
    ligarFiltroRapido('fMotSetor', 'setor');
    ligarFiltroRapido('fMotLocal', 'localAtual');
    ligarFiltroRapido('fMotEquipamento', 'equipamento');
    ligarFiltroRapido('fMotCV', 'potencia');

    document.querySelectorAll('.chk-saida-lote').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) _saidaSelecionados.add(cb.value); else _saidaSelecionados.delete(cb.value);
      App.navigate('motores', true);
    }));
    document.getElementById('btnSolicitarSaidaLote')?.addEventListener('click', () => abrirSolicitarSaidaLote([..._saidaSelecionados]));
  },
};

function miniStatMotor(label, value, color, icon) {
  const colorVar = color === 'neutral' ? 'var(--text-muted)' : `var(--${color})`;
  return `<div class="card" style="padding:14px 16px;"><div class="flex-between">
    <div><div class="kpi-label">${label}</div><div class="kpi-value" style="font-size:22px;margin-top:4px;">${value}</div></div>
    <div class="kpi-icon" style="color:${colorVar};background:color-mix(in srgb, ${colorVar} 15%, transparent);">${Icon(icon,17)}</div>
  </div></div>`;
}

function badgeManutencao(status) {
  const map = { 'Em Dia': 'success', 'Pendente': 'warning', 'Em Manutenção': 'info', 'Atrasada': 'danger' };
  return map[status] || 'neutral';
}

function motorAtivoNome(m) {
  return m.ativoTexto || Store.ativoNome(m.ativoId) || '—';
}

// Setor da árvore do Melvin (Filial > Setor > Ativo — sincronização de Ativos
// grava Setor como Pasta do Ativo; ver ativoSetorNome em js/semanas.js). Um
// motor Reserva/Oficina/Estoque não tem Equipamento instalado, então não dá
// pra derivar o Setor dele — por isso também aceita um valor gravado
// manualmente no próprio motor (`m.setor`), preenchido no cadastro.
function motorSetorNome(m) {
  if (m.setor) return m.setor;
  if (!m.ativoId) return null;
  const ativo = Store.get('ativos', m.ativoId);
  return ativo ? ativoSetorNome(ativo) : null;
}
function setoresConhecidos() {
  return [...new Set(Store.all('ativos').map(a => ativoSetorNome(a)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function badgeTipo(tipo) {
  const map = { 'Motor': 'info', 'Redutor': 'warning' };
  return map[tipo] || 'neutral';
}

function badgeValidade(status) {
  const map = { 'Dentro da Validade': 'success', 'Próximo do Vencimento': 'warning', 'Vencido': 'danger', 'Indefinido': 'neutral' };
  return map[status] || 'neutral';
}

function abrirFormMotor(id, dadosClone) {
  const motor = id ? Store.get('motores', id) : null;
  // dadosClone: registro de origem quando se está duplicando (usa os valores
  // dele pra pré-preencher o form, mas `motor` continua null — então o save
  // no fim da função cai no ramo de Store.add, criando um registro novo).
  const modoClone = !motor && !!dadosClone;
  const origem = motor || dadosClone || null;
  const ativos = Store.all('ativos');
  const body = document.createElement('div');
  const tipoAtual = origem?.tipo || 'Motor';
  let docsTemp = modoClone ? [] : (motor?.documentos ? [...motor.documentos] : []);
  // "Motorredutor" só é oferecido ao cadastrar um registro novo (não editando
  // nem duplicando) — selecionar isso cria de uma vez um Motor + um Redutor já
  // vinculados ao mesmo Equipamento, em vez de precisar cadastrar os dois
  // separadamente e depois torcer pra apontarem pro mesmo lugar.
  const opcoesTipo = (motor || modoClone) ? ['Motor', 'Redutor'] : ['Motor', 'Redutor', 'Motorredutor'];
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Tipo</label><select id="mTipo">${opcoesTipo.map(t => `<option ${tipoAtual===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field field-span-2"><label>Equipamento</label>
        <input id="mAtivo" list="dlAtivosMotor" placeholder="Selecione da lista ou digite livremente" value="${origem?.ativoTexto || (origem?.ativoId ? Store.ativoNome(origem.ativoId) : '')}">
        <datalist id="dlAtivosMotor">${ativos.map(a => `<option value="${a.tag} — ${a.nome}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Setor</label>
        <input id="mSetor" list="dlSetoresMotor" placeholder="Preenche sozinho ao escolher o Equipamento" value="${origem ? (motorSetorNome(origem) || '') : ''}">
        <datalist id="dlSetoresMotor">${setoresConhecidos().map(s => `<option value="${s}">`).join('')}</datalist>
      </div>
      <div class="field field-span-2"><label>Equipamentos Compatíveis (se for sobressalente)</label><input id="mEquipCompativeis" list="dlAtivosMotor" placeholder="Ex: P01, P02, P03 — deixe em branco se não for compartilhado" value="${origem?.equipamentosCompativeis || ''}"></div>
      <div class="field"><label>Status</label><select id="mStatus">${['Operação','Reserva','Oficina','Estoque'].map(s => `<option ${origem?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Local</label><input id="mLocal" value="${origem?.localAtual || ''}" placeholder="Ex: Almoxarifado, Oficina Central... — onde está fisicamente se for Reserva/Oficina/Estoque"></div>
      <div class="field"><label>Data de Instalação</label><input type="date" id="mDataInstalacao" value="${modoClone ? '' : (origem?.dataInstalacao || '')}"></div>
      <div class="field"><label>Valor de Aquisição (R$)</label><input type="number" id="mValorAquisicao" value="${origem?.valorAquisicao ?? 0}"></div>
      <div class="field"><label>Depreciação (% a.a.)</label><input type="number" id="mDepreciacao" value="${origem?.depreciacaoPercentual ?? 10}"></div>
      <div class="field"><label>Status de Manutenção</label><select id="mStatusManutencao">${['Em Dia','Pendente','Em Manutenção','Atrasada'].map(s => `<option ${origem?.statusManutencao===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div id="blocoIdentidadeMotor" style="margin-top:16px;">
      <div id="labelIdentidadeMotor" class="${tipoAtual === 'Motorredutor' ? '' : 'hidden'}" style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Identificação — Motor</div>
      <div class="form-grid">
        <div class="field"><label>TAG</label><input id="mTag" value="${modoClone ? 'MOT-' + String(Store.all('motores').length + 1).padStart(3, '0') : (origem?.tag || 'MOT-' + String(Store.all('motores').length + 1).padStart(3, '0'))}"></div>
        <div class="field"><label>Código Interno</label><input id="mCodigoInterno" placeholder="Ex: MC6599" value="${modoClone ? '' : (origem?.codigoInterno || '')}"></div>
        <div class="field"><label>Fabricante</label><input id="mFab" value="${origem?.fabricante || 'WEG'}"></div>
        <div class="field"><label>Modelo</label><input id="mModelo" value="${origem?.modelo || ''}"></div>
      </div>
    </div>
    <div id="blocoIdentidadeRedutor" class="${tipoAtual === 'Motorredutor' ? '' : 'hidden'}" style="margin-top:16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Identificação — Redutor</div>
      <div class="form-grid">
        <div class="field"><label>TAG</label><input id="mTagRedutor" value="RED-${String(Store.all('motores').length + 1).padStart(3, '0')}"></div>
        <div class="field"><label>Código Interno</label><input id="mCodigoInternoRedutor" placeholder="Ex: MC6599"></div>
        <div class="field"><label>Fabricante</label><input id="mFabRedutor" value="SEW"></div>
        <div class="field"><label>Modelo</label><input id="mModeloRedutor"></div>
      </div>
    </div>
    <div id="blocoMotorEletrico" class="${tipoAtual === 'Redutor' ? 'hidden' : ''}" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Dados Elétricos do Motor</div>
      <div class="form-grid">
        <div class="field"><label>Potência (CV)</label><input type="number" id="mPot" value="${origem?.potenciaCV || 10}"></div>
        <div class="field"><label>Tensão (V)</label><input type="number" id="mTensao" value="${origem?.tensaoV || 380}"></div>
        <div class="field"><label>Corrente (A)</label><input type="number" id="mCorrente" value="${origem?.correnteA || 12}"></div>
        <div class="field"><label>Rotação (RPM)</label><input type="number" id="mRpm" value="${origem?.rpm || 1750}"></div>
      </div>
    </div>
    <div id="blocoRedutor" class="${tipoAtual === 'Motor' ? 'hidden' : ''}" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Dados de Redução</div>
      <div class="form-grid">
        <div class="field"><label>Relação de Redução (i:1)</label><input type="number" id="mRedRelacao" value="${origem?.relacaoReducao ?? ''}"></div>
        <div class="field"><label>Rotação de Saída (RPM)</label><input type="number" id="mRedRpmSaida" value="${origem?.rpmSaida ?? ''}"></div>
        <div class="field"><label>Torque de Saída (N·m)</label><input type="number" id="mRedTorque" value="${origem?.torqueSaidaNm ?? ''}"></div>
      </div>
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Documentos (manual, NF, laudo, foto...)</div>
      <input type="file" id="docInputFormMotor" multiple>
      <div id="listaDocsFormMotor" style="margin-top:12px;">${renderDocsMotor({ documentos: docsTemp })}</div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelMot">Cancelar</button><button class="btn btn-primary" id="saveMot">${Icon('check',15)} Salvar Motor</button>`;
  App.openModal({ title: motor ? 'Editar Motor' : (modoClone ? 'Duplicar Motor' : 'Novo Motor'), body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('mTipo').addEventListener('change', (e) => {
    const v = e.target.value;
    document.getElementById('blocoRedutor').classList.toggle('hidden', v === 'Motor');
    document.getElementById('blocoMotorEletrico').classList.toggle('hidden', v === 'Redutor');
    document.getElementById('blocoIdentidadeRedutor').classList.toggle('hidden', v !== 'Motorredutor');
    document.getElementById('labelIdentidadeMotor').classList.toggle('hidden', v !== 'Motorredutor');
  });

  // Ao escolher um Equipamento real da lista, preenche o Setor sozinho (só se
  // ainda estiver vazio, pra não sobrescrever um valor que a pessoa já digitou
  // à mão — ex: motor Reserva sem Equipamento, com Setor manual).
  document.getElementById('mAtivo').addEventListener('change', (e) => {
    const digitado = e.target.value.trim();
    const ativoEncontrado = ativos.find(a => `${a.tag} — ${a.nome}` === digitado || a.nome === digitado || a.tag === digitado);
    const setorEl = document.getElementById('mSetor');
    if (ativoEncontrado && !setorEl.value.trim()) {
      const setor = ativoSetorNome(ativoEncontrado);
      if (setor) setorEl.value = setor;
    }
  });

  function refreshDocsFormMotor() {
    const wrap = document.getElementById('listaDocsFormMotor');
    wrap.innerHTML = renderDocsMotor({ documentos: docsTemp });
    renderIcons(wrap);
    wrap.querySelectorAll('[data-del-doc]').forEach(b => b.addEventListener('click', () => {
      docsTemp = docsTemp.filter(d => d.id !== b.dataset.delDoc);
      refreshDocsFormMotor();
    }));
  }
  refreshDocsFormMotor();

  document.getElementById('docInputFormMotor').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let pending = files.length;
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        docsTemp = [...docsTemp, { id: Store.uid('doc'), nome: f.name, mime: f.type, tamanho: f.size, data: reader.result, dataUpload: new Date().toISOString().slice(0, 10) }];
        pending--;
        if (pending === 0) { App.toast('Documento(s) pronto(s) para salvar.', 'success'); refreshDocsFormMotor(); }
      };
      reader.readAsDataURL(f);
    });
  });

  document.getElementById('cancelMot').onclick = App.closeModal;
  document.getElementById('saveMot').onclick = () => {
    const tipo = val('mTipo');
    const digitadoAtivo = val('mAtivo').trim();
    const ativoEncontrado = ativos.find(a => `${a.tag} — ${a.nome}` === digitadoAtivo || a.nome === digitadoAtivo || a.tag === digitadoAtivo);
    const comum = {
      ativoId: ativoEncontrado ? ativoEncontrado.id : null,
      ativoTexto: ativoEncontrado ? '' : digitadoAtivo,
      setor: val('mSetor').trim(),
      equipamentosCompativeis: val('mEquipCompativeis'),
      status: val('mStatus'), localAtual: val('mLocal'),
      dataInstalacao: val('mDataInstalacao'), valorAquisicao: Number(val('mValorAquisicao')) || 0,
      depreciacaoPercentual: Number(val('mDepreciacao')) || 0, statusManutencao: val('mStatusManutencao'),
      documentos: docsTemp,
    };

    if (tipo === 'Motorredutor') {
      // Só aparece ao cadastrar um registro novo — cria os dois já vinculados
      // ao mesmo Equipamento/Setor/Status/Local, prontos pra formar o
      // conjunto combinado na tabela (ver motorParPareado).
      Store.add('motores', {
        ...comum, tag: val('mTag'), codigoInterno: val('mCodigoInterno'), tipo: 'Motor',
        fabricante: val('mFab'), modelo: val('mModelo'),
        potenciaCV: Number(val('mPot')), tensaoV: Number(val('mTensao')), correnteA: Number(val('mCorrente')), rpm: Number(val('mRpm')),
        relacaoReducao: null, rpmSaida: null, torqueSaidaNm: null,
        historicoTrocas: [], manutencoes: [],
      });
      Store.add('motores', {
        ...comum, tag: val('mTagRedutor'), codigoInterno: val('mCodigoInternoRedutor'), tipo: 'Redutor',
        fabricante: val('mFabRedutor'), modelo: val('mModeloRedutor'),
        potenciaCV: null, tensaoV: null, correnteA: null, rpm: null,
        relacaoReducao: val('mRedRelacao') ? Number(val('mRedRelacao')) : null,
        rpmSaida: val('mRedRpmSaida') ? Number(val('mRedRpmSaida')) : null,
        torqueSaidaNm: val('mRedTorque') ? Number(val('mRedTorque')) : null,
        historicoTrocas: [], manutencoes: [],
        documentos: [], // já anexados ao Motor acima — evita guardar os mesmos arquivos duas vezes
      });
      App.toast('Motorredutor cadastrado — motor e redutor já vinculados ao mesmo equipamento.', 'success');
      App.closeModal();
      return;
    }

    const data = {
      tag: val('mTag'), codigoInterno: val('mCodigoInterno'), tipo,
      fabricante: val('mFab'), modelo: val('mModelo'),
      potenciaCV: tipo === 'Motor' ? Number(val('mPot')) : null,
      tensaoV: tipo === 'Motor' ? Number(val('mTensao')) : null,
      correnteA: tipo === 'Motor' ? Number(val('mCorrente')) : null,
      rpm: tipo === 'Motor' ? Number(val('mRpm')) : null,
      relacaoReducao: tipo !== 'Motor' && val('mRedRelacao') ? Number(val('mRedRelacao')) : null,
      rpmSaida: tipo !== 'Motor' && val('mRedRpmSaida') ? Number(val('mRedRpmSaida')) : null,
      torqueSaidaNm: tipo !== 'Motor' && val('mRedTorque') ? Number(val('mRedTorque')) : null,
      ...comum,
    };
    if (motor) {
      // Se este registro faz parte de um conjunto Motorredutor e o Equipamento
      // mudou aqui, move o parceiro (motor ou redutor) junto — senão o par
      // fica com ativoId/ativoTexto diferentes, o pareamento quebra e o
      // "Motorredutor" combinado some da tabela (vira dois avulsos soltos).
      const equipMudou = (data.ativoId || null) !== (motor.ativoId || null) || (data.ativoTexto || '') !== (motor.ativoTexto || '');
      const par = equipMudou ? motorParPareado(motor) : null; // captura o par ANTES de atualizar
      const parceiro = par ? (par.motor.id === motor.id ? par.redutor : par.motor) : null;
      Store.update('motores', motor.id, data);
      if (parceiro) {
        Store.update('motores', parceiro.id, { ativoId: data.ativoId, ativoTexto: data.ativoTexto });
        App.toast(`Motor atualizado — o ${parceiro.tipo === 'Redutor' ? 'redutor' : 'motor'} ${parceiro.tag} do mesmo conjunto foi movido junto, pra manter o motorredutor.`, 'success');
      } else {
        App.toast('Motor atualizado.', 'success');
      }
    }
    else { Store.add('motores', { ...data, historicoTrocas: [], manutencoes: [] }); App.toast(modoClone ? 'Motor duplicado com sucesso.' : 'Motor cadastrado.', 'success'); }
    App.closeModal();
  };
}

// Duplicar: abre o mesmo form de cadastro já preenchido com os dados do
// motor/redutor original (menos TAG, código interno, data de instalação e
// documentos, que são específicos daquela unidade física) — o usuário edita
// o que for diferente e salva como um registro novo, sem alterar o original.
function duplicarMotor(id) {
  const original = Store.get('motores', id);
  if (!original) return;
  abrirFormMotor(null, original);
}

// A linha "Motorredutor" da tabela representa um Motor + um Redutor no mesmo Equipamento —
// aqui só oferece escolher qual dos dois abrir; cada um continua sendo visto/editado pela
// mesma tela de sempre (verMotor), com seu próprio histórico intacto.
function verConjuntoMotorredutor(motorId, redutorId) {
  const motor = Store.get('motores', motorId);
  const redutor = Store.get('motores', redutorId);

  function cardConjunto(m, prefixo, badgeClass, especificacao) {
    return `
      <div class="card" style="padding:14px 16px;">
        <div class="flex-between"><span class="badge badge-${badgeClass}">${m.tipo || 'Motor'}</span></div>
        <div style="font-weight:700;margin-top:8px;">${m.tag}</div>
        <div class="cell-tag">${especificacao}</div>
        <div style="margin-top:8px;"><span class="badge badge-${App.badgeForStatus(m.status)}">${m.status}</span></div>
        <div class="row-actions" style="margin-top:10px;">
          <button class="btn btn-sm" id="${prefixo}Ver" title="Ver">${Icon('eye',13)}</button>
          <button class="btn btn-sm" id="${prefixo}Editar" title="Editar">${Icon('edit',13)}</button>
          <button class="btn btn-sm" id="${prefixo}Trocar" title="Trocar status">${Icon('refresh',13)}</button>
          <button class="btn btn-sm" id="${prefixo}Mover" title="Mover para outro equipamento">${Icon('arrow-right',13)}</button>
          <button class="btn btn-sm btn-danger" id="${prefixo}Excluir" title="Excluir">${Icon('trash',13)}</button>
        </div>
      </div>`;
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">Motor e Redutor cadastrados separadamente, cada um com seu próprio histórico.</p>
    <div class="form-grid cols-2">
      ${cardConjunto(motor, 'cjMotor', 'info', `${motor.fabricante} · ${motor.modelo} · ${motor.potenciaCV} CV`)}
      ${cardConjunto(redutor, 'cjRedutor', 'warning', `${redutor.fabricante} · ${redutor.modelo}${redutor.relacaoReducao ? ' · ' + redutor.relacaoReducao + ':1' : ''}`)}
    </div>`;
  App.openModal({ title: `Conjunto Motorredutor — ${motorAtivoNome(motor)}`, body });
  renderIcons();

  function wireCard(prefixo, item) {
    document.getElementById(`${prefixo}Ver`).onclick = () => verMotor(item.id);
    document.getElementById(`${prefixo}Editar`).onclick = () => abrirFormMotor(item.id);
    document.getElementById(`${prefixo}Trocar`).onclick = () => abrirTrocaMotor(item.id);
    document.getElementById(`${prefixo}Mover`).onclick = () => abrirMoverMotor(item.id);
    document.getElementById(`${prefixo}Excluir`).onclick = () => {
      const label = item.tipo === 'Redutor' ? 'redutor' : 'motor';
      App.confirmAction(`Excluir o ${label} ${item.tag} do cadastro?`, () => {
        Store.remove('motores', item.id);
        App.toast(`${label === 'redutor' ? 'Redutor' : 'Motor'} excluído.`, 'success');
      });
    };
  }
  wireCard('cjMotor', motor);
  wireCard('cjRedutor', redutor);
}

function verMotor(id) {
  const m = Store.get('motores', id);
  const valorAtual = Store.valorAtualMotor(m);
  const validade = Store.validadeMotor(m);
  const manutencoes = (m.manutencoes || []).slice().sort((a, b) => b.data.localeCompare(a.data));
  const custoTotalManutencoes = manutencoes.reduce((s, x) => s + (x.valor || 0), 0);
  const body = document.createElement('div');
  body.innerHTML = `
    ${validade.status === 'Vencido' || validade.status === 'Próximo do Vencimento' ? `<div class="card" style="margin-bottom:16px;padding:12px 14px;border-color:${validade.status==='Vencido'?'rgba(242,73,92,.4)':'rgba(242,183,5,.4)'};">
      <div class="flex" style="gap:10px;align-items:center;color:${validade.status==='Vencido'?'var(--danger)':'var(--warning)'};font-weight:600;font-size:13px;">
        ${Icon('alert',17)} ${validade.status === 'Vencido' ? `Validade de depreciação vencida em ${App.fmtDate(validade.dataValidade)} — avaliar substituição do motor.` : `Validade de depreciação próxima do vencimento (${App.fmtDate(validade.dataValidade)}, em ${validade.diasRestantes} dia(s)).`}
      </div>
    </div>` : ''}
    <div class="form-grid cols-3" style="margin-bottom:18px;">
      <div><div class="kpi-label">Tipo</div><div style="margin-top:4px;"><span class="badge badge-${badgeTipo(m.tipo)}">${m.tipo || 'Motor'}</span></div></div>
      <div><div class="kpi-label">Equipamento</div><div style="font-weight:600;margin-top:4px;">${motorAtivoNome(m)}</div></div>
      <div><div class="kpi-label">Status</div><div style="margin-top:4px;"><span class="badge badge-${App.badgeForStatus(m.status)}">${m.status}</span></div></div>
      <div><div class="kpi-label">Data de Instalação</div><div style="font-weight:600;margin-top:4px;">${App.fmtDate(m.dataInstalacao)}</div></div>
      <div><div class="kpi-label">Valor de Aquisição</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(m.valorAquisicao)}</div></div>
      <div><div class="kpi-label">Valor Atual (depreciado)</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(valorAtual)}</div></div>
      <div><div class="kpi-label">Depreciação</div><div style="font-weight:600;margin-top:4px;">${m.depreciacaoPercentual ?? 0}% a.a.</div></div>
      <div><div class="kpi-label">Depreciação — Validade</div><div style="margin-top:4px;"><span class="badge badge-${badgeValidade(validade.status)}">${validade.status}${validade.dataValidade ? ' · ' + App.fmtDate(validade.dataValidade) : ''}</span></div></div>
      <div><div class="kpi-label">Status de Manutenção</div><div style="margin-top:4px;"><span class="badge badge-${badgeManutencao(m.statusManutencao)}">${m.statusManutencao || '—'}</span></div></div>
      <div><div class="kpi-label">Qtd. de Saídas p/ Manutenção</div><div style="font-weight:600;margin-top:4px;">${manutencoes.length}</div></div>
      <div><div class="kpi-label">Documentos Anexados</div><div style="font-weight:600;margin-top:4px;">${(m.documentos||[]).length}</div></div>
      ${m.equipamentosCompativeis ? `<div class="field-span-3"><div class="kpi-label">Equipamentos Compatíveis (sobressalente)</div><div style="font-weight:600;margin-top:4px;">${m.equipamentosCompativeis}</div></div>` : ''}
    </div>

    <div class="card" style="margin-bottom:18px;padding:14px 16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Identificação</div>
      <div class="form-grid cols-3">
        <div><div class="kpi-label">TAG</div><div style="font-weight:600;margin-top:4px;">${m.tag}</div></div>
        <div><div class="kpi-label">Código Interno</div><div style="font-weight:600;margin-top:4px;">${m.codigoInterno || '—'}</div></div>
        <div><div class="kpi-label">Fabricante</div><div style="font-weight:600;margin-top:4px;">${m.fabricante || '—'}</div></div>
        <div><div class="kpi-label">Modelo</div><div style="font-weight:600;margin-top:4px;">${m.modelo || '—'}</div></div>
      </div>
    </div>

    ${m.tipo !== 'Redutor' ? `
    <div class="card" style="margin-bottom:18px;padding:14px 16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Dados Elétricos do Motor</div>
      <div class="form-grid cols-3">
        <div><div class="kpi-label">Potência</div><div style="font-weight:600;margin-top:4px;">${m.potenciaCV} CV</div></div>
        <div><div class="kpi-label">Tensão</div><div style="font-weight:600;margin-top:4px;">${m.tensaoV} V</div></div>
        <div><div class="kpi-label">Corrente</div><div style="font-weight:600;margin-top:4px;">${m.correnteA} A</div></div>
        <div><div class="kpi-label">Rotação</div><div style="font-weight:600;margin-top:4px;">${m.rpm} RPM</div></div>
      </div>
    </div>` : ''}

    ${m.tipo === 'Redutor' ? `
    <div class="card" style="margin-bottom:18px;padding:14px 16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text-muted);">Dados de Redução</div>
      <div class="form-grid cols-3">
        <div><div class="kpi-label">Relação de Redução</div><div style="font-weight:600;margin-top:4px;">${m.relacaoReducao ? m.relacaoReducao + ':1' : '—'}</div></div>
        <div><div class="kpi-label">Rotação de Saída</div><div style="font-weight:600;margin-top:4px;">${m.rpmSaida ? m.rpmSaida + ' RPM' : '—'}</div></div>
        <div><div class="kpi-label">Torque de Saída</div><div style="font-weight:600;margin-top:4px;">${m.torqueSaidaNm ? m.torqueSaidaNm + ' N·m' : '—'}</div></div>
      </div>
    </div>` : ''}

    <div class="tabs">
      <div class="tab active" data-mtab="manut">Manutenções (${manutencoes.length})</div>
      <div class="tab" data-mtab="externa">Manutenção Externa${(m.manutencaoExterna?.motor || m.manutencaoExterna?.redutor) ? ' <span class="badge badge-danger" style="margin-left:4px;">ativo</span>' : ''}</div>
      <div class="tab" data-mtab="trocas">Histórico de Trocas</div>
      <div class="tab" data-mtab="docs">Documentos (${(m.documentos||[]).length})</div>
    </div>

    <div id="motTabManut">
      ${m.manutencaoProximaData ? (() => {
        const hoje = new Date().toISOString().slice(0, 10);
        const dias = Math.round((new Date(m.manutencaoProximaData + 'T00:00:00') - new Date(hoje + 'T00:00:00')) / 86400000);
        const vencido = dias < 0;
        const proximo = dias >= 0 && dias <= 7;
        if (!vencido && !proximo) return `<div class="cell-tag" style="margin-bottom:12px;">${Icon('calendar',13)} Próxima manutenção prevista para ${App.fmtDate(m.manutencaoProximaData)} (a cada ${m.manutencaoPeriodicidadeDias} dias).</div>`;
        return `<div class="card" style="margin-bottom:14px;padding:12px 14px;border-color:${vencido ? 'rgba(242,73,92,.4)' : 'rgba(242,183,5,.4)'};">
          <div class="flex" style="gap:8px;align-items:flex-start;font-size:12.5px;color:${vencido ? 'var(--danger)' : 'var(--warning)'};">
            ${Icon('alert',17)} ${vencido ? `Manutenção preventiva atrasada — prevista para ${App.fmtDate(m.manutencaoProximaData)} (há ${Math.abs(dias)} dia(s)).` : `Manutenção preventiva se aproximando — prevista para ${App.fmtDate(m.manutencaoProximaData)} (em ${dias} dia(s)).`}
          </div>
        </div>`;
      })() : ''}
      <div class="flex-between" style="margin-bottom:10px;">
        <span class="cell-tag">Custo total registrado: ${App.fmtMoney(custoTotalManutencoes)}</span>
        <button class="btn btn-sm btn-primary" id="btnNovaManutMotor">${Icon('plus',13)} Nova Manutenção</button>
      </div>
      ${manutencoes.map(x => `<div style="padding:9px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><div class="flex-between"><strong>${App.fmtMoney(x.valor)}</strong><span class="cell-tag">${App.fmtDate(x.data)}</span></div><div class="text-muted" style="font-size:12px;margin-top:2px;">${x.descricao || 'Sem descrição'} · NF ${x.numeroNF || '—'}</div></div>`).join('') || '<div class="empty">Nenhuma manutenção registrada.</div>'}
    </div>
    <div id="motTabExterna" class="hidden">${renderTabExterna(m)}</div>
    <div id="motTabTrocas" class="hidden">
      ${m.historicoTrocas.map(h => `<div style="padding:9px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><div class="flex-between"><strong>${h.de} → ${h.para}</strong><span class="cell-tag">${App.fmtDate(h.data)}</span></div><div class="text-muted" style="font-size:12px;margin-top:2px;">${h.motivo} · ${h.os}</div></div>`).join('') || '<div class="empty">Sem trocas registradas.</div>'}
    </div>
    <div id="motTabDocs" class="hidden">
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Anexe manuais, notas fiscais, laudos, fotos ou qualquer documento do motor/redutor.</p>
      <input type="file" id="docInputMotor" multiple>
      <div id="listaDocsMotor" style="margin-top:12px;">${renderDocsMotor(m)}</div>
    </div>
  `;
  const overlay = App.openModal({ title: `Motor ${m.tag}`, body, size: 'lg' });
  renderIcons(overlay);
  overlay.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    overlay.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('motTabManut').classList.toggle('hidden', t.dataset.mtab !== 'manut');
    document.getElementById('motTabExterna').classList.toggle('hidden', t.dataset.mtab !== 'externa');
    document.getElementById('motTabTrocas').classList.toggle('hidden', t.dataset.mtab !== 'trocas');
    document.getElementById('motTabDocs').classList.toggle('hidden', t.dataset.mtab !== 'docs');
  }));
  document.getElementById('btnNovaManutMotor').addEventListener('click', () => abrirFormManutencaoMotor(m.id));
  bindTabExterna(overlay, m.id);

  document.getElementById('docInputMotor').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let pending = files.length;
    const novosDocs = [];
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        novosDocs.push({ id: Store.uid('doc'), nome: f.name, mime: f.type, tamanho: f.size, data: reader.result, dataUpload: new Date().toISOString().slice(0, 10) });
        pending--;
        if (pending === 0) {
          const atual = Store.get('motores', m.id);
          const documentos = [...(atual.documentos || []), ...novosDocs];
          Store.update('motores', m.id, { documentos });
          App.toast(novosDocs.length + ' documento(s) anexado(s).', 'success');
          verMotor(m.id);
        }
      };
      reader.readAsDataURL(f);
    });
  });

  overlay.querySelectorAll('[data-del-doc]').forEach(b => b.addEventListener('click', () => {
    App.confirmAction('Remover este documento do motor?', () => {
      const atual = Store.get('motores', m.id);
      const documentos = (atual.documentos || []).filter(d => d.id !== b.dataset.delDoc);
      Store.update('motores', m.id, { documentos });
      App.toast('Documento removido.', 'success');
      verMotor(m.id);
    });
  }));
}

function renderDocsMotor(m) {
  const docs = m.documentos || [];
  if (!docs.length) return `<div class="empty">${Icon('paperclip',26)}<span>Nenhum documento anexado.</span></div>`;
  return `<div style="display:flex;flex-direction:column;gap:0;">${docs.map(d => `
    <div class="flex-between" style="padding:9px 0;border-bottom:1px solid var(--border-soft);font-size:13px;">
      <div class="flex" style="gap:8px;align-items:center;min-width:0;">
        ${Icon('file',16)}
        <div style="min-width:0;">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px;">${d.nome}</div>
          <div class="text-muted" style="font-size:11.5px;">${fmtBytes(d.tamanho)} · anexado em ${App.fmtDate(d.dataUpload)}</div>
        </div>
      </div>
      <div class="row-actions">
        <a class="btn btn-sm" href="${d.data}" download="${d.nome}" title="Baixar">${Icon('download',14)}</a>
        <button class="btn btn-sm btn-danger" data-del-doc="${d.id}" title="Excluir">${Icon('trash',14)}</button>
      </div>
    </div>`).join('')}</div>`;
}

function fmtBytes(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(0) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

function abrirFormManutencaoMotor(motorId) {
  const m = Store.get('motores', motorId);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Data</label><input type="date" id="nmData" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Valor (R$)</label><input type="number" id="nmValor" value="0"></div>
      <div class="field"><label>Número da NF</label><input id="nmNF" placeholder="Ex: NF-12345"></div>
      <div class="field field-span-2"><label>Descrição</label><textarea id="nmDesc" placeholder="Serviço realizado..."></textarea></div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <label class="flex" style="gap:8px;align-items:center;cursor:pointer;font-size:13px;font-weight:600;">
        <input type="checkbox" id="nmLembrar" ${m.manutencaoPeriodicidadeDias ? 'checked' : ''}> Lembrar da próxima manutenção
      </label>
      <div class="field" style="margin-top:10px;">
        <label>A cada quantos dias</label>
        <input type="number" id="nmPeriodicidade" min="1" value="${m.manutencaoPeriodicidadeDias || 90}" ${m.manutencaoPeriodicidadeDias ? '' : 'disabled'}>
      </div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelNm">Cancelar</button><button class="btn btn-primary" id="saveNm">${Icon('check',15)} Registrar Manutenção</button>`;
  App.openModal({ title: `Nova Manutenção — Motor ${m.tag}`, body, footer });
  renderIcons();
  document.getElementById('cancelNm').onclick = App.closeModal;
  document.getElementById('nmLembrar').addEventListener('change', (e) => {
    document.getElementById('nmPeriodicidade').disabled = !e.target.checked;
  });
  document.getElementById('saveNm').onclick = () => {
    const data = document.getElementById('nmData').value;
    const valor = Number(document.getElementById('nmValor').value) || 0;
    const numeroNF = document.getElementById('nmNF').value;
    const descricao = document.getElementById('nmDesc').value;
    if (!data) { App.toast('Informe a data da manutenção.', 'danger'); return; }
    const manutencoes = [...(m.manutencoes || []), { id: Store.uid('mm'), data, valor, numeroNF, descricao }];
    const lembrar = document.getElementById('nmLembrar').checked;
    const periodicidade = Number(document.getElementById('nmPeriodicidade').value) || 0;
    const updateData = { manutencoes };
    if (lembrar && periodicidade > 0) {
      updateData.manutencaoPeriodicidadeDias = periodicidade;
      updateData.manutencaoProximaData = new Date(new Date(data + 'T00:00:00').getTime() + periodicidade * 86400000).toISOString().slice(0, 10);
    } else {
      updateData.manutencaoPeriodicidadeDias = null;
      updateData.manutencaoProximaData = null;
    }
    Store.update('motores', m.id, updateData);
    App.toast('Manutenção registrada com sucesso.', 'success');
    App.closeModal();
    verMotor(m.id);
  };
}

function abrirTrocaMotor(id) {
  const m = Store.get('motores', id);
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:13px;margin-bottom:14px;">Registrar troca de status do motor <strong>${m.tag}</strong>. O histórico será atualizado automaticamente.</p>
    <div class="form-grid">
      <div class="field"><label>Novo Status</label><select id="tNovoStatus">${['Operação','Reserva','Oficina','Estoque'].filter(s=>s!==m.status).map(s => `<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Novo Local</label><input id="tNovoLocal" value="${m.localAtual}"></div>
      <div class="field field-span-2"><label>Motivo da troca</label><input id="tMotivo" placeholder="Ex: falha de rolamento, manutenção preventiva..."></div>
      <div class="field field-span-2"><label>OS relacionada (opcional)</label><input id="tOs" placeholder="OS-0000"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelTr">Cancelar</button><button class="btn btn-primary" id="saveTr">${Icon('refresh',15)} Confirmar Troca</button>`;
  App.openModal({ title: 'Registrar Troca de Motor', body, footer });
  renderIcons();
  document.getElementById('cancelTr').onclick = App.closeModal;
  document.getElementById('saveTr').onclick = () => {
    const novoStatus = val('tNovoStatus'), novoLocal = val('tNovoLocal'), motivo = val('tMotivo') || 'Não informado', os = val('tOs') || '-';
    const historicoTrocas = [...m.historicoTrocas, { data: new Date().toISOString().slice(0,10), de: m.status, para: novoStatus, motivo, os }];
    Store.update('motores', m.id, { status: novoStatus, localAtual: novoLocal, historicoTrocas });
    App.toast('Troca registrada com sucesso.', 'success');
    App.closeModal();
  };
}

// Move o motor pra outro Ativo (equipamento/conjunto). Se outro motor já ocupar o mesmo
// Ativo, ele é automaticamente desvinculado (fica "Reserva") — nunca mexe em
// manutencoes/manutencaoExterna/historicoManutencaoExterna de nenhum dos dois motores.
// `parceiro`: se `m` faz parte de um conjunto Motorredutor, é o motor/redutor
// que forma o par com ele — move junto, senão o par ficaria em equipamentos
// diferentes e o "Motorredutor" combinado sumiria da tabela.
function motMoverParaAtivo(m, alvo, ocupante, parceiro) {
  const hoje = new Date().toISOString().slice(0, 10);
  const localAnterior = m.ativoTexto || Store.ativoNome(m.ativoId) || 'Sem equipamento';
  Store.update('motores', m.id, {
    ativoId: alvo.id,
    ativoTexto: '',
    historicoTrocas: [...m.historicoTrocas, {
      data: hoje, de: localAnterior, para: alvo.nome,
      motivo: 'Movido para outro equipamento/conjunto', os: '-',
    }],
  });
  if (parceiro && (!ocupante || parceiro.id !== ocupante.id)) {
    const localAnteriorParceiro = parceiro.ativoTexto || Store.ativoNome(parceiro.ativoId) || 'Sem equipamento';
    Store.update('motores', parceiro.id, {
      ativoId: alvo.id,
      ativoTexto: '',
      historicoTrocas: [...parceiro.historicoTrocas, {
        data: hoje, de: localAnteriorParceiro, para: alvo.nome,
        motivo: `Movido junto com ${m.tag} para manter o conjunto motorredutor`, os: '-',
      }],
    });
  }
  if (ocupante) {
    Store.update('motores', ocupante.id, {
      ativoId: null,
      ativoTexto: '',
      status: 'Reserva',
      historicoTrocas: [...ocupante.historicoTrocas, {
        data: hoje, de: ocupante.status, para: 'Reserva',
        motivo: `Removido do conjunto — substituído pelo motor ${m.tag}`, os: '-',
      }],
    });
  }
}

function abrirMoverMotor(id) {
  const m = Store.get('motores', id);
  const ativos = Store.all('ativos');
  const equipamentoAtual = m.ativoTexto || Store.ativoNome(m.ativoId);
  // Se `m` faz parte de um conjunto Motorredutor, captura o parceiro AGORA
  // (equipamento atual) pra mover os dois juntos — ver motMoverParaAtivo.
  const parAtual = motorParPareado(m);
  const parceiro = parAtual ? (parAtual.motor.id === m.id ? parAtual.redutor : parAtual.motor) : null;
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:13px;margin-bottom:14px;">
      Mover o motor <strong>${m.tag}</strong> para outro equipamento/conjunto (ex.: o
      motorredutor de um misturador). Equipamento atual: <strong>${equipamentoAtual || '—'}</strong>.
    </p>
    <div class="form-grid">
      <div class="field field-span-2"><label>Novo Equipamento</label>
        <input id="movAtivo" list="dlAtivosMover" placeholder="Selecione da lista">
        <datalist id="dlAtivosMover">${ativos.map(a => `<option value="${a.tag} — ${a.nome}">`).join('')}</datalist>
      </div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelMov">Cancelar</button><button class="btn btn-primary" id="saveMov">${Icon('arrow-right',15)} Mover</button>`;
  App.openModal({ title: 'Mover Motor para Equipamento', body, footer });
  renderIcons();
  document.getElementById('cancelMov').onclick = App.closeModal;
  document.getElementById('saveMov').onclick = () => {
    const digitado = val('movAtivo').trim();
    const alvo = ativos.find(a => `${a.tag} — ${a.nome}` === digitado || a.nome === digitado || a.tag === digitado);
    if (!alvo) { App.toast('Selecione um equipamento válido da lista.', 'danger'); return; }
    if (alvo.id === m.ativoId) { App.toast('O motor já está nesse equipamento.', 'info'); return; }
    // Também casa por ativoTexto (nome digitado livremente, sem vínculo real de ativoId) —
    // motores editados antes desta feature podem estar "no mesmo lugar" só por texto igual.
    const ocupante = Store.all('motores').find(o => o.id !== m.id && (
      o.ativoId === alvo.id ||
      (o.ativoTexto && [alvo.nome, alvo.tag, `${alvo.tag} — ${alvo.nome}`].includes(o.ativoTexto))
    ));
    if (!ocupante) {
      motMoverParaAtivo(m, alvo, null, parceiro);
      App.toast(parceiro
        ? `${m.tag} e o ${parceiro.tipo === 'Redutor' ? 'redutor' : 'motor'} ${parceiro.tag} (mesmo conjunto) movidos para ${alvo.nome}.`
        : `Motor movido para ${alvo.nome}.`, 'success');
      App.closeModal();
      return;
    }
    body.innerHTML = `<p style="font-size:13px;">O equipamento <strong>${alvo.nome}</strong> já
      está ocupado pelo motor <strong>${ocupante.tag}</strong>. Ao continuar, esse motor sai do
      conjunto (fica como <strong>Reserva</strong>) e <strong>${m.tag}</strong> assume o lugar.</p>`;
    footer.innerHTML = `<button class="btn" id="cancelSub">Cancelar</button><button class="btn btn-primary" id="confirmSub">${Icon('check',15)} Substituir</button>`;
    renderIcons();
    document.getElementById('cancelSub').onclick = App.closeModal;
    document.getElementById('confirmSub').onclick = () => {
      motMoverParaAtivo(m, alvo, ocupante, parceiro);
      App.toast(`${m.tag} movido para ${alvo.nome} — ${ocupante.tag} removido do conjunto.`, 'success');
      App.closeModal();
    };
  };
}

/* ------------------------- Manutenção Externa ------------------------- */

function lerArquivoComoDoc(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: Store.uid('doc'), nome: file.name, mime: file.type, tamanho: file.size, data: reader.result, dataUpload: new Date().toISOString().slice(0, 10) });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderTabExterna(m) {
  const componentes = m.tipo === 'Redutor' ? ['redutor'] : ['motor'];
  let html = componentes.map(comp => renderCasoComponente(m, comp)).join('');

  const historico = m.historicoManutencaoExterna || [];
  if (historico.length) {
    html += `
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--text-muted);">Histórico de Manutenções Externas</div>
      ${historico.map(h => `
        <div style="padding:9px 0;border-bottom:1px solid var(--border-soft);font-size:13px;">
          <div class="flex-between"><strong>${h.empresaEscolhida}</strong> <span class="badge badge-neutral" style="margin-left:4px;">${h.componente === 'redutor' ? 'Redutor' : 'Motor'}</span><span class="cell-tag">${App.fmtDate(h.dataSaida)} → ${App.fmtDate(h.dataRetorno)}</span></div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">${h.descricaoFalha || 'Sem descrição'} · Valor final: ${App.fmtMoney(h.valorFinal)}</div>
          ${h.status !== 'Reprovado - Retornou sem Reparo' && h.numeroSC ? `<div class="text-muted" style="font-size:11.5px;margin-top:2px;">SC nº <strong>${escapeHtml(h.numeroSC)}</strong>${h.proposta ? ` · Proposta ${escapeHtml(h.proposta)}` : ''}</div>` : ''}
          ${h.status !== 'Reprovado - Retornou sem Reparo' ? `<button class="btn btn-sm" data-informar-sc="${h.id}" style="margin-top:6px;">${Icon('mail', 12)} Informar SC / Fornecedor</button>` : ''}
        </div>`).join('')}
    `;
  }
  return html || '<div class="empty">Nenhum registro de manutenção externa.</div>';
}

function renderCasoComponente(m, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const caso = m.manutencaoExterna?.[comp];
  let html = `<div style="font-weight:700;font-size:13px;margin-bottom:8px;">${label}</div>`;

  if (!caso) {
    html += `
      <div class="empty" style="margin-bottom:20px;">${Icon('alert', 24)}<span>Nenhuma manutenção externa em andamento (${label}).</span></div>
      <button class="btn btn-primary" data-registrar-falha="${comp}" style="margin-bottom:22px;">${Icon('plus', 14)} Registrar Falha / Solicitar Orçamento (${label})</button>
    `;
    return html;
  }

  html += `
    <div class="card" style="padding:14px 16px;margin-bottom:20px;">
      <div class="flex-between" style="margin-bottom:10px;">
        <div>
          <div style="font-weight:700;font-size:13.5px;">Falha registrada em ${App.fmtDate(caso.dataFalha)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">${caso.descricaoFalha || 'Sem descrição'}</div>
        </div>
        <span class="badge badge-${caso.status === 'Aguardando Saída' ? 'info' : 'warning'}">${caso.status}</span>
      </div>
      ${caso.status !== 'Aguardando Saída' ? `<div class="cell-tag" style="margin-bottom:10px;">Enviado para <strong>${caso.empresaEscolhida}</strong> em ${App.fmtDate(caso.dataSaida)}</div>` : ''}
      ${caso.orcamentoValidado === true ? `<div class="cell-tag" style="margin-bottom:10px;color:var(--success);">Orçamento aprovado: ${App.fmtMoney(caso.valorAprovado)} — aguardando retorno do equipamento.</div>` : ''}

      <div style="font-weight:600;font-size:12.5px;margin-bottom:8px;color:var(--text-muted);">Orçamentos (${caso.orcamentos.length})</div>
      ${caso.orcamentos.map(o => `
        <div class="flex-between" style="padding:7px 0;border-bottom:1px solid var(--border-soft);font-size:12.5px;">
          <div class="flex" style="gap:6px;align-items:center;min-width:0;">
            ${Icon('file', 13)}
            <div>
              <div style="font-weight:600;">${o.empresa}</div>
              <div class="text-muted" style="font-size:11px;">${App.fmtMoney(o.valor)}${o.arquivo ? ' · anexo disponível' : ''}</div>
            </div>
          </div>
          <div class="row-actions">
            ${o.arquivo ? `<a class="btn btn-sm" href="${o.arquivo.data}" download="${o.arquivo.nome}" title="Baixar orçamento">${Icon('download', 12)}</a>` : ''}
            <button class="btn btn-sm btn-danger" data-del-orcamento="${o.id}" data-comp="${comp}" title="Excluir">${Icon('trash', 12)}</button>
          </div>
        </div>`).join('') || '<div class="text-muted" style="font-size:12px;padding:6px 0;">Nenhum orçamento anexado ainda.</div>'}

      <div class="flex" style="gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn-sm" data-add-orcamento="${comp}">${Icon('plus', 13)} Adicionar Orçamento</button>
        ${caso.status === 'Aguardando Saída' ? `<button class="btn btn-sm btn-primary" data-solicitar-saida="${comp}">${Icon('check', 13)} Solicitar Saída</button>` : ''}
        ${caso.status === 'Aguardando Validação' && caso.orcamentoValidado == null ? `<button class="btn btn-sm btn-primary" data-validar-orcamento="${comp}">${Icon('check', 13)} Validar Orçamento / Laudo</button>` : ''}
        ${caso.orcamentoValidado === true ? `<button class="btn btn-sm btn-primary" data-registrar-retorno="${comp}">${Icon('check', 13)} Registrar Retorno</button>` : ''}
      </div>
    </div>
  `;
  return html;
}

function bindTabExterna(overlay, motorId) {
  overlay.querySelectorAll('[data-registrar-falha]').forEach(b => b.addEventListener('click', () => abrirRegistrarFalha(motorId, b.dataset.registrarFalha)));
  overlay.querySelectorAll('[data-add-orcamento]').forEach(b => b.addEventListener('click', () => abrirAdicionarOrcamento(motorId, b.dataset.addOrcamento)));
  overlay.querySelectorAll('[data-solicitar-saida]').forEach(b => b.addEventListener('click', () => abrirSolicitarSaida(motorId, b.dataset.solicitarSaida)));
  overlay.querySelectorAll('[data-validar-orcamento]').forEach(b => b.addEventListener('click', () => abrirValidarOrcamento(motorId, b.dataset.validarOrcamento)));
  overlay.querySelectorAll('[data-registrar-retorno]').forEach(b => b.addEventListener('click', () => abrirRegistrarRetorno(motorId, b.dataset.registrarRetorno)));
  overlay.querySelectorAll('[data-informar-sc]').forEach(b => b.addEventListener('click', () => abrirInformarSC(motorId, b.dataset.informarSc)));

  overlay.querySelectorAll('[data-del-orcamento]').forEach(b => b.addEventListener('click', () => {
    App.confirmAction('Remover este orçamento?', () => {
      const m = Store.get('motores', motorId);
      const comp = b.dataset.comp;
      const orcamentos = m.manutencaoExterna[comp].orcamentos.filter(o => o.id !== b.dataset.delOrcamento);
      Store.update('motores', motorId, { manutencaoExterna: { ...m.manutencaoExterna, [comp]: { ...m.manutencaoExterna[comp], orcamentos } } });
      App.toast('Orçamento removido.', 'success');
      verMotor(motorId);
    });
  }));
}

function abrirRegistrarFalha(motorId, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">Registre a falha do <strong>${label}</strong> e, se já tiver, anexe o primeiro orçamento de conserto. Dá pra adicionar orçamentos de outras empresas depois, pra comparar.</p>
    <div class="form-grid">
      <div class="field"><label>Data da Falha</label><input type="date" id="fDataFalha" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label>Empresa (orçamento)</label><input id="fEmpresa" list="dlPrestadoresFalha" placeholder="Selecione ou digite livremente"><datalist id="dlPrestadoresFalha">${Store.all('prestadores').filter(p=>p.ativo).map(p=>`<option value="${p.nome}">`).join('')}</datalist></div>
      <div class="field field-span-2"><label>Descrição da Falha</label><input id="fDescricao" placeholder="Ex: ruído excessivo no rolamento dianteiro"></div>
      <div class="field"><label>Valor Orçado (R$)</label><input type="number" id="fValor" value="0"></div>
      <div class="field"><label>Anexar Orçamento (opcional)</label><input type="file" id="fArquivo"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelFalha">Cancelar</button><button class="btn btn-primary" id="saveFalha">${Icon('check', 15)} Registrar Falha</button>`;
  App.openModal({ title: `Registrar Falha / Solicitar Orçamento — ${label}`, body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelFalha').onclick = App.closeModal;
  document.getElementById('saveFalha').onclick = async () => {
    const dataFalha = val('fDataFalha');
    if (!dataFalha) { App.toast('Informe a data da falha.', 'danger'); return; }
    const empresa = val('fEmpresa').trim();
    const file = document.getElementById('fArquivo').files[0];
    let arquivo = null;
    if (file) arquivo = await lerArquivoComoDoc(file);
    const orcamentos = empresa ? [{ id: Store.uid('orc'), empresa, valor: Number(val('fValor')) || 0, arquivo }] : [];
    const m = Store.get('motores', motorId);
    const casoNovo = {
      id: Store.uid('mext'), componente: comp, dataFalha, descricaoFalha: val('fDescricao'), orcamentos,
      empresaEscolhida: '', dataSaida: '', status: 'Aguardando Saída',
      orcamentoValidado: null, valorAprovado: null,
    };
    Store.update('motores', motorId, { manutencaoExterna: { ...m.manutencaoExterna, [comp]: casoNovo }, statusManutencao: 'Pendente' });
    App.toast(`Falha registrada (${label}).`, 'success');
    App.closeModal();
    verMotor(motorId);
  };
}

function abrirAdicionarOrcamento(motorId, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Empresa</label><input id="oEmpresa" list="dlPrestadoresOrc" placeholder="Selecione ou digite livremente"><datalist id="dlPrestadoresOrc">${Store.all('prestadores').filter(p=>p.ativo).map(p=>`<option value="${p.nome}">`).join('')}</datalist></div>
      <div class="field"><label>Valor Orçado (R$)</label><input type="number" id="oValor" value="0"></div>
      <div class="field field-span-2"><label>Anexar Orçamento (opcional)</label><input type="file" id="oArquivo"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelOrc">Cancelar</button><button class="btn btn-primary" id="saveOrc">${Icon('plus', 15)} Adicionar</button>`;
  App.openModal({ title: `Adicionar Orçamento — ${label}`, body, footer });
  renderIcons();
  document.getElementById('cancelOrc').onclick = App.closeModal;
  document.getElementById('saveOrc').onclick = async () => {
    const empresa = val('oEmpresa').trim();
    if (!empresa) { App.toast('Informe a empresa.', 'danger'); return; }
    const file = document.getElementById('oArquivo').files[0];
    let arquivo = null;
    if (file) arquivo = await lerArquivoComoDoc(file);
    const m = Store.get('motores', motorId);
    const caso = m.manutencaoExterna[comp];
    const orcamentos = [...caso.orcamentos, { id: Store.uid('orc'), empresa, valor: Number(val('oValor')) || 0, arquivo }];
    Store.update('motores', motorId, { manutencaoExterna: { ...m.manutencaoExterna, [comp]: { ...caso, orcamentos } } });
    App.toast('Orçamento adicionado.', 'success');
    App.closeModal();
    verMotor(motorId);
  };
}

function abrirSolicitarSaida(motorId, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const m = Store.get('motores', motorId);
  const caso = m.manutencaoExterna[comp];
  const orcamentos = caso.orcamentos;
  const empresasSugeridas = [...new Set([...orcamentos.map(o => o.empresa), ...Store.all('prestadores').filter(p => p.ativo).map(p => p.nome)])];
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">Confirme para qual empresa o(a) <strong>${label}</strong> está saindo para manutenção.</p>
    <div class="form-grid">
      <div class="field field-span-2"><label>Empresa de Destino</label>
        <input id="sEmpresa" list="dlEmpresasOrc" value="${orcamentos[0]?.empresa || ''}" placeholder="Selecione ou digite livremente">
        <datalist id="dlEmpresasOrc">${empresasSugeridas.map(nome => `<option value="${nome}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Data de Saída</label><input type="date" id="sData" value="${new Date().toISOString().slice(0, 10)}"></div>
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--text-muted);">Nota Fiscal de Entrada do Equipamento</div>
      <p class="text-muted" style="font-size:11.5px;margin-bottom:10px;">Selecione a NF já anexada nos documentos do motor ou importe uma agora — ela será baixada e usada de referência ao abrir o e-mail de solicitação da Nota de Remessa.</p>
      <div class="form-grid">
        <div class="field">
          <label>Documento (NF de entrada)</label>
          <select id="sNfEntradaSelect">
            <option value="">— Nenhuma —</option>
            ${(m.documentos || []).map(d => `<option value="${d.id}" ${m.nfEntradaDocId === d.id ? 'selected' : ''}>${d.nome}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Número da NF</label><input id="sNumeroNf" placeholder="Ex: 12345" value="${m.numeroNfEntrada || ''}"></div>
      </div>
      <input type="file" id="inputNfEntrada" accept=".pdf,image/*,.xlsx,.xls,.doc,.docx" style="margin-top:8px;">
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelSaida">Cancelar</button><button class="btn btn-primary" id="saveSaida">${Icon('check', 15)} Confirmar Saída</button>`;
  App.openModal({ title: `Solicitar Saída para Manutenção — ${label}`, body, footer, size: 'lg' });
  renderIcons();

  let novoDocNf = null;
  document.getElementById('inputNfEntrada').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    novoDocNf = await lerArquivoComoDoc(file);
    const select = document.getElementById('sNfEntradaSelect');
    const opt = document.createElement('option');
    opt.value = novoDocNf.id;
    opt.textContent = novoDocNf.nome + ' (novo)';
    opt.selected = true;
    select.appendChild(opt);
    App.toast('NF de entrada pronta para salvar.', 'success');
  });

  document.getElementById('cancelSaida').onclick = App.closeModal;
  document.getElementById('saveSaida').onclick = () => {
    const empresa = val('sEmpresa').trim();
    const data = val('sData');
    if (!empresa || !data) { App.toast('Informe a empresa e a data de saída.', 'danger'); return; }
    const nfEntradaDocId = document.getElementById('sNfEntradaSelect').value || null;
    const numeroNfEntrada = val('sNumeroNf').trim();
    const documentos = novoDocNf ? [...(m.documentos || []), novoDocNf] : (m.documentos || []);
    const historicoTrocas = [...m.historicoTrocas, { data, de: m.status, para: 'Oficina', motivo: `${label} enviado para manutenção externa — ${empresa}`, os: '-' }];
    Store.update('motores', motorId, {
      manutencaoExterna: { ...m.manutencaoExterna, [comp]: { ...caso, empresaEscolhida: empresa, dataSaida: data, status: 'Aguardando Validação' } },
      status: 'Oficina', statusManutencao: 'Em Manutenção', historicoTrocas,
      documentos, nfEntradaDocId, numeroNfEntrada,
    });
    App.toast(`Saída registrada — ${label} enviado para ${empresa}.`, 'success');
    App.closeModal();
    const nfEntrada = documentos.find(d => d.id === nfEntradaDocId) || null;
    motorSolicitarNotaRemessa(m, label, empresa, data, nfEntrada, numeroNfEntrada);
    verMotor(motorId);
  };
}

// Após confirmar a saída de um motor/redutor para manutenção externa, baixa a NF de
// entrada selecionada (se houver, para o usuário anexar manualmente — mailto: não
// permite anexos automáticos) e abre um e-mail pronto solicitando a Nota de Remessa
// ao setor fiscal/contábil.
function motorSolicitarNotaRemessa(m, label, empresa, data, nfEntrada, numeroNfEntrada) {
  if (nfEntrada) {
    const a = document.createElement('a');
    a.href = nfEntrada.data;
    a.download = nfEntrada.nome;
    document.body.appendChild(a); a.click(); a.remove();
  }
  const prestador = Store.all('prestadores').find(p => p.nome === empresa);
  const assunto = `Solicitação de Nota de Remessa — ${m.tag}${m.codigoInterno ? ' · ' + m.codigoInterno : ''} — envio para ${empresa}`;
  const corpo = `Solicito a emissão de Nota Fiscal de Remessa para o envio do equipamento abaixo para manutenção externa:\n\n`
    + `Componente: ${label}\n`
    + `TAG: ${m.tag}${m.codigoInterno ? ' · Código interno: ' + m.codigoInterno : ''}\n`
    + `Ativo vinculado: ${motorAtivoNome(m)}\n`
    + `Empresa de destino: ${empresa}\n`
    + (prestador ? `Razão Social: ${prestador.nome}\n` : '')
    + (prestador?.cnpj ? `CNPJ: ${prestador.cnpj}\n` : '')
    + `Data de saída: ${App.fmtDate(data)}\n`
    + (numeroNfEntrada ? `Número da NF de entrada: ${numeroNfEntrada}\n` : '')
    + `\n`
    + (nfEntrada
      ? `A Nota Fiscal de Entrada do equipamento (${nfEntrada.nome}) foi baixada agora — anexe-a a este e-mail antes de enviar.`
      : `Não há Nota Fiscal de Entrada selecionada para este equipamento no sistema.`);
  window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  App.toast(nfEntrada ? 'NF de entrada baixada — anexe-a ao e-mail que acabamos de abrir.' : 'E-mail de solicitação de Nota de Remessa aberto.', 'info');
}

// Versão em lote: confirma a saída de vários motores/redutores (com manutenção
// externa "Aguardando Saída") de uma vez, para a mesma empresa/data, e monta
// um único e-mail de solicitação de Nota de Remessa cobrindo todos eles.
function abrirSolicitarSaidaLote(chaves) {
  const itens = chaves.map(chave => {
    const [motorId, comp] = chave.split(':');
    const m = Store.get('motores', motorId);
    const caso = m?.manutencaoExterna?.[comp];
    return (m && caso && caso.status === 'Aguardando Saída') ? { m, comp, caso } : null;
  }).filter(Boolean);
  if (!itens.length) { App.toast('Nenhum item válido selecionado.', 'danger'); return; }

  const empresasSugeridas = [...new Set(itens.flatMap(({ caso }) => caso.orcamentos.map(o => o.empresa)).concat(Store.all('prestadores').filter(p => p.ativo).map(p => p.nome)))];
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Confirme para qual empresa os ${itens.length} item(ns) abaixo estão saindo para manutenção. Um único e-mail de solicitação de Nota de Remessa será aberto para todos.</p>
    <ul style="font-size:12.5px;margin:0 0 14px;padding-left:18px;max-height:140px;overflow:auto;">
      ${itens.map(({ m, comp }) => `<li>${m.tag}${m.codigoInterno ? ' · ' + m.codigoInterno : ''} — ${motorAtivoNome(m)} (${comp === 'motor' ? 'Motor' : 'Redutor'})</li>`).join('')}
    </ul>
    <div class="form-grid">
      <div class="field field-span-2"><label>Empresa de Destino</label>
        <input id="slEmpresa" list="dlEmpresasOrcLote" placeholder="Selecione ou digite livremente">
        <datalist id="dlEmpresasOrcLote">${empresasSugeridas.map(nome => `<option value="${nome}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Data de Saída</label><input type="date" id="slData" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label>Número da NF (opcional, aplicado a todos)</label><input id="slNumeroNf" placeholder="Ex: 12345"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelSaidaLote">Cancelar</button><button class="btn btn-primary" id="saveSaidaLote">${Icon('check', 15)} Confirmar Saída em Lote</button>`;
  App.openModal({ title: `Solicitar Saída em Lote — ${itens.length} item(ns)`, body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelSaidaLote').onclick = App.closeModal;
  document.getElementById('saveSaidaLote').onclick = () => {
    const empresa = val('slEmpresa').trim();
    const data = val('slData');
    if (!empresa || !data) { App.toast('Informe a empresa e a data de saída.', 'danger'); return; }
    const numeroNfEntrada = val('slNumeroNf').trim();

    itens.forEach(({ m, comp, caso }) => {
      const historicoTrocas = [...m.historicoTrocas, { data, de: m.status, para: 'Oficina', motivo: `${comp === 'motor' ? 'Motor' : 'Redutor'} enviado para manutenção externa (lote) — ${empresa}`, os: '-' }];
      Store.update('motores', m.id, {
        manutencaoExterna: { ...m.manutencaoExterna, [comp]: { ...caso, empresaEscolhida: empresa, dataSaida: data, status: 'Aguardando Validação' } },
        status: 'Oficina', statusManutencao: 'Em Manutenção', historicoTrocas,
        numeroNfEntrada,
      });
    });

    _saidaSelecionados.clear();
    App.toast(`Saída registrada para ${itens.length} item(ns) — ${empresa}.`, 'success');
    App.closeModal();
    motorSolicitarNotaRemessaLote(itens, empresa, data, numeroNfEntrada);
    App.navigate('motores', true);
  };
}

function motorSolicitarNotaRemessaLote(itens, empresa, data, numeroNfEntrada) {
  const linhas = itens.map(({ m, comp }) =>
    `- ${comp === 'motor' ? 'Motor' : 'Redutor'} · TAG: ${m.tag}${m.codigoInterno ? ' · Código interno: ' + m.codigoInterno : ''} · Ativo vinculado: ${motorAtivoNome(m)}`
  ).join('\n');
  const prestador = Store.all('prestadores').find(p => p.nome === empresa);
  const assunto = `Solicitação de Nota de Remessa — ${itens.length} item(ns) — envio para ${empresa}`;
  const corpo = `Solicito a emissão de Nota Fiscal de Remessa para o envio dos equipamentos abaixo para manutenção externa:\n\n`
    + `Empresa de destino: ${empresa}\n`
    + (prestador ? `Razão Social: ${prestador.nome}\n` : '')
    + (prestador?.cnpj ? `CNPJ: ${prestador.cnpj}\n` : '')
    + `Data de saída: ${App.fmtDate(data)}\n`
    + (numeroNfEntrada ? `Número da NF de entrada: ${numeroNfEntrada}\n` : '')
    + `\nItens:\n${linhas}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  App.toast('E-mail de solicitação de Nota de Remessa (lote) aberto.', 'info');
}

function abrirValidarOrcamento(motorId, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const m = Store.get('motores', motorId);
  const caso = m.manutencaoExterna[comp];
  const valorRef = caso.orcamentos.find(o => o.empresa === caso.empresaEscolhida)?.valor || caso.orcamentos[0]?.valor || 0;
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">
      O prestador avaliou o(a) <strong>${label}</strong> (perícia/laudo) e enviou o orçamento. Aprove para seguir com o reparo, ou reprove para que o equipamento volte sem conserto.
    </p>
    <div class="form-grid">
      <div class="field field-span-2"><label>Orçamento aprovado?</label>
        <select id="vDecisao">
          <option value="sim">Sim — seguir com o reparo</option>
          <option value="nao">Não — reprovar e retornar sem reparo</option>
        </select>
      </div>
    </div>
    <div id="vBlocoSim" class="form-grid" style="margin-top:14px;">
      <div class="field field-span-2"><label>Valor Aprovado (R$)</label><input type="number" id="vValorAprovado" value="${valorRef}"></div>
    </div>
    <div id="vBlocoNao" class="form-grid hidden" style="margin-top:14px;">
      <div class="field"><label>Valor do Laudo/Perícia (R$)</label><input type="number" id="vValorLaudo" value="0"></div>
      <div class="field"><label>Data de Retorno</label><input type="date" id="vDataRetorno" value="${new Date().toISOString().slice(0, 10)}"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelVal">Cancelar</button><button class="btn btn-primary" id="saveVal">${Icon('check', 15)} Confirmar</button>`;
  App.openModal({ title: `Validar Orçamento / Laudo — ${label}`, body, footer, size: 'lg' });
  renderIcons();

  document.getElementById('vDecisao').addEventListener('change', (e) => {
    document.getElementById('vBlocoSim').classList.toggle('hidden', e.target.value !== 'sim');
    document.getElementById('vBlocoNao').classList.toggle('hidden', e.target.value !== 'nao');
  });

  document.getElementById('cancelVal').onclick = App.closeModal;
  document.getElementById('saveVal').onclick = () => {
    const decisao = val('vDecisao');

    if (decisao === 'sim') {
      const valorAprovado = Number(val('vValorAprovado')) || 0;
      Store.update('motores', motorId, {
        manutencaoExterna: { ...m.manutencaoExterna, [comp]: { ...caso, orcamentoValidado: true, valorAprovado, status: 'Manutenção Iniciada' } },
      });
      App.toast('Orçamento aprovado — aguardando o retorno do equipamento.', 'success');
      App.closeModal();
      verMotor(motorId);
      return;
    }

    // Reprovado: registra só o valor do laudo/perícia e o equipamento já retorna, sem reparo.
    const dataRetorno = val('vDataRetorno');
    if (!dataRetorno) { App.toast('Informe a data de retorno.', 'danger'); return; }
    const valorLaudo = Number(val('vValorLaudo')) || 0;
    const historicoManutencaoExterna = [...(m.historicoManutencaoExterna || []), {
      ...caso, componente: comp, orcamentoValidado: false, dataRetorno, valorFinal: valorLaudo,
      status: 'Reprovado - Retornou sem Reparo', numeroNF: '-',
    }];
    const manutencoes = [...m.manutencoes, { id: Store.uid('mm'), data: dataRetorno, valor: valorLaudo, numeroNF: '-', descricao: `Laudo/perícia — orçamento reprovado (${label}) — ${caso.empresaEscolhida}` }];
    const historicoTrocas = [...m.historicoTrocas, { data: dataRetorno, de: m.status, para: 'Oficina', motivo: `Retorno da manutenção externa (${label}) sem reparo — orçamento reprovado — ${caso.empresaEscolhida}`, os: '-' }];
    const outroComp = comp === 'motor' ? 'redutor' : 'motor';
    const aindaAtivo = !!m.manutencaoExterna?.[outroComp];
    Store.update('motores', motorId, {
      manutencaoExterna: { ...m.manutencaoExterna, [comp]: null }, historicoManutencaoExterna, manutencoes,
      status: 'Oficina', statusManutencao: aindaAtivo ? 'Em Manutenção' : 'Pendente', historicoTrocas,
    });
    App.toast('Orçamento reprovado — equipamento retornou sem reparo, valor do laudo registrado.', 'success');
    App.closeModal();
    verMotor(motorId);
  };
}

// ---------------------------------------- Informar SC / Fornecedor (Compras)
// Depois que o orçamento de manutenção externa é aprovado, este passo reúne
// o que Compras precisa pra formalizar a compra: número da SC (pode ser
// preenchido depois, quando o ERP devolver), a proposta do fornecedor, a
// descrição do serviço, e a Conta Contábil (com Centro de Custo vinculado,
// mesmo padrão de cadastro rápido usado em Projetos — ver estoque.js). Gera
// um e-mail formatado reaproveitando as mesmas funções de clipboard/mailto
// já usadas na Solicitação de Compra (copiarHtmlParaClipboard, selecionarConteudo,
// saudacaoPorHorario, FONTE_EMAIL — definidas em estoque.js).
function construirEmailInformarSC(d) {
  const saudacao = saudacaoPorHorario();
  const nomeSolicitante = (typeof AuthProfile !== 'undefined' && AuthProfile && AuthProfile.nome) ? AuthProfile.nome : '';
  const assinatura = nomeSolicitante ? `<p style="margin-top:20px;">Atenciosamente,<br>${escapeHtml(nomeSolicitante)}</p>` : '';
  return `<div style="font-family:${FONTE_EMAIL};font-size:14px;color:#222222;line-height:1.5;">
    <p style="margin:0 0 4px;">Prezados,<br>${saudacao}.</p>
    <p style="margin:0 0 16px;">Segue a SC nº <strong>${escapeHtml(d.numeroSC || '[a informar]')}</strong>, referente a: <strong>${escapeHtml(d.referencia)}</strong>.</p>
    <table style="border-collapse:collapse;font-family:${FONTE_EMAIL};font-size:13px;width:100%;margin-bottom:16px;">
      <tbody>
        <tr><td style="padding:4px 10px 4px 0;color:#555555;white-space:nowrap;">Descrição do serviço:</td><td style="padding:4px 0;"><strong>${escapeHtml(d.descricaoServico || '—')}</strong></td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#555555;white-space:nowrap;">Proposta:</td><td style="padding:4px 0;">${escapeHtml(d.proposta || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#555555;white-space:nowrap;">Valor:</td><td style="padding:4px 0;"><strong>${App.fmtMoney(d.valorAprovado)}</strong></td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#555555;white-space:nowrap;">Centro de Custo:</td><td style="padding:4px 0;">${escapeHtml(d.centroCusto || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#555555;white-space:nowrap;">Conta Contábil:</td><td style="padding:4px 0;">${escapeHtml(d.conta || '—')}</td></tr>
      </tbody>
    </table>
    <p style="margin:0 0 4px;"><strong>Fornecedor</strong></p>
    <p style="margin:0 0 16px;">
      Nome Fantasia: ${escapeHtml(d.nomeFantasia || '—')}<br>
      Razão Social: ${escapeHtml(d.razaoSocial || '—')}<br>
      CNPJ: ${escapeHtml(d.cnpj || '—')}
    </p>
    ${assinatura}
  </div>`;
}
function montarTextoInformarSC(d, copiado) {
  const saudacao = saudacaoPorHorario();
  const nomeSolicitante = (typeof AuthProfile !== 'undefined' && AuthProfile && AuthProfile.nome) ? AuthProfile.nome : '';
  const assinatura = nomeSolicitante ? `\r\n\r\nAtenciosamente,\r\n${nomeSolicitante}` : '';
  return [
    'Prezados,', `${saudacao}.`, '',
    `Segue a SC nº ${d.numeroSC || '[a informar]'}, referente a: ${d.referencia}.`, '',
    `Descrição do serviço: ${d.descricaoServico || '—'}`,
    `Proposta: ${d.proposta || '—'}`,
    `Valor: ${App.fmtMoney(d.valorAprovado)}`,
    `Centro de Custo: ${d.centroCusto || '—'}`,
    `Conta Contábil: ${d.conta || '—'}`, '',
    'Fornecedor',
    `Nome Fantasia: ${d.nomeFantasia || '—'}`,
    `Razão Social: ${d.razaoSocial || '—'}`,
    `CNPJ: ${d.cnpj || '—'}`, '',
    ...(copiado ? ['(O e-mail formatado foi copiado para a área de transferência — cole aqui com Ctrl+V no lugar deste texto simples, se preferir.)'] : []),
  ].join('\r\n') + assinatura;
}

function abrirInformarSC(motorId, historicoId) {
  const m = Store.get('motores', motorId);
  const caso = (m.historicoManutencaoExterna || []).find(h => h.id === historicoId);
  if (!caso) { App.toast('Registro de manutenção externa não encontrado.', 'danger'); return; }
  const label = caso.componente === 'redutor' ? 'Redutor' : 'Motor';
  const fornecedorMatch = Store.all('prestadores').find(p => p.nome === caso.empresaEscolhida);
  const fornecedorIdInicial = caso.fornecedorId || fornecedorMatch?.id || '';

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">Preencha os dados da SC e do fornecedor escolhido para gerar o e-mail de confirmação para Compras.</p>
    <div class="form-grid">
      <div class="field"><label>Nº da SC</label><input id="scNumero" placeholder="Preencher quando o número saír" value="${escapeHtml(caso.numeroSC || '')}"></div>
      <div class="field"><label>Proposta</label><input id="scProposta" placeholder="Nº/referência da proposta" value="${escapeHtml(caso.proposta || '')}"></div>
      <div class="field field-span-2"><label>Fornecedor</label>
        <select id="scFornecedor">
          <option value="">— Selecione um prestador cadastrado —</option>
          ${Store.all('prestadores').map(p => `<option value="${p.id}" ${fornecedorIdInicial === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field field-span-2"><label>Descrição do Serviço</label>
        <input id="scDescricao" placeholder="Ex: manutenção do motor elétrico 25 CV, 18 kW, 220/380V, 4 polos, carcaça 160L, V1" value="${escapeHtml(caso.descricaoServico || caso.descricaoFalha || '')}">
      </div>
      <div class="field"><label>Conta Contábil</label>
        <select id="scConta">
          <option value="">— Selecione —</option>
          ${Store.all('contasContabeis').map(c => `<option value="${c.id}" ${caso.contaContabilId === c.id ? 'selected' : ''}>${escapeHtml(c.conta)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Centro de Custo</label><input id="scCentroCusto" disabled></div>
    </div>
    <div style="margin-top:10px;">
      <button type="button" class="btn btn-sm" id="scNovaContaBtn">${Icon('plus', 13)} Cadastrar nova conta contábil</button>
      <div class="hidden" id="scNovaContaInline" style="margin-top:10px;padding:12px;border:1px dashed var(--border);border-radius:8px;">
        <div class="form-grid">
          <div class="field"><label>Conta Contábil</label><input id="scNcConta" placeholder="Ex: 4.1.2.05"></div>
          <div class="field"><label>Centro de Custo</label><input id="scNcCC" placeholder="Ex: CC-3020"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button type="button" class="btn btn-sm" id="scNcCancelar">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" id="scNcSalvar">${Icon('check', 13)} Salvar Conta</button>
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top:18px;">Prévia do e-mail</div>
    <div id="scSCPreview" title="Clique para selecionar tudo" style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;cursor:pointer;padding:16px;background:#fff;"></div>
    <p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">"Abrir no Outlook" já copia este e-mail inteiro sozinho — só colar (Ctrl+V) no lugar do texto simples que abrir.</p>`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;flex-wrap:wrap;';
  footer.innerHTML = `<button class="btn" id="scCancelarInf">Cancelar</button>
    <button class="btn" id="scSalvarInf">${Icon('check', 15)} Salvar</button>
    <button class="btn btn-accent" id="scCopiarInf">${Icon('clipboard', 15)} Copiar E-mail</button>
    <button class="btn btn-primary" id="scAbrirInf">${Icon('mail', 15)} Abrir no Outlook</button>`;
  App.openModal({ title: `Informar SC / Fornecedor — ${label}`, body, footer, size: 'lg' });
  renderIcons();

  function contaSelecionada() {
    const id = document.getElementById('scConta').value;
    return Store.all('contasContabeis').find(c => c.id === id) || null;
  }
  function atualizarCentroCusto() {
    const c = contaSelecionada();
    document.getElementById('scCentroCusto').value = c ? c.centroCusto : '';
  }
  function coletarDados() {
    const fornecedor = Store.get('prestadores', document.getElementById('scFornecedor').value);
    const conta = contaSelecionada();
    return {
      numeroSC: document.getElementById('scNumero').value.trim(),
      proposta: document.getElementById('scProposta').value.trim(),
      descricaoServico: capitalizarFrase(document.getElementById('scDescricao').value.trim()),
      tag: m.tag,
      referencia: `manutenção do motor ${m.tag}`,
      valorAprovado: caso.valorFinal || caso.valorAprovado || 0,
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
    document.getElementById('scSCPreview').innerHTML = construirEmailInformarSC(coletarDados());
  }

  atualizarCentroCusto();
  renderPreview();
  document.getElementById('scSCPreview').addEventListener('click', () => selecionarConteudo(document.getElementById('scSCPreview')));
  ['scNumero', 'scProposta', 'scDescricao'].forEach(id => document.getElementById(id).addEventListener('input', renderPreview));
  document.getElementById('scFornecedor').addEventListener('change', renderPreview);
  document.getElementById('scConta').addEventListener('change', () => { atualizarCentroCusto(); renderPreview(); });

  document.getElementById('scNovaContaBtn').addEventListener('click', () => {
    document.getElementById('scNovaContaInline').classList.remove('hidden');
  });
  document.getElementById('scNcCancelar').addEventListener('click', () => {
    document.getElementById('scNovaContaInline').classList.add('hidden');
  });
  document.getElementById('scNcSalvar').addEventListener('click', () => {
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
    atualizarCentroCusto();
    renderPreview();
    App.toast('Conta contábil cadastrada.', 'success');
  });

  function salvarDados() {
    const dados = coletarDados();
    const m2 = Store.get('motores', motorId);
    const historicoManutencaoExterna = (m2.historicoManutencaoExterna || []).map(h => h.id === historicoId
      ? { ...h, numeroSC: dados.numeroSC, proposta: dados.proposta, descricaoServico: dados.descricaoServico, fornecedorId: dados.fornecedorId, contaContabilId: dados.contaContabilId }
      : h);
    Store.update('motores', motorId, { historicoManutencaoExterna });
    return dados;
  }

  document.getElementById('scCancelarInf').onclick = App.closeModal;
  document.getElementById('scSalvarInf').onclick = () => {
    salvarDados();
    App.toast('Dados da SC salvos.', 'success');
    App.closeModal();
    verMotor(motorId);
  };
  document.getElementById('scCopiarInf').onclick = async () => {
    const dados = salvarDados();
    const html = construirEmailInformarSC(dados);
    const texto = montarTextoInformarSC(dados, false);
    const copiado = await copiarHtmlParaClipboard(html, texto);
    if (copiado) App.toast('E-mail copiado — cole (Ctrl+V) dentro do corpo do e-mail.', 'success');
    else { selecionarConteudo(document.getElementById('scSCPreview')); App.toast('Não copiou automaticamente. Clique na prévia e aperte Ctrl+C.', 'danger'); }
  };
  document.getElementById('scAbrirInf').onclick = async () => {
    const dados = salvarDados();
    const assunto = `Solicitação de Compra — SC ${dados.numeroSC || 'a informar'} — Motor ${dados.tag}`;
    const html = construirEmailInformarSC(dados);
    const texto = montarTextoInformarSC(dados, false);
    const copiado = await copiarHtmlParaClipboard(html, texto);
    if (!copiado) selecionarConteudo(document.getElementById('scSCPreview'));
    const corpo = montarTextoInformarSC(dados, copiado);
    window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    App.toast(copiado ? 'Outlook aberto — e-mail copiado, cole com Ctrl+V.' : 'Outlook aberto. Copie manualmente pela prévia.', 'success');
    App.closeModal();
    verMotor(motorId);
  };
}

function abrirRegistrarRetorno(motorId, comp) {
  const label = comp === 'redutor' ? 'Redutor' : 'Motor';
  const m = Store.get('motores', motorId);
  const caso = m.manutencaoExterna[comp];
  const valorSugerido = caso.valorAprovado || caso.orcamentos.find(o => o.empresa === caso.empresaEscolhida)?.valor || 0;
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">Registrando o retorno do(a) <strong>${label}</strong>.</p>
    <div class="form-grid">
      <div class="field"><label>Data de Retorno</label><input type="date" id="rData" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label>Valor Final Pago (R$)</label><input type="number" id="rValor" value="${valorSugerido}"></div>
      <div class="field"><label>Nº NF (opcional)</label><input id="rNF"></div>
      <div class="field"><label>Novo Status do Motor</label><select id="rStatus">${['Operação', 'Reserva', 'Estoque'].map(s => `<option>${s}</option>`).join('')}</select></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelRet">Cancelar</button><button class="btn btn-primary" id="saveRet">${Icon('check', 15)} Confirmar Retorno</button>`;
  App.openModal({ title: `Registrar Retorno da Manutenção — ${label}`, body, footer });
  renderIcons();
  document.getElementById('cancelRet').onclick = App.closeModal;
  document.getElementById('saveRet').onclick = () => {
    const dataRetorno = val('rData');
    if (!dataRetorno) { App.toast('Informe a data de retorno.', 'danger'); return; }
    const valorFinal = Number(val('rValor')) || 0;
    const novoStatus = val('rStatus');
    const historicoManutencaoExterna = [...(m.historicoManutencaoExterna || []), { ...caso, componente: comp, dataRetorno, valorFinal, numeroNF: val('rNF') || '-' }];
    const manutencoes = [...m.manutencoes, { id: Store.uid('mm'), data: dataRetorno, valor: valorFinal, numeroNF: val('rNF') || '-', descricao: `Manutenção externa (${label}) — ${caso.empresaEscolhida}` }];
    const historicoTrocas = [...m.historicoTrocas, { data: dataRetorno, de: m.status, para: novoStatus, motivo: `Retorno da manutenção externa (${label}) — ${caso.empresaEscolhida}`, os: '-' }];
    const outroComp = comp === 'motor' ? 'redutor' : 'motor';
    const aindaAtivo = !!m.manutencaoExterna?.[outroComp];
    Store.update('motores', motorId, {
      manutencaoExterna: { ...m.manutencaoExterna, [comp]: null }, historicoManutencaoExterna, manutencoes,
      status: novoStatus, statusManutencao: aindaAtivo ? 'Em Manutenção' : 'Em Dia', historicoTrocas,
    });
    App.toast('Retorno registrado — custo somado ao histórico de manutenções.', 'success');
    App.closeModal();
    verMotor(motorId);
  };
}
