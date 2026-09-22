/* ==========================================================================
   FertGrow CMMS — Sincronização em Nuvem (Supabase)
   Permite que várias pessoas, em computadores diferentes, compartilhem os
   mesmos dados em tempo real, usando uma única tabela no Supabase como
   "espelho" do banco local (mesmo formato usado no Backup/Restauração).
   Sem configuração, o sistema continua funcionando 100% localmente.
   ========================================================================== */

const SYNC_CONFIG_KEY = 'fertgrow_sync_config_v1';
const SYNC_LOCAL_CHANGE_KEY = 'fertgrow_last_local_change';
const SYNC_TABLE = 'fertgrow_db';
const SYNC_ROW_ID = 1;
const SYNC_CONFIG_PADRAO = {
  url: 'https://woabzpjzjkaqkjmzsiqj.supabase.co',
  anonKey: 'sb_publishable_kAbXzgAybK885fnyV2-7kQ_6B623rg7',
  ativo: true
};

let _syncClient = null;
let _syncChannel = null;
let _syncAplicandoRemoto = false;
let _syncUltimoEnviadoJSON = null;
let _syncDebounceTimer = null;

// Espelho de mão única (CMMS -> Supabase) de db.estoque numa tabela com colunas
// de verdade, para que outro site possa consultar o estoque via REST sem
// precisar baixar/parsear o blob inteiro de fertgrow_db. Não sincroniza de
// volta para o CMMS — é só escrita.
const SYNC_ESTOQUE_TABLE = 'estoque';
let _syncEstoqueIdsRemotos = null;
let _syncEstoqueUltimoEnviadoJSON = null;
let _syncEstoqueDebounceTimer = null;

function syncGetConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function syncSalvarConfig(config) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}
function syncLimparConfig() {
  localStorage.removeItem(SYNC_CONFIG_KEY);
}
function syncStatus() {
  const config = syncGetConfig();
  return { conectado: !!(config && config.url && config.anonKey && config.ativo), config };
}

// Marca quando foi a última alteração feita AQUI, pelo usuário desta tela (não
// conta alterações aplicadas a partir da nuvem). Usado para nunca sobrescrever
// silenciosamente uma edição local que ainda não foi enviada com sucesso.
function syncMarcarAlteracaoLocal() {
  if (_syncAplicandoRemoto) return;
  try { localStorage.setItem(SYNC_LOCAL_CHANGE_KEY, String(Date.now())); } catch (e) {}
}
document.addEventListener('db:changed', syncMarcarAlteracaoLocal);

function syncUltimaAlteracaoLocal() {
  return Number(localStorage.getItem(SYNC_LOCAL_CHANGE_KEY) || 0);
}

// Conecta pela primeira vez: testa a chave, garante que a linha compartilhada
// exista (criando com os dados locais atuais se ainda não existir, ou
// trazendo os dados já existentes se alguém já configurou antes).
async function syncConectar(url, anonKey) {
  if (typeof supabase === 'undefined') throw new Error('Biblioteca do Supabase não carregou. Verifique sua internet e tente novamente.');
  const client = supabase.createClient(url, anonKey);

  const { data, error } = await client.from(SYNC_TABLE).select('data').eq('id', SYNC_ROW_ID).maybeSingle();
  if (error) throw error;

  if (!data) {
    const dbAtual = JSON.parse(Store.exportarBackup());
    const { error: insertError } = await client.from(SYNC_TABLE).insert({ id: SYNC_ROW_ID, data: dbAtual });
    if (insertError) throw insertError;
    _syncUltimoEnviadoJSON = JSON.stringify(dbAtual);
  } else {
    _syncAplicandoRemoto = true;
    Store.substituirDb(data.data);
    _syncAplicandoRemoto = false;
    _syncUltimoEnviadoJSON = JSON.stringify(data.data);
  }

  syncSalvarConfig({ url, anonKey, ativo: true });
  syncIniciarCliente();
}

function syncDesconectar() {
  syncLimparConfig();
  if (_syncChannel) { try { _syncChannel.unsubscribe(); } catch (e) {} _syncChannel = null; }
  document.removeEventListener('db:changed', syncEnviarAlteracoes);
  document.removeEventListener('db:changed', syncEstoqueEnviar);
  clearTimeout(_syncEstoqueDebounceTimer);
  _syncEstoqueIdsRemotos = null;
  _syncEstoqueUltimoEnviadoJSON = null;
  _syncClient = null;
}

