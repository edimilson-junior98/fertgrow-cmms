/* ==========================================================================
   FertGrow CMMS — Ativos · Árvore Lógica
   Estrutura genérica e recursiva: Grupos (pastas) organizam Bens, e qualquer
   Bem pode conter outros Bens (sub-bens), em profundidade ilimitada —
   inspirada na Árvore Lógica de manutenção de ativos (ex.: TOTVS).
   ========================================================================== */

let _ativosFiltro = { texto: '', area: '', criticidade: '' };
let _arvoreSel = { tipo: 'raiz', id: null }; // 'raiz' | 'pasta' | 'bem'
let _pastasExpandidas = new Set();
let _arvoreDestaqueId = null;

Views.ativos = {
  title: 'Ativos',
  render() {
    return `
      <div class="ativos-layout">
        <div class="card tree-panel">
          <div class="card-head"><h3>${Icon('layers',15)} Árvore Lógica</h3></div>
          ${renderBuscaArvore()}
          <div id="arvoreAtivos">${renderArvore()}</div>
          ${renderRodapeArvore()}
        </div>
        <div class="ativos-main">${renderPainelPrincipal()}</div>
      </div>
    `;
  },
  afterRender() {
    renderIcons();
    bindBuscaArvore();
    bindArvoreEvents();
    bindPainelPrincipalEvents();
    if (_arvoreDestaqueId) {
      const alvo = document.querySelector(`[data-tree-pasta="${_arvoreDestaqueId}"], [data-tree-bem="${_arvoreDestaqueId}"]`);
      if (alvo) { alvo.scrollIntoView({ block: 'center' }); alvo.classList.add('tree-flash'); }
      _arvoreDestaqueId = null;
    }
  },
};

/* ============================== BUSCA ============================== */

function renderBuscaArvore() {
  return `
    <div class="tree-search">
      <label>Localizar Por</label>
      <div class="tree-search-row">
        <select id="arvBuscaTipo" class="tree-search-input">
          <option value="bem">Bem</option>
          <option value="grupo">Grupo</option>
        </select>
        <input id="arvBuscaTexto" class="tree-search-input" placeholder="Digite e pressione OK...">
        <button class="btn btn-sm" id="arvBuscaBtn">OK</button>
      </div>
    </div>`;
}

function bindBuscaArvore() {
  document.getElementById('arvBuscaBtn')?.addEventListener('click', buscarNaArvore);
  document.getElementById('arvBuscaTexto')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarNaArvore(); });
}

function buscarNaArvore() {
  const termo = (document.getElementById('arvBuscaTexto')?.value || '').trim().toLowerCase();
  const tipo = document.getElementById('arvBuscaTipo')?.value || 'bem';
  if (!termo) return;

  if (tipo === 'grupo') {
    const alvo = Store.all('pastas').find(p => p.nome.toLowerCase().includes(termo));
    if (!alvo) { App.toast(`Nenhum grupo encontrado para "${termo}".`, 'danger'); return; }
    expandirAncestraisPasta(alvo.id);
    _arvoreSel = { tipo: 'pasta', id: alvo.id };
    _arvoreDestaqueId = alvo.id;
  } else {
    const alvo = Store.all('ativos').find(a => (a.nome + ' ' + a.tag + ' ' + (a.codigoAtivo||'')).toLowerCase().includes(termo));
    if (!alvo) { App.toast(`Nenhum bem encontrado para "${termo}".`, 'danger'); return; }
    expandirAncestraisBem(alvo.id);
    if (alvo.parentAtivoId) _arvoreSel = { tipo: 'bem', id: alvo.parentAtivoId };
    else if (alvo.pastaId) _arvoreSel = { tipo: 'pasta', id: alvo.pastaId };
    else _arvoreSel = { tipo: 'raiz', id: null };
    _arvoreDestaqueId = alvo.id;
  }
  App.navigate('ativos', true);
}

function expandirAncestraisPasta(id) {
  let atual = Store.get('pastas', id);
  while (atual && atual.parentId) { _pastasExpandidas.add(atual.parentId); atual = Store.get('pastas', atual.parentId); }
}

function expandirAncestraisBem(id) {
  let atual = Store.get('ativos', id);
  while (atual) {
    if (atual.parentAtivoId) {
      _pastasExpandidas.add('bem_' + atual.parentAtivoId);
      atual = Store.get('ativos', atual.parentAtivoId);
    } else {
      if (atual.pastaId) { _pastasExpandidas.add(atual.pastaId); expandirAncestraisPasta(atual.pastaId); }
      atual = null;
    }
  }
}

/* ============================== ÁRVORE ============================== */

function renderArvore() {
  const pastasRaiz = Store.all('pastas').filter(p => !p.parentId);
  const bensOrfaos = Store.all('ativos').filter(a => !a.pastaId && !a.parentAtivoId);
  return `
    <div class="tree">
      <div class="tree-row ${_arvoreSel.tipo==='raiz'?'active':''}" data-tree-raiz>
        <span class="tree-toggle"></span>${Icon('grid',14)}<span class="tree-label">Todos os Ativos</span>
      </div>
      ${pastasRaiz.map(p => renderPastaNode(p, 1)).join('')}
      ${bensOrfaos.map(b => renderBemNode(b, 1)).join('')}
    </div>
    <button class="btn btn-sm" style="width:100%;margin-top:10px;" id="btnNovaPastaRaiz">${Icon('plus',13)} Novo Grupo</button>
  `;
}

function renderPastaNode(pasta, depth) {
  const subPastas = Store.all('pastas').filter(p => p.parentId === pasta.id);
  const bensDiretos = Store.all('ativos').filter(a => a.pastaId === pasta.id);
  const expandida = _pastasExpandidas.has(pasta.id);
  const temFilhos = subPastas.length > 0 || bensDiretos.length > 0;
  return `
    <div class="tree-node">
      <div class="tree-row ${_arvoreSel.tipo==='pasta' && _arvoreSel.id===pasta.id?'active':''}" style="padding-left:${8+depth*11}px" data-tree-pasta="${pasta.id}">
        <span class="tree-toggle" data-toggle-pasta="${pasta.id}">${temFilhos ? (expandida?'▾':'▸') : ''}</span>
        ${Icon('layers',13)}<span class="tree-label">${pasta.nome}</span>
        <span class="tree-count">${bensDiretos.length}</span>
        <span class="tree-action" data-dup-pasta="${pasta.id}" title="Duplicar grupo">${Icon('package',12)}</span>
        <span class="tree-del" data-del-pasta="${pasta.id}" title="Excluir grupo">${Icon('trash',12)}</span>
      </div>
      ${expandida ? `<div class="tree-children">
        ${subPastas.map(sp => renderPastaNode(sp, depth+1)).join('')}
        ${bensDiretos.map(b => renderBemNode(b, depth+1)).join('')}
      </div>` : ''}
    </div>`;
}

