/* ==========================================================================
   FertGrow CMMS — Importação / Exportação
   Bulk import de ativos via Excel/CSV (SheetJS) + exportações Excel/PDF.
   ========================================================================== */

const Importacao = (() => {

  // ------------------------------------------------- Import hierárquico (Bem)
  // Suporta planilhas de patrimônio (ex: exportação de ERP) cujo código do
  // "Bem" já expressa a hierarquia por hífen (ex: P02-DG1-EC1). Cada código
  // é ligado ao ancestral mais próximo que também existe como linha própria
  // na planilha; sem ancestral, vira um item de raiz numa pasta nomeada pelo
  // primeiro segmento do código.
  function normChave(s) {
    const semAcento = String(s == null ? '' : s).normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return semAcento.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function normalizarLinha(row) {
    const m = {};
    Object.keys(row).forEach(k => { m[normChave(k)] = row[k]; });
    return m;
  }
  function campo(m, ...chaves) {
    for (const c of chaves) { if (m[c] !== undefined && m[c] !== null && String(m[c]).trim() !== '') return m[c]; }
    return '';
  }
  function boolBR(v) {
    const s = normChave(v);
    return s === 'sim' || s === 'true' || s === '1' || s === 'yes';
  }
  function numeroBR(v) {
    if (v === undefined || v === null) return 0;
    let s = String(v).trim();
    if (!s || /^-+$/.test(s)) return 0;
    s = s.replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Algumas planilhas (ex: exportações de ERP) trazem uma linha de título
  // acima do cabeçalho de verdade (ex: "Listagem do Browse" antes de "Bem;
  // Tipo Modelo;..."). Detecta a primeira linha com várias células
  // preenchidas dentre as 10 primeiras e usa ela como cabeçalho, em vez de
  // assumir cegamente que é sempre a linha 1.
  function lerLinhasComCabecalhoAutomatico(sheet) {
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let linhaCabecalho = 0;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
      const preenchidas = (aoa[i] || []).filter(c => String(c).trim() !== '').length;
      if (preenchidas >= 3) { linhaCabecalho = i; break; }
    }
    const headers = (aoa[linhaCabecalho] || []).map(h => String(h || '').trim());
    return aoa.slice(linhaCabecalho + 1)
      .filter(linha => linha.some(c => String(c).trim() !== ''))
      .map(linha => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = linha[i] !== undefined ? linha[i] : ''; });
        return obj;
      });
  }

  // Lê um arquivo de planilha (.xlsx/.xls/.csv) e devolve as linhas já
  // processadas por lerLinhasComCabecalhoAutomatico. Para .csv, lê como TEXTO
  // (UTF-8) em vez de bytes crus: exportações de ERP/Excel em .csv nem sempre
  // trazem um BOM UTF-8, e sem ele o XLSX.read(dados, {type:'array'}) trata
  // cada byte como Latin-1 — cabeçalhos acentuados (Descrição, Endereço,
  // Município...) viram mojibake e o mapeamento por nome de coluna falha em
  // silêncio. .xlsx/.xls são formatos binários (ZIP/OLE) sem essa ambiguidade,
  // então continuam lidos como array buffer.
  function lerArquivoPlanilha(file, onSucesso, onErro) {
    const ehCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = ehCsv
          ? XLSX.read(evt.target.result, { type: 'string' })
          : XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        onSucesso(lerLinhasComCabecalhoAutomatico(sheet));
      } catch (err) {
        onErro(err);
      }
    };
    reader.onerror = () => onErro(reader.error);
    if (ehCsv) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file);
  }

  function importarComoArvoreBens(rows, pastaBaseId) {
    const linhas = rows
      .map(r => normalizarLinha(r))
      .filter(m => campo(m, 'bem'))
      .map(m => ({ m, bem: String(campo(m, 'bem')).trim() }));

    const codigosExistentes = new Set(linhas.map(l => l.bem));
    linhas.sort((a, b) => a.bem.split('-').length - b.bem.split('-').length);

    const idPorCodigo = {};
    const pastaPorGrupo = {};
    const hoje = new Date().toISOString().slice(0, 10);
    let count = 0;

    linhas.forEach(({ m, bem }) => {
      const partes = bem.split('-');

      let paiId = null;
      for (let k = partes.length - 1; k >= 1; k--) {
        const prefixo = partes.slice(0, k).join('-');
        if (codigosExistentes.has(prefixo) && idPorCodigo[prefixo]) { paiId = idPorCodigo[prefixo]; break; }
      }

      let pastaId = null;
      if (!paiId) {
        const grupo = partes[0];
        if (!pastaPorGrupo[grupo]) {
          const existente = Store.all('pastas').find(p => p.nome === grupo && p.parentId === (pastaBaseId || null));
          pastaPorGrupo[grupo] = existente ? existente.id : Store.addSilent('pastas', { nome: grupo, parentId: pastaBaseId || null }).id;
        }
        pastaId = pastaPorGrupo[grupo];
      }

      const nome = campo(m, 'nomedobem', 'nome') || bem;
      const terceiro = boolBR(campo(m, 'terceiro'));
      const alugado = boolBR(campo(m, 'aluguel'));

      const novo = Store.addSilent('ativos', {
        tag: bem,
        nome,
        area: partes[0],
        setor: 'Mecânico',
        categoria: 'Mecânico',
        fabricante: '—',
        modelo: campo(m, 'modelo') || '—',
        criticidade: 'C',
        status: 'Operando',
        dataInstalacao: hoje,
        vidaUtilAnos: 10,
        valorAquisicao: numeroBR(campo(m, 'valcompra')),
        horasOperacaoAcumuladas: 0,
        anexos: [],
        historico: [{ data: hoje, tipo: 'Importação', descricao: 'Importado da planilha de bens patrimoniais.', os: '-' }],
        familia: campo(m, 'familia') || '—',
        codigoAtivo: bem,
        centroCusto: campo(m, 'centrocusto') || '—',
        centroTrabalho: campo(m, 'centrotrab') || '—',
        planta: 'Planta Industrial FertGrow',
        sistema: '—',
        subsistema: '—',
        localizacao: campo(m, 'instalacao') || '—',
        proprietario: campo(m, 'proprietario') || '—',
        proprio: !alugado && !terceiro,
        terceiro,
        alugado,
        contaContabil: campo(m, 'contacontab') || '—',
        tipoModelo: campo(m, 'tipomodelo') || '—',
        serie: campo(m, 'serie') || '—',
        instalacao: true,
        unidade: 'un',
        produtoAbastecido: '—',
        percentualManutencao: numeroBR(campo(m, 'manutencao')),
        percentualSeguroLicenciamento: numeroBR(campo(m, 'seglic')),
        valorPresente: numeroBR(campo(m, 'valpresente')),
        valorFaturado: numeroBR(campo(m, 'valfaturado')),
        pastaId,
        parentAtivoId: paiId,
      });
      idPorCodigo[bem] = novo.id;
      count++;
    });

    Store.persist();
    return count;
  }

  // Desfaz uma importação de bens (função de emergência, chamada pelo Console
  // do navegador: Importacao.desfazerImportacaoBens()). Remove apenas os
  // ativos que carregam a marca deixada pela importação hierárquica de Bem,
  // e só remove uma pasta se TODOS os ativos dela também forem dessa marca
  // e ela não tiver sub-pastas — nunca mexe no que já existia antes.
  const MARCA_IMPORTACAO = 'Importado da planilha de bens patrimoniais.';
  function desfazerImportacaoBens() {
    const ativosImportados = Store.all('ativos').filter(a => (a.historico || []).some(h => h.descricao === MARCA_IMPORTACAO));
    const idsAtivos = ativosImportados.map(a => a.id);
    const idsAtivosSet = new Set(idsAtivos);

    const pastasParaRemover = Store.all('pastas').filter(p => {
      const ativosDaPasta = Store.all('ativos').filter(a => a.pastaId === p.id);
      const temSubPasta = Store.all('pastas').some(sp => sp.parentId === p.id);
      if (ativosDaPasta.length === 0 || temSubPasta) return false;
      return ativosDaPasta.every(a => idsAtivosSet.has(a.id));
    });

    Store.removerEmLote('ativos', idsAtivos);
    Store.removerEmLote('pastas', pastasParaRemover.map(p => p.id));

    const resultado = { ativosRemovidos: idsAtivos.length, pastasRemovidas: pastasParaRemover.length };
    console.log('Importação desfeita:', resultado);
    return resultado;
  }

  function abrirModalImportAtivos(pastaId) {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">
        Envie uma planilha (.xlsx, .xls ou .csv) com colunas como: <strong>nome, tag, familia, codigoAtivo, centroCusto, centroTrabalho, planta, area, sistema, subsistema, localizacao, setor, fabricante, modelo, criticidade, status, dataInstalacao, valorAquisicao, proprietario, proprio, terceiro, alugado, contaContabil</strong>.
        Apenas <strong>nome</strong> (Nome do Bem) é obrigatório — os demais campos ausentes recebem valores padrão. Os itens importados entram como <strong>Equipamentos</strong>${pastaId ? ` dentro da pasta <strong>${Store.caminhoPasta(pastaId)}</strong>` : ' na raiz da árvore de ativos'}.
        <br>Se a planilha tiver uma coluna <strong>Bem</strong> com códigos hierárquicos separados por hífen (ex: <em>P02-DG1-EC1</em>), a importação monta a árvore <strong>ativo → equipamento → componente</strong> automaticamente, ligando cada código ao seu ancestral mais próximo que também existe na planilha.
      </p>
      <input type="file" id="fileImport" accept=".xlsx,.xls,.csv">
      <div id="importPreview" class="mt-16"></div>
    `;
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
    footer.innerHTML = `<button class="btn" id="cancelImp">Cancelar</button><button class="btn btn-primary" id="confirmImp" disabled>${Icon('upload',15)} Importar</button>`;
    App.openModal({ title: 'Importar Ativos em Massa', body, footer, size: 'lg' });
    renderIcons();
    document.getElementById('cancelImp').onclick = App.closeModal;

    let parsedRows = [];
    document.getElementById('fileImport').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      lerArquivoPlanilha(file, (rows) => {
        parsedRows = rows;
        document.getElementById('importPreview').innerHTML = renderPreview(rows);
        document.getElementById('confirmImp').disabled = rows.length === 0;
      }, () => App.toast('Falha ao ler o arquivo. Verifique o formato.', 'danger'));
    });

    document.getElementById('confirmImp').addEventListener('click', () => {
      const temColunaBem = parsedRows.some(r => campo(normalizarLinha(r), 'bem'));
      if (temColunaBem) {
        const count = importarComoArvoreBens(parsedRows, pastaId);
        App.toast(count + ' ativo(s) importado(s) com sucesso, organizados por hierarquia de Bem.', 'success');
        App.closeModal();
        return;
      }
      let count = 0;
      parsedRows.forEach(r => {
        const nome = r.nome || r.Nome || r.NOME;
        if (!nome) return;
        const bool = (v) => ['sim','Sim','SIM','true','1',1,true].includes(v);
        const alugado = bool(r.alugado || r.Alugado);
        const terceiro = bool(r.terceiro || r.Terceiro);
        Store.add('ativos', {
          tag: r.tag || r.TAG || ('AT-IMP-' + (count + 1)),
          nome,
          area: r.area || r.Area || 'Não classificado',
          setor: r.setor || r.Setor || 'Mecânico',
          categoria: r.setor || 'Mecânico',
          fabricante: r.fabricante || r.Fabricante || '—',
          modelo: r.modelo || r.Modelo || '—',
          criticidade: (r.criticidade || r.Criticidade || 'C').toString().toUpperCase().charAt(0),
          status: r.status || r.Status || 'Operando',
          dataInstalacao: r.dataInstalacao || new Date().toISOString().slice(0,10),
          valorAquisicao: Number(r.valorAquisicao) || 0,
          vidaUtilAnos: 10, horasOperacaoAcumuladas: 0, anexos: [],
          historico: [{ data: new Date().toISOString().slice(0,10), tipo: 'Importação', descricao: 'Ativo importado via planilha em massa.', os: '-' }],
          // Informações Patrimoniais
          familia: r.familia || r.Familia || r['Família'] || 'Equipamento Geral',
          codigoAtivo: r.codigoAtivo || r['Código do Ativo'] || r.CodigoAtivo || ('PAT-' + (20260000 + count + 1)),
          centroCusto: r.centroCusto || r['Centro de Custo'] || '—',
          centroTrabalho: r.centroTrabalho || r['Centro de Trabalho'] || '—',
          planta: r.planta || r.Planta || 'Planta Industrial FertGrow — Unidade 01',
          sistema: r.sistema || r.Sistema || '—',
          subsistema: r.subsistema || r.Subsistema || '—',
          localizacao: r.localizacao || r['Localização'] || r.Localizacao || '—',
          proprietario: r.proprietario || r['Proprietário'] || 'FertGrow Insumos Agrícolas S.A.',
          proprio: !alugado && !terceiro,
          terceiro,
          alugado,
          contaContabil: r.contaContabil || r['Conta Contábil'] || '—',
          // Árvore de Ativos
          pastaId: pastaId || null, parentAtivoId: null,
        });
        count++;
      });
      App.toast(count + ' ativo(s) importado(s) com sucesso.', 'success');
      App.closeModal();
    });
  }

  // ------------------------------------------------- Import de Estoque (ERP)
  // Planilha exportada do ERP com colunas como: Produto, Armazém, Descrição,
  // Saldo Atual, Sld.Atu. (saldo valorizado), C.Unitário, C.Unit.FIFO1, Grupo,
  // Cod.Produto, Status Sld. Faz upsert por Produto + Armazém: itens já
  // cadastrados são atualizados, os demais são criados.
  // Com `substituir: true`, ao final também remove do estoque qualquer item
  // (Produto + Armazém) que não apareceu na planilha importada — usado para
  // repor o estoque inteiro por uma planilha nova mais enxuta. As demais
  // coleções (solicitações de compra, projetos etc.) nunca são tocadas aqui.
  function importarEstoque(rows, substituir) {
    const linhas = rows.map(r => normalizarLinha(r)).filter(m => campo(m, 'produto'));
    let novos = 0, atualizados = 0;
    const chavesNaPlanilha = new Set();
    linhas.forEach(m => {
      const codigo = String(campo(m, 'produto')).trim();
      const armazem = String(campo(m, 'armazem')).trim();
      chavesNaPlanilha.add(codigo + '|' + armazem);
      const dados = {
        codigo, armazem,
        descricao: campo(m, 'descricao') || codigo,
        grupo: campo(m, 'grupo') || '',
        codProduto: campo(m, 'codproduto') || '',
        qtdAtual: numeroBR(campo(m, 'saldoatual')),
        saldoAtualizado: numeroBR(campo(m, 'sldatu')),
        custoUnitario: numeroBR(campo(m, 'cunitario')),
        custoUnitarioFifo1: numeroBR(campo(m, 'cunitfifo1')),
        statusSaldo: campo(m, 'statussld') || '',
      };
      const existente = Store.all('estoque').find(e => e.codigo === codigo && e.armazem === armazem);
      if (existente) { Object.assign(existente, dados); atualizados++; }
      else { Store.addSilent('estoque', Object.assign({ unidade: 'un' }, dados)); novos++; }
    });
    let removidos = 0;
    if (substituir) {
      const idsRemover = Store.all('estoque')
        .filter(e => !chavesNaPlanilha.has(e.codigo + '|' + e.armazem))
        .map(e => e.id);
      removidos = idsRemover.length;
      if (removidos) Store.removerEmLote('estoque', idsRemover);
    }
    Store.persist();
    return { novos, atualizados, removidos };
  }

  function abrirModalImportEstoque() {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">
        Envie a planilha de estoque exportada do ERP (.xlsx, .xls ou .csv), com colunas como:
        <strong>Produto, Armazém, Descrição, Saldo Atual, Sld.Atu., C.Unitário, C.Unit.FIFO1, Grupo, Cod.Produto, Status Sld.</strong>
        Apenas <strong>Produto</strong> é obrigatório — os demais campos ausentes recebem valores padrão.
        Itens já cadastrados (mesmo <strong>Produto + Armazém</strong>) são <strong>atualizados</strong>.
      </p>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="checkbox" id="chkSubstituirEstoque" style="margin-top:2px;">
        <span style="font-size:12.5px;">
          <strong>Substituir completamente</strong> — remove do estoque qualquer item (Produto + Armazém) que <strong>não</strong> aparecer nesta planilha.
          Use quando a planilha nova é a lista completa e mais enxuta do estoque. Solicitações de Compra e Projetos não são afetados.
          <br>Desmarcado (padrão): itens que não aparecerem na planilha permanecem como estão.
        </span>
      </label>
      <input type="file" id="fileImportEstoque" accept=".xlsx,.xls,.csv">
      <div id="importEstoquePreview" class="mt-16"></div>
    `;
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
    footer.innerHTML = `<button class="btn" id="cancelImpEst">Cancelar</button><button class="btn btn-primary" id="confirmImpEst" disabled>${Icon('upload',15)} Importar</button>`;
    App.openModal({ title: 'Importar Planilha de Estoque', body, footer, size: 'lg' });
    renderIcons();
    document.getElementById('cancelImpEst').onclick = App.closeModal;

    let parsedRows = [];
    document.getElementById('fileImportEstoque').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      lerArquivoPlanilha(file, (rows) => {
        parsedRows = rows;
        document.getElementById('importEstoquePreview').innerHTML = renderPreview(rows);
        document.getElementById('confirmImpEst').disabled = rows.length === 0;
      }, () => App.toast('Falha ao ler o arquivo. Verifique o formato.', 'danger'));
    });

    document.getElementById('confirmImpEst').addEventListener('click', () => {
      const substituir = document.getElementById('chkSubstituirEstoque').checked;
      const executar = () => {
        const { novos, atualizados, removidos } = importarEstoque(parsedRows, substituir);
        const partes = [`${novos} item(ns) novo(s)`, `${atualizados} atualizado(s)`];
        if (substituir) partes.push(`${removidos} removido(s)`);
        App.toast(`${partes.join(', ')} importado(s) com sucesso.`, 'success');
        App.closeModal();
      };
      if (substituir) {
        App.confirmAction(
          `Isso vai REMOVER do estoque todo item que não estiver nesta planilha. Confirma a substituição completa?`,
          executar
        );
      } else {
        executar();
      }
    });
  }

  // ------------------------------------------------- Import de Serviços
  // Planilha própria de Serviços (não é a exportação de estoque do ERP), com
  // colunas como: Código, Descrição, Grupo, Unidade, Custo Unitário. Faz
  // upsert por Código (sem Armazém, que não existe para serviço): itens já
  // cadastrados são atualizados, os demais são criados.
  // Com `substituir: true`, remove ao final qualquer serviço cujo Código não
  // apareceu na planilha importada. Nunca toca em Estoque, Solicitações de
  // Compra ou Projetos.
  function importarServicos(rows, substituir) {
    const linhas = rows.map(r => normalizarLinha(r)).filter(m => campo(m, 'codigo', 'servico', 'produto'));
    let novos = 0, atualizados = 0;
    const codigosNaPlanilha = new Set();
    linhas.forEach(m => {
      const codigo = String(campo(m, 'codigo', 'servico', 'produto')).trim();
      codigosNaPlanilha.add(codigo);
      const dados = {
        codigo,
        descricao: campo(m, 'descricao') || codigo,
        grupo: campo(m, 'grupo') || '',
        unidade: campo(m, 'unidade') || 'un',
        custoUnitario: numeroBR(campo(m, 'custounitario', 'cunitario', 'custo')),
      };
      const existente = Store.all('servicos').find(e => e.codigo === codigo);
      if (existente) { Object.assign(existente, dados); atualizados++; }
      else { Store.addSilent('servicos', dados); novos++; }
    });
    let removidos = 0;
    if (substituir) {
      const idsRemover = Store.all('servicos')
        .filter(e => !codigosNaPlanilha.has(e.codigo))
        .map(e => e.id);
      removidos = idsRemover.length;
      if (removidos) Store.removerEmLote('servicos', idsRemover);
    }
    Store.persist();
    return { novos, atualizados, removidos };
  }

  function abrirModalImportServicos() {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">
        Envie a planilha de serviços (.xlsx, .xls ou .csv), com colunas como:
        <strong>Código, Descrição, Grupo, Unidade, Custo Unitário</strong>.
        Apenas <strong>Código</strong> é obrigatório — os demais campos ausentes recebem valores padrão.
        Serviços já cadastrados (mesmo <strong>Código</strong>) são <strong>atualizados</strong>.
      </p>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="checkbox" id="chkSubstituirServicos" style="margin-top:2px;">
        <span style="font-size:12.5px;">
          <strong>Substituir completamente</strong> — remove os serviços que <strong>não</strong> aparecerem nesta planilha.
          Use quando a planilha nova é a lista completa e atualizada de serviços. Estoque, Solicitações de Compra e Projetos não são afetados.
          <br>Desmarcado (padrão): serviços que não aparecerem na planilha permanecem como estão.
        </span>
      </label>
      <input type="file" id="fileImportServicos" accept=".xlsx,.xls,.csv">
      <div id="importServicosPreview" class="mt-16"></div>
    `;
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
    footer.innerHTML = `<button class="btn" id="cancelImpServ">Cancelar</button><button class="btn btn-primary" id="confirmImpServ" disabled>${Icon('upload',15)} Importar</button>`;
    App.openModal({ title: 'Importar Planilha de Serviços', body, footer, size: 'lg' });
    renderIcons();
    document.getElementById('cancelImpServ').onclick = App.closeModal;

    let parsedRows = [];
    document.getElementById('fileImportServicos').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      lerArquivoPlanilha(file, (rows) => {
        parsedRows = rows;
        document.getElementById('importServicosPreview').innerHTML = renderPreview(rows);
        document.getElementById('confirmImpServ').disabled = rows.length === 0;
      }, () => App.toast('Falha ao ler o arquivo. Verifique o formato.', 'danger'));
    });

    document.getElementById('confirmImpServ').addEventListener('click', () => {
      const substituir = document.getElementById('chkSubstituirServicos').checked;
      const executar = () => {
        const { novos, atualizados, removidos } = importarServicos(parsedRows, substituir);
        const partes = [`${novos} serviço(s) novo(s)`, `${atualizados} atualizado(s)`];
        if (substituir) partes.push(`${removidos} removido(s)`);
        App.toast(`${partes.join(', ')} importado(s) com sucesso.`, 'success');
        App.closeModal();
      };
      if (substituir) {
        App.confirmAction(
          `Isso vai REMOVER da lista de serviços tudo que não estiver nesta planilha. Confirma a substituição completa?`,
          executar
        );
      } else {
        executar();
      }
    });
  }

  // ------------------------------------------------- Import de Prestadores
  // Planilha de fornecedores exportada do ERP (ex: Protheus SA2) — vem com
  // dezenas/centenas de colunas fiscais/contábeis que não interessam aqui.
  // Só lê: Razão Social (ou N Fantasia, se a primeira estiver vazia), CNPJ/CPF,
  // Telefone, E-Mail, Endereço + Bairro + Município + Estado + CEP (juntados
  // num só campo) e Bloqueado (invertido -> Ativo). Especialidade não existe
  // nessa planilha de ERP — continua em branco/como já estava, pra preencher
  // à mão depois. Faz upsert por CNPJ/CPF; linhas sem CNPJ/CPF são sempre
  // criadas como novo prestador (não há como saber se já existem).
  function importarPrestadores(rows, substituir) {
    const linhas = rows.map(r => normalizarLinha(r)).filter(m => campo(m, 'razaosocial', 'nfantasia'));
    let novos = 0, atualizados = 0;
    const documentosNaPlanilha = new Set();
    linhas.forEach(m => {
      const cnpj = String(campo(m, 'cnpjcpf')).trim();
      if (cnpj) documentosNaPlanilha.add(cnpj);
      const enderecoPartes = [
        campo(m, 'endereco'), campo(m, 'bairro'), campo(m, 'municipio'),
        campo(m, 'estado'), campo(m, 'cep'),
      ].filter(Boolean);
      const dados = {
        nome: campo(m, 'razaosocial', 'nfantasia'),
        nomeFantasia: campo(m, 'nfantasia') || '',
        cnpj,
        telefone: campo(m, 'telefone') || '',
        email: campo(m, 'email') || '',
        endereco: enderecoPartes.join(', '),
        ativo: !boolBR(campo(m, 'bloqueado')),
      };
      const existente = cnpj ? Store.all('prestadores').find(p => p.cnpj === cnpj) : null;
      if (existente) { Object.assign(existente, dados); atualizados++; }
      else { Store.addSilent('prestadores', dados); novos++; }
    });
    let removidos = 0;
    if (substituir) {
      const idsRemover = Store.all('prestadores')
        .filter(p => p.cnpj && !documentosNaPlanilha.has(p.cnpj))
        .map(p => p.id);
      removidos = idsRemover.length;
      if (removidos) Store.removerEmLote('prestadores', idsRemover);
    }
    Store.persist();
    return { novos, atualizados, removidos };
  }

  function abrirModalImportPrestadores() {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="text-muted" style="font-size:12.5px;margin-bottom:12px;">
        Envie a planilha de fornecedores exportada do ERP (.xlsx, .xls ou .csv). Ela pode ter muitas colunas —
        só estas são lidas: <strong>Razão Social</strong> e <strong>N Fantasia</strong> (se a Razão Social vier vazia, usa o Fantasia no lugar), <strong>CNPJ/CPF</strong>, <strong>Telefone</strong>,
        <strong>E-Mail</strong>, <strong>Endereço, Bairro, Município, Estado, CEP</strong> (juntados num único endereço) e
        <strong>Bloqueado</strong> (define o Status Ativo/Inativo). As demais colunas são ignoradas.
        <br><strong>Especialidade</strong> não existe nessa planilha — continue preenchendo à mão depois de importar.
        Prestadores já cadastrados (mesmo <strong>CNPJ/CPF</strong>) são <strong>atualizados</strong>; linhas sem CNPJ/CPF sempre criam um novo registro.
      </p>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="checkbox" id="chkSubstituirPrestadores" style="margin-top:2px;">
        <span style="font-size:12.5px;">
          <strong>Substituir completamente</strong> — remove os prestadores (com CNPJ/CPF) que <strong>não</strong> aparecerem nesta planilha.
          <br>Desmarcado (padrão): prestadores que não aparecerem na planilha permanecem como estão.
        </span>
      </label>
      <input type="file" id="fileImportPrestadores" accept=".xlsx,.xls,.csv">
      <div id="importPrestadoresPreview" class="mt-16"></div>
    `;
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:8px;width:100%;justify-content:flex-end;';
    footer.innerHTML = `<button class="btn" id="cancelImpPrest">Cancelar</button><button class="btn btn-primary" id="confirmImpPrest" disabled>${Icon('upload',15)} Importar</button>`;
    App.openModal({ title: 'Importar Planilha de Prestadores', body, footer, size: 'lg' });
    renderIcons();
    document.getElementById('cancelImpPrest').onclick = App.closeModal;

    let parsedRows = [];
    document.getElementById('fileImportPrestadores').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      lerArquivoPlanilha(file, (rows) => {
        parsedRows = rows;
        document.getElementById('importPrestadoresPreview').innerHTML = renderPreview(rows);
        document.getElementById('confirmImpPrest').disabled = rows.length === 0;
      }, () => App.toast('Falha ao ler o arquivo. Verifique o formato.', 'danger'));
    });

    document.getElementById('confirmImpPrest').addEventListener('click', () => {
      const substituir = document.getElementById('chkSubstituirPrestadores').checked;
      const executar = () => {
        const { novos, atualizados, removidos } = importarPrestadores(parsedRows, substituir);
        const partes = [`${novos} prestador(es) novo(s)`, `${atualizados} atualizado(s)`];
        if (substituir) partes.push(`${removidos} removido(s)`);
        App.toast(`${partes.join(', ')} importado(s) com sucesso.`, 'success');
        App.closeModal();
      };
      if (substituir) {
        App.confirmAction(
          `Isso vai REMOVER da lista de prestadores tudo que não estiver nesta planilha (e tiver CNPJ/CPF). Confirma a substituição completa?`,
          executar
        );
      } else {
        executar();
      }
    });
  }

  function renderPreview(rows) {
    if (!rows.length) return '<div class="empty">Nenhuma linha encontrada na planilha.</div>';
    const cols = Object.keys(rows[0]).slice(0, 6);
    return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0,6).map(r => `<tr>${cols.map(c=>`<td>${r[c]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="text-muted mt-8" style="font-size:11.5px;">Exibindo até 6 de ${rows.length} linha(s) detectada(s).</div>`;
  }

  // ------------------------------------------------------- Exports (Excel)
  function baixarWorkbook(wb, filename) {
    XLSX.writeFile(wb, filename);
    App.toast('Arquivo exportado: ' + filename, 'success');
  }

  function exportarOrdensExcel(ordens) {
    const rows = ordens.map(o => ({
      OS: o.numero, Ativo: Store.ativoNome(o.ativoId), Tipo: o.tipo, Semana: o.semana,
      Prioridade: o.prioridade, Status: o.status, Responsavel: o.responsavel,
      HorasPrevistas: o.horasPrevistas, HorasReais: o.horasReais, DataAbertura: o.dataAbertura,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ordens de Serviço');
    baixarWorkbook(wb, 'fertgrow_ordens_servico.xlsx');
  }

  function exportarPlanoExcel(semanas) {
    const rows = semanas.map(w => ({
      Semana: w.numero, DataInicio: w.dataInicio, HorasPlanejadas: w.horasPlanejadas.toFixed(1),
      HorasDisponiveis: w.horasDisponiveis, CargaPercent: w.cargaPercent.toFixed(1) + '%',
      Status: w.statusSemana, ParadaPlanta: w.paradaPlanta ? 'Sim' : 'Não', HorasParada: w.tempoParadaTotal.toFixed(1),
      AtivosProgramados: w.ativosProgramados.length,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Plano 52 Semanas');
    baixarWorkbook(wb, 'fertgrow_plano_52_semanas.xlsx');
  }

  function exportarRelatorio(key) {
    const wb = XLSX.utils.book_new();
    let rows = [], name = '';
    if (key === 'ativos') {
      rows = Store.all('ativos').map(a => ({
        Tipo: a.parentAtivoId ? 'Sub-Bem' : 'Bem',
        Grupo: a.parentAtivoId ? '' : (a.pastaId ? Store.caminhoPasta(a.pastaId) : '— raiz —'),
        ItemPai: a.parentAtivoId ? Store.ativoNome(a.parentAtivoId) : '',
        TAG: a.tag, CodigoAtivo: a.codigoAtivo, NomeDoBem: a.nome, Familia: a.familia,
        CentroCusto: a.centroCusto, CentroTrabalho: a.centroTrabalho, Planta: a.planta,
        Area: a.area, Sistema: a.sistema, Subsistema: a.subsistema, Localizacao: a.localizacao,
        Criticidade: a.criticidade, Status: a.status, Fabricante: a.fabricante, Modelo: a.modelo,
        Instalacao: a.dataInstalacao, Valor: a.valorAquisicao, Proprietario: a.proprietario,
        Proprio: a.proprio ? 'Sim' : 'Não', Terceiro: a.terceiro ? 'Sim' : 'Não', Alugado: a.alugado ? 'Sim' : 'Não',
        ContaContabil: a.contaContabil,
      }));
      name = 'ativos';
    } else if (key === 'ordens') {
      return exportarOrdensExcel(Store.all('ordens'));
    } else if (key === 'estoque') {
      rows = Store.all('estoque').map(e => ({
        Produto: e.codigo, CodProduto: e.codProduto, Armazem: e.armazem, Descricao: e.descricao, Grupo: e.grupo,
        SaldoAtual: e.qtdAtual, SldAtualizado: e.saldoAtualizado, CUnitario: e.custoUnitario, CUnitFIFO1: e.custoUnitarioFifo1,
        StatusSld: e.statusSaldo,
      }));
      name = 'estoque';
    } else if (key === 'motores') {
      rows = Store.all('motores').map(m => ({ TAG: m.tag, Tipo: m.tipo || 'Motor', Ativo: motorAtivoNome(m), Fabricante: m.fabricante, Modelo: m.modelo, PotenciaCV: m.potenciaCV, RelacaoReducao: m.relacaoReducao, Status: m.status, Local: m.localAtual }));
      name = 'motores';
    } else if (key === 'locacoes') {
      rows = Store.calcLocacoes().map(l => ({ Bem: l.bem, Locador: l.locador, ValorMensal: l.valorMensal, DataInicio: l.dataInicio, DataFim: l.dataFim || 'Indeterminado', Status: l.status, CustoAcumulado: l.custoAcumulado }));
      name = 'locacoes';
    } else if (key === 'semanas') {
      return exportarPlanoExcel(Store.calcTodasSemanas());
    } else if (key === 'indicadores') {
      const k = Store.calcKPIs();
      rows = [{ Ativos: k.totalAtivos, OSAbertas: k.osAbertas, Preventivas: k.preventivas, Corretivas: k.corretivas, MTBF: k.mtbf.toFixed(1), MTTR: k.mttr.toFixed(1), Disponibilidade: k.disponibilidade.toFixed(1)+'%', BacklogSemanas: k.backlogSemanas.toFixed(2), CustoTotal: k.custoTotal.toFixed(2) }];
      name = 'indicadores';
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    baixarWorkbook(wb, `fertgrow_${name}.xlsx`);
  }

  // ------------------------------------------------------- Export PDF (print)
  function exportarPdf(key) {
    const titles = { ativos: 'Relatório de Ativos', ordens: 'Relatório de Ordens de Serviço', estoque: 'Relatório de Estoque', motores: 'Relatório de Motores', locacoes: 'Relatório de Locações', semanas: 'Relatório do Plano 52 Semanas', indicadores: 'Relatório de Indicadores' };
    let titulo = titles[key] || 'Relatório';
    if (key === 'motores' && Object.keys(_motFiltros).length) {
      titulo += ' (com filtros aplicados)';
    }
    const win = window.open('', '_blank');
    const html = buildPrintHtml(titulo, key);
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  function buildPrintHtml(title, key) {
    let tableHtml = '';
    if (key === 'ativos') {
      tableHtml = tableFrom(['Tipo','Grupo / Item Pai','TAG','Código do Ativo','Nome do Bem','Família','Área','Posse','Criticidade','Status'],
        Store.all('ativos').map(a => [
          a.parentAtivoId ? 'Sub-Bem' : 'Bem',
          a.parentAtivoId ? Store.ativoNome(a.parentAtivoId) : (a.pastaId ? Store.caminhoPasta(a.pastaId) : '— raiz —'),
          a.tag, a.codigoAtivo, a.nome, a.familia, a.area, a.alugado ? 'Alugado' : (a.terceiro ? 'Terceiro' : 'Próprio'), a.criticidade, a.status,
        ]));
    } else if (key === 'ordens') {
      tableHtml = tableFrom(['OS','Ativo','Tipo','Semana','Status'], Store.all('ordens').map(o => [o.numero, Store.ativoNome(o.ativoId), o.tipo, o.semana, o.status]));
    } else if (key === 'estoque') {
      tableHtml = tableFrom(['Produto','Armazém','Descrição','Grupo','Saldo Atual','Custo Unit.','Status'],
        Store.all('estoque').map(e => [e.codigo, e.armazem, e.descricao, e.grupo, e.qtdAtual, e.custoUnitario.toFixed(2), e.statusSaldo]));
    } else if (key === 'motores') {
      // Respeita os mesmos filtros por coluna que estão ativos na tela de Motores.
      const motoresFiltrados = motAplicarFiltrosOrdenacao(Store.all('motores'));
      tableHtml = tableFrom(['TAG','Tipo','Ativo','Fabricante/Modelo','Potência','Status','Local'], motoresFiltrados.map(m => [m.tag, m.tipo || 'Motor', motorAtivoNome(m), `${m.fabricante || '—'} · ${m.modelo || '—'}`, m.tipo === 'Redutor' ? (m.relacaoReducao ? m.relacaoReducao+':1' : '—') : m.potenciaCV+' CV', m.status, m.localAtual]));
    } else if (key === 'locacoes') {
      tableHtml = tableFrom(['Bem','Locador','Valor Mensal','Início','Término','Status','Custo Acumulado'],
        Store.calcLocacoes().map(l => [l.bem, l.locador, l.valorMensal.toFixed(2), l.dataInicio, l.dataFim || 'Indeterminado', l.status, l.custoAcumulado.toFixed(2)]));
    } else if (key === 'semanas') {
      tableHtml = tableFrom(['Semana','Planejado (h)','Disponível (h)','Carga %','Status'], Store.calcTodasSemanas().map(w => [w.numero, w.horasPlanejadas.toFixed(1), w.horasDisponiveis, w.cargaPercent.toFixed(0)+'%', w.statusSemana]));
    } else if (key === 'indicadores') {
      const k = Store.calcKPIs();
      tableHtml = tableFrom(['Indicador','Valor'], [['MTBF (h)', k.mtbf.toFixed(1)], ['MTTR (h)', k.mttr.toFixed(1)], ['Disponibilidade', k.disponibilidade.toFixed(1)+'%'], ['Backlog (semanas)', k.backlogSemanas.toFixed(2)], ['Custo Total', App.fmtMoney(k.custoTotal)]]);
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} · FertGrow CMMS</title>
      <style>
        @page { size: A4 landscape; margin: 14mm 12mm; }
        body{font-family:Arial,sans-serif;color:#111;padding:0;}
        .cab{display:flex;align-items:center;gap:12px;border-bottom:3px solid #1E8E5A;padding-bottom:12px;margin-bottom:18px;}
        .cab img{width:36px;height:36px;object-fit:contain;flex-shrink:0;}
        .cab-marca{font-weight:700;font-size:15px;}
        h1{font-size:17px;margin:0 0 2px;} .sub{color:#666;font-size:11.5px;}
        table{width:100%;border-collapse:collapse;font-size:11.5px;} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
        th{background:#f2f2f2;}
      </style></head><body>
      <div class="cab">
        <img src="data:image/png;base64,${LOGO_FERTGROW_B64}" alt="FertGrow">
        <div><div class="cab-marca">FertGrow</div><h1>${title}</h1><div class="sub">Gerado em ${new Date().toLocaleString('pt-BR')}</div></div>
      </div>
      ${tableHtml}
      </body></html>`;
  }

  function tableFrom(headers, rows) {
    return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  return { abrirModalImportAtivos, abrirModalImportEstoque, abrirModalImportServicos, abrirModalImportPrestadores, desfazerImportacaoBens, exportarOrdensExcel, exportarPlanoExcel, exportarRelatorio, exportarPdf, lerArquivoPlanilha, normalizarLinha, campo };
})();