// Usado no boot do app: se já existe configuração salva neste navegador, só
// inicia o cliente normalmente. Se não existe (primeiro acesso / navegador
// novo), conecta automaticamente usando a configuração padrão do arquivo,
// sem exigir que a pessoa digite URL/chave na tela.
async function syncGarantirConectado() {
  const config = syncGetConfig();
  if (config) {
    syncIniciarCliente();
    return;
  }
  if (!SYNC_CONFIG_PADRAO.ativo || !SYNC_CONFIG_PADRAO.url || !SYNC_CONFIG_PADRAO.anonKey) return;
  try {
    await syncConectar(SYNC_CONFIG_PADRAO.url, SYNC_CONFIG_PADRAO.anonKey);
  } catch (e) {
    console.warn('Sincronização automática não iniciada:', e);
  }
}

function syncEstoqueLinha(item) {
  return {
    id: item.id,
    codigo: item.codigo || '',
    cod_produto: item.codProduto || '',
    armazem: item.armazem || '',
    descricao: item.descricao || '',
    grupo: item.grupo || '',
    unidade: item.unidade || 'un',
    qtd_atual: item.qtdAtual || 0,
    custo_unitario: item.custoUnitario || 0,
    custo_unitario_fifo1: item.custoUnitarioFifo1 == null ? null : item.custoUnitarioFifo1,
    saldo_atualizado: item.saldoAtualizado || 0,
    status_saldo: item.statusSaldo || '',
    updated_at: new Date().toISOString()
  };
}

// Ao contrário do envio do blob inteiro, não checa _syncAplicandoRemoto: essa
// tabela não tem escuta em tempo real nem aplica nada de volta no CMMS, então
// não existe o loop remoto->local->remoto que aquela trava evita ali.
function syncEstoqueEnviar() {
  if (!_syncClient) return;
  clearTimeout(_syncEstoqueDebounceTimer);
  _syncEstoqueDebounceTimer = setTimeout(async () => {
    const estoqueAtual = Store.all('estoque');
    const json = JSON.stringify(estoqueAtual);
    if (json === _syncEstoqueUltimoEnviadoJSON) return;
    try {
      if (estoqueAtual.length) {
        const linhas = estoqueAtual.map(syncEstoqueLinha);
        const { error } = await _syncClient.from(SYNC_ESTOQUE_TABLE).upsert(linhas, { onConflict: 'id' });
        if (error) throw error;
      }
      const idsAtuais = new Set(estoqueAtual.map(e => e.id));
      const idsParaRemover = [...(_syncEstoqueIdsRemotos || [])].filter(id => !idsAtuais.has(id));
      if (idsParaRemover.length) {
        const { error: delError } = await _syncClient.from(SYNC_ESTOQUE_TABLE).delete().in('id', idsParaRemover);
        if (delError) throw delError;
      }
      _syncEstoqueIdsRemotos = idsAtuais;
      _syncEstoqueUltimoEnviadoJSON = json;
    } catch (e) {
      console.warn('Falha ao sincronizar tabela estoque:', e);
    }
  }, 500);
}

// Roda uma vez por conexão: busca os ids que já existem na tabela remota (em
// vez de confiar em algo salvo localmente, que poderia estar desatualizado se
// a tabela foi editada por fora) e força um envio imediato para popular/
// reconciliar a tabela com o estado local atual.
async function syncEstoqueIniciar() {
  try {
    const { data, error } = await _syncClient.from(SYNC_ESTOQUE_TABLE).select('id');
    if (error) throw error;
    _syncEstoqueIdsRemotos = new Set((data || []).map(r => r.id));
  } catch (e) {
    console.warn('Falha ao consultar estado remoto da tabela estoque:', e);
    _syncEstoqueIdsRemotos = new Set();
  }
  document.removeEventListener('db:changed', syncEstoqueEnviar);
  document.addEventListener('db:changed', syncEstoqueEnviar);
  syncEstoqueEnviar();
}