function renderBemNode(bem, depth) {
  const filhos = Store.all('ativos').filter(a => a.parentAtivoId === bem.id);
  const chaveExp = 'bem_' + bem.id;
  const expandida = _pastasExpandidas.has(chaveExp);
  const icone = bem.parentAtivoId ? 'wrench' : 'box';
  return `
    <div class="tree-node">
      <div class="tree-row ${_arvoreSel.tipo==='bem' && _arvoreSel.id===bem.id?'active':''}" style="padding-left:${8+depth*11}px" data-tree-bem="${bem.id}">
        <span class="tree-toggle" data-toggle-pasta="${chaveExp}">${filhos.length ? (expandida?'▾':'▸') : ''}</span>
        ${Icon(icone,13)}<span class="tree-label">${bem.nome}</span>
        ${filhos.length ? `<span class="tree-count">${filhos.length}</span>` : ''}
        <span class="tree-action" data-view-bem="${bem.id}" title="Ver detalhes">${Icon('eye',12)}</span>
        <span class="tree-action" data-dup-bem="${bem.id}" title="Duplicar bem">${Icon('package',12)}</span>
        <span class="tree-action" data-mov-bem="${bem.id}" title="Mover">${Icon('refresh',12)}</span>
        <span class="tree-del" data-del-bem="${bem.id}" title="Excluir bem">${Icon('trash',12)}</span>
      </div>
      ${expandida ? `<div class="tree-children">${filhos.map(f => renderBemNode(f, depth+1)).join('')}</div>` : ''}
    </div>`;
}

function bindArvoreEvents() {
  document.querySelector('[data-tree-raiz]')?.addEventListener('click', () => { _arvoreSel = { tipo: 'raiz', id: null }; App.navigate('ativos', true); });

  document.querySelectorAll('[data-tree-pasta]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle-pasta]') || e.target.closest('[data-del-pasta]') || e.target.closest('[data-dup-pasta]')) return;
    _arvoreSel = { tipo: 'pasta', id: el.dataset.treePasta };
    App.navigate('ativos', true);
  }));

  document.querySelectorAll('[data-tree-bem]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle-pasta]') || e.target.closest('[data-view-bem]') || e.target.closest('[data-del-bem]') || e.target.closest('[data-mov-bem]') || e.target.closest('[data-dup-bem]')) return;
    _arvoreSel = { tipo: 'bem', id: el.dataset.treeBem };
    App.navigate('ativos', true);
  }));

  document.querySelectorAll('[data-view-bem]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirDetalheAtivo(el.dataset.viewBem);
  }));

  document.querySelectorAll('[data-dup-bem]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirDuplicarAtivo(el.dataset.dupBem);
  }));

  document.querySelectorAll('[data-mov-bem]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirMoverAtivo(el.dataset.movBem);
  }));

  document.querySelectorAll('[data-del-bem]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const bemId = el.dataset.delBem;
    const bem = Store.get('ativos', bemId);
    App.confirmAction(`Excluir "${bem ? bem.nome : 'este bem'}" e todos os seus sub-bens? Esta ação não pode ser desfeita.`, () => {
      [bemId, ...descendentesBem(bemId).map(x => x.id)].forEach(id => Store.remove('ativos', id));
      if (_arvoreSel.tipo === 'bem' && _arvoreSel.id === bemId) _arvoreSel = { tipo: 'raiz', id: null };
      App.toast('Bem excluído.', 'success');
      App.navigate('ativos', true);
    });
  }));

  document.querySelectorAll('[data-toggle-pasta]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = el.dataset.togglePasta;
    if (_pastasExpandidas.has(key)) _pastasExpandidas.delete(key); else _pastasExpandidas.add(key);
    App.navigate('ativos', true);
  }));

  document.querySelectorAll('[data-del-pasta]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const pastaId = el.dataset.delPasta;
    App.confirmAction('Excluir este grupo? Os itens dentro dele serão movidos para o nível superior.', () => {
      Store.removerPasta(pastaId);
      if (_arvoreSel.tipo === 'pasta' && _arvoreSel.id === pastaId) _arvoreSel = { tipo: 'raiz', id: null };
      App.toast('Grupo removido.', 'success');
      App.navigate('ativos', true);
    });
  }));

  document.querySelectorAll('[data-dup-pasta]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirDuplicarPasta(el.dataset.dupPasta);
  }));

  document.getElementById('btnNovaPastaRaiz')?.addEventListener('click', () => abrirFormPasta());
}

/* ========================= RODAPÉ (contadores) ========================= */

function descendentesBem(id) {
  const diretos = Store.all('ativos').filter(a => a.parentAtivoId === id);
  return diretos.reduce((acc, d) => acc.concat([d], descendentesBem(d.id)), []);
}

function bensSobGrupo(pastaId) {
  const subGrupos = Store.all('pastas').filter(p => p.parentId === pastaId);
  const diretos = Store.all('ativos').filter(a => a.pastaId === pastaId);
  let all = [...diretos];
  diretos.forEach(d => { all = all.concat(descendentesBem(d.id)); });
  subGrupos.forEach(sg => { all = all.concat(bensSobGrupo(sg.id)); });
  return all;
}

function bensNoContexto() {
  if (_arvoreSel.tipo === 'pasta') return bensSobGrupo(_arvoreSel.id);
  if (_arvoreSel.tipo === 'bem') {
    const b = Store.get('ativos', _arvoreSel.id);
    return b ? [b, ...descendentesBem(b.id)] : [];
  }
  return Store.all('ativos');
}

function statsContexto() {
  const bens = bensNoContexto();
  const ids = new Set(bens.map(b => b.id));
  const hoje = Store.weekToDate(Store.config.semanaAtual);
  const ordensContexto = Store.all('ordens').filter(o => ids.has(o.ativoId));
  const pendentes = ordensContexto.filter(o => o.status !== 'Concluída' && o.status !== 'Cancelada');
  const osEmAtraso = pendentes.filter(o => o.dataProgramada && o.dataProgramada < hoje).length;
  return { bens: bens.length, osEmDia: pendentes.length - osEmAtraso, osEmAtraso };
}

function renderRodapeArvore() {
  const s = statsContexto();
  return `
    <div class="tree-stats">
      <div class="tree-stat"><span>${Icon('box',12)} Bens</span><strong>${s.bens}</strong></div>
      <div class="tree-stat"><span>${Icon('check',12)} OS em Dia</span><strong>${s.osEmDia}</strong></div>
      <div class="tree-stat"><span>${Icon('alert',12)} OS em Atraso</span><strong>${s.osEmAtraso}</strong></div>
    </div>`;
}

/* ========================= CAMINHOS / CÓDIGOS ========================= */

function caminhoCompletoBem(id) {
  const partes = [];
  let atual = Store.get('ativos', id);
  while (atual) {
    partes.unshift(atual.nome);
    if (atual.parentAtivoId) {
      atual = Store.get('ativos', atual.parentAtivoId);
    } else {
      if (atual.pastaId) partes.unshift(Store.caminhoPasta(atual.pastaId));
      atual = null;
    }
  }
  return partes.join(' / ');
}

function tagHierarquica(id) {
  const partes = [];
  let atual = Store.get('ativos', id);
  while (atual) { partes.unshift(atual.tag); atual = atual.parentAtivoId ? Store.get('ativos', atual.parentAtivoId) : null; }
  return partes.join('-');
}

/* ========================= PAINEL PRINCIPAL ========================= */

function renderPainelPrincipal() {
  if (_arvoreSel.tipo === 'bem' && Store.get('ativos', _arvoreSel.id)) return renderPainelBem(_arvoreSel.id);
  return renderPainelGrupo();
}

function bindPainelPrincipalEvents() {
  if (_arvoreSel.tipo === 'bem' && Store.get('ativos', _arvoreSel.id)) bindPainelBemEvents(_arvoreSel.id);
  else bindPainelGrupoEvents();
}

