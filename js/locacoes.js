/* ==========================================================================
   FertGrow CMMS — Locações (Aluguéis)
   Controle de todos os ativos alugados: locador, valor mensal, custo total
   acumulado por mês e vigência (data de início e, quando possível, término).
   ========================================================================== */

Views.locacoes = {
  title: 'Locações',
  render() {
    const locacoes = Store.calcLocacoes().sort((a, b) => (a.status === b.status ? 0 : a.status === 'A Vencer' ? -1 : 1));
    const ativas = locacoes.filter(l => l.status !== 'Encerrada');
    const custoMensal = Store.custoMensalLocacoes();
    const aVencer = locacoes.filter(l => l.status === 'A Vencer');

    return `
      <div class="view-head">
        <div><h1>Locações</h1><div class="sub">${ativas.length} contrato(s) ativo(s) · ${locacoes.length} no total</div></div>
        <div class="view-actions"><button class="btn btn-primary" id="btnNovaLocacao">${Icon('plus',15)} Nova Locação</button></div>
      </div>

      <div class="grid grid-4" style="margin-bottom:18px;">
        ${indCard('Locações Ativas', ativas.length, 'contratos em vigência', 'clipboard')}
        ${indCard('Custo Mensal Total', App.fmtMoney(custoMensal), 'soma das locações ativas', 'coin')}
        ${indCard('Custo Anual Projetado', App.fmtMoney(custoMensal * 12), 'baseado no custo mensal atual', 'chart')}
        ${indCard('A Vencer (30 dias)', aVencer.length, 'contratos próximos do término', 'alert')}
      </div>

      ${aVencer.length ? `<div class="card" style="margin-bottom:16px;border-color:rgba(242,183,5,.4);">
        <div class="flex" style="gap:10px;align-items:center;color:var(--warning);font-weight:600;font-size:13px;">${Icon('alert',18)} ${aVencer.length} locação(ões) vencendo nos próximos 30 dias — avalie renovação ou devolução.</div>
      </div>` : ''}

      <div class="table-wrap">
        <table>
          <thead><tr><th>Bem</th><th>Locador</th><th>Valor Mensal</th><th>Início</th><th>Término</th><th>Status</th><th>Custo Acumulado</th><th></th></tr></thead>
          <tbody>
            ${locacoes.map(l => `
              <tr>
                <td><strong>${l.bem || '—'}</strong></td>
                <td>${l.locador}</td>
                <td>${App.fmtMoney(l.valorMensal)}</td>
                <td class="cell-tag">${App.fmtDate(l.dataInicio)}</td>
                <td class="cell-tag">${l.dataFim ? App.fmtDate(l.dataFim) : 'Indeterminado'}</td>
                <td><span class="badge badge-${l.status==='Ativa'?'success':l.status==='A Vencer'?'warning':'neutral'}">${l.status}</span></td>
                <td>${App.fmtMoney(l.custoAcumulado)}</td>
                <td><div class="row-actions">
                  <button class="btn btn-sm" data-edit-locacao="${l.id}" title="Editar">${Icon('edit',14)}</button>
                  <button class="btn btn-sm btn-danger" data-del-locacao="${l.id}" title="Excluir">${Icon('trash',14)}</button>
                </div></td>
              </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('clipboard',30)}<span>Nenhuma locação cadastrada.</span></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  },
  afterRender() {
    document.getElementById('btnNovaLocacao').addEventListener('click', () => abrirFormLocacao());
    document.querySelectorAll('[data-edit-locacao]').forEach(b => b.addEventListener('click', () => abrirFormLocacao(b.dataset.editLocacao)));
    document.querySelectorAll('[data-del-locacao]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Excluir esta locação? O ativo permanecerá cadastrado, apenas o contrato de locação será removido.', () => {
        Store.remove('locacoes', b.dataset.delLocacao);
        App.toast('Locação excluída.', 'success');
      });
    }));
  },
};

function abrirFormLocacao(id) {
  const locacao = id ? Store.get('locacoes', id) : null;
  const sugestoes = [...new Set([
    ...Store.all('ativos').map(a => a.nome),
    ...Store.all('locacoes').map(l => l.bem),
  ].filter(Boolean))];
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field field-span-2"><label>Bem Alugado</label><input id="lBem" value="${locacao?.bem || ''}" list="bensLocacaoList" placeholder="Digite o nome do bem alugado"></div>
      <div class="field"><label>Locador (Proprietário)</label><input id="lLocador" value="${locacao?.locador || ''}" placeholder="Ex: Locadora Industrial Nordeste LTDA"></div>
      <div class="field"><label>Valor Mensal (R$)</label><input type="number" id="lValor" value="${locacao?.valorMensal || 0}"></div>
      <div class="field"><label>Data de Início</label><input type="date" id="lInicio" value="${locacao?.dataInicio || ''}"></div>
      <div class="field">
        <label>Data de Término</label>
        <input type="date" id="lFim" value="${locacao?.dataFim || ''}" ${!locacao || !locacao.dataFim ? 'disabled' : ''}>
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-weight:400;font-size:12px;color:var(--text-muted);">
          <input type="checkbox" id="lIndeterminado" ${!locacao || !locacao.dataFim ? 'checked' : ''} style="width:auto;"> Prazo indeterminado (sem data de término)
        </label>
      </div>
      <div class="field field-span-2"><label>Observações</label><textarea id="lObs">${locacao?.observacoes || ''}</textarea></div>
    </div>
    <datalist id="bensLocacaoList">${sugestoes.map(s => `<option value="${s}">`).join('')}</datalist>
    <p class="text-muted mt-8" style="font-size:11.5px;">"Bem Alugado" é digitado livremente — não precisa estar cadastrado na árvore de ativos. As sugestões são apenas para agilizar, mas você pode digitar qualquer nome.</p>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelLoc">Cancelar</button><button class="btn btn-primary" id="saveLoc">${Icon('check',15)} Salvar Locação</button>`;
  App.openModal({ title: locacao ? 'Editar Locação' : 'Nova Locação', body, footer, size: 'lg' });
  renderIcons();

  const fimInput = document.getElementById('lFim');
  const chkIndeterminado = document.getElementById('lIndeterminado');
  chkIndeterminado.addEventListener('change', () => {
    fimInput.disabled = chkIndeterminado.checked;
    if (chkIndeterminado.checked) fimInput.value = '';
  });

  document.getElementById('cancelLoc').onclick = App.closeModal;
  document.getElementById('saveLoc').onclick = () => {
    const bem = document.getElementById('lBem').value.trim();
    const locador = document.getElementById('lLocador').value.trim();
    const valorMensal = Number(document.getElementById('lValor').value) || 0;
    const dataInicio = document.getElementById('lInicio').value;
    const dataFim = chkIndeterminado.checked ? null : (fimInput.value || null);
    const observacoes = document.getElementById('lObs').value;
    if (!bem) { App.toast('Informe o bem alugado.', 'danger'); return; }
    if (!locador) { App.toast('Informe o locador (proprietário).', 'danger'); return; }
    if (!dataInicio) { App.toast('Informe a data de início.', 'danger'); return; }
    const data = { bem, locador, valorMensal, dataInicio, dataFim, observacoes };
    if (locacao) { Store.update('locacoes', locacao.id, data); App.toast('Locação atualizada.', 'success'); }
    else { Store.add('locacoes', data); App.toast('Locação cadastrada.', 'success'); }
    App.closeModal();
  };
}
