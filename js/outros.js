/* ==========================================================================
   FertGrow CMMS — Lubrificação, Inspeções, Indicadores, Custos, Relatórios, Usuários
   ========================================================================== */

/* ---------------------------- LUBRIFICAÇÃO ---------------------------- */
Views.lubrificacao = {
  title: 'Lubrificação',
  render() {
    const pontos = Store.all('lubrificacao');
    return `
      <div class="view-head">
        <div><h1>Plano de Lubrificação</h1><div class="sub">${pontos.length} pontos de lubrificação cadastrados</div></div>
        <div class="view-actions"><button class="btn btn-primary" id="btnNovoLub">${Icon('plus',15)} Novo Ponto</button></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ativo</th><th>Ponto</th><th>Lubrificante</th><th>Periodicidade</th><th>Última</th><th>Próxima</th><th>Situação</th></tr></thead>
        <tbody>${pontos.map(p => {
          const atrasado = new Date(p.proximaData) < new Date();
          return `<tr>
            <td>${Store.ativoNome(p.ativoId)}</td><td>${p.ponto}</td><td>${p.lubrificante}</td>
            <td class="cell-tag">${p.periodicidadeDias} dias</td><td class="cell-tag">${App.fmtDate(p.ultimaData)}</td><td class="cell-tag">${App.fmtDate(p.proximaData)}</td>
            <td><span class="badge badge-${atrasado?'danger':'success'}">${atrasado?'Atrasado':'Em dia'}</span></td>
          </tr>`; }).join('') || `<tr><td colspan="7"><div class="empty">${Icon('drop',30)}<span>Nenhum ponto cadastrado.</span></div></td></tr>`}</tbody>
      </table></div>`;
  },
  afterRender() {
    document.getElementById('btnNovoLub').addEventListener('click', () => {
      const ativos = Store.all('ativos').filter(a => !a.parentAtivoId);
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-grid">
        <div class="field"><label>Ativo</label><select id="lAtivo">${ativos.map(a=>`<option value="${a.id}">${a.tag} — ${a.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Ponto</label><input id="lPonto" placeholder="Ex: Mancal principal"></div>
        <div class="field"><label>Lubrificante</label><input id="lLub" placeholder="Ex: Graxa Industrial EP2"></div>
        <div class="field"><label>Periodicidade (dias)</label><input type="number" id="lPer" value="30"></div>
      </div>`;
      const footer = document.createElement('div'); footer.style.cssText='display:flex;gap:8px;width:100%;justify-content:flex-end;';
      footer.innerHTML = `<button class="btn" id="cLub">Cancelar</button><button class="btn btn-primary" id="sLub">Salvar</button>`;
      App.openModal({ title: 'Novo Ponto de Lubrificação', body, footer });
      document.getElementById('cLub').onclick = App.closeModal;
      document.getElementById('sLub').onclick = () => {
        Store.add('lubrificacao', { ativoId: val('lAtivo'), ponto: val('lPonto'), lubrificante: val('lLub'), periodicidadeDias: Number(val('lPer')), ultimaData: new Date().toISOString().slice(0,10), proximaData: new Date(Date.now()+Number(val('lPer'))*86400000).toISOString().slice(0,10) });
        App.toast('Ponto de lubrificação cadastrado.', 'success'); App.closeModal();
      };
    });
  },
};

/* ---------------------------- INSPEÇÕES ---------------------------- */
Views.inspecoes = {
  title: 'Inspeções',
  render() {
    const insp = Store.all('inspecoes');
    return `
      <div class="view-head">
        <div><h1>Inspeções</h1><div class="sub">${insp.length} rotas de inspeção ativas</div></div>
        <div class="view-actions"><button class="btn btn-primary" id="btnNovaInsp">${Icon('plus',15)} Nova Inspeção</button></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ativo</th><th>Tipo</th><th>Periodicidade</th><th>Última</th><th>Próxima</th><th>Resultado</th></tr></thead>
        <tbody>${insp.map(i => `<tr>
          <td>${Store.ativoNome(i.ativoId)}</td><td>${i.tipo}</td><td class="cell-tag">${i.periodicidadeDias} dias</td>
          <td class="cell-tag">${App.fmtDate(i.ultimaData)}</td><td class="cell-tag">${App.fmtDate(i.proximaData)}</td>
          <td><span class="badge badge-${i.resultado==='Normal'?'success':'warning'}">${i.resultado}</span></td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${Icon('check',30)}<span>Nenhuma rota de inspeção cadastrada.</span></div></td></tr>`}</tbody>
      </table></div>`;
  },
  afterRender() {
    document.getElementById('btnNovaInsp').addEventListener('click', () => {
      const ativos = Store.all('ativos').filter(a => !a.parentAtivoId);
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-grid">
        <div class="field"><label>Ativo</label><select id="iAtivo">${ativos.map(a=>`<option value="${a.id}">${a.tag} — ${a.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo de Inspeção</label><input id="iTipo" placeholder="Ex: Análise de Vibração"></div>
        <div class="field"><label>Periodicidade (dias)</label><input type="number" id="iPer" value="30"></div>
      </div>`;
      const footer = document.createElement('div'); footer.style.cssText='display:flex;gap:8px;width:100%;justify-content:flex-end;';
      footer.innerHTML = `<button class="btn" id="cIns">Cancelar</button><button class="btn btn-primary" id="sIns">Salvar</button>`;
      App.openModal({ title: 'Nova Rota de Inspeção', body, footer });
      document.getElementById('cIns').onclick = App.closeModal;
      document.getElementById('sIns').onclick = () => {
        Store.add('inspecoes', { ativoId: val('iAtivo'), tipo: val('iTipo'), periodicidadeDias: Number(val('iPer')), ultimaData: new Date().toISOString().slice(0,10), proximaData: new Date(Date.now()+Number(val('iPer'))*86400000).toISOString().slice(0,10), resultado: 'Normal' });
        App.toast('Rota de inspeção cadastrada.', 'success'); App.closeModal();
      };
    });
  },
};

/* ---------------------------- INDICADORES ---------------------------- */
Views.indicadores = {
  title: 'Indicadores',
  render() {
    const k = Store.calcKPIs();
    return `
      <div class="view-head"><div><h1>Indicadores de Manutenção</h1><div class="sub">MTBF, MTTR, disponibilidade e backlog calculados automaticamente</div></div></div>
      <div class="grid grid-4" style="margin-bottom:20px;">
        ${indCard('MTBF', k.mtbf.toFixed(0)+' h', 'Tempo médio entre falhas', 'gauge')}
        ${indCard('MTTR', k.mttr.toFixed(1)+' h', 'Tempo médio de reparo', 'wrench')}
        ${indCard('Disponibilidade', k.disponibilidade.toFixed(1)+'%', 'MTBF / (MTBF + MTTR)', 'power')}
        ${indCard('Backlog', k.backlogSemanas.toFixed(2)+' sem.', k.backlogHoras.toFixed(0)+'h pendentes', 'clock')}
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Preventiva × Corretiva (ano)</h3></div><canvas id="chIndTipo" height="230"></canvas></div>
        <div class="card"><div class="card-head"><h3>Evolução da Disponibilidade</h3><span class="meta">simulado por trimestre</span></div><canvas id="chIndDisp" height="230"></canvas></div>
      </div>
    `;
  },
  afterRender() {
    if (typeof Chart === 'undefined') return; // biblioteca de gráficos não carregou (ex: sem internet)
    const styles = getComputedStyle(document.documentElement);
    const success = styles.getPropertyValue('--success').trim(), danger = styles.getPropertyValue('--danger').trim(), accent = styles.getPropertyValue('--accent').trim(), grid = styles.getPropertyValue('--border-soft').trim();
    Chart.defaults.color = styles.getPropertyValue('--text-muted').trim();
    const k = Store.calcKPIs();
    new Chart(document.getElementById('chIndTipo'), { type: 'bar', data: { labels: ['Preventiva','Corretiva'], datasets:[{ data:[k.preventivas,k.corretivas], backgroundColor:[success,danger], borderRadius:6 }] }, options:{ plugins:{legend:{display:false}}, scales:{x:{grid:{color:grid}},y:{grid:{color:grid}}} } });
    const base = Math.max(80, Math.min(99, k.disponibilidade));
    new Chart(document.getElementById('chIndDisp'), { type: 'line', data: { labels:['T1','T2','T3','T4'], datasets:[{ data:[base-4,base-2,base-1,base], borderColor:accent, backgroundColor:accent+'33', fill:true, tension:.35 }] }, options:{ plugins:{legend:{display:false}}, scales:{x:{grid:{color:grid}},y:{grid:{color:grid},min:70,max:100} } } });
  },
};
function indCard(label, value, sub, icon) {
  return `<div class="kpi-card"><div class="kpi-top"><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div><div class="kpi-icon">${Icon(icon,17)}</div></div><div class="kpi-trend" style="color:var(--text-muted);margin-top:10px;">${sub}</div></div>`;
}

/* ---------------------------- CUSTOS ---------------------------- */
Views.custos = {
  title: 'Custos',
  render() {
    const k = Store.calcKPIs();
    const ativos = Store.all('ativos').filter(a => !a.parentAtivoId);
    const custoPorAtivo = ativos.map(a => {
      const os = Store.all('ordens').filter(o => o.ativoId === a.id);
      const c = os.reduce((s,o)=> s + (o.maoDeObra||[]).reduce((x,m)=>x+m.horas*m.custoHora,0) + (o.materiais||[]).reduce((x,m)=>{const it=Store.get('estoque',m.estoqueId);return x+(it?it.custoUnitario*m.qtd:0);},0),0);
      return { ativo: a, custo: c };
    }).sort((a,b)=>b.custo-a.custo).slice(0,10);

    return `
      <div class="view-head"><div><h1>Custos de Manutenção</h1><div class="sub">Custo total no ano: ${App.fmtMoney(k.custoTotal)}</div></div></div>
      <div class="grid grid-4" style="margin-bottom:20px;">
        ${indCard('Mão de Obra', App.fmtMoney(k.custoMO), 'Total apontado nas OS', 'user')}
        ${indCard('Materiais', App.fmtMoney(k.custoMat), 'Consumo de estoque', 'layers')}
        ${indCard('Locações', App.fmtMoney(Store.custoMensalLocacoes()), 'Custo mensal de ativos alugados', 'truck')}
        ${indCard('Custo Total', App.fmtMoney(k.custoTotal), 'Mão de obra + materiais', 'coin')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Top 10 Ativos por Custo de Manutenção</h3></div>
        <div class="table-wrap" style="border:0;"><table>
          <thead><tr><th>Ativo</th><th>Área</th><th>Custo Acumulado</th><th></th></tr></thead>
          <tbody>${custoPorAtivo.map(c => `<tr><td><strong>${c.ativo.nome}</strong><div class="cell-tag">${c.ativo.tag}</div></td><td>${c.ativo.area}</td><td>${App.fmtMoney(c.custo)}</td>
            <td style="width:180px;"><div class="progress"><div class="progress-bar" style="width:${custoPorAtivo[0].custo>0?(c.custo/custoPorAtivo[0].custo*100):0}%"></div></div></td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    `;
  },
};

/* ---------------------------- RELATÓRIOS ---------------------------- */
Views.relatorios = {
  title: 'Relatórios',
  render() {
    return `
      <div class="view-head"><div><h1>Relatórios</h1><div class="sub">Exporte dados operacionais em Excel ou PDF</div></div></div>
      <div class="grid grid-3">
        ${relCard('Ativos', 'Cadastro completo de ativos com criticidade e status.', 'box', 'ativos')}
        ${relCard('Ordens de Serviço', 'Todas as OS do ano com custos e status.', 'clipboard', 'ordens')}
        ${relCard('Estoque', 'Posição atual de estoque e itens críticos.', 'layers', 'estoque')}
        ${relCard('Motores', 'Cadastro e status de todos os motores.', 'bolt', 'motores')}
        ${relCard('Locações', 'Contratos de aluguel, custo mensal e vigência.', 'truck', 'locacoes')}
        ${relCard('Plano 52 Semanas', 'Carga semanal, backlog e paradas de planta.', 'calendar', 'semanas')}
        ${relCard('Indicadores', 'MTBF, MTTR, disponibilidade e custos consolidados.', 'chart', 'indicadores')}
      </div>
    `;
  },
  afterRender() {
    document.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => Importacao.exportarRelatorio(b.dataset.rel)));
    document.querySelectorAll('[data-relpdf]').forEach(b => b.addEventListener('click', () => Importacao.exportarPdf(b.dataset.relpdf)));
  },
};
function relCard(titulo, desc, icon, key) {
  return `<div class="card">
    <div class="kpi-icon" style="margin-bottom:12px;">${Icon(icon,18)}</div>
    <h3 style="font-size:14px;margin-bottom:6px;">${titulo}</h3>
    <p class="text-muted" style="font-size:12.5px;margin:0 0 14px;">${desc}</p>
    <div class="flex gap-8">
      <button class="btn btn-sm" data-rel="${key}">${Icon('download',13)} Excel</button>
      <button class="btn btn-sm" data-relpdf="${key}">${Icon('print',13)} PDF</button>
    </div>
  </div>`;
}

/* ---------------------------- USUÁRIOS ---------------------------- */
const PERFIS_SISTEMA = ['Administrador', 'PCM', 'Supervisor', 'Mecânico', 'Eletricista', 'Operador'];

Views.usuarios = {
  title: 'Usuários',
  render() {
    const cloud = syncStatus().conectado;
    const usuariosLocais = Store.all('usuarios');
    return `
      <div class="view-head">
        <div><h1>Usuários e Permissões</h1><div class="sub">${cloud ? 'Gerenciado via Supabase (nuvem)' : usuariosLocais.length + ' usuários cadastrados (local)'}</div></div>
        ${!cloud ? `<div class="view-actions"><button class="btn btn-primary" id="btnNovoUser">${Icon('plus',15)} Novo Usuário</button></div>` : ''}
      </div>

      <div class="card" style="padding:16px;margin-bottom:20px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Backup e Restauração</div>
        <p class="text-muted" style="font-size:12.5px;margin:0 0 12px;">Os dados ficam salvos automaticamente neste navegador. Para ter uma cópia de segurança ou levar os dados para outro computador, baixe o backup — e, se precisar, restaure-o aqui depois.</p>
        <div class="flex" style="gap:10px;flex-wrap:wrap;">
          <button class="btn" id="btnBaixarBackup">${Icon('download',14)} Baixar Backup Completo</button>
          <button class="btn" id="btnRestaurarBackup">${Icon('refresh',14)} Restaurar Backup</button>
          <input type="file" id="inputRestaurarBackup" accept="application/json,.json" style="display:none;">
        </div>
      </div>

      ${(() => { const s = syncStatus(); return `
      <div class="card" style="padding:16px;margin-bottom:20px;">
        <div class="flex-between" style="margin-bottom:4px;">
          <div style="font-weight:700;font-size:14px;">Sincronização em Nuvem (Supabase)</div>
          <span class="badge badge-${s.conectado?'success':'neutral'}">${s.conectado?'Conectado':'Desconectado'}</span>
        </div>
        <p class="text-muted" style="font-size:12.5px;margin:0 0 12px;">${s.conectado ? `Conectado a <strong>${s.config.url}</strong> — as alterações são compartilhadas em tempo real com todos que também estiverem conectados a este mesmo projeto.` : 'Conecte a um projeto Supabase para que todos os computadores da equipe vejam as mesmas informações automaticamente, sem precisar de backup manual.'}</p>
        ${s.conectado ? `
          <button class="btn btn-danger" id="btnDesconectarSync">${Icon('x',14)} Desconectar</button>
        ` : `
          <div class="form-grid">
            <div class="field field-span-2"><label>Project URL</label><input id="syncUrl" placeholder="https://xxxxxxxx.supabase.co"></div>
            <div class="field field-span-2"><label>Anon Public Key</label><input id="syncKey" placeholder="eyJhbGciOiJI..."></div>
          </div>
          <button class="btn btn-primary" id="btnConectarSync" style="margin-top:10px;">${Icon('check',14)} Conectar</button>
        `}
      </div>`; })()}

      ${cloud ? `
        ${authEhAdmin() ? `
        <div class="card" style="padding:16px;margin-bottom:20px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Convidar Usuário</div>
          <p class="text-muted" style="font-size:12.5px;margin:0 0 12px;">Cadastre nome, e-mail e perfil da pessoa. Ela mesma cria a própria senha na tela de login, usando "Criar Conta" com este e-mail.</p>
          <div class="form-grid">
            <div class="field"><label>Nome</label><input id="convNome"></div>
            <div class="field"><label>E-mail</label><input id="convEmail" type="email"></div>
            <div class="field"><label>Perfil</label><select id="convPerfil">${PERFIS_SISTEMA.map(p=>`<option>${p}</option>`).join('')}</select></div>
          </div>
          <button class="btn btn-primary" id="btnConvidar" style="margin-top:10px;">${Icon('plus',14)} Criar Convite</button>
        </div>` : ''}
        <div id="listaEquipeCloud"><div class="empty">${Icon('user',26)}<span>Carregando equipe...</span></div></div>
      ` : `
        <div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
          <tbody>${usuariosLocais.map(u => `<tr>
            <td><strong>${u.nome}</strong></td><td class="cell-tag">${u.email}</td><td><span class="badge badge-accent">${u.perfil}</span></td>
            <td><span class="badge badge-${u.ativo?'success':'neutral'}">${u.ativo?'Ativo':'Inativo'}</span></td>
            <td><div class="row-actions"><button class="btn btn-sm" data-toggle-user="${u.id}">${Icon(u.ativo?'x':'check',14)}</button><button class="btn btn-sm btn-danger" data-del-user="${u.id}">${Icon('trash',14)}</button></div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      `}
    `;
  },
  afterRender() {
    document.getElementById('btnBaixarBackup').addEventListener('click', () => {
      const json = Store.exportarBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const agora = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `fertgrow-backup-${agora}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      App.toast('Backup baixado com sucesso.', 'success');
    });

    document.getElementById('btnRestaurarBackup').addEventListener('click', () => {
      document.getElementById('inputRestaurarBackup').click();
    });

    document.getElementById('inputRestaurarBackup').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      App.confirmAction('Restaurar este backup vai substituir TODOS os dados atuais do sistema. Deseja continuar?', () => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Store.importarBackup(reader.result);
            App.toast('Backup restaurado com sucesso.', 'success');
          } catch (err) {
            App.toast('Não foi possível restaurar: arquivo inválido.', 'danger');
          }
        };
        reader.readAsText(file);
      });
      e.target.value = '';
    });

    const btnConectarSync = document.getElementById('btnConectarSync');
    if (btnConectarSync) btnConectarSync.addEventListener('click', async () => {
      const url = val('syncUrl').trim();
      const key = val('syncKey').trim();
      if (!url || !key) { App.toast('Preencha a Project URL e a Anon Public Key.', 'danger'); return; }
      btnConectarSync.disabled = true;
      btnConectarSync.textContent = 'Conectando...';
      try {
        await syncConectar(url, key);
        App.toast('Conectado! Atualize a página para ativar o login da equipe.', 'success');
        App.navigate('usuarios');
      } catch (e) {
        App.toast('Não foi possível conectar: ' + (e.message || 'verifique a URL e a chave.'), 'danger');
        btnConectarSync.disabled = false;
        btnConectarSync.innerHTML = `${Icon('check',14)} Conectar`;
        renderIcons();
      }
    });

    const btnDesconectarSync = document.getElementById('btnDesconectarSync');
    if (btnDesconectarSync) btnDesconectarSync.addEventListener('click', () => {
      App.confirmAction('Desconectar da nuvem? O sistema volta a salvar só neste navegador.', () => {
        syncDesconectar();
        App.toast('Desconectado da sincronização em nuvem.', 'success');
        App.navigate('usuarios');
      });
    });

    if (syncStatus().conectado) {
      const btnConvidar = document.getElementById('btnConvidar');
      if (btnConvidar) btnConvidar.addEventListener('click', async () => {
        const nome = val('convNome').trim();
        const email = val('convEmail').trim();
        const perfil = val('convPerfil');
        if (!nome || !email) { App.toast('Preencha nome e e-mail.', 'danger'); return; }
        try {
          const { error } = await _syncClient.from('convites').insert({ email, nome, perfil });
          if (error) throw error;
          App.toast('Convite criado! Peça para a pessoa usar "Criar Conta" com esse e-mail.', 'success');
          document.getElementById('convNome').value = '';
          document.getElementById('convEmail').value = '';
          usuariosCarregarListaCloud();
        } catch (e) {
          App.toast('Não foi possível criar o convite: ' + e.message, 'danger');
        }
      });
      usuariosCarregarListaCloud();
      return;
    }

    document.getElementById('btnNovoUser').addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-grid">
        <div class="field"><label>Nome</label><input id="uNome"></div>
        <div class="field"><label>E-mail</label><input id="uEmail" type="email"></div>
        <div class="field field-span-2"><label>Perfil</label><select id="uPerfil">${['Administrador','PCM','Supervisor','Mecânico','Eletricista','Operador'].map(p=>`<option>${p}</option>`).join('')}</select></div>
      </div>`;
      const footer = document.createElement('div'); footer.style.cssText='display:flex;gap:8px;width:100%;justify-content:flex-end;';
      footer.innerHTML = `<button class="btn" id="cUsr">Cancelar</button><button class="btn btn-primary" id="sUsr">Salvar</button>`;
      App.openModal({ title: 'Novo Usuário', body, footer });
      document.getElementById('cUsr').onclick = App.closeModal;
      document.getElementById('sUsr').onclick = () => {
        if (!val('uNome') || !val('uEmail')) { App.toast('Preencha nome e e-mail.', 'danger'); return; }
        Store.add('usuarios', { nome: val('uNome'), email: val('uEmail'), perfil: val('uPerfil'), ativo: true });
        App.toast('Usuário cadastrado.', 'success'); App.closeModal();
      };
    });
    document.querySelectorAll('[data-toggle-user]').forEach(b => b.addEventListener('click', () => {
      const u = Store.get('usuarios', b.dataset.toggleUser);
      Store.update('usuarios', u.id, { ativo: !u.ativo });
    }));
    document.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Remover este usuário do sistema?', () => { Store.remove('usuarios', b.dataset.delUser); App.toast('Usuário removido.', 'success'); });
    }));
  },
};

async function usuariosCarregarListaCloud() {
  const el = document.getElementById('listaEquipeCloud');
  if (!el || !_syncClient) return;
  const admin = authEhAdmin();
  try {
    const { data: perfis, error: e1 } = await _syncClient.from('profiles').select('*').order('created_at');
    if (e1) throw e1;
    let convites = [];
    if (admin) {
      const { data: convData, error: e2 } = await _syncClient.from('convites').select('*').eq('usado', false).order('criado_em');
      if (e2) throw e2;
      convites = convData || [];
    }

    el.innerHTML = `
      <div class="table-wrap" style="margin-bottom:${convites.length ? '18px' : '0'};"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead>
        <tbody>${(perfis || []).map(u => `<tr>
          <td><strong>${u.nome}</strong>${AuthUser && u.id === AuthUser.id ? ' <span class="cell-tag">(você)</span>' : ''}</td>
          <td class="cell-tag">${u.email}</td>
          <td>${admin && (!AuthUser || u.id !== AuthUser.id) ? `<select data-perfil-user="${u.id}">${PERFIS_SISTEMA.map(p => `<option ${p === u.perfil ? 'selected' : ''}>${p}</option>`).join('')}</select>` : `<span class="badge badge-accent">${u.perfil}</span>`}</td>
          <td><span class="badge badge-${u.ativo ? 'success' : 'neutral'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
          ${admin ? `<td><div class="row-actions">${(!AuthUser || u.id !== AuthUser.id) ? `<button class="btn btn-sm" data-toggle-user-cloud="${u.id}" data-ativo="${u.ativo}" title="${u.ativo ? 'Desativar' : 'Reativar'}">${Icon(u.ativo ? 'x' : 'check', 14)}</button>` : ''}</div></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${admin ? 5 : 4}"><div class="empty">Nenhum usuário na equipe ainda.</div></td></tr>`}</tbody>
      </table></div>
      ${admin && convites.length ? `
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--text-muted);">Convites Pendentes (${convites.length})</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th></th></tr></thead>
        <tbody>${convites.map(c => `<tr>
          <td><strong>${c.nome}</strong></td><td class="cell-tag">${c.email}</td><td><span class="badge badge-accent">${c.perfil}</span></td>
          <td><button class="btn btn-sm btn-danger" data-del-convite="${c.email}" title="Cancelar convite">${Icon('trash', 14)}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    `;
    renderIcons(el);

    el.querySelectorAll('[data-perfil-user]').forEach(sel => sel.addEventListener('change', async () => {
      const { error } = await _syncClient.from('profiles').update({ perfil: sel.value }).eq('id', sel.dataset.perfilUser);
      if (error) { App.toast('Não foi possível atualizar: ' + error.message, 'danger'); return; }
      App.toast('Perfil atualizado.', 'success');
      usuariosCarregarListaCloud();
    }));
    el.querySelectorAll('[data-toggle-user-cloud]').forEach(b => b.addEventListener('click', async () => {
      const novoAtivo = b.dataset.ativo !== 'true';
      const { error } = await _syncClient.from('profiles').update({ ativo: novoAtivo }).eq('id', b.dataset.toggleUserCloud);
      if (error) { App.toast('Não foi possível atualizar: ' + error.message, 'danger'); return; }
      App.toast(novoAtivo ? 'Usuário reativado.' : 'Usuário desativado.', 'success');
      usuariosCarregarListaCloud();
    }));
    el.querySelectorAll('[data-del-convite]').forEach(b => b.addEventListener('click', () => {
      App.confirmAction('Cancelar este convite?', async () => {
        const { error } = await _syncClient.from('convites').delete().eq('email', b.dataset.delConvite);
        if (error) { App.toast('Não foi possível cancelar: ' + error.message, 'danger'); return; }
        App.toast('Convite cancelado.', 'success');
        usuariosCarregarListaCloud();
      });
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty">${Icon('user', 26)}<span>Não foi possível carregar a equipe: ${e.message}</span></div>`;
    renderIcons(el);
  }
}
