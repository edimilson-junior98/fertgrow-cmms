/* ==========================================================================
   FertGrow CMMS — servidor local de sincronização com o Melvin

   Só existe pra manter o login/senha do Melvin (melvin.secrets.json) fora do
   navegador. O app (rodando via file://) chama http://localhost:5178/melvin/ativos
   nesta máquina; este servidor loga no Melvin, busca a árvore de ativos e
   devolve só os dados pro navegador — a senha nunca trafega até lá.

   Uso: dê 2 cliques em iniciar-sync-melvin.bat (ou "node melvin-sync-server.js")
   e deixe essa janela aberta enquanto for sincronizar.

   As chamadas em si (autenticação, árvore de ativos, ordens, solicitações,
   planos) ficam em melvin-api.js — o mesmo módulo usado pela sincronização
   automática agendada no GitHub Actions (scripts/sync-melvin-cloud.js).
   ========================================================================== */

const http = require('http');
const {
  buscarArvoreAtivos, buscarOrdensServico, buscarSolicitacoesServico, buscarPlanosPreventivos,
} = require('./melvin-api');

const PORTA = 5178;

const server = http.createServer((req, res) => {
  // CORS liberado pra página file:// do CMMS conseguir chamar este servidor.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url.startsWith('/melvin/ativos')) {
    buscarArvoreAtivos()
      .then((arvore) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, arvore }));
      })
      .catch((e) => {
        console.error('Erro ao sincronizar com o Melvin:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      });
    return;
  }

  if (req.url.startsWith('/melvin/ordens')) {
    buscarOrdensServico()
      .then((ordens) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ordens }));
      })
      .catch((e) => {
        console.error('Erro ao buscar ordens de serviço no Melvin:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      });
    return;
  }

  if (req.url.startsWith('/melvin/solicitacoes')) {
    buscarSolicitacoesServico()
      .then((solicitacoes) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, solicitacoes }));
      })
      .catch((e) => {
        console.error('Erro ao buscar solicitações de serviço no Melvin:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      });
    return;
  }

  if (req.url.startsWith('/melvin/planos')) {
    buscarPlanosPreventivos()
      .then((planos) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, planos }));
      })
      .catch((e) => {
        console.error('Erro ao buscar planos preventivos no Melvin:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, erro: 'Rota não encontrada.' }));
});

server.listen(PORTA, () => {
  console.log(`Servidor de sincronização com o Melvin rodando em http://localhost:${PORTA}`);
  console.log('Deixe esta janela aberta enquanto usa o botão "Sincronizar Melvin" no CMMS.');
});
