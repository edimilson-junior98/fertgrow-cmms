/* ==========================================================================
   FertGrow CMMS — Autenticação
   Login por e-mail/senha via Supabase Auth. Só entra em ação quando a
   Sincronização em Nuvem está conectada — sem nuvem, o sistema continua
   funcionando sem tela de login, como sempre funcionou.

   Fluxo de acesso:
   - Um administrador "convida" uma pessoa (nome + e-mail + perfil) na tela
     de Usuários. Isso só cria um registro de convite, não uma senha.
   - A pessoa convidada usa "Criar Conta" com esse mesmo e-mail e escolhe
     sua própria senha — o sistema então libera o acesso com o perfil que
     o administrador já definiu.
   - Sem convite prévio, não é possível criar conta.
   ========================================================================== */

// Login ativado — o sistema vai ficar acessível publicamente (GitHub Pages),
// então exige e-mail/senha antes de mostrar qualquer dado real.
const AUTH_ATIVO = true;

let AuthUser = null;    // sessão do Supabase Auth
let AuthProfile = null; // linha correspondente em "profiles"

function authEhAdmin() {
  return !!(AuthProfile && AuthProfile.perfil === 'Administrador' && AuthProfile.ativo);
}

async function authIniciar() {
  if (!AUTH_ATIVO) {
    // Login desativado: a interface não pode ficar travada esperando a
    // conexão com a nuvem (que depende da rede do usuário e pode demorar
    // vários segundos, ou até travar, sem timeout algum) — inicia o app
    // local IMEDIATAMENTE, deixando a sincronização em nuvem conectar em
    // segundo plano. Enquanto ela não conecta, a barra lateral já aparece
    // pronta mas os cliques não fazem nada até App.init() rodar; sem essa
    // mudança, isso podia durar o tempo inteiro da tentativa de rede.
    App.init();
    syncGarantirConectado().catch(e => console.warn('Sincronização automática não iniciada:', e));
    return;
  }
  await syncGarantirConectado(); // aqui precisamos saber se a nuvem conectou antes de decidir se mostra a tela de login
  const status = syncStatus();
  if (!status.conectado || !_syncClient) {
    App.init();
    return;
  }
  authVerificarSessao();
}

async function authVerificarSessao() {
  try {
    const { data } = await _syncClient.auth.getSession();
    if (!data || !data.session) { authRenderLogin(); return; }
    await authCarregarPerfil(data.session.user);
  } catch (e) {
    console.warn('Falha ao verificar sessão:', e);
    authRenderLogin();
  }
}

async function authCarregarPerfil(user) {
  AuthUser = user;
  const { data: perfil, error } = await _syncClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error || !perfil) {
    authRenderAguardando('Não encontramos seu cadastro de perfil. Se você acabou de criar a conta, aguarde alguns segundos e tente sair e entrar de novo. Caso persista, peça para um administrador conferir seu convite.');
    return;
  }
  AuthProfile = perfil;
  if (!perfil.ativo) { authRenderAguardando('Sua conta está desativada. Fale com um administrador do sistema.'); return; }
  authOcultarTelaLogin();
  App.init();
  authMontarTopbarUsuario();
}

async function authLogin(email, senha, onErro) {
  const { data, error } = await _syncClient.auth.signInWithPassword({ email, password: senha });
  if (error) { onErro(authTraduzErro(error.message)); return; }
  await authCarregarPerfil(data.user);
}

async function authCriarConta(email, senha, onErro) {
  try {
    const { data: convite, error: convError } = await _syncClient.from('convites').select('*').eq('email', email).eq('usado', false).maybeSingle();
    if (convError) throw convError;
    if (!convite) { onErro('Este e-mail ainda não foi cadastrado por um administrador. Peça para alguém te convidar primeiro, na tela de Usuários.'); return; }

    const { data: signUpData, error: signUpError } = await _syncClient.auth.signUp({ email, password: senha });
    if (signUpError) throw signUpError;
    if (!signUpData.session) { onErro('Sua conta foi criada, mas a confirmação de e-mail ainda está ativa no Supabase. Desative "Confirm email" em Authentication → Sign In / Up → Email, e tente criar a conta de novo (ou confirme pelo link enviado ao seu e-mail).'); return; }

    const { error: profileError } = await _syncClient.from('profiles').insert({
      id: signUpData.user.id, nome: convite.nome, email, perfil: convite.perfil, ativo: true,
    });
    if (profileError) throw profileError;

    await authCarregarPerfil(signUpData.user);
  } catch (e) {
    onErro(authTraduzErro(e.message) || 'Não foi possível criar a conta.');
  }
}

function authLogout() {
  if (_syncClient) _syncClient.auth.signOut();
  AuthUser = null; AuthProfile = null;
  window.location.reload();
}

function authTraduzErro(msg) {
  if (!msg) return 'Erro desconhecido.';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/user already registered/i.test(msg)) return 'Já existe uma conta com este e-mail — use "Entrar".';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return msg;
}

