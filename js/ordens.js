/* ==========================================================================
   FertGrow CMMS — Ordens de Serviço
   ========================================================================== */

let _osFiltro = { status: '', tipo: '' };

Views.ordens = {
  title: 'Ordens de Serviço',
  render() {
    const ordens = filtrarOrdens().sort((a, b) => b.semana - a.semana);
    const statusOpts = ['Aberta', 'Em Andamento', 'Aguardando Peça', 'Concluída', 'Cancelada'];
    const tipoOpts = ['Preventiva', 'Corretiva', 'Preditiva', 'Inspeção'];
    return `
      <div class="view-head">
        <div><h1>Ordens de Serviço</h1><div class="sub">${Store.all('ordens').length} OS no ano · ${ordens.length} exibidas</div></div>
        <div class="view-actions">
          <button class="btn" id="btnSyncMelvinOs">${Icon('refresh',15)} Sincronizar Melvin</button>
          <button class="btn" id="btnExportOs">${Icon('download',15)} Exportar Excel</button>
          <button class="btn btn-primary" id="btnNovaOs">${Icon('plus',15)} Nova OS</button>
        </div>
      </div>

      <div class="pill-filter" style="margin-bottom:14px;">
        <span class="pill ${!_osFiltro.status?'active':''}" data-fs="">Todos status</span>
        ${statusOpts.map(s => `<span class="pill ${_osFiltro.status===s?'active':''}" data-fs="${s}">${s}</span>`).join('')}
      </div>
      <div class="pill-filter" style="margin-bottom:16px;">
        <span class="pill ${!_osFiltro.tipo?'active':''}" data-ft="">Todos tipos</span>
        ${tipoOpts.map(t => `<span class="pill ${_osFiltro.tipo===t?'active':''}" data-ft="${t}">${t}</span>`).join('')}
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>OS</th><th>Ativo</th><th>Tipo</th><th>Semana</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th></th></tr></thead>
          <tbody>
            ${ordens.slice(0, 80).map(o => `
              <tr>
                <td class="cell-tag">${o.numero}</td>
                <td>${Store.ativoNome(o.ativoId)}</td>
                <td>${o.tipo}</td>
                <td class="cell-tag">S${o.semana}</td>
                <td><span class="badge badge-${o.prioridade==='Urgente'?'danger':o.prioridade==='Alta'?'warning':'neutral'}">${o.prioridade}</span></td>
                <td><span class="badge badge-${App.badgeForStatus(o.status)}">${o.status}</span></td>
                <td>${o.responsavel}</td>
                <td><button class="btn btn-sm" data-open-os="${o.id}">${Icon('eye',14)} Abrir</button></td>
              </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${Icon('clipboard',30)}<span>Nenhuma OS encontrada.</span></div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${ordens.length > 80 ? `<div class="text-muted" style="margin-top:10px;font-size:12px;">Mostrando 80 de ${ordens.length} registros. Refine os filtros para ver mais.</div>` : ''}
    `;
  },
  afterRender() {
    document.getElementById('btnNovaOs').addEventListener('click', () => abrirFormOs());
    document.getElementById('btnExportOs').addEventListener('click', () => Importacao.exportarOrdensExcel(filtrarOrdens()));
    document.getElementById('btnSyncMelvinOs')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const antigasNaoMelvin = Store.all('ordens').filter(o => !o.melvinId);

      const executar = async () => {
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = `${Icon('refresh',15)} Sincronizando…`;
        try {
          const removidas = antigasNaoMelvin.length ? MelvinSync.removerOrdensSemMelvinId() : 0;
          const r = await MelvinSync.sincronizarOrdens();
          App.toast(
            `Melvin sincronizado: ${removidas} OS antiga(s) removida(s), ${r.ordensCriadas} nova(s), ${r.ordensAtualizadas} atualizada(s).`,
            'success'
          );
          App.navigate('ordens', true);
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
          `Isso vai apagar ${antigasNaoMelvin.length} ordem(ns) de serviço atual(is) (que não vieram do Melvin) e trazer as ordens reais do Melvin no lugar. Continuar?`,
          executar
        );
      } else {
        executar();
      }
    });
    document.querySelectorAll('[data-fs]').forEach(p => p.addEventListener('click', () => { _osFiltro.status = p.dataset.fs; App.navigate('ordens', true); }));
    document.querySelectorAll('[data-ft]').forEach(p => p.addEventListener('click', () => { _osFiltro.tipo = p.dataset.ft; App.navigate('ordens', true); }));
    document.querySelectorAll('[data-open-os]').forEach(b => b.addEventListener('click', () => abrirDetalheOs(b.dataset.openOs)));
  },
};

function filtrarOrdens() {
  return Store.all('ordens').filter(o => (!_osFiltro.status || o.status === _osFiltro.status) && (!_osFiltro.tipo || o.tipo === _osFiltro.tipo));
}

function abrirFormOs(id) {
  const os = id ? Store.get('ordens', id) : null;
  const ativos = Store.all('ativos');
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Ativo</label><select id="oAtivo">${ativos.map(a => `<option value="${a.id}" ${os?.ativoId===a.id?'selected':''}>${a.tag} — ${a.nome}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo</label><select id="oTipo">${['Preventiva','Corretiva','Preditiva','Inspeção'].map(t => `<option ${os?.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field field-span-2"><label>Descrição do Serviço</label><textarea id="oDesc">${os?.descricao || ''}</textarea></div>
      <div class="field"><label>Prioridade</label><select id="oPrio">${['Baixa','Média','Alta','Urgente'].map(p => `<option ${os?.prioridade===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Semana Planejada (1-52)</label><input type="number" min="1" max="52" id="oSemana" value="${os?.semana || Store.config.semanaAtual}"></div>
      <div class="field"><label>Responsável</label><input id="oResp" value="${os?.responsavel || ''}"></div>
      <div class="field"><label>Horas Previstas</label><input type="number" id="oHoras" value="${os?.horasPrevistas || 2}"></div>
      <div class="field"><label>Requer Parada de Planta?</label><select id="oParada"><option value="nao" ${!os?.paradaPlanta?'selected':''}>Não</option><option value="sim" ${os?.paradaPlanta?'selected':''}>Sim</option></select></div>
      <div class="field"><label>Horas de Parada (se aplicável)</label><input type="number" id="oHorasParada" value="${os?.horasParada || 0}"></div>
    </div>`;
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
  footer.innerHTML = `<button class="btn" id="cancelOs">Cancelar</button><button class="btn btn-primary" id="saveOs">${Icon('check',15)} Salvar OS</button>`;
  App.openModal({ title: os ? `Editar ${os.numero}` : 'Nova Ordem de Serviço', body, footer, size: 'lg' });
  renderIcons();
  document.getElementById('cancelOs').onclick = App.closeModal;
  document.getElementById('saveOs').onclick = () => {
    const data = {
      ativoId: val('oAtivo'), tipo: val('oTipo'), descricao: val('oDesc'), prioridade: val('oPrio'),
      semana: Number(val('oSemana')), responsavel: val('oResp'), horasPrevistas: Number(val('oHoras')),
      paradaPlanta: val('oParada') === 'sim', horasParada: Number(val('oHorasParada')),
    };
    if (!data.descricao) { App.toast('Descreva o serviço.', 'danger'); return; }
    if (os) { Store.update('ordens', os.id, data); App.toast('OS atualizada.', 'success'); }
    else {
      Store.add('ordens', {
        ...data, numero: 'OS-' + String(Store.all('ordens').length + 1).padStart(4, '0'), status: 'Aberta',
        solicitante: 'PCM', dataAbertura: new Date().toISOString().slice(0,10), dataProgramada: Store.weekToDate(data.semana),
        dataConclusao: null, horasReais: 0,
        checklist: [
          { item: 'Bloqueio e sinalização (LOTO)', feito: false },
          { item: 'Inspeção visual do equipamento', feito: false },
          { item: 'Execução do serviço planejado', feito: false },
          { item: 'Teste funcional pós-serviço', feito: false },
        ],
        materiais: [], maoDeObra: [], fotos: [], assinatura: null, observacoes: '',
      });
      App.toast('OS criada com sucesso.', 'success');
    }
    App.closeModal();
  };
}

function abrirDetalheOs(id) {
  const o = Store.get('ordens', id);
  if (!o) return;
  const ativo = Store.get('ativos', o.ativoId);
  const estoque = Store.all('estoque');
  const custoMO = (o.maoDeObra || []).reduce((s, m) => s + m.horas * m.custoHora, 0);
  const custoMat = (o.materiais || []).reduce((s, m) => { const it = Store.get('estoque', m.estoqueId); return s + (it ? it.custoUnitario * m.qtd : 0); }, 0);

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="flex-between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="cell-tag">${ativo?.tag} — ${ativo?.nome}</div>
        <div style="font-size:14px;margin-top:2px;">${o.descricao}</div>
      </div>
      <select id="osStatusSel" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);">
        ${['Aberta','Em Andamento','Aguardando Peça','Concluída','Cancelada'].map(s => `<option ${o.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    <div class="tabs">
      <div class="tab active" data-t="check">Checklist</div>
      <div class="tab" data-t="mat">Materiais</div>
      <div class="tab" data-t="mo">Mão de Obra</div>
      <div class="tab" data-t="foto">Fotos</div>
      <div class="tab" data-t="sig">Assinatura</div>
      <div class="tab" data-t="custo">Custos</div>
    </div>

    <div id="pane-check">
      ${o.checklist.map((c, i) => `<label class="checklist-item"><input type="checkbox" data-ci="${i}" ${c.feito?'checked':''}> <span>${c.item}</span></label>`).join('')}
    </div>

    <div id="pane-mat" class="hidden">
      <div class="flex gap-8" style="margin-bottom:12px;">
        <select id="matSelect" style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);">${estoque.map(e => `<option value="${e.id}">${e.codigo} — ${e.descricao} (disp: ${e.qtdAtual})</option>`).join('')}</select>
        <input type="number" id="matQtd" value="1" min="1" style="width:80px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);">
        <button class="btn btn-sm btn-primary" id="btnAddMat">${Icon('plus',14)}</button>
      </div>
      <div id="listaMateriais">${renderMateriais(o)}</div>
    </div>

    <div id="pane-mo" class="hidden">
      <div class="flex gap-8" style="margin-bottom:12px;flex-wrap:wrap;">
        <input id="moColab" placeholder="Colaborador" style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);min-width:140px;">
        <input type="number" id="moHoras" placeholder="Horas" value="1" style="width:80px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);">
        <input type="number" id="moCusto" placeholder="R$/h" value="65" style="width:90px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);">
        <button class="btn btn-sm btn-primary" id="btnAddMo">${Icon('plus',14)}</button>
      </div>
      <div id="listaMo">${renderMaoDeObra(o)}</div>
    </div>

    <div id="pane-foto" class="hidden">
      <input type="file" id="fotoInput" accept="image/*" multiple>
      <div id="listaFotos" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">${(o.fotos||[]).map(f => `<img src="${f}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`).join('') || '<span class="text-muted" style="font-size:12px;">Nenhuma foto anexada.</span>'}</div>
    </div>

    <div id="pane-sig" class="hidden">
      <p class="text-muted" style="font-size:12.5px;margin-bottom:8px;">Assinatura digital de conclusão do serviço.</p>
      ${o.assinatura ? `<img src="${o.assinatura}" style="background:#fff;border-radius:8px;padding:6px;">` : `<canvas id="sigCanvas" class="sig-pad" width="560" height="160"></canvas><div class="mt-8"><button class="btn btn-sm" id="btnClearSig">Limpar</button> <button class="btn btn-sm btn-primary" id="btnSaveSig">${Icon('signature',14)} Salvar Assinatura</button></div>`}
    </div>

    <div id="pane-custo" class="hidden">
      <div class="form-grid cols-3">
        <div class="card" style="padding:14px;"><div class="kpi-label">Mão de Obra</div><div class="kpi-value" style="font-size:20px;">${App.fmtMoney(custoMO)}</div></div>
        <div class="card" style="padding:14px;"><div class="kpi-label">Materiais</div><div class="kpi-value" style="font-size:20px;">${App.fmtMoney(custoMat)}</div></div>
        <div class="card" style="padding:14px;"><div class="kpi-label">Total</div><div class="kpi-value" style="font-size:20px;color:var(--accent);">${App.fmtMoney(custoMO + custoMat)}</div></div>
      </div>
    </div>
  `;
  const overlay = App.openModal({ title: `${o.numero}`, body, size: 'lg' });
  renderIcons(overlay);

  overlay.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    overlay.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ['check','mat','mo','foto','sig','custo'].forEach(k => document.getElementById('pane-' + k).classList.add('hidden'));
    document.getElementById('pane-' + t.dataset.t).classList.remove('hidden');
    if (t.dataset.t === 'sig') initSignaturePad();
  }));

  document.getElementById('osStatusSel').addEventListener('change', (e) => {
    const status = e.target.value;
    const patch = { status };
    if (status === 'Concluída') { patch.dataConclusao = new Date().toISOString().slice(0,10); patch.horasReais = o.horasReais || o.horasPrevistas; }
    Store.update('ordens', o.id, patch);
    App.toast('Status atualizado para ' + status, 'success');
  });

  overlay.querySelectorAll('[data-ci]').forEach(cb => cb.addEventListener('change', () => {
    const idx = Number(cb.dataset.ci);
    const checklist = [...o.checklist];
    checklist[idx] = { ...checklist[idx], feito: cb.checked };
    Store.update('ordens', o.id, { checklist });
  }));

  document.getElementById('btnAddMat')?.addEventListener('click', () => {
    const estoqueId = document.getElementById('matSelect').value;
    const qtd = Number(document.getElementById('matQtd').value) || 1;
    const item = Store.get('estoque', estoqueId);
    if (item && item.qtdAtual < qtd) { App.toast('Quantidade insuficiente em estoque.', 'danger'); return; }
    const materiais = [...o.materiais, { estoqueId, qtd }];
    Store.update('ordens', o.id, { materiais });
    if (item) Store.update('estoque', item.id, { qtdAtual: item.qtdAtual - qtd });
    App.toast('Material adicionado à OS.', 'success');
    document.getElementById('listaMateriais').innerHTML = renderMateriais(Store.get('ordens', o.id));
  });

  document.getElementById('btnAddMo')?.addEventListener('click', () => {
    const colaborador = document.getElementById('moColab').value || 'Não informado';
    const horas = Number(document.getElementById('moHoras').value) || 1;
    const custoHora = Number(document.getElementById('moCusto').value) || 65;
    const maoDeObra = [...o.maoDeObra, { colaborador, horas, custoHora }];
    Store.update('ordens', o.id, { maoDeObra });
    document.getElementById('listaMo').innerHTML = renderMaoDeObra(Store.get('ordens', o.id));
    App.toast('Registro de mão de obra adicionado.', 'success');
  });

  document.getElementById('fotoInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).slice(0, 4);
    let pending = files.length;
    if (!pending) return;
    const novasFotos = [];
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        novasFotos.push(reader.result);
        pending--;
        if (pending === 0) {
          const fotos = [...(o.fotos || []), ...novasFotos];
          Store.update('ordens', o.id, { fotos });
          App.toast('Fotos anexadas.', 'success');
          App.closeModal();
        }
      };
      reader.readAsDataURL(f);
    });
  });
}

