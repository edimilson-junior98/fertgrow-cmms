/* ==========================================================================
   FertGrow CMMS — Solicitações de Serviço

   Pedido informal de manutenção (ex: "trocar lâmpada", "vazamento no setor X")
   feito ANTES de virar uma Ordem de Serviço formal — quem abre não precisa
   saber prioridade técnica, oficina responsável etc., só descrever o
   problema. PCM analisa depois e, se for o caso, transforma numa OS de
   verdade na tela de Ordens de Serviço.

   Também sincroniza com o Melvin (botão "Sincronizar Melvin"), que já tem
   esse mesmo conceito (controller SolicitacaoServico) — mesmo padrão de
   Ativos/Ordens: cada solicitação trazida de lá guarda `melvinId` pra
   próximas sincronizações atualizarem em vez de duplicar.
   ========================================================================== */

let _solFiltro = { status: '', prioridade: '' };

Views.solicitacoes = {
  title: 'Solicitações de Serviço',
  render() {
    const todas = Store.all('solicitacoesServico').filter(s =>
      (!_solFiltro.status || s.status === _solFiltro.status) &&
      (!_solFiltro.prioridade || s.prioridade === _solFiltro.prioridade)
    ).sort((a, b) => (b.dataAbertura || '').localeCompare(a.dataAbertura || ''));

    const statusOpts = ['Aberta', 'Em Andamento', 'Aprovada', 'Concluída', 'Arquivada'];
    const prioOpts = ['Baixa', 'Média', 'Alta'];

    return `
      <div class="view-head">
        <div><h1>Solicitações de Serviço</h1><div class="sub">${Store.all('solicitacoesServico').length} solicitação(ões) no total · ${todas.length} exibidas</div></div>
        <div class="view-actions">
          <button class="btn" id="btnSyncMelvinSol">${Icon('refresh',15)} Sincronizar Melvin</button>
          <button class="btn btn-primary" id="btnNovaSolicitacao">${Icon('plus',15)} Nova Solicitação</button>
        </div>
      </div>

      <div class="pill-filter" style="margin-bottom:14px;">
        <span class="pill ${!_solFiltro.status?'active':''}" data-fs="">Todos status</span>
        ${statusOpts.map(s => `<span class="pill ${_solFiltro.status===s?'active':''}" data-fs="${s}">${s}</span>`).join('')}
      </div>
      <div class="pill-filter" style="margin-bottom:16px;">
        <span class="pill ${!_solFiltro.prioridade?'active':''}" data-fp="">Todas prioridades</span>
        ${prioOpts.map(p => `<span class="pill ${_solFiltro.prioridade===p?'active':''}" data-fp="${p}">${p}</span>`).join('')}
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Solicitação</th><th>Ativo</th><th>Descrição</th><th>Solicitante</th><th>Canal</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${todas.slice(0, 80).map(s => `
              <tr>
                <td class="cell-tag">${s.numero}</td>
                <td>${s.ativoId ? Store.ativoNome(s.ativoId) : '—'}</td>
                <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.descricao || ''}</td>
                <td>${s.solicitante || '—'}</td>
                <td>${s.canal || '—'}</td>
                <td><span class="badge badge-${s.prioridade==='Alta'?'danger':s.prioridade==='Média'?'warning':'neutral'}">${s.prioridade}</span></td>
                <td><span class="badge badge-${solBadgeStatus(s.status)}">${s.status}</span></td>
                <td><button class="btn btn-sm" data-edit-sol="${s.id}">${Icon('edit',14)} Abrir</button></td>
              </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('clipboard',30)}<span>Nenhuma solicitação encontrada.</span></div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${todas.length > 80 ? `<div class="text-muted" style="margin-top:10px;font-size:12px;">Mostrando 80 de ${todas.length} registros. Refine os filtros para ver mais.</div>` : ''}
    `;
  },
  afterRender() {
    document.getElementById('btnNovaSolicitacao').addEventListener('click', () => abrirFormSolicitacao());
    document.querySelectorAll('[data-edit-sol]').forEach(b => b.addEventListener('click', () => abrirFormSolicitacao(b.dataset.editSol)));
    document.querySelectorAll('[data-fs]').forEach(p => p.addEventListener('click', () => { _solFiltro.status = p.dataset.fs; App.navigate('solicitacoes', true); }));
    document.querySelectorAll('[data-fp]').forEach(p => p.addEventListener('click', () => { _solFiltro.prioridade = p.dataset.fp; App.navigate('solicitacoes', true); }));

    document.getElementById('btnSyncMelvinSol')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const antigasNaoMelvin = Store.all('solicitacoesServico').filter(s => !s.melvinId);

      const executar = async () => {
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = `${Icon('refresh',15)} Sincronizando…`;
        try {
          const removidas = antigasNaoMelvin.length ? MelvinSync.removerSolicitacoesSemMelvinId() : 0;
          const r = await MelvinSync.sincronizarSolicitacoes();
          App.toast(
            `Melvin sincronizado: ${removidas} solicitação(ões) antiga(s) removida(s), ${r.criadas} nova(s), ${r.atualizadas} atualizada(s).`,
            'success'
          );
          App.navigate('solicitacoes', true);
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

      if (antigasNaoMelvin.length) {
        App.confirmAction(
          `Isso vai apagar ${antigasNaoMelvin.length} solicitação(ões) atual(is) (que não vieram do Melvin) e trazer as solicitações reais do Melvin no lugar. Continuar?`,
          executar
        );
      } else {
        executar();
      }
    });
  },
};

function solBadgeStatus(status) {
  if (status === 'Concluída') return 'success';
  if (status === 'Arquivada') return 'neutral';
  if (status === 'Aprovada' || status === 'Em Andamento') return 'warning';
  return 'danger'; // Aberta — ainda não tratada
}

function abrirFormSolicitacao(id) {
  const sol = id ? Store.get('solicitacoesServico', id) : null;
  const ativos = Store.all('ativos');
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field field-span-2"><label>Ativo (opcional)</label>
        <select id="solAtivo"><option value="">— não vinculado —</option>${ativos.map(a => `<option value="${a.id}" ${sol?.ativoId===a.id?'selected':''}>${a.tag} — ${a.nome}</option>`).join('')}</select>
      </div>
      <div class="field field-span-2"><label>Descrição do problema/pedido</label><textarea id="solDesc">${sol?.descricao || ''}</textarea></div>
      <div class="field"><label>Solicitante</label><input id="solSolicitante" value="${sol?.solicitante || ''}"></div>
      <div class="field"><label>Prioridade</label><select id="solPrio">${['Baixa','Média','Alta'].map(p => `<option ${sol?.prioridade===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Canal</label><select id="solCanal">${['Sistema','Aplicativo','Telefone','E-mail','Presencial'].map(c => `<option ${sol?.canal===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select id="solStatus">${['Aberta','Em Andamento','Aprovada','Concluída','Arquivada'].map(s => `<option ${sol?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field field-span-2"><label>Observações</label><textarea id="solObs">${sol?.observacoes || ''}</textarea></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelSol">Cancelar</button><button class="btn btn-primary" id="saveSol">${Icon('check',15)} Salvar</button>`;
  App.openModal({ title: sol ? `Editar ${sol.numero}` : 'Nova Solicitação de Serviço', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelSol').onclick = App.closeModal;
  document.getElementById('saveSol').onclick = () => {
    const data = {
      ativoId: val('solAtivo') || null,
      descricao: val('solDesc'),
      solicitante: val('solSolicitante'),
      prioridade: val('solPrio'),
      canal: val('solCanal'),
      status: val('solStatus'),
      observacoes: val('solObs'),
    };
    if (!data.descricao.trim()) { App.toast('Descreva o problema ou pedido.', 'danger'); return; }
    if (sol) { Store.update('solicitacoesServico', sol.id, data); App.toast('Solicitação atualizada.', 'success'); }
    else {
      Store.add('solicitacoesServico', {
        ...data,
        numero: 'SOL-' + String(Store.all('solicitacoesServico').length + 1).padStart(4, '0'),
        dataAbertura: new Date().toISOString().slice(0, 10),
      });
      App.toast('Solicitação criada com sucesso.', 'success');
    }
    App.closeModal();
    App.navigate('solicitacoes', true);
  };
}
