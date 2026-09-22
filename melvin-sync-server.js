/* ==========================================================================
   FertGrow CMMS — servidor local de sincronização com o Melvin

   Só existe pra manter o login/senha do Melvin (melvin.secrets.json) fora do
   navegador. O app (rodando via file://) chama http://localhost:5178/melvin/ativos
   nesta máquina; este servidor loga no Melvin, busca a árvore de ativos e
   devolve só os dados pro navegador — a senha nunca trafega até lá.

   Uso: dê 2 cliques em iniciar-sync-melvin.bat (ou "node melvin-sync-server.js")
   e deixe essa janela aberta enquanto for sincronizar.
   ========================================================================== */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORTA = 5178;
const SECRETS_PATH = path.join(__dirname, 'melvin.secrets.json');
const MELVIN_HOST = 'api-novo.oimelvin.com.br';

function lerSecrets() {
  const raw = fs.readFileSync(SECRETS_PATH, 'utf8');
  return JSON.parse(raw);
}

function requisitarJson(options, corpo) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: MELVIN_HOST, ...options }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch (e) { reject(new Error('Resposta inesperada do Melvin: ' + data.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

async function autenticarNoMelvin() {
  const secrets = lerSecrets();
  const corpo = JSON.stringify({
    userNameOrEmailAddress: secrets.userNameOrEmailAddress,
    password: secrets.password,
  });
  const { status, json } = await requisitarJson({
    path: '/api/TokenAuth/Authenticate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) },
  }, corpo);
  if (status !== 200 || !json.success) {
    throw new Error(json.error?.message || `Falha ao autenticar no Melvin (HTTP ${status}).`);
  }
  return json.result; // { accessToken, tenantId, ... }
}

async function buscarArvoreAtivos() {
  const auth = await autenticarNoMelvin();
  const { status, json } = await requisitarJson({
    path: '/api/services/app/ArvoreAtivo/GetTodos?ExibirInativos=true',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Abp.TenantId': String(auth.tenantId),
    },
  });
  if (status !== 200 || !json.success) {
    throw new Error(json.error?.message || `Falha ao buscar árvore de ativos no Melvin (HTTP ${status}).`);
  }
  return json.result; // { empresa, filiais: [...] }
}

// OrdemServico/GetAll é paginado (SkipCount/MaxResultCount) — busca em blocos
// de 200 até não vir mais nada, e devolve a lista inteira já montada.
async function buscarOrdensServico() {
  const auth = await autenticarNoMelvin();
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'Abp.TenantId': String(auth.tenantId) };
  const TAMANHO_PAGINA = 200;
  let todas = [];
  let skip = 0;
  while (true) {
    const { status, json } = await requisitarJson({
      path: `/api/services/app/OrdemServico/GetAll?SkipCount=${skip}&MaxResultCount=${TAMANHO_PAGINA}`,
      method: 'GET',
      headers,
    });
    if (status !== 200 || !json.success) {
      throw new Error(json.error?.message || `Falha ao buscar ordens de serviço no Melvin (HTTP ${status}).`);
    }
    const pagina = json.result.items || [];
    todas = todas.concat(pagina);
    if (pagina.length < TAMANHO_PAGINA || todas.length >= json.result.totalCount) break;
    skip += TAMANHO_PAGINA;
  }
  return todas;
}

// SolicitacaoServico/GetAll também é paginado — mesmo padrão de buscarOrdensServico.
async function buscarSolicitacoesServico() {
  const auth = await autenticarNoMelvin();
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'Abp.TenantId': String(auth.tenantId) };
  const TAMANHO_PAGINA = 200;
  let todas = [];
  let skip = 0;
  while (true) {
    const { status, json } = await requisitarJson({
      path: `/api/services/app/SolicitacaoServico/GetAll?SkipCount=${skip}&MaxResultCount=${TAMANHO_PAGINA}`,
      method: 'GET',
      headers,
    });
    if (status !== 200 || !json.success) {
      throw new Error(json.error?.message || `Falha ao buscar solicitações de serviço no Melvin (HTTP ${status}).`);
    }
    const pagina = json.result.items || [];
    todas = todas.concat(pagina);
    if (pagina.length < TAMANHO_PAGINA || todas.length >= json.result.totalCount) break;
    skip += TAMANHO_PAGINA;
  }
  return todas;
}

// Fmp/GetControleFmp exige a lista de ids de equipamento (não tem "traga
// tudo") — por isso busca a árvore de ativos primeiro só pra pegar os ids,
// depois pede os planos desses equipamentos. Só devolve os "iniciados":
// têm dataInicio preenchida e ainda não foram encerrados (dataEncerramento
// nula) — planos nunca iniciados ou já encerrados ficam de fora.
async function buscarPlanosPreventivos() {
  const arvore = await buscarArvoreAtivos();
  const idsEquipamentos = [];
  (arvore.filiais || []).forEach((filial) => {
    (filial.setores || []).forEach((setor) => {
      (setor.equipamentos || []).forEach((eq) => idsEquipamentos.push(eq.id));
    });
  });

  const auth = await autenticarNoMelvin();
  const corpo = JSON.stringify({ idsEquipamentos });
  const { status, json } = await requisitarJson({
    path: '/api/services/app/Fmp/GetControleFmp',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Abp.TenantId': String(auth.tenantId),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(corpo),
    },
  }, corpo);
  if (status !== 200 || !json.success) {
    throw new Error(json.error?.message || `Falha ao buscar planos preventivos no Melvin (HTTP ${status}).`);
  }
  return (json.result.items || []).filter((p) => p.dataInicio && !p.dataEncerramento);
}

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
