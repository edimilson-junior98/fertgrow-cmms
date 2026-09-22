/* ==========================================================================
   FertGrow CMMS — Prestadores de Serviço
   Cadastro de empresas/fornecedores externos (retíficas, oficinas, etc.)
   usados nos orçamentos e envios de Manutenção Externa dos motores.
   ========================================================================== */

let _prestBusca = '';
let _prestBuscaTimer = null;

// Busca por nome/razão social, CNPJ ou especialidade; favoritos sempre no
// topo da lista (mesmo padrão da tela de Serviços — ver servicos.js).
function prestAplicarFiltroOrdenacao(prestadores) {
  let out = prestadores;
  const busca = _prestBusca.trim().toLowerCase();
  if (busca) {
    out = out.filter(p => (p.nome || '').toLowerCase().includes(busca)
      || (p.cnpj || '').toLowerCase().includes(busca)
      || (p.especialidade || '').toLowerCase().includes(busca));
  }
  return [...out].sort((a, b) => (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0));
}

Views.prestadores = {
  title: 'Prestadores de Serviço',
  render() {
    const todos = Store.all('prestadores');
    const prestadores = prestAplicarFiltroOrdenacao(todos);
    return `
      <div class="view-head">
        <div><h1>Prestadores de Serviço</h1><div class="sub">${prestadores.length}${prestadores.length !== todos.length ? ' de ' + todos.length : ''} prestador(es) cadastrado(s)</div></div>
        <div class="view-actions">
          <button class="btn" id="btnImportPrestadores">${Icon('upload', 15)} Importar Planilha</button>
          <button class="btn btn-primary" id="btnNovoPrestador">${Icon('plus', 15)} Novo Prestador</button>
        </div>
      </div>

      <div class="field" style="position:relative;max-width:380px;margin-bottom:16px;">
        <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);display:flex;">${Icon('search',14)}</span>
        <input id="prestBusca" placeholder="Buscar por nome, CNPJ ou especialidade..." value="${escapeHtml(_prestBusca)}"
          style="width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:9px 12px 9px 34px;color:var(--text);font-size:13px;box-sizing:border-box;">
      </div>

      <div class="table-wrap"><table>
        <thead><tr><th style="width:30px;"></th><th>Nome / Razão Social</th><th>CNPJ</th><th>Especialidade</th><th>Telefone</th><th>E-mail</th><th>Status</th><th></th></tr></thead>
        <tbody>${prestadores.map(p => `<tr>
          <td><button type="button" class="btn-fav" data-fav-prestador="${p.id}" title="${p.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'}"
              style="background:none;border:none;padding:2px;cursor:pointer;line-height:0;display:flex;color:${p.favorito ? 'var(--warning)' : 'var(--text-faint)'};">${iconeEstrela(p.favorito)}</button></td>
          <td><strong>${escapeHtml(p.nome)}</strong></td>
          <td class="cell-tag">${escapeHtml(p.cnpj) || '—'}</td>
          <td>${p.especialidade ? escapeHtml(p.especialidade) : '—'}</td>
          <td class="cell-tag">${p.telefone ? escapeHtml(p.telefone) : '—'}</td>
          <td class="cell-tag">${p.email ? escapeHtml(p.email) : '—'}</td>
          <td><span class="badge badge-${p.ativo ? 'success' : 'neutral'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td><div class="row-actions">
            <button class="btn btn-sm" data-edit-prestador="${p.id}" title="Editar">${Icon('edit', 14)}</button>
            <button class="btn btn-sm" data-toggle-prestador="${p.id}" title="${p.ativo ? 'Desativar' : 'Reativar'}">${Icon(p.ativo ? 'x' : 'check', 14)}</button>
            <button class="btn btn-sm btn-danger" data-del-prestador="${p.id}" title="Excluir">${Icon('trash', 14)}</button>
          </div></td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('building', 30)}<span>${todos.length ? 'Nenhum prestador corresponde à busca.' : 'Nenhum prestador cadastrado.'}</span></div></td></tr>`}</tbody>
      </table></div>
    `;
  },
  afterRender() {
    document.getElementById('btnNovoPrestador').addEventListener('click', () => abrirFormPrestador());
    document.getElementById('btnImportPrestadores').addEventListener('click', () => Importacao.abrirModalImportPrestadores());
    document.getElementById('prestBusca').addEventListener('input', (e) => {
      _prestBusca = e.target.value;
      clearTimeout(_prestBuscaTimer);
      _prestBuscaTimer = setTimeout(() => {
        App.navigate('prestadores', true);
        const inp = document.getElementById('prestBusca');
        if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
      }, 220);
    });
    document.querySelectorAll('[data-fav-prestador]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.favPrestador;
      const p = Store.get('prestadores', id);
      if (p) Store.update('prestadores', id, { favorito: !p.favorito });
    }));
    document.querySelectorAll('[data-edit-prestador]').forEach(b => b.addEventListener('click', () => abrirFormPrestador(Store.get('prestadores', b.dataset.editPrestador))));
    document.querySelectorAll('[data-toggle-prestador]').forEach(b => b.addEventListener('click', () => {
      const p = Store.get('prestadores', b.dataset.togglePrestador);
      Store.update('prestadores', p.id, { ativo: !p.ativo });
      App.toast(p.ativo ? 'Prestador desativado.' : 'Prestador reativado.', 'success');
    }));
    document.querySelectorAll('[data-del-prestador]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Remover este prestador de serviço?', () => {
        Store.remove('prestadores', b.dataset.delPrestador);
        App.toast('Prestador removido.', 'success');
      });
    }));
  },
};

function abrirFormPrestador(prestador) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Razão Social</label><input id="pNome" value="${prestador?.nome || ''}"></div>
      <div class="field"><label>Nome Fantasia</label><input id="pNomeFantasia" placeholder="Se for diferente da Razão Social" value="${prestador?.nomeFantasia || ''}"></div>
      <div class="field"><label>CNPJ</label><input id="pCnpj" placeholder="00.000.000/0000-00" value="${prestador?.cnpj || ''}"></div>
      <div class="field"><label>Especialidade</label><input id="pEspecialidade" placeholder="Ex: Retífica de Motores" value="${prestador?.especialidade || ''}"></div>
      <div class="field"><label>Telefone</label><input id="pTelefone" placeholder="(00) 00000-0000" value="${prestador?.telefone || ''}"></div>
      <div class="field"><label>E-mail</label><input id="pEmail" type="email" value="${prestador?.email || ''}"></div>
      <div class="field field-span-2"><label>Endereço</label><input id="pEndereco" value="${prestador?.endereco || ''}"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelPr">Cancelar</button><button class="btn btn-primary" id="savePr">${Icon('check', 15)} Salvar Prestador</button>`;
  App.openModal({ title: prestador ? 'Editar Prestador' : 'Novo Prestador de Serviço', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelPr').onclick = App.closeModal;
  document.getElementById('savePr').onclick = () => {
    const nome = val('pNome').trim();
    if (!nome) { App.toast('Informe a razão social.', 'danger'); return; }
    const data = {
      nome, nomeFantasia: val('pNomeFantasia'), cnpj: val('pCnpj'), especialidade: val('pEspecialidade'),
      telefone: val('pTelefone'), email: val('pEmail'), endereco: val('pEndereco'),
    };
    if (prestador) { Store.update('prestadores', prestador.id, data); App.toast('Prestador atualizado.', 'success'); }
    else { Store.add('prestadores', { ...data, ativo: true }); App.toast('Prestador cadastrado.', 'success'); }
    App.closeModal();
  };
}
