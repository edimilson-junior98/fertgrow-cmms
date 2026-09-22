/* ==========================================================================
   FertGrow CMMS — sincronização automática com o Melvin (GitHub Actions)

   Roda periodicamente na nuvem do GitHub (.github/workflows/melvin-sync.yml),
   sem depender do computador de ninguém estar ligado:
     1. Busca o banco compartilhado atual no Supabase (mesma tabela que o
        navegador usa, fertgrow_db/id=1).
     2. Chama o Melvin direto (credenciais vêm de MELVIN_EMAIL/MELVIN_PASSWORD,
        configuradas como Secrets do repositório — nunca ficam no código).
     3. Aplica a MESMA lógica de mesclagem usada pelo botão "Sincronizar
        Melvin" no navegador (js/melvinSync.js), assim os dois caminhos nunca
        divergem.
     4. Grava o banco atualizado de volta no Supabase — qualquer navegador
        aberto recebe a atualização em tempo real, como se alguém tivesse
        clicado em sincronizar.

   Só cria/atualiza registros (nunca apaga o que não veio do Melvin) — a
   limpeza de dados antigos continua sendo uma ação manual, com confirmação,
   dentro do próprio CMMS.
   ========================================================================== */

const SUPABASE_URL = 'https://woabzpjzjkaqkjmzsiqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kAbXzgAybK885fnyV2-7kQ_6B623rg7'; // mesma chave pública já usada em js/sync.js
const SYNC_TABLE = 'fertgrow_db';
const SYNC_ROW_ID = 1;

async function buscarDbAtual() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?id=eq.${SYNC_ROW_ID}&select=data`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Falha ao buscar o banco atual no Supabase (HTTP ${resp.status}).`);
  const linhas = await resp.json();
  if (!linhas.length) throw new Error('A linha compartilhada ainda não existe no Supabase — abra o CMMS pelo menos uma vez (com a sincronização em nuvem ativa) antes da primeira sincronização automática.');
  return linhas[0].data;
}

async function salvarDb(db) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${SYNC_TABLE}?id=eq.${SYNC_ROW_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data: db, updated_at: new Date().toISOString() }),
  });
  if (!resp.ok) throw new Error(`Falha ao salvar o banco atualizado no Supabase (HTTP ${resp.status}): ${await resp.text()}`);
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
  const db = await buscarDbAtual();
  global.Store = criarStoreShim(db);
  const MelvinSync = require('../js/melvinSync.js');
  const MelvinApi = require('../melvin-api.js');

  const resumo = {};
  resumo.ativos = await MelvinSync.sincronizarAtivos(await MelvinApi.buscarArvoreAtivos());
  resumo.ordens = await MelvinSync.sincronizarOrdens(await MelvinApi.buscarOrdensServico());
  resumo.solicitacoes = await MelvinSync.sincronizarSolicitacoes(await MelvinApi.buscarSolicitacoesServico());
  resumo.planos = await MelvinSync.sincronizarPlanos(await MelvinApi.buscarPlanosPreventivos());
  resumo.programacao = MelvinSync.sincronizarProgramacao();

  await salvarDb(db);
  console.log('Sincronização automática com o Melvin concluída:');
  console.log(JSON.stringify(resumo, null, 2));
}

main().catch((e) => {
  console.error('Falha na sincronização automática com o Melvin:', e.message);
  process.exit(1);
});
