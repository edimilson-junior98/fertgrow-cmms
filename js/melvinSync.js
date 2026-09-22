/* ==========================================================================
   FertGrow CMMS — Sincronização da Árvore de Ativos com o Melvin

   Puxa filiais > setores > equipamentos (> conjuntos, se existirem) do Melvin
   via o servidor local (melvin-sync-server.js, roda em localhost:5178 — dê
   2 cliques em iniciar-sync-melvin.bat antes de sincronizar) e importa pra
   dentro da árvore de Ativos já existente: filial/setor viram Pastas,
   equipamento/conjunto viram Ativos.

   Cada pasta/ativo criado a partir do Melvin guarda `melvinId` (o id do nó lá
   no Melvin) — nas próximas sincronizações, isso é usado pra ACHAR e
   ATUALIZAR o mesmo registro em vez de duplicar. Nada que já existia antes
   (pastas/ativos sem melvinId, criados manualmente) é tocado ou removido.
   ========================================================================== */

const MelvinSync = (function () {
  const SYNC_URL = 'http://localhost:5178/melvin/ativos';
  const SYNC_URL_ORDENS = 'http://localhost:5178/melvin/ordens';

  function acharOuCriarPasta(nome, parentId, melvinId, contadores) {
    let pasta = Store.all('pastas').find(p => p.melvinId === melvinId);
    if (pasta) {
      if (pasta.nome !== nome || pasta.parentId !== (parentId || null)) {
        Store.update('pastas', pasta.id, { nome, parentId: parentId || null });
      }
      return pasta.id;
    }
    // Sem melvinId ainda (primeira sincronização) — tenta casar por nome/local
    // antes de criar uma pasta duplicada, e só então marca com o melvinId.
    pasta = Store.all('pastas').find(p => p.nome === nome && p.parentId === (parentId || null) && !p.melvinId);
    if (pasta) {
      Store.update('pastas', pasta.id, { melvinId });
      return pasta.id;
    }
    contadores.pastasCriadas++;
    return Store.add('pastas', { nome, parentId: parentId || null, melvinId }).id;
  }

  // Preenche o resto do esquema de "ativos" com os mesmos padrões usados pelo
  // importador de planilha (Importacao.importarComoArvoreBens) — o Melvin só
  // manda tag/descricao/status, então os demais campos (criticidade, área,
  // fabricante etc.) entram com um valor neutro em vez de undefined, pra não
  // quebrar telas/relatórios que dependem deles.
  function acharOuCriarAtivo(equip, pastaId, parentAtivoId, contadores) {
    const status = (equip.indParado || equip.isActive === false) ? 'Parado' : 'Operando';
    const dadosBase = {
      tag: equip.tag,
      nome: equip.descricao,
      pastaId: pastaId || null,
      parentAtivoId: parentAtivoId || null,
      status,
      melvinId: equip.id,
    };
    const existente = Store.all('ativos').find(a => a.melvinId === equip.id);
    if (existente) {
      Store.update('ativos', existente.id, dadosBase);
      contadores.ativosAtualizados++;
      return existente.id;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const novo = Store.add('ativos', {
      ...dadosBase,
      area: '—', setor: '—', categoria: '—', fabricante: '—', modelo: '—',
      criticidade: 'C', dataInstalacao: hoje, vidaUtilAnos: 10, valorAquisicao: 0,
      horasOperacaoAcumuladas: 0, anexos: [],
      historico: [{ data: hoje, tipo: 'Sincronização', descricao: 'Importado da árvore de ativos do Melvin.', os: '-' }],
      familia: '—', codigoAtivo: equip.tag, centroCusto: '—', centroTrabalho: '—',
      planta: 'Planta Industrial FertGrow', sistema: '—', subsistema: '—', localizacao: '—',
      proprietario: '—', proprio: true, terceiro: false, alugado: false, contaContabil: '—',
      tipoModelo: '—', serie: '—', instalacao: true, unidade: 'un', produtoAbastecido: '—',
      percentualManutencao: 0, percentualSeguroLicenciamento: 0, valorPresente: 0, valorFaturado: 0,
    });
    contadores.ativosCriados++;
    return novo.id;
  }

  // A hierarquia oficial do Melvin tem 5 níveis: Filial > Setor > Ativo >
  // Conjunto > Subconjunto. Os 3 primeiros (Filial/Setor viram Pasta, Ativo
  // vira o bem raiz) já são tratados por fora; esta função cobre os 2 últimos
  // (Conjunto e Subconjunto), que entram como sub-bens recursivos
  // (parentAtivoId), igual ao padrão que a árvore de Ativos já usa.
  // Não sei ainda o nome exato do campo de filhos de um "conjunto" (nenhum
  // equipamento desta conta tem conjunto cadastrado pra confirmar), então
  // aceita as variações mais prováveis — se um dia existir dado real em
  // algum desses formatos, a recursão já funciona sem precisar mexer aqui.
  function filhosDe(no) {
    return no.conjuntos || no.subConjuntos || no.subconjuntos || no.subConjunto || [];
  }
  function processarEquipamentos(lista, pastaId, parentAtivoId, contadores) {
    (lista || []).forEach((equip) => {
      const ativoId = acharOuCriarAtivo(equip, pastaId, parentAtivoId, contadores);
      const filhos = filhosDe(equip);
      if (filhos.length) processarEquipamentos(filhos, pastaId, ativoId, contadores);
    });
  }

  // Apaga tudo que não veio do Melvin (pastas e ativos sem melvinId) — usado
  // quando o usuário quer que a árvore de Ativos fique só com o que está no
  // Melvin, em vez de somar aos dados de demonstração/manuais que já existiam.
  // A tela é quem decide chamar isso (com confirmação); a sincronização que
  // roda logo depois recria tudo do zero já marcado com melvinId.
  function removerNaoMelvin() {
    const ativosAntigos = Store.all('ativos').filter(a => !a.melvinId);
    const pastasAntigas = Store.all('pastas').filter(p => !p.melvinId);
    if (ativosAntigos.length) Store.removerEmLote('ativos', ativosAntigos.map(a => a.id));
    if (pastasAntigas.length) Store.removerEmLote('pastas', pastasAntigas.map(p => p.id));
    return { ativosRemovidos: ativosAntigos.length, pastasRemovidas: pastasAntigas.length };
  }

  async function sincronizarAtivos() {
    const resp = await fetch(SYNC_URL);
    const body = await resp.json();
    if (!body.ok) throw new Error(body.erro || 'Falha desconhecida ao falar com o servidor de sincronização.');
    const arvore = body.arvore;
    const contadores = { pastasCriadas: 0, ativosCriados: 0, ativosAtualizados: 0 };

    (arvore.filiais || []).forEach((filial) => {
      const pastaFilialId = acharOuCriarPasta(filial.descricao || filial.tag, null, filial.id, contadores);
      (filial.setores || []).forEach((setor) => {
        const pastaSetorId = acharOuCriarPasta(setor.descricao || setor.tag, pastaFilialId, setor.id, contadores);
        processarEquipamentos(setor.equipamentos, pastaSetorId, null, contadores);
      });
    });

    Store.persist();
    return contadores;
  }

  // ------------------------------------------------------------------------
  // Ordens de Serviço
  // ------------------------------------------------------------------------

  // "2026-09-22T..." -> nº da semana (1-52) do Plano 52 Semanas, usando a
  // mesma base (1º de janeiro de 2026) que Store.weekToDate já usa.
  function dataParaSemana(dataISO) {
    if (!dataISO) return Store.config.semanaAtual || 1;
    const base = new Date(2026, 0, 1);
    const alvo = new Date(dataISO);
    if (isNaN(alvo.getTime())) return Store.config.semanaAtual || 1;
    const dias = Math.round((alvo - base) / 86400000);
    const semana = Math.floor(dias / 7) + 1;
    return Math.min(52, Math.max(1, semana));
  }

  // O Melvin não tem um "tipo" fixo (Preventiva/Corretiva/Preditiva/Inspeção)
  // como o FertGrow CMMS — cada tipo de manutenção é um cadastro livre de
  // texto (ex: "Lubrificação de Mancal", "Calibração"). `indCorretiva` é o
  // sinal mais confiável; o resto é inferido pela descrição, com Preventiva
  // como padrão de bom senso pra tudo que não é claramente Inspeção/Corretiva.
  function mapTipoOS(tipoManutencao) {
    if (!tipoManutencao) return 'Preventiva';
    if (tipoManutencao.indCorretiva) return 'Corretiva';
    const d = (tipoManutencao.descricao || '').toLowerCase();
    if (d.includes('inspe') || d.includes('calibr') || d.includes('aferi')) return 'Inspeção';
    if (d.includes('corretiva')) return 'Corretiva';
    return 'Preventiva';
  }

  function mapPrioridadeOS(prioridade) {
    const d = (prioridade?.descricao || '').trim();
    return ['Baixa', 'Média', 'Alta', 'Urgente'].includes(d) ? d : 'Média';
  }

  // statusTexto observados na conta real: Planejada, Programada, Aguardando,
  // Encerrada, Cancelada. Qualquer valor novo/desconhecido cai em "Aberta"
  // (mais seguro que travar a sincronização por causa de um texto novo).
  const MAPA_STATUS_OS = {
    Planejada: 'Aberta',
    Programada: 'Aberta',
    Aguardando: 'Aguardando Peça',
    Encerrada: 'Concluída',
    Cancelada: 'Cancelada',
  };
  function mapStatusOS(statusTexto) {
    return MAPA_STATUS_OS[statusTexto] || 'Aberta';
  }

  function acharOuCriarOrdem(os, contadores) {
    // `itens[0].id` é o id do equipamento lá no Melvin — cruza com o
    // `melvinId` gravado nos ativos pela sincronização de Ativos, se ela já
    // tiver rodado antes. Se não achar (ainda não sincronizou Ativos, ou o
    // equipamento não existe mais lá), fica sem ativo vinculado.
    const primeiroItem = (os.itens || [])[0];
    const ativoMatch = primeiroItem ? Store.all('ativos').find(a => a.melvinId === primeiroItem.id) : null;
    const dataRef = os.dataProgramacaoInicio || os.dataAbertura;

    const dados = {
      numero: 'MEL-' + os.codOrdem,
      ativoId: ativoMatch ? ativoMatch.id : null,
      tipo: mapTipoOS(os.tipoManutencao),
      descricao: os.descricao || '(sem descrição)',
      prioridade: mapPrioridadeOS(os.prioridade),
      semana: dataParaSemana(dataRef),
      responsavel: os.oficina?.descricao || '',
      horasPrevistas: os.hora || 0,
      status: mapStatusOS(os.statusTexto),
      solicitante: 'Melvin',
      dataAbertura: (os.dataAbertura || '').slice(0, 10),
      dataProgramada: (dataRef || '').slice(0, 10),
      dataConclusao: os.dataEncerramento ? os.dataEncerramento.slice(0, 10) : null,
      observacoes: os.observacao || os.justificativa || '',
      melvinId: os.id,
      melvinCodigo: os.codOrdem,
    };

    const existente = Store.all('ordens').find(o => o.melvinId === os.id);
    if (existente) {
      Store.update('ordens', existente.id, dados);
      contadores.ordensAtualizadas++;
      return;
    }
    Store.add('ordens', {
      ...dados,
      horasReais: 0, paradaPlanta: false, horasParada: 0,
      checklist: [], materiais: [], maoDeObra: [], fotos: [], assinatura: null,
    });
    contadores.ordensCriadas++;
  }

  // Some vezes precisa apagar as OS que já estavam no sistema (dados de
  // demonstração, não vindas do Melvin) antes de trazer as reais — quem
  // decide isso é a tela (pede confirmação), esta função só faz a limpeza.
  function removerOrdensSemMelvinId() {
    const antigas = Store.all('ordens').filter(o => !o.melvinId);
    if (antigas.length) Store.removerEmLote('ordens', antigas.map(o => o.id));
    return antigas.length;
  }

  async function sincronizarOrdens() {
    const resp = await fetch(SYNC_URL_ORDENS);
    const body = await resp.json();
    if (!body.ok) throw new Error(body.erro || 'Falha desconhecida ao buscar ordens de serviço do Melvin.');
    const contadores = { ordensCriadas: 0, ordensAtualizadas: 0 };
    (body.ordens || []).forEach((os) => acharOuCriarOrdem(os, contadores));
    Store.persist();
    return contadores;
  }

  // ------------------------------------------------------------------------
  // Solicitações de Serviço
  // ------------------------------------------------------------------------
  const SYNC_URL_SOLICITACOES = 'http://localhost:5178/melvin/solicitacoes';

  // statusTexto observados na conta real: Em Aberto, OS Planejada, OS Criada,
  // OS Encerrada, Arquivada.
  const MAPA_STATUS_SOLICITACAO = {
    'Em Aberto': 'Aberta',
    'OS Planejada': 'Em Andamento',
    'OS Criada': 'Aprovada',
    'OS Encerrada': 'Concluída',
    Arquivada: 'Arquivada',
  };
  function mapStatusSolicitacao(statusTexto) {
    return MAPA_STATUS_SOLICITACAO[statusTexto] || 'Aberta';
  }

  function mapPrioridadeSolicitacao(prioridade) {
    const d = (prioridade?.descricao || '').trim();
    return ['Baixa', 'Média', 'Alta'].includes(d) ? d : 'Média';
  }

  function acharOuCriarSolicitacao(s, contadores) {
    // `idEquipamento` é o id do equipamento lá no Melvin — mesmo cruzamento
    // com `melvinId` usado em Ordens (só funciona se Ativos já foi sincronizado).
    const ativoMatch = s.idEquipamento ? Store.all('ativos').find(a => a.melvinId === s.idEquipamento) : null;
    const dados = {
      numero: 'SOL-' + s.codigo,
      ativoId: ativoMatch ? ativoMatch.id : null,
      descricao: s.solicitacao || '(sem descrição)',
      solicitante: s.solicitante || '',
      prioridade: mapPrioridadeSolicitacao(s.prioridade),
      canal: s.canalTexto || '',
      status: mapStatusSolicitacao(s.statusTexto),
      observacoes: s.justificativaArquivar || '',
      dataAbertura: (s.dataAbertura || '').slice(0, 10),
      melvinId: s.id,
      melvinCodigo: s.codigo,
    };
    const existente = Store.all('solicitacoesServico').find(x => x.melvinId === s.id);
    if (existente) {
      Store.update('solicitacoesServico', existente.id, dados);
      contadores.atualizadas++;
      return;
    }
    Store.add('solicitacoesServico', dados);
    contadores.criadas++;
  }

  function removerSolicitacoesSemMelvinId() {
    const antigas = Store.all('solicitacoesServico').filter(s => !s.melvinId);
    if (antigas.length) Store.removerEmLote('solicitacoesServico', antigas.map(x => x.id));
    return antigas.length;
  }

  async function sincronizarSolicitacoes() {
    const resp = await fetch(SYNC_URL_SOLICITACOES);
    const body = await resp.json();
    if (!body.ok) throw new Error(body.erro || 'Falha desconhecida ao buscar solicitações de serviço do Melvin.');
    const contadores = { criadas: 0, atualizadas: 0 };
    (body.solicitacoes || []).forEach((s) => acharOuCriarSolicitacao(s, contadores));
    Store.persist();
    return contadores;
  }

  // ------------------------------------------------------------------------
  // Programação — não chama o Melvin de novo; monta a grade semanal a partir
  // das Ordens de Serviço que JÁ foram sincronizadas (usa `dataProgramada`
  // pra saber o dia de cada uma). Sempre que roda, refaz do zero o "arquivo"
  // MELVIN_ARQUIVO_ID de cada dia afetado — é assim de propósito: "Realizada"
  // e "Cancelada" nesse arquivo espelham o status atual da OS no Melvin, não
  // são marcadas manualmente (isso continua existindo normalmente pra
  // arquivos importados por planilha, que essa função nunca toca).
  // ------------------------------------------------------------------------
  const MELVIN_ARQUIVO_ID = 'melvin-auto';

  function sincronizarProgramacao() {
    const ordensComData = Store.all('ordens').filter(o => o.melvinId && o.dataProgramada);
    const porDia = {};
    ordensComData.forEach((o) => {
      (porDia[o.dataProgramada] = porDia[o.dataProgramada] || []).push(o);
    });

    let diasAtualizados = 0;
    Object.entries(porDia).forEach(([dia, ordensDoDia]) => {
      const ordensArquivo = ordensDoDia.map((o) => ({
        id: 'mel-' + o.melvinId,
        numero: o.numero,
        codigoExterno: o.melvinCodigo != null ? String(o.melvinCodigo) : '',
        tipo: o.tipo || '',
        bem: o.ativoId ? Store.ativoNome(o.ativoId) : '',
        servico: o.descricao || '',
        etapas: [],
        concluida: o.status === 'Concluída',
        cancelada: o.status === 'Cancelada',
        motivoCancelamento: o.status === 'Cancelada' ? (o.observacoes || '') : '',
      }));
      const arquivoMelvin = { id: MELVIN_ARQUIVO_ID, nome: 'Ordens de Serviço do Melvin', ordens: ordensArquivo };

      const entry = Store.all('programacao').find(p => p.data === dia);
      if (entry) {
        const outrosArquivos = (entry.arquivos || []).filter(a => a.id !== MELVIN_ARQUIVO_ID);
        Store.update('programacao', entry.id, { arquivos: [arquivoMelvin, ...outrosArquivos] });
      } else {
        Store.add('programacao', { data: dia, observacao: '', arquivos: [arquivoMelvin] });
      }
      diasAtualizados++;
    });

    Store.persist();
    return { diasAtualizados, ordensTotal: ordensComData.length };
  }

  // ------------------------------------------------------------------------
  // Planos Preventivos (FMP) — só os "iniciados" (dataInicio preenchida e
  // ainda sem dataEncerramento); o servidor local já filtra isso.
  // ------------------------------------------------------------------------
  const SYNC_URL_PLANOS = 'http://localhost:5178/melvin/planos';

  function acharOuCriarPlano(p, contadores) {
    const ativoMatch = p.idEquipamento ? Store.all('ativos').find(a => a.melvinId === p.idEquipamento) : null;
    const dados = {
      tagFmp: p.tagFmp || '',
      ativoId: ativoMatch ? ativoMatch.id : null,
      equipamentoNome: p.equipamentoDescricao || (ativoMatch ? ativoMatch.nome : ''),
      descricao: p.descricaoOS || '',
      tipoManutencao: p.tipoManutencao || '',
      periodicidade: p.periodicidade || '',
      oficina: p.oficina || '',
      homem: p.homem || 0,
      hora: p.hora || 0,
      dataInicio: p.dataInicio ? p.dataInicio.slice(0, 10) : null,
      proximaOS: p.dataCriacaoProximaOS ? p.dataCriacaoProximaOS.slice(0, 10) : null,
      melvinId: p.id,
    };
    const existente = Store.all('planosPreventivos').find(x => x.melvinId === p.id);
    if (existente) { Store.update('planosPreventivos', existente.id, dados); contadores.atualizados++; return; }
    Store.add('planosPreventivos', dados);
    contadores.criados++;
  }

  function removerPlanosSemMelvinId() {
    const antigos = Store.all('planosPreventivos').filter(p => !p.melvinId);
    if (antigos.length) Store.removerEmLote('planosPreventivos', antigos.map(x => x.id));
    return antigos.length;
  }

  async function sincronizarPlanos() {
    const resp = await fetch(SYNC_URL_PLANOS);
    const body = await resp.json();
    if (!body.ok) throw new Error(body.erro || 'Falha desconhecida ao buscar planos preventivos do Melvin.');
    const contadores = { criados: 0, atualizados: 0 };
    (body.planos || []).forEach((p) => acharOuCriarPlano(p, contadores));
    // Planos que estavam sincronizados mas não voltaram desta vez já foram
    // encerrados/desativados no Melvin (a busca só traz os "iniciados") —
    // remove pra a lista não ficar com plano que não está mais ativo.
    const idsAtuais = new Set((body.planos || []).map(p => p.id));
    const encerrados = Store.all('planosPreventivos').filter(x => x.melvinId && !idsAtuais.has(x.melvinId));
    if (encerrados.length) Store.removerEmLote('planosPreventivos', encerrados.map(x => x.id));
    Store.persist();
    return { ...contadores, encerrados: encerrados.length };
  }

  return {
    sincronizarAtivos, sincronizarOrdens, removerOrdensSemMelvinId, removerNaoMelvin,
    sincronizarSolicitacoes, removerSolicitacoesSemMelvinId,
    sincronizarProgramacao,
    sincronizarPlanos, removerPlanosSemMelvinId,
  };
})();