function renderMateriais(o) {
  if (!o.materiais.length) return '<div class="empty" style="padding:20px;">Nenhum material lançado.</div>';
  return o.materiais.map(m => {
    const it = Store.get('estoque', m.estoqueId);
    return `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><span>${it ? it.descricao : '—'}</span><span class="cell-tag">${m.qtd} ${it?.unidade || ''} · ${App.fmtMoney((it?.custoUnitario||0)*m.qtd)}</span></div>`;
  }).join('');
}
function renderMaoDeObra(o) {
  if (!o.maoDeObra.length) return '<div class="empty" style="padding:20px;">Nenhum apontamento de mão de obra.</div>';
  return o.maoDeObra.map(m => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:13px;"><span>${m.colaborador}</span><span class="cell-tag">${m.horas}h × ${App.fmtMoney(m.custoHora)} = ${App.fmtMoney(m.horas*m.custoHora)}</span></div>`).join('');
}

function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || canvas.dataset.init) return;
  canvas.dataset.init = '1';
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  let drawing = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };
  const start = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', move); canvas.addEventListener('touchend', end);
  document.getElementById('btnClearSig')?.addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  document.getElementById('btnSaveSig')?.addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/png');
    const title = document.querySelector('.modal-title').textContent;
    const o = Store.all('ordens').find(x => x.numero === title.trim());
    if (o) { Store.update('ordens', o.id, { assinatura: dataUrl }); App.toast('Assinatura registrada.', 'success'); App.closeModal(); }
  });
}
