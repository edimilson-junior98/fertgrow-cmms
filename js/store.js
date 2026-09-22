/* ==========================================================================
   FertGrow CMMS — Store
   Local-first data layer. Persists to localStorage. Provides CRUD helpers
   and the calculation engine (KPIs, capacity, backlog, availability, etc).
   ========================================================================== */

const DB_KEY = 'fertgrow_cmms_db_v1';

const Store = (() => {

  function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  }

  function seed() {
    const areas = ['Recepção de Matéria-Prima', 'Moagem', 'Mistura', 'Granulação', 'Secagem', 'Peneiramento', 'Ensaque', 'Expedição', 'Utilidades'];

    const ativosSeed = [
      ['Moinho de Martelos 01', 'Moagem', 'Mecânico', 'A'],
      ['Moinho de Martelos 02', 'Moagem', 'Mecânico', 'B'],
      ['Misturador Horizontal 01', 'Mistura', 'Mecânico', 'A'],
      ['Granulador de Prato 01', 'Granulação', 'Mecânico', 'A'],
      ['Secador Rotativo 01', 'Secagem', 'Térmico', 'A'],
      ['Peneira Vibratória 01', 'Peneiramento', 'Mecânico', 'B'],
      ['Elevador de Canecas 01', 'Moagem', 'Mecânico', 'B'],
      ['Elevador de Canecas 02', 'Granulação', 'Mecânico', 'B'],
      ['Correia Transportadora 01', 'Recepção de Matéria-Prima', 'Mecânico', 'C'],
      ['Correia Transportadora 02', 'Expedição', 'Mecânico', 'C'],
      ['Ventilador Centrífugo 01', 'Secagem', 'Mecânico', 'B'],
      ['Compressor de Ar 01', 'Utilidades', 'Mecânico', 'A'],
      ['Bomba Centrífuga 01', 'Utilidades', 'Mecânico', 'C'],
      ['Silo de Armazenagem 01', 'Recepção de Matéria-Prima', 'Estrutural', 'B'],
      ['Ensacadora Automática 01', 'Ensaque', 'Mecânico', 'A'],
      ['Empilhadeira Elétrica 01', 'Expedição', 'Móvel', 'C'],
      ['Painel Elétrico Geral QGBT', 'Utilidades', 'Elétrico', 'A'],
      ['Balança Rodoviária 01', 'Expedição', 'Instrumentação', 'B'],
    ];

    const fabricantes = ['WEG', 'Bühler', 'Buhler-Miag', 'Kepler Weber', 'Vibra Screen', 'Ingersoll Rand', 'KSB', 'Siemens'];

    // ---- Referências para Informações Patrimoniais ----
    const familiaPorSetor = {
      'Mecânico': 'Equipamento Mecânico', 'Térmico': 'Equipamento Térmico', 'Estrutural': 'Estrutura e Instalação',
      'Móvel': 'Equipamento Móvel', 'Elétrico': 'Equipamento Elétrico', 'Instrumentação': 'Instrumentação e Controle',
    };
    const centroTrabalhoPorSetor = {
      'Mecânico': 'Manutenção Mecânica', 'Térmico': 'Manutenção Mecânica', 'Estrutural': 'Manutenção Civil',
      'Móvel': 'Manutenção de Frota', 'Elétrico': 'Manutenção Elétrica', 'Instrumentação': 'Manutenção de Instrumentação',
    };
    const sistemaPorArea = {
      'Recepção de Matéria-Prima': ['Sistema de Recepção', 'Moegas e Silos de Recepção'],
      'Moagem': ['Sistema de Moagem', 'Moinhos e Elevadores'],
      'Mistura': ['Sistema de Mistura', 'Misturadores'],
      'Granulação': ['Sistema de Granulação', 'Granuladores'],
      'Secagem': ['Sistema de Secagem', 'Secadores e Ventilação'],
      'Peneiramento': ['Sistema de Classificação', 'Peneiras'],
      'Ensaque': ['Sistema de Ensaque', 'Ensacadoras'],
      'Expedição': ['Sistema de Expedição', 'Transporte e Pesagem'],
      'Utilidades': ['Sistema de Utilidades', 'Ar Comprimido e Energia'],
    };
    const centroCustoPorArea = {
      'Recepção de Matéria-Prima': 'CC-3010', 'Moagem': 'CC-3020', 'Mistura': 'CC-3030', 'Granulação': 'CC-3040',
      'Secagem': 'CC-3050', 'Peneiramento': 'CC-3060', 'Ensaque': 'CC-3070', 'Expedição': 'CC-3080', 'Utilidades': 'CC-3090',
    };

    const ativos = ativosSeed.map((a, i) => {
      const ehAlugado = i % 11 === 0 || i === 15;
      const sisSub = sistemaPorArea[a[1]] || ['Sistema Geral', 'Subsistema Geral'];
      return {
        id: uid('at'),
        tag: `AT-${String(i + 1).padStart(3, '0')}`,
        nome: a[0],
        area: a[1],
        setor: a[2],
        categoria: a[2],
        criticidade: a[3],
        fabricante: fabricantes[i % fabricantes.length],
        modelo: `MD-${1000 + i * 7}`,
        status: i % 9 === 0 ? 'Parado' : (i % 6 === 0 ? 'Manutenção' : 'Operando'),
        dataInstalacao: `20${14 + (i % 8)}-0${(i % 9) + 1}-1${i % 9}`,
        vidaUtilAnos: 10 + (i % 6),
        valorAquisicao: 40000 + i * 8300,
        horasOperacaoAcumuladas: 12000 + i * 900,
        anexos: [],
        historico: [
          { data: '2026-02-10', tipo: 'Instalação', descricao: 'Ativo cadastrado e comissionado.', os: '-' },
        ],
        // ---- Informações Patrimoniais ----
        familia: familiaPorSetor[a[2]] || 'Equipamento Geral',
        codigoAtivo: `PAT-${String(20260000 + i + 1)}`,
        centroCusto: centroCustoPorArea[a[1]] || 'CC-3000',
        centroTrabalho: centroTrabalhoPorSetor[a[2]] || 'Manutenção Geral',
        planta: 'Planta Industrial FertGrow — Unidade 01',
        sistema: sisSub[0],
        subsistema: sisSub[1],
        localizacao: `${a[1]} — Nível ${1 + (i % 3)}`,
        proprietario: ehAlugado ? 'Locadora Industrial Nordeste LTDA' : 'FertGrow Insumos Agrícolas S.A.',
        proprio: !ehAlugado,
        terceiro: false,
        alugado: ehAlugado,
        contaContabil: `1.2.3.0${1 + (i % 4)}.${String(i + 1).padStart(3, '0')}`,
        // ---- Cadastro do Ativo (ficha do bem) ----
        tipoModelo: ['Nacional', 'Importado', 'Nacional Reforçado', 'Standard'][i % 4],
        serie: `SN-${100000 + i * 37}`,
        instalacao: true,
        unidade: 'un',
        produtoAbastecido: a[0].includes('Empilhadeira') ? 'Bateria Elétrica' : (a[0].includes('Compressor') ? 'Energia Elétrica' : '—'),
        percentualManutencao: 2 + (i % 5),
        percentualSeguroLicenciamento: 1 + (i % 3),
        valorPresente: Math.round((40000 + i * 8300) * 0.75),
        valorFaturado: Math.round((40000 + i * 8300) * 1.05),
        // ---- Árvore de Ativos (grupos / bens / sub-bens) ----
        pastaId: null, // preenchido abaixo, após a criação dos grupos por área
        parentAtivoId: null,
      };
    });

    // ---- Pastas (organização em árvore: Planta > Área) ----
    const pastaPlanta = { id: uid('pa'), nome: 'Planta Industrial FertGrow — Unidade 01', parentId: null };
    const pastasArea = areas.map(area => ({ id: uid('pa'), nome: area, parentId: pastaPlanta.id }));
    const pastas = [pastaPlanta, ...pastasArea];
    ativos.forEach(at => {
      const pastaDaArea = pastasArea.find(p => p.nome === at.area);
      at.pastaId = pastaDaArea ? pastaDaArea.id : pastaPlanta.id;
    });

    // ---- Componentes de exemplo, aninhados sob alguns equipamentos ----
    const componentesSeed = [
      [0, 'Motor de Acionamento Principal', 'Equipamento Elétrico'],
      [0, 'Rolamento do Eixo Principal', 'Componente Mecânico'],
      [2, 'Redutor de Velocidade', 'Equipamento Mecânico'],
      [2, 'Pás do Misturador', 'Componente Mecânico'],
      [4, 'Queimador a Gás', 'Equipamento Térmico'],
      [11, 'Válvula de Alívio', 'Componente de Instrumentação'],
      [14, 'Bico Dosador', 'Componente Mecânico'],
    ];
    const componentes = componentesSeed.map((c, i) => {
      const pai = ativos[c[0]];
      return {
        id: uid('at'),
        tag: `${pai.tag}-C${String(i + 1).padStart(2, '0')}`,
        nome: c[1],
        area: pai.area, setor: pai.setor, categoria: pai.setor, criticidade: pai.criticidade,
        fabricante: pai.fabricante, modelo: `${pai.modelo}-C${i + 1}`,
        status: 'Operando', dataInstalacao: pai.dataInstalacao, vidaUtilAnos: 6,
        valorAquisicao: 3500 + i * 900, horasOperacaoAcumuladas: Math.round(pai.horasOperacaoAcumuladas * 0.6),
        anexos: [], historico: [{ data: '2026-02-10', tipo: 'Instalação', descricao: 'Componente cadastrado sob o equipamento pai.', os: '-' }],
        familia: c[2], codigoAtivo: `${pai.codigoAtivo}-C${i + 1}`, centroCusto: pai.centroCusto, centroTrabalho: pai.centroTrabalho,
        planta: pai.planta, sistema: pai.sistema, subsistema: pai.subsistema, localizacao: pai.localizacao,
        proprietario: pai.proprietario, proprio: pai.proprio, terceiro: pai.terceiro, alugado: pai.alugado,
        contaContabil: pai.contaContabil,
        tipoModelo: pai.tipoModelo, serie: `${pai.serie}-${i + 1}`, instalacao: true,
        unidade: ['un', 'jogo', 'par', 'kit'][i % 4], produtoAbastecido: '—',
        percentualManutencao: pai.percentualManutencao, percentualSeguroLicenciamento: pai.percentualSeguroLicenciamento,
        valorPresente: Math.round((3500 + i * 900) * 0.75), valorFaturado: Math.round((3500 + i * 900) * 1.05),
        pastaId: null, parentAtivoId: pai.id,
      };
    });
    ativos.push(...componentes);

    // Demonstra profundidade ilimitada: sub-itens sob um componente já aninhado.
    const rolamentoPrincipal = componentes[1]; // 'Rolamento do Eixo Principal'
    const subItensSeed = [
      ['Anel Interno', 'Peça de Reposição'],
      ['Anel Externo', 'Peça de Reposição'],
      ['Esfera/Rolete', 'Peça de Reposição'],
    ];
    const subItens = subItensSeed.map((s, i) => ({
      id: uid('at'),
      tag: `${rolamentoPrincipal.tag}-${String(i + 1).padStart(2, '0')}`,
      nome: s[0],
      area: rolamentoPrincipal.area, setor: rolamentoPrincipal.setor, categoria: rolamentoPrincipal.setor,
      criticidade: rolamentoPrincipal.criticidade, fabricante: rolamentoPrincipal.fabricante, modelo: `${rolamentoPrincipal.modelo}-${i + 1}`,
      status: 'Operando', dataInstalacao: rolamentoPrincipal.dataInstalacao, vidaUtilAnos: 4,
      valorAquisicao: 450 + i * 80, horasOperacaoAcumuladas: Math.round(rolamentoPrincipal.horasOperacaoAcumuladas * 0.8),
      anexos: [], historico: [{ data: '2026-02-10', tipo: 'Instalação', descricao: 'Sub-item cadastrado sob o componente pai.', os: '-' }],
      familia: s[1], codigoAtivo: `${rolamentoPrincipal.codigoAtivo}-${i + 1}`, centroCusto: rolamentoPrincipal.centroCusto,
      centroTrabalho: rolamentoPrincipal.centroTrabalho, planta: rolamentoPrincipal.planta, sistema: rolamentoPrincipal.sistema,
      subsistema: rolamentoPrincipal.subsistema, localizacao: rolamentoPrincipal.localizacao,
      proprietario: rolamentoPrincipal.proprietario, proprio: rolamentoPrincipal.proprio, terceiro: rolamentoPrincipal.terceiro,
      alugado: rolamentoPrincipal.alugado, contaContabil: rolamentoPrincipal.contaContabil,
      tipoModelo: rolamentoPrincipal.tipoModelo, serie: `${rolamentoPrincipal.serie}-${i + 1}`, instalacao: true,
      unidade: 'un', produtoAbastecido: '—',
      percentualManutencao: 0, percentualSeguroLicenciamento: 0,
      valorPresente: Math.round((450 + i * 80) * 0.75), valorFaturado: Math.round((450 + i * 80) * 1.05),
      pastaId: null, parentAtivoId: rolamentoPrincipal.id,
    }));
    ativos.push(...subItens);

    const motores = ativos.slice(0, ativosSeed.length).filter((_, i) => i % 2 === 0).map((at, i) => ({
      id: uid('mo'),
      tag: `MOT-${String(i + 1).padStart(3, '0')}`,
      codigoInterno: '',
      ativoId: at.id,
      ativoTexto: '',
      equipamentosCompativeis: '',
      tipo: 'Motor',
      fabricante: 'WEG',
      modelo: `W22-${100 + i * 3}`,
      potenciaCV: [7.5, 10, 15, 20, 25, 30, 40, 50, 60][i % 9],
      tensaoV: 380,
      correnteA: 12 + i * 2,
      rpm: [1160, 1750, 3500][i % 3],
      status: ['Operação', 'Operação', 'Reserva', 'Oficina', 'Estoque'][i % 5],
      localAtual: at.nome,
      dataInstalacao: at.dataInstalacao,
      dataAquisicao: at.dataInstalacao,
      valorAquisicao: 4500 + i * 620,
      depreciacaoPercentual: 10,
      statusManutencao: ['Em Dia', 'Em Dia', 'Pendente', 'Em Manutenção', 'Atrasada'][i % 5],
      redutorFabricante: i % 3 === 0 ? ['SEW', 'Falk', 'Bonfiglioli'][i % 3] : '',
      redutorCodigoInterno: '',
      redutorTag: '',
      redutorModelo: i % 3 === 0 ? `K${77 + i}` : '',
      relacaoReducao: i % 3 === 0 ? [10, 15, 20, 25][i % 4] : null,
      rpmSaida: i % 3 === 0 ? Math.round([1160, 1750, 3500][i % 3] / [10, 15, 20, 25][i % 4]) : null,
      torqueSaidaNm: i % 3 === 0 ? 200 + i * 25 : null,
      historicoTrocas: i % 4 === 0 ? [
        { data: '2025-11-02', de: 'Estoque', para: 'Operação', motivo: 'Substituição por falha de rolamento', os: 'OS-0044' },
      ] : [],
      manutencoes: i % 3 === 0 ? [
        { id: uid('mm'), data: '2026-04-12', valor: 380 + i * 15, numeroNF: `NF-${88000 + i}`, descricao: 'Troca de rolamentos e revisão de ventilação.' },
        { id: uid('mm'), data: '2026-06-20', valor: 210 + i * 10, numeroNF: `NF-${89500 + i}`, descricao: 'Lubrificação e balanceamento.' },
      ] : [],
      documentos: [],
      nfEntradaDocId: null,
      numeroNfEntrada: '',
      manutencaoExterna: { motor: null, redutor: null },
      historicoManutencaoExterna: [],
      manutencaoPeriodicidadeDias: null,
      manutencaoProximaData: null,
    }));

    // Estoque começa vazio — os itens vêm da importação da planilha do ERP
    // (Produto, Armazém, Descrição, Saldo, Custo, Grupo, etc. — ver Importacao.abrirModalImportEstoque).
    const estoque = [];

    // Ordens de Serviço distribuídas nas 52 semanas do ano
    const tipos = ['Preventiva', 'Preventiva', 'Preventiva', 'Corretiva', 'Preditiva', 'Inspeção'];
    const prioridades = ['Baixa', 'Média', 'Alta', 'Urgente'];
    const statusList = ['Concluída', 'Concluída', 'Concluída', 'Aberta', 'Em Andamento', 'Aguardando Peça'];
    const colaboradores = ['João Silva', 'Marcos Souza', 'Paulo Lima', 'Ana Ferreira', 'Rafael Costa', 'Elias Nunes'];
    const equipamentosOS = ativos.filter(a => !a.parentAtivoId);

    const ordens = [];
    let counter = 1;
    for (let semana = 1; semana <= 52; semana++) {
      const qtdOS = 1 + (semana % 4); // 1 a 4 OS por semana
      for (let k = 0; k < qtdOS; k++) {
        const ativo = equipamentosOS[(semana * 3 + k) % equipamentosOS.length];
        const tipo = tipos[(semana + k) % tipos.length];
        const isPast = semana <= 29; // "hoje" ~ semana 29 do ano corrente
        const status = isPast ? statusList[(semana + k) % statusList.length] : 'Aberta';
        const horasPrevistas = tipo === 'Corretiva' ? 3 + (k % 5) : 1.5 + (k % 3);
        const horasReais = status === 'Concluída' ? horasPrevistas + (((semana + k) % 3) - 1) * 0.5 : 0;
        const paradaPlanta = tipo !== 'Inspeção' && ativo.criticidade === 'A' && k % 2 === 0;
        ordens.push({
          id: uid('os'),
          numero: `OS-${String(counter).padStart(4, '0')}`,
          tipo,
          ativoId: ativo.id,
          descricao: `${tipo} em ${ativo.nome} — ${['Verificação geral', 'Troca de componente', 'Lubrificação e ajuste', 'Análise de vibração', 'Reparo elétrico'][(semana + k) % 5]}`,
          prioridade: prioridades[(semana + k) % 4],
          status,
          solicitante: colaboradores[(semana) % colaboradores.length],
          responsavel: colaboradores[(semana + k + 1) % colaboradores.length],
          semana,
          dataAbertura: weekToDate(semana),
          dataProgramada: weekToDate(semana),
          dataConclusao: status === 'Concluída' ? weekToDate(semana) : null,
          horasPrevistas: Math.max(1, horasPrevistas),
          horasReais: Math.max(0, horasReais),
          paradaPlanta,
          horasParada: paradaPlanta ? 2 + (k % 4) : 0,
          checklist: [
            { item: 'Bloqueio e sinalização (LOTO)', feito: status === 'Concluída' },
            { item: 'Inspeção visual do equipamento', feito: status === 'Concluída' },
            { item: 'Execução do serviço planejado', feito: status === 'Concluída' },
            { item: 'Teste funcional pós-serviço', feito: status === 'Concluída' },
          ],
          materiais: [],
          maoDeObra: [
            { colaborador: colaboradores[(semana + k + 1) % colaboradores.length], horas: Math.max(1, horasReais || horasPrevistas), custoHora: 65 },
          ],
          fotos: [],
          assinatura: null,
          observacoes: '',
        });
        counter++;
      }
    }

    const lubrificacao = ativos.slice(0, 10).map((at, i) => ({
      id: uid('lu'),
      ativoId: at.id,
      ponto: ['Mancal principal', 'Redutor', 'Caixa de engrenagens', 'Mancal do eixo'][i % 4],
      lubrificante: i % 2 === 0 ? 'Graxa Industrial EP2' : 'Óleo Hidráulico ISO 68',
      periodicidadeDias: [15, 30, 60, 90][i % 4],
      ultimaData: '2026-06-01',
      proximaData: '2026-07-30',
    }));

    const inspecoes = ativos.slice(0, 12).map((at, i) => ({
      id: uid('in'),
      ativoId: at.id,
      tipo: ['Análise de Vibração', 'Termografia', 'Inspeção Visual', 'Ensaio de Isolamento'][i % 4],
      periodicidadeDias: [30, 60, 15, 90][i % 4],
      ultimaData: '2026-06-15',
      proximaData: '2026-08-01',
      resultado: ['Normal', 'Normal', 'Atenção', 'Normal'][i % 4],
    }));

    const usuarios = [
      { id: uid('us'), nome: 'Carla Menezes', email: 'carla.menezes@fertgrow.com', perfil: 'Administrador', ativo: true },
      { id: uid('us'), nome: 'Diego Ramos', email: 'diego.ramos@fertgrow.com', perfil: 'PCM', ativo: true },
      { id: uid('us'), nome: 'Fernanda Alves', email: 'fernanda.alves@fertgrow.com', perfil: 'Supervisor', ativo: true },
      { id: uid('us'), nome: 'João Silva', email: 'joao.silva@fertgrow.com', perfil: 'Mecânico', ativo: true },
      { id: uid('us'), nome: 'Marcos Souza', email: 'marcos.souza@fertgrow.com', perfil: 'Eletricista', ativo: true },
      { id: uid('us'), nome: 'Rafael Costa', email: 'rafael.costa@fertgrow.com', perfil: 'Mecânico', ativo: false },
    ];

    // ---- Locações: contratos de aluguel dos ativos marcados como "Alugado" ----
    const ativosAlugados = ativos.filter(a => a.alugado && !a.parentAtivoId);
    const locacoes = ativosAlugados.map((a, i) => ({
      id: uid('lo'),
      bem: a.nome,
      locador: a.proprietario || 'Locadora Industrial Nordeste LTDA',
      valorMensal: 3200 + i * 850,
      dataInicio: ['2025-09-01', '2025-11-15', '2026-03-01'][i % 3],
      dataFim: i % 2 === 0 ? null : '2026-12-31',
      observacoes: i % 2 === 0
        ? 'Contrato por prazo indeterminado, renovação automática mensal.'
        : 'Contrato com vigência definida — revisar renovação próximo do vencimento.',
    }));

    return {
      ativos, pastas, motores, estoque, ordens, lubrificacao, inspecoes, usuarios, locacoes,
      programacao: [],
      solicitacoesServico: [],
      planosPreventivos: [],
      solicitacoesCompra: [],
      projetos: [],
      servicos: [],
      contasContabeis: [],
      prestadores: [
        { id: uid('pr'), nome: 'Retífica Rolamentos Sul', cnpj: '12.345.678/0001-90', telefone: '(11) 3456-7890', email: 'contato@retificasul.com.br', especialidade: 'Retífica de Motores', endereco: '', ativo: true },
        { id: uid('pr'), nome: 'Motores & Cia Manutenção Industrial', cnpj: '98.765.432/0001-10', telefone: '(11) 2345-6789', email: 'comercial@motoresecia.com.br', especialidade: 'Motores e Redutores', endereco: '', ativo: true },
      ],
      config: {
        anoBase: 2026,
        tamanhoEquipe: 6,
        horasDiaPadrao: 8,
        diasUteisSemana: 5,
        custoHoraMedio: 65,
        semanaAtual: 29,
      },
    };
  }

  function weekToDate(week) {
    const base = new Date(2026, 0, 1);
    base.setDate(base.getDate() + (week - 1) * 7);
    return base.toISOString().slice(0, 10);
  }

  // "Hoje" de verdade (data real do dispositivo), normalizado pra meia-noite.
  // `db.config.semanaAtual` é a semana operacional do Plano 52 Semanas — um
  // contador de planejamento que alguém precisa avançar manualmente toda
  // semana, e que pode ficar desatualizado (ex: parado há 2 meses). Cálculos
  // de vencimento/status (locação encerrada, validade de motor etc.) não podem
  // depender dele, senão ficam travados na última vez que alguém lembrou de
  // avançar a semana — precisam do relógio real.
  function hojeReal() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        migrate(parsed);
        return parsed;
      }
    } catch (e) { console.warn('Falha ao carregar DB local, recriando seed.', e); }
    const fresh = seed();
    localStorage.setItem(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }

  // Compatibilidade com bancos salvos antes da árvore de grupos/bens existir.
  function migrate(d) {
    if (!d.pastas) d.pastas = [];
    // Auto-recuperação: se as pastas ficarem vazias (ex: um computador com dados
    // desatualizados sincronizou por cima), mas ainda existem bens de raiz, recria
    // os grupos automaticamente a partir do próprio TAG de cada um — isso roda em
    // QUALQUER computador que carregar os dados, sem precisar de comando manual.
    if (d.pastas.length === 0) {
      const raizesSemPasta = (d.ativos || []).filter(a => !a.parentAtivoId);
      if (raizesSemPasta.length) {
        const pastasNovas = {};
        raizesSemPasta.forEach(a => {
          const grupo = (a.tag || '').split('-')[0] || 'Sem Grupo';
          if (!pastasNovas[grupo]) pastasNovas[grupo] = { id: uid('pa'), nome: grupo, parentId: null };
          a.pastaId = pastasNovas[grupo].id;
        });
        d.pastas = Object.values(pastasNovas);
      }
    }
    if (!d.locacoes) d.locacoes = [];
    if (!d.programacao) d.programacao = [];
    if (!d.prestadores) d.prestadores = [];
    if (!d.solicitacoesCompra) d.solicitacoesCompra = [];
    if (!d.solicitacoesServico) d.solicitacoesServico = [];
    if (!d.planosPreventivos) d.planosPreventivos = [];
    if (!d.projetos) d.projetos = [];
    if (!d.servicos) d.servicos = [];
    if (!d.contasContabeis) d.contasContabeis = [];
    // Estoque foi trocado para o modelo da planilha do ERP (Produto, Armazém,
    // Grupo, Saldo, Custo, FIFO1...) — zera uma única vez o estoque fictício/antigo
    // de qualquer banco já salvo, para começar limpo e pronto para importação.
    if (!d._estoqueResetV2) {
      d.estoque = [];
      d._estoqueResetV2 = true;
    }
    (d.estoque || []).forEach(e => {
      if (e.armazem === undefined) e.armazem = e.localizacao || '';
      if (e.grupo === undefined) e.grupo = e.categoria || '';
      if (e.codProduto === undefined) e.codProduto = '';
      if (e.custoUnitarioFifo1 === undefined) e.custoUnitarioFifo1 = null;
      if (e.saldoAtualizado === undefined) e.saldoAtualizado = Math.round((e.qtdAtual || 0) * (e.custoUnitario || 0) * 100) / 100;
      if (e.statusSaldo === undefined) e.statusSaldo = '';
    });
    (d.ordens || []).forEach(o => {
      o.materiais = (o.materiais || []).filter(m => (d.estoque || []).some(e => e.id === m.estoqueId));
    });
    (d.programacao || []).forEach(p => {
      (p.arquivos || []).forEach(a => {
        if (a.ordens === undefined) {
          a.ordens = a.dadosOS ? [{ id: uid('os'), ...a.dadosOS, concluida: false }] : [];
        }
        delete a.dadosOS;
        (a.ordens || []).forEach(o => {
          if (o.tipo === undefined) o.tipo = '';
          if (o.cancelada === undefined) o.cancelada = false;
          if (o.motivoCancelamento === undefined) o.motivoCancelamento = '';
        });
      });
    });
    d.locacoes.forEach(l => {
      if (!l.bem && l.ativoId) {
        const a = (d.ativos || []).find(x => x.id === l.ativoId);
        l.bem = a ? a.nome : '';
      }
    });
    (d.ativos || []).forEach(a => {
      if (a.pastaId === undefined) a.pastaId = null;
      if (a.parentAtivoId === undefined) a.parentAtivoId = null;
    });
    (d.motores || []).forEach(m => {
      if (m.dataAquisicao === undefined) m.dataAquisicao = m.dataInstalacao || '';
      // A depreciação passou a contar a partir da instalação, não da aquisição — motores
      // cadastrados antes só tinham data de aquisição preenchida (o formulário nunca pediu
      // instalação); usa a aquisição como melhor estimativa disponível, pra não zerar a
      // depreciação já calculada de ninguém.
      if (!m.dataInstalacao) m.dataInstalacao = m.dataAquisicao || '';
      if (m.valorAquisicao === undefined) m.valorAquisicao = 0;
      if (m.depreciacaoPercentual === undefined) m.depreciacaoPercentual = 10;
      if (m.statusManutencao === undefined) m.statusManutencao = 'Em Dia';
      if (m.manutencoes === undefined) m.manutencoes = [];
      if (m.tipo === undefined) m.tipo = 'Motor';
      if (m.redutorFabricante === undefined) m.redutorFabricante = '';
      if (m.redutorModelo === undefined) m.redutorModelo = '';
      if (m.relacaoReducao === undefined) m.relacaoReducao = null;
      if (m.rpmSaida === undefined) m.rpmSaida = null;
      if (m.torqueSaidaNm === undefined) m.torqueSaidaNm = null;
      if (m.documentos === undefined) m.documentos = [];
      if (m.nfEntradaDocId === undefined) m.nfEntradaDocId = null;
      if (m.numeroNfEntrada === undefined) m.numeroNfEntrada = '';
      if (m.ativoTexto === undefined) m.ativoTexto = '';
      if (m.codigoInterno === undefined) m.codigoInterno = '';
      if (m.redutorCodigoInterno === undefined) m.redutorCodigoInterno = '';
      if (m.redutorTag === undefined) m.redutorTag = '';
      if (m.equipamentosCompativeis === undefined) m.equipamentosCompativeis = '';
      if (m.manutencaoExterna === undefined || m.manutencaoExterna === null) {
        m.manutencaoExterna = { motor: null, redutor: null };
      } else if (m.manutencaoExterna.motor === undefined) {
        // formato antigo: um único caso -> migra para dentro de "motor"
        m.manutencaoExterna = { motor: m.manutencaoExterna, redutor: null };
      }
      ['motor', 'redutor'].forEach(comp => {
        const caso = m.manutencaoExterna[comp];
        if (caso && caso.orcamentoValidado === undefined) caso.orcamentoValidado = null;
        if (caso && caso.valorAprovado === undefined) caso.valorAprovado = null;
        // Renomeação de status (versão anterior do fluxo de manutenção externa).
        if (caso && caso.status === 'Em Manutenção Externa') caso.status = 'Aguardando Validação';
        if (caso && caso.status === 'Orçamento Aprovado - Aguardando Retorno') caso.status = 'Manutenção Iniciada';
      });
      if (m.historicoManutencaoExterna === undefined) m.historicoManutencaoExterna = [];
      m.historicoManutencaoExterna.forEach(h => { if (h.componente === undefined) h.componente = 'motor'; });
      if (m.manutencaoPeriodicidadeDias === undefined) m.manutencaoPeriodicidadeDias = null;
      if (m.manutencaoProximaData === undefined) m.manutencaoProximaData = null;
    });

    // "Motorredutor" deixou de ser um tipo próprio: motor e redutor agora são cada um seu
    // próprio cadastro (histórico de manutenção separado), "conjunto" é só os dois
    // compartilharem o mesmo Equipamento. Divide, uma única vez, todo registro antigo
    // tipo:'Motorredutor' em dois: o original vira Motor puro (mantém id e histórico
    // intactos), e nasce um novo registro Redutor herdando o mesmo Equipamento/status.
    if (!d._splitMotorredutorV1) {
      const novosRedutores = [];
      (d.motores || []).forEach(m => {
        if (m.tipo !== 'Motorredutor') return;
        // O caso ativo de manutenção externa do componente "redutor" (e o histórico já
        // fechado tagueado como tal) pertencem ao redutor, não ao motor — têm que ir junto
        // pro registro novo, senão ficam "presos" num slot que o Motor não olha mais.
        const casoRedutorAtivo = m.manutencaoExterna?.redutor || null;
        const historicoRedutor = (m.historicoManutencaoExterna || []).filter(h => h.componente === 'redutor');
        const historicoMotorRestante = (m.historicoManutencaoExterna || []).filter(h => h.componente !== 'redutor');
        novosRedutores.push({
          id: uid('mo'),
          tag: m.redutorTag || `${m.tag}-RED`,
          codigoInterno: m.redutorCodigoInterno || '',
          ativoId: m.ativoId, ativoTexto: m.ativoTexto,
          equipamentosCompativeis: '',
          tipo: 'Redutor',
          fabricante: m.redutorFabricante || '', modelo: m.redutorModelo || '',
          potenciaCV: null, tensaoV: null, correnteA: null, rpm: null,
          status: m.status, localAtual: m.localAtual,
          dataInstalacao: m.dataInstalacao, dataAquisicao: m.dataAquisicao,
          valorAquisicao: 0, depreciacaoPercentual: m.depreciacaoPercentual,
          statusManutencao: 'Em Dia',
          relacaoReducao: m.relacaoReducao, rpmSaida: m.rpmSaida, torqueSaidaNm: m.torqueSaidaNm,
          historicoTrocas: [], manutencoes: [], documentos: [],
          nfEntradaDocId: null, numeroNfEntrada: '',
          manutencaoExterna: { motor: null, redutor: casoRedutorAtivo },
          historicoManutencaoExterna: historicoRedutor,
          manutencaoPeriodicidadeDias: null, manutencaoProximaData: null,
        });
        m.tipo = 'Motor';
        m.redutorTag = ''; m.redutorCodigoInterno = ''; m.redutorFabricante = ''; m.redutorModelo = '';
        m.manutencaoExterna = { motor: m.manutencaoExterna?.motor || null, redutor: null };
        m.historicoManutencaoExterna = historicoMotorRestante;
      });
      (d.motores || []).push(...novosRedutores);
      d._splitMotorredutorV1 = true;
    }

    // Conserto pontual: a primeira versão da divisão acima (v1) deixava o caso de
    // manutenção externa do redutor "preso" no registro antigo (agora tipo Motor), que só
    // olha o slot .motor — some da tela mesmo sem estar perdido. Aqui procura qualquer
    // registro tipo Motor com algo em .redutor e devolve pro Redutor que nasceu junto dele
    // (mesmo Equipamento), uma única vez.
    if (!d._fixManutencaoExternaRedutorV1) {
      (d.motores || []).forEach(m => {
        if (m.tipo === 'Redutor') return;
        const casoPreso = m.manutencaoExterna?.redutor;
        const historicoPreso = (m.historicoManutencaoExterna || []).filter(h => h.componente === 'redutor');
        if (!casoPreso && !historicoPreso.length) return;
        const chave = m.ativoId || m.ativoTexto;
        const par = (d.motores || []).find(o => o.id !== m.id && o.tipo === 'Redutor' && (o.ativoId || o.ativoTexto) === chave && chave);
        if (!par) return; // sem redutor par pra devolver — deixa como está, não perde o caso
        if (casoPreso) par.manutencaoExterna = { motor: null, redutor: casoPreso };
        if (historicoPreso.length) par.historicoManutencaoExterna = [...(par.historicoManutencaoExterna || []), ...historicoPreso];
        m.manutencaoExterna = { motor: m.manutencaoExterna?.motor || null, redutor: null };
        m.historicoManutencaoExterna = (m.historicoManutencaoExterna || []).filter(h => h.componente !== 'redutor');
      });
      d._fixManutencaoExternaRedutorV1 = true;
    }
  }

  function persist() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    document.dispatchEvent(new CustomEvent('db:changed'));
  }

  function resetSeed() {
    db = seed();
    persist();
  }

  // Generic CRUD -----------------------------------------------------------
  function all(col) { return db[col] || []; }
  function get(col, id) { return (db[col] || []).find(x => x.id === id); }
  function add(col, obj) { obj.id = obj.id || uid(col.slice(0, 2)); db[col].push(obj); persist(); return obj; }
  function addSilent(col, obj) { obj.id = obj.id || uid(col.slice(0, 2)); db[col].push(obj); return obj; }
  function update(col, id, patch) {
    const item = get(col, id);
    if (item) { Object.assign(item, patch); persist(); }
    return item;
  }
  function remove(col, id) {
    db[col] = db[col].filter(x => x.id !== id);
    persist();
  }
  function removerEmLote(col, ids) {
    const idSet = new Set(ids);
    db[col] = db[col].filter(x => !idSet.has(x.id));
    persist();
  }

  // Lookups ------------------------------------------------------------------
  function ativoNome(id) { const a = get('ativos', id); return a ? a.nome : '—'; }
  function ativoTag(id) { const a = get('ativos', id); return a ? a.tag : '—'; }

  // Calculation engine ---------------------------------------------------
  function calcKPIs() {
    const ativos = all('ativos').filter(a => !a.parentAtivoId);
    const ordens = all('ordens');
    const cfg = db.config;

    const osAbertas = ordens.filter(o => o.status === 'Aberta' || o.status === 'Em Andamento' || o.status === 'Aguardando Peça');
    const preventivas = ordens.filter(o => o.tipo === 'Preventiva');
    const corretivas = ordens.filter(o => o.tipo === 'Corretiva');
    const concluidas = ordens.filter(o => o.status === 'Concluída');

    // Backlog: horas pendentes de OS abertas ÷ capacidade semanal da equipe
    const horasPendentes = osAbertas.reduce((s, o) => s + (o.horasPrevistas || 0), 0);
    const capacidadeSemanal = cfg.tamanhoEquipe * cfg.horasDiaPadrao * cfg.diasUteisSemana;
    const backlogSemanas = capacidadeSemanal > 0 ? (horasPendentes / capacidadeSemanal) : 0;

    // MTBF (h) = horas totais de operação acumuladas / nº de falhas (corretivas concluídas)
    const corretivasConcluidas = corretivas.filter(o => o.status === 'Concluída');
    const horasOperacaoTotais = ativos.reduce((s, a) => s + (a.horasOperacaoAcumuladas || 0), 0);
    const mtbf = corretivasConcluidas.length > 0 ? (horasOperacaoTotais / corretivasConcluidas.length) : horasOperacaoTotais;

    // MTTR (h) = soma horas reais de reparo corretivo / nº de corretivas concluídas
    const horasReparoCorretivo = corretivasConcluidas.reduce((s, o) => s + (o.horasReais || o.horasPrevistas || 0), 0);
    const mttr = corretivasConcluidas.length > 0 ? (horasReparoCorretivo / corretivasConcluidas.length) : 0;

    // Disponibilidade = (MTBF / (MTBF + MTTR)) * 100
    const disponibilidade = (mtbf + mttr) > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100;

    // Custos: mão de obra + materiais de todas as OS concluídas
    let custoTotal = 0, custoMO = 0, custoMat = 0;
    ordens.forEach(o => {
      const mo = (o.maoDeObra || []).reduce((s, m) => s + m.horas * m.custoHora, 0);
      const mat = (o.materiais || []).reduce((s, m) => {
        const item = get('estoque', m.estoqueId);
        return s + (item ? item.custoUnitario * m.qtd : 0);
      }, 0);
      custoMO += mo; custoMat += mat; custoTotal += mo + mat;
    });

    return {
      totalAtivos: ativos.length,
      ativosOperando: ativos.filter(a => a.status === 'Operando').length,
      ativosParados: ativos.filter(a => a.status !== 'Operando').length,
      osAbertas: osAbertas.length,
      osTotal: ordens.length,
      preventivas: preventivas.length,
      corretivas: corretivas.length,
      concluidas: concluidas.length,
      backlogHoras: horasPendentes,
      backlogSemanas,
      mtbf, mttr, disponibilidade,
      custoTotal, custoMO, custoMat,
    };
  }

  function calcSemana(numero) {
    const cfg = db.config;
    const ordensSemana = all('ordens').filter(o => o.semana === numero);
    const horasPlanejadas = ordensSemana.reduce((s, o) => s + (o.horasPrevistas || 0), 0);
    const horasDisponiveis = cfg.tamanhoEquipe * cfg.horasDiaPadrao * cfg.diasUteisSemana;
    const cargaPercent = horasDisponiveis > 0 ? (horasPlanejadas / horasDisponiveis) * 100 : 0;
    const paradaPlanta = ordensSemana.some(o => o.paradaPlanta);
    const tempoParadaTotal = ordensSemana.reduce((s, o) => s + (o.horasParada || 0), 0);
    const ativosProgramados = [...new Set(ordensSemana.map(o => o.ativoId))];

    // materiais necessários agregados
    const materiaisMap = {};
    ordensSemana.forEach(o => (o.materiais || []).forEach(m => {
      materiaisMap[m.estoqueId] = (materiaisMap[m.estoqueId] || 0) + m.qtd;
    }));
    const materiaisNecessarios = Object.entries(materiaisMap).map(([estoqueId, qtd]) => {
      const item = get('estoque', estoqueId);
      return { item, qtd, suficiente: item ? item.qtdAtual >= qtd : false };
    });

    let statusSemana = 'Normal';
    if (cargaPercent >= 100) statusSemana = 'Sobrecarregada';
    else if (cargaPercent >= 85) statusSemana = 'Atenção';

    return {
      numero, ordensSemana, horasPlanejadas, horasDisponiveis, cargaPercent,
      paradaPlanta, tempoParadaTotal, ativosProgramados, materiaisNecessarios, statusSemana,
      dataInicio: weekToDate(numero),
    };
  }

  function calcTodasSemanas() {
    const arr = [];
    for (let s = 1; s <= 52; s++) arr.push(calcSemana(s));
    return arr;
  }

  function detectConflitos() {
    const conflitos = [];
    for (let s = 1; s <= 52; s++) {
      const ordensSemana = all('ordens').filter(o => o.semana === s);
      const porAtivo = {};
      ordensSemana.forEach(o => {
        porAtivo[o.ativoId] = porAtivo[o.ativoId] || [];
        porAtivo[o.ativoId].push(o);
      });
      Object.entries(porAtivo).forEach(([ativoId, lista]) => {
        if (lista.length > 1 && lista.some(o => o.paradaPlanta)) {
          conflitos.push({ semana: s, ativoId, ordens: lista });
        }
      });
    }
    return conflitos;
  }

  function estoqueSemSaldo() {
    return all('estoque').filter(e => e.qtdAtual <= 0);
  }

  // ------------------------------------------------------- Motores
  function valorAtualMotor(motor) {
    if (!motor.dataInstalacao || !motor.valorAquisicao) return motor.valorAquisicao || 0;
    const inicio = new Date(motor.dataInstalacao + 'T00:00:00');
    if (isNaN(inicio.getTime())) return motor.valorAquisicao || 0;
    const hoje = hojeReal();
    const anos = Math.max(0, (hoje - inicio) / (365.25 * 86400000));
    const depreciado = motor.valorAquisicao * (motor.depreciacaoPercentual || 0) / 100 * anos;
    return Math.max(0, Math.round(motor.valorAquisicao - depreciado));
  }

  function validadeMotor(motor) {
    if (!motor.dataInstalacao || !motor.depreciacaoPercentual) return { dataValidade: null, diasRestantes: null, status: 'Indefinido' };
    const anos = 100 / motor.depreciacaoPercentual;
    const inicio = new Date(motor.dataInstalacao + 'T00:00:00');
    // Data de instalação inválida/mal formatada (ex: digitada errado por alguém no
    // cadastro) não pode derrubar a tela inteira — trata como validade indefinida.
    if (isNaN(inicio.getTime())) return { dataValidade: null, diasRestantes: null, status: 'Indefinido' };
    const dataValidade = new Date(inicio);
    dataValidade.setFullYear(dataValidade.getFullYear() + Math.floor(anos));
    dataValidade.setMonth(dataValidade.getMonth() + Math.round((anos % 1) * 12));
    const hoje = hojeReal();
    const diasRestantes = Math.round((dataValidade - hoje) / 86400000);
    let status = 'Dentro da Validade';
    if (diasRestantes <= 0) status = 'Vencido';
    else if (diasRestantes <= 90) status = 'Próximo do Vencimento';
    return { dataValidade: dataValidade.toISOString().slice(0, 10), diasRestantes, status };
  }


  function calcLocacoes() {
    const hoje = hojeReal();
    return all('locacoes').map(l => {
      const inicio = new Date(l.dataInicio + 'T00:00:00');
      const dataFimDate = l.dataFim ? new Date(l.dataFim + 'T00:00:00') : null;
      const encerrada = !!(dataFimDate && dataFimDate < hoje);
      const refFim = encerrada ? dataFimDate : hoje;
      let meses = (refFim.getFullYear() - inicio.getFullYear()) * 12 + (refFim.getMonth() - inicio.getMonth()) + 1;
      meses = Math.max(1, meses);
      const diasParaVencer = dataFimDate ? Math.round((dataFimDate - hoje) / 86400000) : null;
      const venceEmBreve = !encerrada && diasParaVencer !== null && diasParaVencer <= 30;
      return {
        ...l,
        custoAcumulado: meses * l.valorMensal,
        mesesAtivos: meses,
        status: encerrada ? 'Encerrada' : (venceEmBreve ? 'A Vencer' : 'Ativa'),
        diasParaVencer,
      };
    });
  }

  function custoMensalLocacoes() {
    return calcLocacoes().filter(l => l.status !== 'Encerrada').reduce((s, l) => s + l.valorMensal, 0);
  }

  // ------------------------------------------------------- Árvore de Ativos
  function caminhoPasta(id) {
    const p = get('pastas', id);
    if (!p) return '';
    return p.parentId ? caminhoPasta(p.parentId) + ' / ' + p.nome : p.nome;
  }

  function removerPasta(id) {
    const pasta = get('pastas', id);
    if (!pasta) return;
    all('pastas').filter(p => p.parentId === id).forEach(p => update('pastas', p.id, { parentId: pasta.parentId }));
    all('ativos').filter(a => a.pastaId === id).forEach(a => update('ativos', a.id, { pastaId: pasta.parentId }));
    remove('pastas', id);
  }

  // Exporta todo o banco local (todas as telas/dados) como texto JSON,
  // para o usuário guardar como backup ou levar para outro computador.
  function exportarBackup() {
    return JSON.stringify(db, null, 2);
  }

  // Importa um backup previamente exportado, substituindo TODOS os dados
  // atuais. Roda a mesma migração usada ao carregar, para aceitar backups
  // de versões um pouco mais antigas do sistema.
  function importarBackup(jsonTexto) {
    const parsed = JSON.parse(jsonTexto);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ativos)) {
      throw new Error('Arquivo de backup inválido.');
    }
    migrate(parsed);
    db = parsed;
    persist();
  }

  // Substitui todo o banco local (usado pela sincronização em nuvem, quando
  // chega uma versão mais nova de outro usuário/computador).
  function substituirDb(novoDb) {
    migrate(novoDb);
    db = novoDb;
    persist();
  }

  return {
    uid, load, persist, resetSeed,
    exportarBackup, importarBackup, substituirDb,
    all, get, add, addSilent, update, remove, removerEmLote,
    ativoNome, ativoTag, weekToDate,
    calcKPIs, calcSemana, calcTodasSemanas, detectConflitos, estoqueSemSaldo,
    calcLocacoes, custoMensalLocacoes, valorAtualMotor, validadeMotor,
    caminhoPasta, removerPasta,
    get config() { return db.config; },
    set config(v) { db.config = v; persist(); },
  };
})();