function bensRaizVisiveis() {
  let list = filtrarAtivos();
  if (_arvoreSel.tipo === 'pasta') list = list.filter(a => a.pastaId === _arvoreSel.id);
  return list;
}

function filtrarAtivos() {
  return Store.all('ativos').filter(a => {
    if (a.parentAtivoId) return false; // sub-bens só aparecem dentro do bem pai
    const t = _ativosFiltro.texto.toLowerCase();
    const matchText = !t || (a.tag + (a.codigoAtivo||'') + a.nome + a.fabricante + a.modelo + (a.familia||'') + (a.centroCusto||'') + (a.centroTrabalho||'') + (a.planta||'') + (a.sistema||'') + (a.subsistema||'') + (a.localizacao||'') + (a.proprietario||'') + (a.contaContabil||'')).toLowerCase().includes(t);
    const matchArea = !_ativosFiltro.area || a.area === _ativosFiltro.area;
    const matchCrit = !_ativosFiltro.criticidade || a.criticidade === _ativosFiltro.criticidade;
    return matchText && matchArea && matchCrit;
  });
}

function renderPainelGrupo() {
  const base = Store.all('ativos').filter(a => !a.parentAtivoId);
  const areas = [...new Set(base.map(a => a.area))];
  const pastaAtual = _arvoreSel.tipo === 'pasta' ? Store.get('pastas', _arvoreSel.id) : null;
  const ativos = bensRaizVisiveis();
  return `
    <div class="view-head">
      <div>
        <div class="cell-tag" style="margin-bottom:4px;">${pastaAtual ? Store.caminhoPasta(pastaAtual.id) : 'Raiz'}</div>
        <h1>${pastaAtual ? pastaAtual.nome : 'Todos os Ativos'}</h1>
        <div class="sub">${ativos.length} bem(ns)${pastaAtual ? ' neste grupo' : ' cadastrados na planta'}</div>
      </div>
      <div class="view-actions">
        <button class="btn" id="btnSyncMelvin">${Icon('refresh',15)} Sincronizar Melvin</button>
        <button class="btn" id="btnImportAtivos">${Icon('upload',15)} Importar Excel/CSV</button>
        <button class="btn btn-primary" id="btnNovoAtivo">${Icon('plus',15)} Novo Bem</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="form-grid cols-3">
        <div class="field"><label>Pesquisa avançada</label><input id="fAtvTexto" placeholder="TAG, código, nome, centro de custo, planta..." value="${_ativosFiltro.texto}"></div>
        <div class="field"><label>Área</label><select id="fAtvArea"><option value="">Todas</option>${areas.map(a => `<option ${a===_ativosFiltro.area?'selected':''}>${a}</option>`).join('')}</select></div>
        <div class="field"><label>Criticidade</label><select id="fAtvCrit"><option value="">Todas</option><option ${_ativosFiltro.criticidade==='A'?'selected':''}>A</option><option ${_ativosFiltro.criticidade==='B'?'selected':''}>B</option><option ${_ativosFiltro.criticidade==='C'?'selected':''}>C</option></select></div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>TAG</th><th>Código do Ativo</th><th>Nome do Bem</th><th>Família</th><th>Grupo</th><th>Área</th><th>Posse</th><th>Criticidade</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${ativos.map(a => `
            <tr>
              <td class="cell-tag">${a.tag}</td>
              <td class="cell-tag">${a.codigoAtivo || '—'}</td>
              <td><strong>${a.nome}</strong><div class="cell-tag">${a.fabricante || '—'} · ${a.modelo || '—'}</div></td>
              <td>${a.familia || '—'}</td>
              <td class="cell-tag">${a.pastaId ? Store.caminhoPasta(a.pastaId) : '— raiz —'}</td>
              <td>${a.area}</td>
              <td><span class="badge badge-${a.alugado?'warning':a.terceiro?'info':'success'}">${a.alugado?'Alugado':a.terceiro?'Terceiro':'Próprio'}</span></td>
              <td><span class="crit crit-${a.criticidade}">${a.criticidade}</span></td>
              <td><span class="badge badge-${App.badgeForStatus(a.status)}">${a.status}</span></td>
              <td><div class="row-actions">
                <button class="btn btn-sm" data-view-ativo="${a.id}" title="Ver">${Icon('eye',14)}</button>
                <button class="btn btn-sm" data-edit-ativo="${a.id}" title="Editar">${Icon('edit',14)}</button>
                <button class="btn btn-sm" data-dup-ativo="${a.id}" title="Duplicar">${Icon('package',14)}</button>
                <button class="btn btn-sm" data-move-ativo="${a.id}" title="Mover de grupo">${Icon('refresh',14)}</button>
                <button class="btn btn-sm btn-danger" data-del-ativo="${a.id}" title="Excluir">${Icon('trash',14)}</button>
              </div></td>
            </tr>`).join('') || `<tr><td colspan="10"><div class="empty">${Icon('box',30)}<span>Nenhum bem encontrado com os filtros atuais.</span></div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindPainelGrupoEvents() {
  document.getElementById('btnNovoAtivo')?.addEventListener('click', () => {
    const pastaId = _arvoreSel.tipo === 'pasta' ? _arvoreSel.id : null;
    abrirFormAtivo(null, { pastaId, parentAtivoId: null });
  });
  document.getElementById('btnImportAtivos')?.addEventListener('click', () => {
    const pastaId = _arvoreSel.tipo === 'pasta' ? _arvoreSel.id : null;
    Importacao.abrirModalImportAtivos(pastaId);
  });
  document.getElementById('btnSyncMelvin')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const antigosNaoMelvin = Store.all('ativos').filter(a => !a.melvinId).length + Store.all('pastas').filter(p => !p.melvinId).length;

    const executar = async () => {
      btn.disabled = true;
      const textoOriginal = btn.innerHTML;
      btn.innerHTML = `${Icon('refresh',15)} Sincronizando…`;
      try {
        const removidos = antigosNaoMelvin ? MelvinSync.removerNaoMelvin() : { ativosRemovidos: 0, pastasRemovidas: 0 };
        const r = await MelvinSync.sincronizarAtivos();
        App.toast(
          `Melvin sincronizado: ${removidos.pastasRemovidas} pasta(s) e ${removidos.ativosRemovidos} ativo(s) antigo(s) removido(s); ${r.pastasCriadas} pasta(s) nova(s), ${r.ativosCriados} ativo(s) novo(s), ${r.ativosAtualizados} atualizado(s).`,
          'success'
        );
        App.navigate('ativos', true);
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

    if (antigosNaoMelvin) {
      App.confirmAction(
        `Isso vai apagar ${antigosNaoMelvin} pasta(s)/ativo(s) atual(is) (que não vieram do Melvin) e deixar a árvore só com o que está no Melvin. Continuar?`,
        executar
      );
    } else {
      executar();
    }
  });
  document.getElementById('fAtvTexto')?.addEventListener('input', (e) => {
    _ativosFiltro.texto = e.target.value;
    App.navigate('ativos', true);
    const inp = document.getElementById('fAtvTexto');
    inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length;
  });
  document.getElementById('fAtvArea')?.addEventListener('change', (e) => { _ativosFiltro.area = e.target.value; App.navigate('ativos', true); });
  document.getElementById('fAtvCrit')?.addEventListener('change', (e) => { _ativosFiltro.criticidade = e.target.value; App.navigate('ativos', true); });
  document.querySelectorAll('[data-view-ativo]').forEach(b => b.addEventListener('click', () => abrirDetalheAtivo(b.dataset.viewAtivo)));
  document.querySelectorAll('[data-edit-ativo]').forEach(b => b.addEventListener('click', () => abrirFormAtivo(b.dataset.editAtivo)));
  document.querySelectorAll('[data-dup-ativo]').forEach(b => b.addEventListener('click', () => abrirDuplicarAtivo(b.dataset.dupAtivo)));
  document.querySelectorAll('[data-move-ativo]').forEach(b => b.addEventListener('click', () => abrirMoverAtivo(b.dataset.moveAtivo)));
  document.querySelectorAll('[data-del-ativo]').forEach(b => b.addEventListener('click', () => {
    const delId = b.dataset.delAtivo;
    App.confirmAction('Excluir este bem, seus sub-bens e todo o histórico? Esta ação não pode ser desfeita.', () => {
      [delId, ...descendentesBem(delId).map(x => x.id)].forEach(id => Store.remove('ativos', id));
      if (_arvoreSel.tipo === 'bem' && _arvoreSel.id === delId) _arvoreSel = { tipo: 'raiz', id: null };
      App.toast('Bem excluído.', 'success');
    });
  }));
}

function renderPainelBem(bemId) {
  const bem = Store.get('ativos', bemId);
  const filhos = Store.all('ativos').filter(a => a.parentAtivoId === bemId);
  return `
    <div class="view-head">
      <div>
        <div class="cell-tag" style="margin-bottom:6px;">${caminhoCompletoBem(bem.id)}</div>
        <h1>${bem.nome}</h1>
        <div class="sub">${Icon('grid',11)} ${tagHierarquica(bem.id)} · ${filhos.length} sub-bem(ns) cadastrado(s)</div>
      </div>
      <div class="view-actions">
        <button class="btn" id="btnVoltarBem">${Icon('arrow-left',14)} Voltar</button>
        <button class="btn" data-edit-ativo="${bem.id}">${Icon('edit',15)} Editar Bem</button>
        <button class="btn btn-primary" id="btnNovoSubBem">${Icon('plus',15)} Novo Sub-Bem</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Nome do Bem</th><th>Família</th><th>Proprietário</th><th>Sub-bens</th><th></th></tr></thead>
        <tbody>
          ${filhos.map(c => {
            const netos = Store.all('ativos').filter(a => a.parentAtivoId === c.id).length;
            return `
            <tr>
              <td class="cell-tag">${c.codigoAtivo || c.tag || '—'}</td>
              <td><strong>${c.nome}</strong></td>
              <td>${c.familia || '—'}</td>
              <td>${c.proprietario || '—'}</td>
              <td>${netos ? `<span class="badge badge-neutral">${netos}</span>` : '—'}</td>
              <td><div class="row-actions">
                <button class="btn btn-sm" data-view-ativo="${c.id}" title="Ver">${Icon('eye',14)}</button>
                <button class="btn btn-sm" data-edit-ativo="${c.id}" title="Editar">${Icon('edit',14)}</button>
                <button class="btn btn-sm" data-dup-ativo="${c.id}" title="Duplicar">${Icon('package',14)}</button>
                <button class="btn btn-sm" data-move-ativo="${c.id}" title="Mover">${Icon('refresh',14)}</button>
                <button class="btn btn-sm btn-danger" data-del-ativo="${c.id}" title="Excluir">${Icon('trash',14)}</button>
              </div></td>
            </tr>`; }).join('') || `<tr><td colspan="6"><div class="empty">${Icon('wrench',30)}<span>Nenhum sub-bem cadastrado para este item.</span></div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindPainelBemEvents(bemId) {
  document.getElementById('btnVoltarBem')?.addEventListener('click', () => {
    const bem = Store.get('ativos', bemId);
    if (bem?.parentAtivoId) _arvoreSel = { tipo: 'bem', id: bem.parentAtivoId };
    else if (bem?.pastaId) _arvoreSel = { tipo: 'pasta', id: bem.pastaId };
    else _arvoreSel = { tipo: 'raiz', id: null };
    App.navigate('ativos', true);
  });
  document.getElementById('btnNovoSubBem')?.addEventListener('click', () => abrirFormAtivo(null, { pastaId: null, parentAtivoId: bemId }));
  document.querySelectorAll('[data-view-ativo]').forEach(b => b.addEventListener('click', () => abrirDetalheAtivo(b.dataset.viewAtivo)));
  document.querySelectorAll('[data-edit-ativo]').forEach(b => b.addEventListener('click', () => abrirFormAtivo(b.dataset.editAtivo)));
  document.querySelectorAll('[data-dup-ativo]').forEach(b => b.addEventListener('click', () => abrirDuplicarAtivo(b.dataset.dupAtivo)));
  document.querySelectorAll('[data-move-ativo]').forEach(b => b.addEventListener('click', () => abrirMoverAtivo(b.dataset.moveAtivo)));
  document.querySelectorAll('[data-del-ativo]').forEach(b => b.addEventListener('click', () => {
    const delId = b.dataset.delAtivo;
    App.confirmAction('Excluir este item e seus sub-bens? Esta ação não pode ser desfeita.', () => {
      [delId, ...descendentesBem(delId).map(x => x.id)].forEach(id => Store.remove('ativos', id));
      App.toast('Item excluído.', 'success');
    });
  }));
}

/* ========================= MODAIS: GRUPO / MOVER ========================= */

function abrirDuplicarAtivo(bemId) {
  const bem = Store.get('ativos', bemId);
  if (!bem) return;
  const qtdSubBens = descendentesBem(bemId).length;
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">
      Duplica o bem <strong>${bem.nome}</strong>${qtdSubBens ? ` junto com seus ${qtdSubBens} sub-bem(ns)` : ''}, mantendo-o no mesmo grupo/item pai do original.
      Use a substituição de texto abaixo para ajustar as TAGs (e nomes) dos itens duplicados e evitar conflito com os originais.
    </p>
    <div class="form-grid cols-1">
      <div class="field"><label>Nome do Novo Bem</label><input id="dupAtvNome" value="${bem.nome} (Cópia)"></div>
    </div>
    <div class="form-grid" style="margin-top:14px;">
      <div class="field"><label>Localizar (na TAG e no nome)</label><input id="dupAtvBuscar" placeholder="Ex: 01"></div>
      <div class="field"><label>Substituir por</label><input id="dupAtvSubstituir" placeholder="Ex: 02"></div>
    </div>
    <p class="text-muted mt-8" style="font-size:11.5px;">Deixe os campos de substituição em branco para manter as TAGs originais (não recomendado se os dois bens forem coexistir na árvore).</p>
  `;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelDupAtv">Cancelar</button><button class="btn btn-primary" id="saveDupAtv">${Icon('package',15)} Duplicar Bem</button>`;
  App.openModal({ title: 'Duplicar Bem', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelDupAtv').onclick = App.closeModal;
  document.getElementById('saveDupAtv').onclick = () => {
    const novoNome = document.getElementById('dupAtvNome').value.trim();
    if (!novoNome) { App.toast('Informe o nome do novo bem.', 'danger'); return; }
    const buscar = document.getElementById('dupAtvBuscar').value;
    const substituir = document.getElementById('dupAtvSubstituir').value;
    const novo = duplicarAtivo(bemId, novoNome, buscar, substituir);
    if (novo) {
      if (novo.parentAtivoId) _arvoreSel = { tipo: 'bem', id: novo.parentAtivoId };
      else if (novo.pastaId) _arvoreSel = { tipo: 'pasta', id: novo.pastaId };
      else _arvoreSel = { tipo: 'raiz', id: null };
    }
    App.toast('Bem duplicado com sucesso.', 'success');
    App.closeModal();
    App.navigate('ativos', true);
  };
}

function duplicarAtivo(bemId, novoNome, buscar, substituir) {
  const original = Store.get('ativos', bemId);
  if (!original) return null;

  const aplicarSubstituicao = (texto) => {
    if (!texto || !buscar) return texto;
    return texto.split(buscar).join(substituir);
  };

  function clonarBem(bemOriginal, nomeForcado, destPastaId, destParentAtivoId) {
    const novo = Store.addSilent('ativos', {
      ...bemOriginal,
      id: undefined,
      nome: nomeForcado !== undefined ? nomeForcado : aplicarSubstituicao(bemOriginal.nome),
      tag: aplicarSubstituicao(bemOriginal.tag),
      codigoAtivo: aplicarSubstituicao(bemOriginal.codigoAtivo),
      pastaId: destPastaId,
      parentAtivoId: destParentAtivoId,
      anexos: [],
      historico: [{ data: new Date().toISOString().slice(0,10), tipo: 'Duplicação', descricao: `Duplicado a partir de "${bemOriginal.nome}" (${bemOriginal.tag}).`, os: '-' }],
    });
    Store.all('ativos').filter(a => a.parentAtivoId === bemOriginal.id).forEach(filho => clonarBem(filho, undefined, null, novo.id));
    return novo;
  }

  const novo = clonarBem(original, novoNome, original.pastaId, original.parentAtivoId);
  Store.persist();
  return novo;
}

function abrirDuplicarPasta(pastaId) {
  const pasta = Store.get('pastas', pastaId);
  if (!pasta) return;
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">
      Duplica o grupo <strong>${pasta.nome}</strong> junto com todos os sub-grupos, bens e sub-bens contidos nele.
      Use a substituição de texto abaixo para ajustar as TAGs (e nomes) dos itens duplicados e evitar conflito com os originais.
    </p>
    <div class="form-grid cols-1">
      <div class="field"><label>Nome do Novo Grupo</label><input id="dupNome" value="${pasta.nome} (Cópia)"></div>
    </div>
    <div class="form-grid" style="margin-top:14px;">
      <div class="field"><label>Localizar (na TAG e no nome)</label><input id="dupBuscar" placeholder="Ex: 01"></div>
      <div class="field"><label>Substituir por</label><input id="dupSubstituir" placeholder="Ex: 02"></div>
    </div>
    <p class="text-muted mt-8" style="font-size:11.5px;">Deixe os campos de substituição em branco para manter as TAGs originais (não recomendado se os dois grupos forem coexistir na árvore).</p>
  `;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelDup">Cancelar</button><button class="btn btn-primary" id="saveDup">${Icon('package',15)} Duplicar Grupo</button>`;
  App.openModal({ title: 'Duplicar Grupo', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelDup').onclick = App.closeModal;
  document.getElementById('saveDup').onclick = () => {
    const novoNome = document.getElementById('dupNome').value.trim();
    if (!novoNome) { App.toast('Informe o nome do novo grupo.', 'danger'); return; }
    const buscar = document.getElementById('dupBuscar').value;
    const substituir = document.getElementById('dupSubstituir').value;
    const nova = duplicarPasta(pastaId, novoNome, buscar, substituir);
    if (nova) { _pastasExpandidas.add(nova.id); _arvoreSel = { tipo: 'pasta', id: nova.id }; }
    App.toast('Grupo duplicado com sucesso.', 'success');
    App.closeModal();
    App.navigate('ativos', true);
  };
}

function duplicarPasta(pastaId, novoNome, buscar, substituir) {
  const original = Store.get('pastas', pastaId);
  if (!original) return null;

  const aplicarSubstituicao = (texto) => {
    if (!texto || !buscar) return texto;
    return texto.split(buscar).join(substituir);
  };

  function clonarBem(bemOriginal, destPastaId, destParentAtivoId) {
    const novo = Store.addSilent('ativos', {
      ...bemOriginal,
      id: undefined,
      nome: aplicarSubstituicao(bemOriginal.nome),
      tag: aplicarSubstituicao(bemOriginal.tag),
      codigoAtivo: aplicarSubstituicao(bemOriginal.codigoAtivo),
      pastaId: destPastaId,
      parentAtivoId: destParentAtivoId,
      anexos: [],
      historico: [{ data: new Date().toISOString().slice(0,10), tipo: 'Duplicação', descricao: `Duplicado a partir de "${bemOriginal.nome}" (${bemOriginal.tag}).`, os: '-' }],
    });
    Store.all('ativos').filter(a => a.parentAtivoId === bemOriginal.id).forEach(filho => clonarBem(filho, null, novo.id));
    return novo;
  }

  function clonarGrupo(origPastaId, destParentId) {
    const origPasta = Store.get('pastas', origPastaId);
    const novaPasta = Store.addSilent('pastas', { nome: aplicarSubstituicao(origPasta.nome), parentId: destParentId });
    Store.all('ativos').filter(a => a.pastaId === origPastaId).forEach(bem => clonarBem(bem, novaPasta.id, null));
    Store.all('pastas').filter(p => p.parentId === origPastaId).forEach(sp => clonarGrupo(sp.id, novaPasta.id));
    return novaPasta;
  }

  // A pasta raiz da duplicação usa o nome escolhido pelo usuário; as demais (sub-grupos) usam a substituição automática.
  const novaPastaRaiz = Store.addSilent('pastas', { nome: novoNome, parentId: original.parentId });
  Store.all('ativos').filter(a => a.pastaId === pastaId).forEach(bem => clonarBem(bem, novaPastaRaiz.id, null));
  Store.all('pastas').filter(p => p.parentId === pastaId).forEach(sp => clonarGrupo(sp.id, novaPastaRaiz.id));

  Store.persist();
  return novaPastaRaiz;
}

function abrirFormPasta(parentId) {
  const pastas = Store.all('pastas');
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid cols-1">
      <div class="field"><label>Nome do Grupo</label><input id="pNome" placeholder="Ex: Área de Moagem"></div>
      <div class="field"><label>Grupo Pai (opcional)</label><select id="pParent">
        <option value="">— Nenhum (grupo raiz) —</option>
        ${pastas.map(p => `<option value="${p.id}" ${parentId===p.id?'selected':''}>${Store.caminhoPasta(p.id)}</option>`).join('')}
      </select></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelPasta">Cancelar</button><button class="btn btn-primary" id="savePasta">${Icon('check',15)} Criar Grupo</button>`;
  App.openModal({ title: 'Novo Grupo', body, footer });
  renderIcons();
  document.getElementById('cancelPasta').onclick = App.closeModal;
  document.getElementById('savePasta').onclick = () => {
    const nome = document.getElementById('pNome').value.trim();
    if (!nome) { App.toast('Informe o nome do grupo.', 'danger'); return; }
    const parentSel = document.getElementById('pParent').value || null;
    Store.add('pastas', { nome, parentId: parentSel });
    if (parentSel) _pastasExpandidas.add(parentSel);
    App.toast('Grupo criado.', 'success');
    App.closeModal();
  };
}

function abrirMoverAtivo(id) {
  const bem = Store.get('ativos', id);
  if (!bem) return;
  const pastas = Store.all('pastas');
  const descendentesIds = new Set(descendentesBem(id).map(d => d.id));
  const candidatosBem = Store.all('ativos').filter(a => a.id !== id && !descendentesIds.has(a.id));
  const abaInicial = bem.parentAtivoId ? 'bem' : 'grupo';

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">Mover <strong>${bem.nome}</strong> para um grupo (nível raiz) ou para dentro de outro bem, como subcomponente.</p>
    <div class="tabs">
      <div class="tab ${abaInicial==='grupo'?'active':''}" data-movtab="grupo">Mover para um Grupo</div>
      <div class="tab ${abaInicial==='bem'?'active':''}" data-movtab="bem">Mover para dentro de um Bem</div>
    </div>
    <div id="movPaneGrupo" class="${abaInicial==='grupo'?'':'hidden'}">
      <div class="field">
        <label>Grupo de destino</label>
        <select id="movDestinoGrupo">
          <option value="">— Raiz (sem grupo) —</option>
          ${pastas.map(p => `<option value="${p.id}" ${bem.pastaId===p.id?'selected':''}>${Store.caminhoPasta(p.id)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="movPaneBem" class="${abaInicial==='bem'?'':'hidden'}">
      <div class="field">
        <label>Bem de destino (o item se tornará um subcomponente dele)</label>
        <select id="movDestinoBem">
          <option value="">Selecione um bem...</option>
          ${candidatosBem.map(b => `<option value="${b.id}" ${bem.parentAtivoId===b.id?'selected':''}>${caminhoCompletoBem(b.id)}</option>`).join('')}
        </select>
      </div>
      ${candidatosBem.length === 0 ? `<p class="text-muted" style="font-size:11.5px;">Não há outros bens disponíveis como destino (evitando ciclos com os próprios sub-bens).</p>` : ''}
    </div>
  `;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelMov">Cancelar</button><button class="btn btn-primary" id="saveMov">${Icon('refresh',14)} Mover</button>`;
  App.openModal({ title: 'Mover Bem', body, footer, size: 'lg' });
  renderIcons();

  let modoAtual = abaInicial;
  body.querySelectorAll('[data-movtab]').forEach(t => t.addEventListener('click', () => {
    body.querySelectorAll('[data-movtab]').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    modoAtual = t.dataset.movtab;
    document.getElementById('movPaneGrupo').classList.toggle('hidden', modoAtual !== 'grupo');
    document.getElementById('movPaneBem').classList.toggle('hidden', modoAtual !== 'bem');
  }));

  document.getElementById('cancelMov').onclick = App.closeModal;
  document.getElementById('saveMov').onclick = () => {
    if (modoAtual === 'grupo') {
      const destino = document.getElementById('movDestinoGrupo').value || null;
      Store.update('ativos', bem.id, { pastaId: destino, parentAtivoId: null });
      if (destino) _pastasExpandidas.add(destino);
      App.toast('Bem movido para o grupo com sucesso.', 'success');
    } else {
      const destinoBemId = document.getElementById('movDestinoBem').value;
      if (!destinoBemId) { App.toast('Selecione o bem de destino.', 'danger'); return; }
      Store.update('ativos', bem.id, { pastaId: null, parentAtivoId: destinoBemId });
      _pastasExpandidas.add('bem_' + destinoBemId);
      App.toast('Bem movido como subcomponente com sucesso.', 'success');
    }
    App.closeModal();
  };
}

/* ========================= FORM BEM / SUB-BEM ========================= */

/* ========================= UNIDADES (autocomplete livre) ========================= */

function unidadesConhecidas() {
  const padrao = ['un', 'jogo', 'par', 'kit', 'cx', 'kg', 'm', 'l', 'rolo', 'balde'];
  const usadas = Store.all('ativos').map(a => a.unidade).filter(Boolean);
  return [...new Set([...padrao, ...usadas])].sort();
}

/* ========================= GERAÇÃO AUTOMÁTICA DE TAG ========================= */

function gerarTagAutomatica(nome) {
  if (!nome || !nome.trim()) return '';
  const stopwords = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'a', 'o', 'as', 'os', 'ao', 'aos', 'no', 'na'];
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numeroFinal = (semAcento.match(/(\d+)\s*$/) || [])[1];
  const palavras = semAcento.replace(/\d+\s*$/, '').trim().split(/\s+/)
    .filter(w => w && !stopwords.includes(w.toLowerCase()));
  let iniciais = palavras.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!iniciais) iniciais = 'BEM';
  iniciais = iniciais.slice(0, 6);
  const sufixo = numeroFinal ? String(numeroFinal).padStart(2, '0') : '';
  return iniciais + sufixo;
}

function gerarTagAutomaticaUnica(nome, ignorarId) {
  const base = gerarTagAutomatica(nome);
  if (!base) return '';
  const existentes = new Set(Store.all('ativos').filter(a => a.id !== ignorarId).map(a => a.tag));
  let tag = base, n = 2;
  while (existentes.has(tag)) { tag = base + '-' + n; n++; }
  return tag;
}

function abrirFormAtivo(id, novoContexto) {
  const ativo = id ? Store.get('ativos', id) : null;
  const ehSubBem = ativo ? !!ativo.parentAtivoId : !!(novoContexto && novoContexto.parentAtivoId);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Bem</label><input id="fBem" value="${ativo?.tag || ''}" placeholder="Gerado automaticamente pelo nome"></div>
      <div class="field"><label>Tipo Modelo</label><input id="fTipoModelo" value="${ativo?.tipoModelo || ''}"></div>
      <div class="field"><label>Família</label><input id="fFamilia" value="${ativo?.familia || ''}"></div>
      <div class="field"><label>Nome do Bem</label><input id="fNome" value="${ativo?.nome || ''}"></div>
      <div class="field"><label>Unidade</label><input id="fUnidade" value="${ativo?.unidade || ''}" list="unidadesList" placeholder="Ex: un, jogo, par, kit..."></div>
      <div class="field"><label>Centro Custo</label><input id="fCentroCusto" value="${ativo?.centroCusto || ''}"></div>
      <div class="field"><label>Centro Trab.</label><input id="fCentroTrab" value="${ativo?.centroTrabalho || ''}"></div>
      <div class="field"><label>Modelo</label><input id="fModelo" value="${ativo?.modelo || ''}"></div>
      <div class="field"><label>Série</label><input id="fSerie" value="${ativo?.serie || ''}"></div>
      <div class="field"><label>Terceiro</label><select id="fTerceiro"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="field"><label>Instalação?</label><select id="fInstalacao"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="field"><label>Valor Compra</label><input type="number" id="fValorCompra" value="${ativo?.valorAquisicao ?? 0}"></div>
      <div class="field"><label>Produto Abastecido</label><input id="fProdutoAbastecido" value="${ativo?.produtoAbastecido || ''}"></div>
      <div class="field"><label>Aluguel?</label><select id="fAluguel"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="field"><label>% Manutenção</label><input type="number" id="fPercManutencao" value="${ativo?.percentualManutencao ?? 0}"></div>
      <div class="field"><label>% Seguro/Licenciamento</label><input type="number" id="fPercSeguro" value="${ativo?.percentualSeguroLicenciamento ?? 0}"></div>
      <div class="field"><label>Valor Presente</label><input type="number" id="fValorPresente" value="${ativo?.valorPresente ?? 0}"></div>
      <div class="field"><label>Valor Faturado</label><input type="number" id="fValorFaturado" value="${ativo?.valorFaturado ?? 0}"></div>
      <div class="field"><label>Proprietário</label><input id="fProprietario" value="${ativo?.proprietario || ''}"></div>
      <div class="field"><label>Próprio?</label><select id="fProprio"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="field"><label>Conta Contábil</label><input id="fContaContabil" value="${ativo?.contaContabil || ''}"></div>
    </div>
    <datalist id="unidadesList">${unidadesConhecidas().map(u => `<option value="${u}">`).join('')}</datalist>
    <p class="text-muted mt-8" style="font-size:11.5px;">Selecionar "Sim" em Próprio? / Terceiro / Aluguel? marca automaticamente os demais como "Não", já que o regime de posse do bem é único. O campo "Bem" é preenchido automaticamente a partir do Nome do Bem — edite-o manualmente se quiser um código específico. Em "Unidade", digite livremente (ex: un, jogo, par, kit) — o valor fica disponível para as próximas vezes automaticamente.</p>
  `;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelAtv">Cancelar</button><button class="btn btn-primary" id="saveAtv">${Icon('check',15)} Salvar</button>`;
  const titulo = ativo
    ? (ehSubBem ? 'Editar Sub-Bem' : 'Editar Bem')
    : (ehSubBem ? 'Novo Sub-Bem' : 'Novo Bem');
  App.openModal({ title: titulo, body, footer, size: 'lg' });
  renderIcons();

  // TAG ("Bem") automática a partir do Nome do Bem, até o usuário editá-la manualmente
  let tagEditadaManualmente = !!ativo; // ao editar um bem existente, não sobrescrever a TAG já definida
  const inputNome = document.getElementById('fNome');
  const inputBem = document.getElementById('fBem');
  inputNome.addEventListener('input', () => {
    if (tagEditadaManualmente) return;
    inputBem.value = gerarTagAutomaticaUnica(inputNome.value, ativo?.id);
  });
  inputBem.addEventListener('input', () => { tagEditadaManualmente = true; });

  // regime de posse padrão + exclusividade mútua
  const posseSel = { proprio: document.getElementById('fProprio'), terceiro: document.getElementById('fTerceiro'), alugado: document.getElementById('fAluguel') };
  const posseInicial = ativo ? (ativo.alugado ? 'alugado' : ativo.terceiro ? 'terceiro' : 'proprio') : 'proprio';
  posseSel[posseInicial].value = 'sim';
  Object.entries(posseSel).forEach(([key, sel]) => sel.addEventListener('change', () => {
    if (sel.value === 'sim') Object.entries(posseSel).forEach(([k2, s2]) => { if (k2 !== key) s2.value = 'nao'; });
  }));
  document.getElementById('fInstalacao').value = ativo ? (ativo.instalacao ? 'sim' : 'nao') : 'sim';

  document.getElementById('cancelAtv').onclick = App.closeModal;
  document.getElementById('saveAtv').onclick = () => {
    const data = {
      tag: val('fBem'),
      tipoModelo: val('fTipoModelo'),
      familia: val('fFamilia'),
      nome: val('fNome'),
      unidade: val('fUnidade'),
      centroCusto: val('fCentroCusto'),
      centroTrabalho: val('fCentroTrab'),
      modelo: val('fModelo'),
      serie: val('fSerie'),
      terceiro: val('fTerceiro') === 'sim',
      instalacao: val('fInstalacao') === 'sim',
      valorAquisicao: Number(val('fValorCompra')) || 0,
      produtoAbastecido: val('fProdutoAbastecido'),
      alugado: val('fAluguel') === 'sim',
      percentualManutencao: Number(val('fPercManutencao')) || 0,
      percentualSeguroLicenciamento: Number(val('fPercSeguro')) || 0,
      valorPresente: Number(val('fValorPresente')) || 0,
      valorFaturado: Number(val('fValorFaturado')) || 0,
      proprietario: val('fProprietario'),
      proprio: val('fProprio') === 'sim',
      contaContabil: val('fContaContabil'),
    };
    if (!data.nome) { App.toast('Informe o nome do bem.', 'danger'); return; }
    if (ativo) {
      Store.update('ativos', ativo.id, data);
      App.toast('Atualizado com sucesso.', 'success');
    } else {
      Store.add('ativos', {
        ...data,
        pastaId: novoContexto?.pastaId ?? null,
        parentAtivoId: novoContexto?.parentAtivoId ?? null,
        setor: data.familia || 'Geral', categoria: data.familia || 'Geral',
        fabricante: '', criticidade: 'C', status: 'Operando',
        dataInstalacao: new Date().toISOString().slice(0,10),
        vidaUtilAnos: 10, horasOperacaoAcumuladas: 0, anexos: [],
        historico: [{ data: new Date().toISOString().slice(0,10), tipo: 'Cadastro', descricao: ehSubBem ? 'Sub-bem cadastrado sob o item pai.' : 'Bem cadastrado no sistema.', os: '-' }],
      });
      App.toast('Cadastrado com sucesso.', 'success');
    }
    App.closeModal();
  };
}

function val(id) { return document.getElementById(id).value; }

/* ========================= DETALHE DO BEM ========================= */

function abrirDetalheAtivo(id) {
  const a = Store.get('ativos', id);
  if (!a) return;
  const osDoAtivo = Store.all('ordens').filter(o => o.ativoId === id);
  const pai = a.parentAtivoId ? Store.get('ativos', a.parentAtivoId) : null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="cell-tag" style="margin-bottom:10px;">${caminhoCompletoBem(a.id)}</div>
    <div class="tabs">
      <div class="tab active" data-tab="info">Informações</div>
      <div class="tab" data-tab="patrim">Patrimônio</div>
      <div class="tab" data-tab="hist">Histórico</div>
      <div class="tab" data-tab="os">Ordens de Serviço (${osDoAtivo.length})</div>
      <div class="tab" data-tab="anexos">Anexos</div>
      <div class="tab" data-tab="qr">QR Code</div>
    </div>
    <div id="tabInfo">
      <div class="form-grid cols-3">
        <div><div class="kpi-label">Código Hierárquico</div><div style="font-weight:600;margin-top:4px;" class="mono">${tagHierarquica(a.id)}</div></div>
        <div><div class="kpi-label">${pai ? 'Item Pai' : 'Grupo'}</div><div style="font-weight:600;margin-top:4px;">${pai ? pai.nome : (a.pastaId ? Store.caminhoPasta(a.pastaId) : '— raiz —')}</div></div>
        <div><div class="kpi-label">TAG</div><div style="font-weight:600;margin-top:4px;">${a.tag}</div></div>
        <div><div class="kpi-label">Área</div><div style="font-weight:600;margin-top:4px;">${a.area}</div></div>
        <div><div class="kpi-label">Criticidade</div><div style="margin-top:4px;"><span class="crit crit-${a.criticidade}">${a.criticidade}</span></div></div>
        <div><div class="kpi-label">Fabricante / Modelo</div><div style="font-weight:600;margin-top:4px;">${a.fabricante || '—'} · ${a.modelo || '—'}</div></div>
        <div><div class="kpi-label">Status</div><div style="margin-top:4px;"><span class="badge badge-${App.badgeForStatus(a.status)}">${a.status}</span></div></div>
        <div><div class="kpi-label">Instalado em</div><div style="font-weight:600;margin-top:4px;">${App.fmtDate(a.dataInstalacao)}</div></div>
        <div><div class="kpi-label">Valor de aquisição</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(a.valorAquisicao)}</div></div>
        <div><div class="kpi-label">Horas de operação</div><div style="font-weight:600;margin-top:4px;">${a.horasOperacaoAcumuladas || 0} h</div></div>
        <div><div class="kpi-label">Vida útil estimada</div><div style="font-weight:600;margin-top:4px;">${a.vidaUtilAnos || '—'} anos</div></div>
      </div>
    </div>
    <div id="tabPatrim" class="hidden">
      <div class="form-grid cols-3">
        <div><div class="kpi-label">Bem</div><div style="font-weight:600;margin-top:4px;">${a.tag}</div></div>
        <div><div class="kpi-label">Tipo Modelo</div><div style="font-weight:600;margin-top:4px;">${a.tipoModelo || '—'}</div></div>
        <div><div class="kpi-label">Família</div><div style="font-weight:600;margin-top:4px;">${a.familia || '—'}</div></div>
        <div><div class="kpi-label">Nome do Bem</div><div style="font-weight:600;margin-top:4px;">${a.nome}</div></div>
        <div><div class="kpi-label">Unidade</div><div style="font-weight:600;margin-top:4px;">${a.unidade || '—'}</div></div>
        <div><div class="kpi-label">Centro Custo</div><div style="font-weight:600;margin-top:4px;">${a.centroCusto || '—'}</div></div>
        <div><div class="kpi-label">Centro Trab.</div><div style="font-weight:600;margin-top:4px;">${a.centroTrabalho || '—'}</div></div>
        <div><div class="kpi-label">Modelo</div><div style="font-weight:600;margin-top:4px;">${a.modelo || '—'}</div></div>
        <div><div class="kpi-label">Série</div><div style="font-weight:600;margin-top:4px;">${a.serie || '—'}</div></div>
        <div><div class="kpi-label">Terceiro</div><div style="margin-top:4px;"><span class="badge badge-${a.terceiro?'info':'neutral'}">${a.terceiro?'Sim':'Não'}</span></div></div>
        <div><div class="kpi-label">Instalação?</div><div style="margin-top:4px;"><span class="badge badge-${a.instalacao?'success':'neutral'}">${a.instalacao?'Sim':'Não'}</span></div></div>
        <div><div class="kpi-label">Valor Compra</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(a.valorAquisicao)}</div></div>
        <div><div class="kpi-label">Produto Abastecido</div><div style="font-weight:600;margin-top:4px;">${a.produtoAbastecido || '—'}</div></div>
        <div><div class="kpi-label">Aluguel?</div><div style="margin-top:4px;"><span class="badge badge-${a.alugado?'warning':'neutral'}">${a.alugado?'Sim':'Não'}</span></div></div>
        <div><div class="kpi-label">% Manutenção</div><div style="font-weight:600;margin-top:4px;">${a.percentualManutencao ?? 0}%</div></div>
        <div><div class="kpi-label">% Seguro/Licenciamento</div><div style="font-weight:600;margin-top:4px;">${a.percentualSeguroLicenciamento ?? 0}%</div></div>
        <div><div class="kpi-label">Valor Presente</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(a.valorPresente)}</div></div>
        <div><div class="kpi-label">Valor Faturado</div><div style="font-weight:600;margin-top:4px;">${App.fmtMoney(a.valorFaturado)}</div></div>
        <div><div class="kpi-label">Proprietário</div><div style="font-weight:600;margin-top:4px;">${a.proprietario || '—'}</div></div>
        <div><div class="kpi-label">Próprio?</div><div style="margin-top:4px;"><span class="badge badge-${a.proprio?'success':'neutral'}">${a.proprio?'Sim':'Não'}</span></div></div>
        <div><div class="kpi-label">Conta Contábil</div><div style="font-weight:600;margin-top:4px;" class="mono">${a.contaContabil || '—'}</div></div>
      </div>
    </div>
    <div id="tabHist" class="hidden">
      ${a.historico.map(h => `<div style="padding:10px 0;border-bottom:1px solid var(--border-soft);"><div class="flex-between"><strong style="font-size:13px;">${h.tipo}</strong><span class="cell-tag">${App.fmtDate(h.data)}</span></div><div class="text-muted" style="font-size:12.5px;margin-top:2px;">${h.descricao}</div></div>`).join('') || '<div class="empty">Sem histórico.</div>'}
    </div>
    <div id="tabOs" class="hidden">
      ${osDoAtivo.map(o => `<div style="padding:10px 0;border-bottom:1px solid var(--border-soft);" class="flex-between"><div><strong style="font-size:13px;">${o.numero}</strong><div class="cell-tag">${o.tipo} · Semana ${o.semana}</div></div><span class="badge badge-${App.badgeForStatus(o.status)}">${o.status}</span></div>`).join('') || '<div class="empty">Nenhuma OS vinculada.</div>'}
    </div>
    <div id="tabAnexos" class="hidden">
      <input type="file" id="fileAnexo" multiple style="margin-bottom:12px;">
      <div id="listaAnexos">${(a.anexos||[]).map((f,i) => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border-soft);"><span style="font-size:13px;">${Icon('paperclip',14)} ${f}</span></div>`).join('') || '<div class="empty">Nenhum anexo.</div>'}</div>
    </div>
    <div id="tabQr" class="hidden" style="text-align:center;padding:20px;">
      <div id="qrHolder" style="display:inline-block;background:#fff;padding:16px;border-radius:8px;"></div>
      <div class="cell-tag" style="margin-top:10px;">${a.tag} — aponte a câmera para acessar o ativo no sistema.</div>
      <div style="margin-top:12px;"><button class="btn btn-sm" id="btnPrintQr">${Icon('print',14)} Imprimir etiqueta</button></div>
    </div>
  `;
  App.openModal({ title: a.nome, body, size: 'lg' });
  renderIcons();
  body.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    body.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ['Info', 'Patrim', 'Hist', 'Os', 'Anexos', 'Qr'].forEach(k => document.getElementById('tab' + k).classList.add('hidden'));
    document.getElementById('tab' + t.dataset.tab.charAt(0).toUpperCase() + t.dataset.tab.slice(1)).classList.remove('hidden');
    if (t.dataset.tab === 'qr') gerarQr(a);
  }));
  document.getElementById('fileAnexo')?.addEventListener('change', (e) => {
    const nomes = Array.from(e.target.files).map(f => f.name);
    const anexos = [...(a.anexos || []), ...nomes];
    Store.update('ativos', a.id, { anexos });
    App.toast(nomes.length + ' anexo(s) adicionado(s).', 'success');
    App.closeModal();
  });
}

function gerarQr(a) {
  const holder = document.getElementById('qrHolder');
  if (!holder || holder.dataset.done) return;
  holder.dataset.done = '1';
  try {
    new QRCode(holder, { text: `FERTGROW-ATIVO:${a.tag}:${a.id}`, width: 160, height: 160, colorDark: '#0A0E14', colorLight: '#ffffff' });
  } catch (e) { holder.innerHTML = '<div style="padding:30px;color:#333;">QR indisponível offline</div>'; }
  document.getElementById('btnPrintQr')?.addEventListener('click', () => window.print());
}