function authMontarTopbarUsuario() {
  const wrap = document.querySelector('.profile-select');
  if (!wrap || !AuthProfile) return;
  wrap.innerHTML = `
    <div class="flex" style="gap:8px;align-items:center;">
      <div style="text-align:right;line-height:1.2;">
        <div style="font-size:12.5px;font-weight:700;">${AuthProfile.nome}</div>
        <div style="font-size:10.5px;color:var(--text-muted);">${AuthProfile.perfil}</div>
      </div>
      <button class="icon-btn" id="authLogoutBtn" title="Sair">${Icon('x', 15)}</button>
    </div>`;
  renderIcons(wrap);
  document.getElementById('authLogoutBtn').addEventListener('click', () => {
    App.confirmAction('Deseja sair da sua conta?', authLogout);
  });
}

/* --------------------------- Telas de bloqueio --------------------------- */

function authMostrarTelaLogin(html) {
  document.getElementById('app').classList.add('hidden');
  const el = document.getElementById('authScreen');
  el.classList.remove('hidden');
  el.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
    <div style="width:100%;max-width:380px;">${html}</div>
  </div>`;
  renderIcons(el);
}
function authOcultarTelaLogin() {
  const el = document.getElementById('authScreen');
  el.classList.add('hidden');
  el.innerHTML = '';
  document.getElementById('app').classList.remove('hidden');
}

function authRenderAguardando(mensagem) {
  authMostrarTelaLogin(`
    <div class="card" style="padding:28px;text-align:center;">
      <div style="width:48px;height:48px;border-radius:12px;background:#fff;padding:6px;margin:0 auto 16px;"><img src="assets/logo-icon.png" style="width:100%;height:100%;object-fit:contain;"></div>
      <div style="font-weight:700;font-size:15px;margin-bottom:8px;">Acesso pendente</div>
      <p class="text-muted" style="font-size:13px;margin-bottom:18px;">${mensagem}</p>
      <button class="btn" id="authSairAguardando">Sair</button>
    </div>`);
  document.getElementById('authSairAguardando').addEventListener('click', authLogout);
}

function authRenderLogin() {
  authMostrarTelaLogin(`
    <div class="card" style="padding:28px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:12px;background:#fff;padding:6px;margin:0 auto 12px;"><img src="assets/logo-icon.png" style="width:100%;height:100%;object-fit:contain;"></div>
        <div style="font-weight:700;font-size:17px;">FertGrow CMMS</div>
        <div class="text-muted" style="font-size:12px;">Entre com sua conta para continuar</div>
      </div>
      <div class="tabs" style="margin-bottom:16px;">
        <div class="tab active" data-authtab="entrar">Entrar</div>
        <div class="tab" data-authtab="criar">Criar Conta</div>
      </div>
      <div id="authTabEntrar">
        <form id="formAuthEntrar" autocomplete="on">
          <div class="field" style="margin-bottom:10px;"><label>E-mail</label><input id="authEmailEntrar" name="email" type="email" autocomplete="username"></div>
          <div class="field" style="margin-bottom:14px;"><label>Senha</label><input id="authSenhaEntrar" name="password" type="password" autocomplete="current-password"></div>
          <button class="btn btn-primary" id="authBtnEntrar" type="submit" style="width:100%;">${Icon('check', 14)} Entrar</button>
          <div id="authErroEntrar" style="color:var(--danger);font-size:12px;margin-top:10px;"></div>
        </form>
      </div>
      <div id="authTabCriar" class="hidden">
        <p class="text-muted" style="font-size:12px;margin-bottom:12px;">Use o e-mail que um administrador já cadastrou como convite no sistema (tela de Usuários).</p>
        <form id="formAuthCriar" autocomplete="on">
          <div class="field" style="margin-bottom:10px;"><label>E-mail convidado</label><input id="authEmailCriar" name="email" type="email" autocomplete="username"></div>
          <div class="field" style="margin-bottom:14px;"><label>Crie uma senha</label><input id="authSenhaCriar" name="new-password" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>
          <button class="btn btn-primary" id="authBtnCriar" type="submit" style="width:100%;">${Icon('check', 14)} Criar Conta e Entrar</button>
          <div id="authErroCriar" style="color:var(--danger);font-size:12px;margin-top:10px;"></div>
        </form>
      </div>
    </div>`);

  document.querySelectorAll('[data-authtab]').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('[data-authtab]').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('authTabEntrar').classList.toggle('hidden', t.dataset.authtab !== 'entrar');
    document.getElementById('authTabCriar').classList.toggle('hidden', t.dataset.authtab !== 'criar');
  }));

  document.getElementById('formAuthEntrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('authBtnEntrar');
    const email = document.getElementById('authEmailEntrar').value.trim();
    const senha = document.getElementById('authSenhaEntrar').value;
    const erroEl = document.getElementById('authErroEntrar');
    erroEl.textContent = '';
    if (!email || !senha) { erroEl.textContent = 'Preencha e-mail e senha.'; return; }
    btn.disabled = true;
    await authLogin(email, senha, (msg) => { erroEl.textContent = msg; btn.disabled = false; });
  });

  document.getElementById('formAuthCriar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('authBtnCriar');
    const email = document.getElementById('authEmailCriar').value.trim();
    const senha = document.getElementById('authSenhaCriar').value;
    const erroEl = document.getElementById('authErroCriar');
    erroEl.textContent = '';
    if (!email || !senha || senha.length < 6) { erroEl.textContent = 'Preencha e-mail e uma senha com ao menos 6 caracteres.'; return; }
    btn.disabled = true;
    await authCriarConta(email, senha, (msg) => { erroEl.textContent = msg; btn.disabled = false; });
  });
}

document.addEventListener('DOMContentLoaded', () => authIniciar());
