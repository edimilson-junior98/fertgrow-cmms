/* ==========================================================================
   FertGrow CMMS — sincronização automática com o Melvin (GitHub Actions)

   Roda periodicamente na nuvem do GitHub (.github/workflows/melvin-sync.yml),
   sem depender do computador de ninguém estar ligado:
     1. Busca as coleções usadas aqui no Supabase (mesma tabela que o navegador
        usa, fertgrow_collections — uma linha por coleção, não mais um blob
        único).
     2. Chama o Melvin direto (credenciais vêm de MELVIN_EMAIL/MELVIN_PASSWORD,
        configuradas como Secrets do repositório — nunca ficam no código).
     3. Aplica a MESMA lógica de mesclagem usada pelo botão "Sincronizar
        Melvin" no navegador (js/melvinSync.js), assim os dois caminhos nunca
        divergem.
     4. Grava de volta no Supabase só as coleções que realmente mudaram —
        qualquer navegador aberto recebe a atualização em tempo real, como se
        alguém tivesse clicado em sincronizar.

   Só cria/atualiza registros (nunca apaga o que não veio do Melvin) — a
   limpeza de dados antigos continua sendo uma ação manual, com confirmação,
   dentro do próprio CMMS.
   ========================================================================== */

const SUPABASE_URL = 'https://woabzpjzjkaqkjmzsiqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kAbXzgAybK885fnyV2-7kQ_6B623rg7'; // mesma chave pública já usada em js/sync.js
const SYNC_TABLE = 'fertgrow_collections';

// Coleções que essa sincronização (js/melvinSync.js) lê e/ou grava — ver
// Store.all/get/add/update/removerEmLote usados lá dentro. Cada uma é sua
// própria linha na tabela (id = nome da coleção), não mais um blob só com
// o banco inteiro (fertgrow_db) — aquele formato antigo cresceu demais
// (4+ MB) e o Postgres passou a recusar o UPDATE por timeout.
const COLECOES_USADAS = ['ativos', 'config', 'ordens', 'pastas', 'planosPreventivos', 'programacao', 'solicitacoesServico'];

async function buscarColecoes(ids) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?id=in.(${ids.join(',')})&select=id,data`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Falha ao buscar as coleções atuais no Supabase (HTTP ${resp.status}).`);
  const linhas = await resp.json();
  if (!linhas.length) throw new Error('As coleções compartilhadas ainda não existem no Supabase — abra o CMMS pelo menos uma vez (com a sincronização em nuvem ativa) antes da primeira sincronização automática.');
  const db = {};
  ids.forEach((id) => { db[id] = id === 'config' ? {} : []; });
  linhas.forEach((l) => { db[l.id] = l.data; });
  return db;
}

// Só grava de volta as coleções que realmente mudaram (comparando com o que
// foi buscado no início) — a maioria das sincronizações só mexe em
// ordens/ativos, então programacao/pastas/etc. nem chegam a ser reenviadas.
async function salvarColecoesAlteradas(dbAntes, dbDepois) {
  const alteradas = Object.keys(dbDepois).filter((id) => JSON.stringify(dbDepois[id]) !== JSON.stringify(dbAntes[id]));
  if (!alteradas.length) { console.log('Nenhuma coleção mudou — nada para salvar.'); return; }
  const agora = new Date().toISOString();
  const payload = alteradas.map((id) => ({ id, data: dbDepois[id], updated_at: agora }));
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Falha ao salvar as coleções atualizadas no Supabase (HTTP ${resp.status}): ${await resp.text()}`);
  console.log('Coleções salvas:', alteradas.join(', '));
}

// Réplica mínima da API do Store (js/store.js) que opera sobre o blob do
// banco em memória, em vez de localStorage — o suficiente pro que
// js/melvinSync.js usa (all/add/update/removerEmLote/ativoNome/config).
function criarStoreShim(db) {
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
  return {
    all(col) { return db[col] || []; },
    get(col, id) { return (db[col] || []).find((x) => x.id === id); },
    add(col, obj) {
      obj.id = obj.id || uid(col.slice(0, 2));
      db[col].push(obj);
      return obj;
    },
    update(col, id, patch) {
      const item = (db[col] || []).find((x) => x.id === id);
      if (item) Object.assign(item, patch);
      return item;
    },
    removerEmLote(col, ids) {
      const idSet = new Set(ids);
      db[col] = (db[col] || []).filter((x) => !idSet.has(x.id));
    },
    ativoNome(id) {
      const a = (db.ativos || []).find((x) => x.id === id);
      return a ? a.nome : '—';
    },
    persist() {}, // o script grava tudo de uma vez só, no final
    get config() { return db.config || {}; },
    set config(v) { db.config = v; },
  };
}

async function main() {
  const db = await buscarColecoes(COLECOES_USADAS);
  const dbAntes = JSON.parse(JSON.stringify(db));
  global.Store = criarStoreShim(db);
  const MelvinSync = require('../js/melvinSync.js');
  const MelvinApi = require('../melvin-api.js');

  // Ordens agora vêm do endpoint de integração (PowerBI), que exige uma janela
  // dataInicio/dataFim — ano corrente inteiro (Jan a Dez), cobrindo OS já
  // encerradas e as programadas pro resto do ano.
  const anoCorrente = new Date().getFullYear();
  const dataInicioOrdens = `${anoCorrente}-01-01`;
  const dataFimOrdens = `${anoCorrente}-12-31`;

  const resumo = {};
  resumo.ativos = await MelvinSync.sincronizarAtivos(await MelvinApi.buscarArvoreAtivos());
  resumo.ordens = await MelvinSync.sincronizarOrdens(await MelvinApi.buscarDadosIntegracao(dataInicioOrdens, dataFimOrdens));
  resumo.solicitacoes = await MelvinSync.sincronizarSolicitacoes(await MelvinApi.buscarSolicitacoesServico());
  resumo.planos = await MelvinSync.sincronizarPlanos(await MelvinApi.buscarPlanosPreventivos());
  resumo.programacao = MelvinSync.sincronizarProgramacao();

  await salvarColecoesAlteradas(dbAntes, db);
  console.log('Sincronização automática com o Melvin concluída:');
  console.log(JSON.stringify(resumo, null, 2));
}

main().catch((e) => {
  console.error('Falha na sincronização automática com o Melvin:', e.message);
  process.exit(1);
});