function syncIniciarCliente() {
  if (_syncClient) return; // já iniciado, evita duplicar assinatura em tempo real
  const config = syncGetConfig();
  if (!config || !config.ativo || typeof supabase === 'undefined') return;
  _syncClient = supabase.createClient(config.url, config.anonKey);
  syncEstoqueIniciar();

  // Busca o estado atual da nuvem já ao conectar — sem isso, ao abrir a página
  // com uma conexão já configurada, o sistema só ficava escutando mudanças
  // feitas DAQUI PRA FRENTE, e nunca pegava o que outra pessoa já tinha
  // enviado antes desta página ser aberta.
  //
  // IMPORTANTE: nunca sobrescrever o banco local às cegas aqui. Se este
  // navegador tem alterações locais mais recentes que a última vez que a
  // nuvem foi atualizada (ex: editou algo e fechou antes do envio terminar,
  // ou ficou sem internet), enviamos o local para a nuvem em vez de substituí-lo
  // — um bug anterior aqui já apagou dados reais de um dia de trabalho.
  _syncClient.from(SYNC_TABLE).select('data, updated_at').eq('id', SYNC_ROW_ID).maybeSingle().then(({ data, error }) => {
    if (error || !data) { if (error) console.warn('Falha ao buscar dados atuais da nuvem:', error); return; }
    const novoJSON = JSON.stringify(data.data);
    const localJSON = JSON.stringify(JSON.parse(Store.exportarBackup()));
    if (novoJSON === localJSON) { _syncUltimoEnviadoJSON = novoJSON; return; }

    const alteracaoLocalEm = syncUltimaAlteracaoLocal();
    const atualizacaoNuvemEm = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (alteracaoLocalEm && alteracaoLocalEm > atualizacaoNuvemEm) {
      console.warn('Dados locais parecem mais recentes que a nuvem — enviando o local em vez de sobrescrever.');
      syncEnviarAlteracoes();
      return;
    }

    _syncAplicandoRemoto = true;
    try { Store.substituirDb(data.data); } catch (e) { console.warn('Falha ao aplicar dados da nuvem:', e); }
    _syncAplicandoRemoto = false;
    _syncUltimoEnviadoJSON = novoJSON;
  });

  _syncChannel = _syncClient
    .channel('fertgrow-db-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: SYNC_TABLE, filter: `id=eq.${SYNC_ROW_ID}` }, async (payload) => {
      // Importante: tudo aqui roda protegido por try/catch/finally. Um banco muito
      // grande pode fazer o Realtime entregar a notificação sem o campo "data"
      // (limite de tamanho do payload) — sem essa proteção, um erro aqui deixava
      // a trava "_syncAplicandoRemoto" presa em true para sempre, e o navegador
      // parava de enviar qualquer alteração nova para a nuvem, silenciosamente.
      try {
        let novoDb = payload.new && payload.new.data;
        if (!novoDb) {
          const { data, error } = await _syncClient.from(SYNC_TABLE).select('data').eq('id', SYNC_ROW_ID).maybeSingle();
          if (error || !data) { console.warn('Notificação em tempo real veio incompleta e não foi possível buscar a versão completa:', error); return; }
          novoDb = data.data;
        }
        const novoJSON = JSON.stringify(novoDb);
        if (novoJSON === _syncUltimoEnviadoJSON) return; // fomos nós mesmos que enviamos
        _syncAplicandoRemoto = true;
        Store.substituirDb(novoDb);
        _syncUltimoEnviadoJSON = novoJSON;
        if (window.App && App.toast) App.toast('Dados atualizados por outro usuário.', 'info');
      } catch (e) {
        console.warn('Falha ao aplicar atualização remota:', e);
      } finally {
        _syncAplicandoRemoto = false;
      }
    })
    .subscribe();

  document.removeEventListener('db:changed', syncEnviarAlteracoes);
  document.addEventListener('db:changed', syncEnviarAlteracoes);
}

function syncEnviarAlteracoes() {
  if (_syncAplicandoRemoto || !_syncClient) return;
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(async () => {
    const dbAtual = JSON.parse(Store.exportarBackup());
    const json = JSON.stringify(dbAtual);
    if (json === _syncUltimoEnviadoJSON) return;
    _syncUltimoEnviadoJSON = json;
    try {
      await _syncClient.from(SYNC_TABLE).update({ data: dbAtual, updated_at: new Date().toISOString() }).eq('id', SYNC_ROW_ID);
    } catch (e) {
      console.warn('Falha ao sincronizar com a nuvem:', e);
    }
  }, 500);
}

// Se já houver uma configuração salva neste navegador, conecta sozinho ao carregar a página.
document.addEventListener('DOMContentLoaded', () => {
  try { syncIniciarCliente(); } catch (e) { console.warn('Sincronização não iniciada:', e); }
});
