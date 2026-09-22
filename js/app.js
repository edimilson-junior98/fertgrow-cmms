/* ==========================================================================
   FertGrow CMMS — App Shell
   Router, modal/toast system, theme toggle, sidebar, global search.
   ========================================================================== */

const Views = {}; // registered by each view module: Views.dashboard = { render, title }

const App = (() => {
  const contentEl = () => document.getElementById('content');
  let currentView = 'dashboard';

  function init() {
    renderIcons();
    bindNav();
    bindTopbar();
    restoreTheme();
    // Liga o listener que re-renderiza a tela atual a cada alteração no Store
    // ANTES do primeiro navigate() — se o render inicial (Dashboard) falhar
    // por qualquer motivo (ex: uma lib de CDN não carregou), o app não pode
    // ficar sem esse listener: sem ele, qualquer alteração de dado (favoritar
    // um serviço, editar um item...) continua sendo salva, mas a tela nunca
    // mais se atualiza sozinha, silenciosamente, até a página ser recarregada.
    document.addEventListener('db:changed', () => { if (Views[currentView]) navigate(currentView, true); });
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(syncTableScrollBars, 120); });
    navigate('dashboard');
  }

  // Tabelas largas (muitas colunas) ganham uma barra de rolagem horizontal
  // também no topo, sincronizada com a de baixo — evita ter que descer até
  // o rodapé da tabela só para arrastar para o lado.
  function syncTableScrollBars() {
    contentEl().querySelectorAll('.table-wrap').forEach(wrap => {
      let bar = wrap.previousElementSibling;
      const isBar = bar && bar.classList && bar.classList.contains('table-scroll-top');
      const precisaBarra = wrap.scrollWidth > wrap.clientWidth + 1;
      if (precisaBarra) {
        if (!isBar) {
          bar = document.createElement('div');
          bar.className = 'table-scroll-top';
          bar.innerHTML = '<div class="table-scroll-top-spacer"></div>';
          wrap.parentNode.insertBefore(bar, wrap);
          let syncing = false;
          bar.addEventListener('scroll', () => { if (syncing) return; syncing = true; wrap.scrollLeft = bar.scrollLeft; syncing = false; });
          wrap.addEventListener('scroll', () => { if (syncing) return; syncing = true; bar.scrollLeft = wrap.scrollLeft; syncing = false; });
        }
        bar.firstElementChild.style.width = wrap.scrollWidth + 'px';
      } else if (isBar) {
        bar.remove();
      }
    });
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        navigate(el.dataset.view);
        document.getElementById('app').classList.remove('sidebar-open');
      });
    });
    document.getElementById('collapseBtn').addEventListener('click', () => {
      document.getElementById('app').classList.toggle('collapsed');
    });
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
      document.getElementById('app').classList.toggle('sidebar-open');
    });
  }

  function bindTopbar() {
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    const search = document.getElementById('globalSearch');
    search.addEventListener('input', () => globalSearch(search.value));
    document.getElementById('profileSelect').addEventListener('change', (e) => {
      toast(`Perfil ativo: ${e.target.value}`, 'info');
    });
  }

  function restoreTheme() {
    const saved = localStorage.getItem('fertgrow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fertgrow_theme', next);
    updateThemeIcon(next);
  }
  function updateThemeIcon(theme) {
    // Alvo é o botão (id fixo, nunca substituído) em vez do <svg> em si:
    // sobrescrever innerHTML do pai e DEPOIS tentar reler `.parentElement`
    // do <svg> antigo (já órfão, removido pelo innerHTML) lançava
    // "Cannot set properties of null" — e isso travava o App.init() inteiro
    // antes de registrar o listener de 'db:changed' que re-renderiza a tela
    // a cada alteração no Store. Sem esse listener, editar/favoritar um
    // item salva o dado mas a tela nunca se atualiza sozinha.
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.innerHTML = Icon(theme === 'dark' ? 'moon' : 'sun', 18);
  }

  function navigate(viewName, silent) {
    const view = Views[viewName];
    if (!view) return;
    currentView = viewName;
    if (!silent) {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewName));
      document.getElementById('breadcrumb').textContent = view.title;
    }
    const scrollPos = contentEl().scrollTop;
    // Um erro dentro do render/afterRender de UMA tela (ex: um gráfico que
    // depende de uma lib de CDN que não carregou) não pode travar a tela em
    // um estado desatualizado pro resto da sessão — melhor mostrar isso no
    // console (e um toast, se o toast já existir) do que falhar em silêncio.
    try {
      contentEl().innerHTML = view.render();
      renderIcons(contentEl());
      if (view.afterRender) view.afterRender();
    } catch (e) {
      console.error(`Falha ao renderizar a tela "${viewName}":`, e);
      if (toast) toast(`Erro ao carregar a tela "${view.title || viewName}". Veja o console (F12) para detalhes.`, 'danger');
    }
    syncTableScrollBars();
    if (!silent) contentEl().scrollTop = 0; else contentEl().scrollTop = scrollPos;
  }

  // ---------------------------------------------------------------- modal
  function openModal({ title, body, footer, size }) {
    closeModal();
    const tpl = document.getElementById('tpl-modal').content.cloneNode(true);
    const overlay = tpl.querySelector('.modal-overlay');
    if (size === 'lg') overlay.querySelector('.modal').classList.add('modal-lg');
    overlay.querySelector('.modal-title').textContent = title;
    const bodyEl = overlay.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    if (footer) {
      const foot = document.createElement('div');
      foot.className = 'modal-foot';
      if (typeof footer === 'string') foot.innerHTML = footer; else foot.appendChild(footer);
      overlay.querySelector('.modal').appendChild(foot);
    }
    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    renderIcons(overlay);
    document.body.style.overflow = 'hidden';
    return overlay;
  }
  function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------------------- toast
  function toast(msg, type = 'default') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${Icon(type === 'success' ? 'check' : type === 'danger' ? 'alert' : 'bell', 15)}<span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3200);
  }

  // ---------------------------------------------------------- confirm
  function confirmAction(msg, onConfirm) {
    const footer = document.createElement('div');
    footer.style.display = 'flex'; footer.style.gap = '8px'; footer.style.width = '100%'; footer.style.justifyContent = 'flex-end';
    const cancel = document.createElement('button'); cancel.className = 'btn'; cancel.textContent = 'Cancelar';
    const ok = document.createElement('button'); ok.className = 'btn btn-danger'; ok.textContent = 'Confirmar';
    cancel.onclick = closeModal;
    ok.onclick = () => { onConfirm(); closeModal(); };
    footer.append(cancel, ok);
    openModal({ title: 'Confirmar ação', body: `<p>${msg}</p>`, footer });
  }

  // ---------------------------------------------------------- global search
  function globalSearch(q) {
    if (!q || q.length < 2) return;
    q = q.toLowerCase();
    const results = [];
    Store.all('ativos').forEach(a => { if ((a.nome + a.tag + a.area).toLowerCase().includes(q)) results.push({ tipo: 'Ativo', label: `${a.tag} · ${a.nome}`, view: 'ativos' }); });
    Store.all('motores').forEach(m => { if ((m.tag + m.modelo + (m.codigoInterno||'') + (m.redutorCodigoInterno||'') + (m.redutorTag||'')).toLowerCase().includes(q)) results.push({ tipo: 'Motor', label: `${m.tag}${m.codigoInterno ? ' · '+m.codigoInterno : ''} · ${m.modelo}`, view: 'motores' }); });
    Store.all('ordens').forEach(o => { if ((o.numero + o.descricao).toLowerCase().includes(q)) results.push({ tipo: 'OS', label: `${o.numero} · ${o.descricao.slice(0, 40)}`, view: 'ordens' }); });
    showSearchDropdown(results.slice(0, 8));
  }
  function showSearchDropdown(results) {
    let dd = document.getElementById('searchDropdown');
    if (dd) dd.remove();
    const box = document.querySelector('.search-box');
    dd = document.createElement('div');
    dd.id = 'searchDropdown';
    dd.style.cssText = `position:absolute;top:${box.getBoundingClientRect().bottom + 6}px;left:${box.getBoundingClientRect().left}px;width:${box.getBoundingClientRect().width}px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-2);z-index:150;max-height:320px;overflow-y:auto;`;
    if (results.length === 0) {
      dd.innerHTML = `<div style="padding:14px;color:var(--text-muted);font-size:13px;">Nenhum resultado encontrado.</div>`;
    } else {
      dd.innerHTML = results.map(r => `<div class="sr-item" data-view="${r.view}" style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;gap:8px;"><span>${r.label}</span><span class="badge badge-neutral">${r.tipo}</span></div>`).join('');
    }
    document.body.appendChild(dd);
    dd.querySelectorAll('.sr-item').forEach(it => it.addEventListener('click', () => { navigate(it.dataset.view); dd.remove(); document.getElementById('globalSearch').value = ''; }));
    setTimeout(() => document.addEventListener('click', function h(e) { if (!dd.contains(e.target) && e.target.id !== 'globalSearch') { dd.remove(); document.removeEventListener('click', h); } }), 0);
  }

  // ---------------------------------------------------------- helpers used by views
  function fmtMoney(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(v) { if (!v) return '—'; const d = new Date(v + 'T00:00:00'); return d.toLocaleDateString('pt-BR'); }
  function badgeForStatus(status) {
    const map = {
      'Operando': 'success', 'Concluída': 'success', 'Normal': 'success', 'Operação': 'success',
      'Aberta': 'info', 'Reserva': 'info',
      'Em Andamento': 'warning', 'Atenção': 'warning', 'Manutenção': 'warning', 'Aguardando Peça': 'warning',
      'Parado': 'danger', 'Sobrecarregada': 'danger', 'Cancelada': 'danger', 'Oficina': 'danger',
      'Estoque': 'neutral',
    };
    return map[status] || 'neutral';
  }

  return { init, navigate, openModal, closeModal, toast, confirmAction, fmtMoney, fmtDate, badgeForStatus };
})();

document.addEventListener('DOMContentLoaded', () => { /* inicialização agora fica a cargo de auth.js (authIniciar) */ });
