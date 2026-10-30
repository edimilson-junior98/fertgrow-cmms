/* ==========================================================================
   FertGrow CMMS — chamadas à API do Melvin (Node)

   Usado tanto pelo servidor local (melvin-sync-server.js, pro botão
   "Sincronizar Melvin" no navegador) quanto pela sincronização automática
   agendada no GitHub Actions (scripts/sync-melvin-cloud.js). As credenciais
   vêm de melvin.secrets.json quando rodando localmente, ou das variáveis de
   ambiente MELVIN_EMAIL/MELVIN_PASSWORD (GitHub Secrets) quando rodando no
   Actions — nunca ficam no código.
   ========================================================================== */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SECRETS_PATH = path.join(__dirname, 'melvin.secrets.json');
const MELVIN_HOST = 'api-novo.oimelvin.com.br';

function lerSecrets() {
  if (process.env.MELVIN_EMAIL && process.env.MELVIN_PASSWORD) {
    // .trim() em tudo — um Secret do GitHub com uma quebra de linha ou
    // espaço a mais no valor (fácil de acontecer ao colar) vira um caractere
    // inválido dentro do path da requisição e o Node recusa ("Request path
    // contains unescaped characters"), então mais vale limpar aqui do que
    // confiar que o valor salvo no Secret está sempre exato.
    const tenancy = (process.env.MELVIN_TENANCY || '').trim();
    return {
      userNameOrEmailAddress: process.env.MELVIN_EMAIL.trim(),
      password: process.env.MELVIN_PASSWORD.trim(),
      tenancyName: tenancy || null,
      // O código de integração do PowerBI é, ele mesmo, o segredo que libera
      // os dados (chamada anônima, sem token) — por isso fica junto das
      // outras credenciais, nunca hardcoded no código (este repositório é
      // público no GitHub).
      codigoIntegracaoPowerBI: (process.env.MELVIN_INTEGRACAO_CODIGO || '').trim(),
    };
  }
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
  // O endpoint antigo (ArvoreAtivo/GetTodos) começou a devolver 404 em algum
  // momento — a Melvin trocou pra ArvoreAtivo/Get, mesmo shape de resposta.
  const { status, json } = await requisitarJson({
    path: '/api/services/app/ArvoreAtivo/Get?ExibirInativos=true',
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

// Endpoint novo de integração (PowerBI) — substitui o antigo OrdemServico/GetAll
// como fonte das Ordens de Serviço (ver js/melvinSync.js). Traz MUITO mais
// detalhe por OS (planta/setor, executante, recursos planejados/utilizados,
// apontamentos de hora) do que o endpoint antigo, mas numa chamada só —
// SEM paginação e, principalmente, SEM autenticação: o `codigoIntegracao` é o
// próprio segredo, então não passa por autenticarNoMelvin().
// `dataInicio`/`dataFim` no formato "YYYY-MM-DD".
async function buscarDadosIntegracao(dataInicio, dataFim) {
  const { codigoIntegracaoPowerBI } = lerSecrets();
  if (!codigoIntegracaoPowerBI) throw new Error('codigoIntegracaoPowerBI não configurado (melvin.secrets.json ou MELVIN_INTEGRACAO_CODIGO).');
  const query = `codigoIntegracao=${codigoIntegracaoPowerBI}&dataInicio=${dataInicio}&dataFim=${dataFim}`;
  const { status, json } = await requisitarJson({
    path: `/api/services/app/PowerBI/GetDadosIntegracao?${query}`,
    method: 'GET',
  });
  if (status !== 200 || !json.success) {
    throw new Error(json.error?.message || `Falha ao buscar dados de integração no Melvin (HTTP ${status}).`);
  }
  return json.result || [];
}

module.exports = {
  autenticarNoMelvin, buscarArvoreAtivos, buscarOrdensServico,
  buscarSolicitacoesServico, buscarPlanosPreventivos, buscarDadosIntegracao,
};
