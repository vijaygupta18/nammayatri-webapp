/* Shared UI helpers: theme, nav, toast, modal, tilt, formatting, maps. */
(function (global) {
  'use strict';

  const S = global.NY_SESSION;
  const CFG = global.NY_CONFIG;

  /* ---- Theme (light / dark) ---- */
  const THEME_KEY = 'ny:theme';
  const html = document.documentElement;
  function currentTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch {}
    if (stored === 'light' || stored === 'dark') return stored;
    const prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  function applyTheme(t) {
    html.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    window.dispatchEvent(new CustomEvent('ny:theme', { detail: t }));
  }
  function toggleTheme() {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }
  applyTheme(currentTheme()); // apply immediately to avoid FOUC

  function tileUrl() {
    return html.getAttribute('data-theme') === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  }
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  /* ---- Journey bar ----
   * A persistent bottom-of-screen rail showing every stage of a ride, with a
   * NammaYatri auto-rickshaw that slides forward to the current stage. The
   * rickshaw animates from its previous stage (persisted in localStorage) so
   * the user sees motion across page transitions. */
  const JOURNEY_STAGES = [
    { key: 'login',     label: 'Sign in' },
    { key: 'otp',       label: 'Verify' },
    { key: 'search',    label: 'Where to' },
    { key: 'estimates', label: 'Pick ride' },
    { key: 'waiting',   label: 'Finding' },
    { key: 'assigned',  label: 'On the way' },
    { key: 'onride',    label: 'On trip' },
    { key: 'rate',      label: 'Rate' },
    { key: 'receipt',   label: 'Complete' },
  ];
  const STAGE_INDEX = Object.fromEntries(JOURNEY_STAGES.map((s, i) => [s.key, i]));
  const AUTO_SVG = `
    <svg viewBox="0 0 80 48" width="56" height="34" aria-hidden="true" class="ny-auto-svg">
      <defs>
        <linearGradient id="nyauto-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFD75C"/>
          <stop offset="1" stop-color="#FCC32C"/>
        </linearGradient>
      </defs>
      <ellipse cx="26" cy="41" rx="8" ry="3"  fill="rgba(0,0,0,0.18)"/>
      <ellipse cx="58" cy="41" rx="6" ry="2"  fill="rgba(0,0,0,0.18)"/>
      <!-- body -->
      <path d="M12 32 Q10 22 18 20 L24 10 Q28 6 36 6 L52 6 Q60 6 64 14 L68 30 Q70 34 66 36 L16 36 Q12 36 12 32 Z" fill="url(#nyauto-body)" stroke="#141016" stroke-width="1.2"/>
      <!-- canopy -->
      <path d="M24 12 Q30 8 38 8 L52 8 Q58 8 60 14 L60 18 L24 18 Z" fill="#141016"/>
      <!-- windshield -->
      <path d="M26 16 L40 16 L40 22 L26 22 Z" fill="#7fa0b6" opacity="0.55"/>
      <!-- amber headlight -->
      <circle cx="67" cy="26" r="3" fill="#FFAE00"/>
      <circle cx="67" cy="26" r="5" fill="#FFAE00" opacity="0.25"/>
      <!-- wheels -->
      <circle cx="26" cy="38" r="6" fill="#0b0b0b" stroke="#2a2c33" stroke-width="1.2"/>
      <circle cx="26" cy="38" r="2" fill="#2a2c33"/>
      <circle cx="58" cy="38" r="5" fill="#0b0b0b" stroke="#2a2c33" stroke-width="1.2"/>
      <circle cx="58" cy="38" r="1.8" fill="#2a2c33"/>
      <!-- side rail -->
      <line x1="14" y1="26" x2="52" y2="26" stroke="#141016" stroke-width="1.2"/>
    </svg>`;

  // Ensure one-time CSS for the journey bar is injected.
  function ensureJourneyStyles() {
    if (document.getElementById('ny-journey-styles')) return;
    const s = document.createElement('style');
    s.id = 'ny-journey-styles';
    s.textContent = `
      .ny-journey {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
        padding: 14px 16px 16px;
        background: color-mix(in srgb, var(--bg) 86%, transparent);
        backdrop-filter: blur(14px) saturate(160%);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-top: 1px solid var(--line);
        pointer-events: none;
      }
      .ny-journey-inner { width: min(1240px, 94vw); margin: 0 auto; position: relative; }
      .ny-journey-track {
        position: relative;
        height: 54px;
        display: grid;
        grid-template-columns: repeat(9, 1fr);
        align-items: end;
      }
      .ny-journey-rail {
        position: absolute; left: 0; right: 0; bottom: 10px;
        height: 2px;
        background: repeating-linear-gradient(90deg, var(--line-2) 0 6px, transparent 6px 12px);
      }
      .ny-journey-rail-fill {
        position: absolute; left: 0; bottom: 10px;
        height: 2px;
        background: var(--accent);
        transition: width 0.8s cubic-bezier(0.3, 1, 0.4, 1);
        box-shadow: 0 0 8px var(--accent-glow);
      }
      .ny-journey-stage {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-3);
        transition: color 0.3s var(--ease);
        position: relative;
        z-index: 1;
      }
      .ny-journey-stage .ny-journey-pin {
        width: 10px; height: 10px; border-radius: 50%;
        background: var(--surface);
        border: 1.5px solid var(--line-2);
        transition: background 0.3s var(--ease), border-color 0.3s var(--ease), transform 0.3s var(--spring);
      }
      .ny-journey-stage.done .ny-journey-pin    { background: var(--accent); border-color: var(--accent); }
      .ny-journey-stage.current { color: var(--text); }
      .ny-journey-stage.current .ny-journey-pin { background: var(--accent); border-color: var(--accent); transform: scale(1.4); box-shadow: 0 0 0 4px var(--accent-glow-2); }
      .ny-journey-auto {
        position: absolute;
        bottom: 20px;
        transform: translateX(-50%);
        transition: left 1.2s cubic-bezier(0.25, 1, 0.5, 1);
        will-change: left, transform;
        pointer-events: none;
        filter: drop-shadow(0 6px 10px rgba(0,0,0,0.18));
      }
      .ny-journey-auto .ny-auto-svg { display: block; }
      /* bob + wheel spin while moving, settled when parked */
      .ny-journey-auto.moving { animation: nyBob 0.28s ease-in-out infinite alternate; }
      @keyframes nyBob { from { transform: translateX(-50%) translateY(0); } to { transform: translateX(-50%) translateY(-2px); } }
      @media (max-width: 720px) {
        .ny-journey { padding: 10px 12px 12px; }
        .ny-journey-stage { font-size: 0; } /* hide labels on small screens, keep pins */
        .ny-journey-stage::after { content: attr(data-n); display: block; font-size: 9px; }
        .ny-journey-track { height: 44px; }
        .ny-journey-auto  { bottom: 12px; }
      }
      body.has-journey main { padding-bottom: 90px; }
    `;
    document.head.appendChild(s);
  }

  function renderJourneyBar(currentKey) {
    ensureJourneyStyles();
    const idx = STAGE_INDEX[currentKey];
    if (idx == null) return;
    // Persist so next page animates the auto from where it was last.
    let prev = 0;
    try { prev = parseInt(localStorage.getItem('ny:journey:last') || '0', 10) || 0; } catch {}
    try { localStorage.setItem('ny:journey:last', String(idx)); } catch {}

    let bar = document.querySelector('.ny-journey');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.className = 'ny-journey';
    bar.setAttribute('aria-label', 'Ride journey progress');
    const stagesHtml = JOURNEY_STAGES.map((s, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      return `<div class="ny-journey-stage ${cls}" data-n="${String(i + 1).padStart(2, '0')}"><span class="ny-journey-pin"></span>${s.label}</div>`;
    }).join('');
    const pct = JOURNEY_STAGES.length <= 1 ? 0 : (idx / (JOURNEY_STAGES.length - 1)) * 100;
    bar.innerHTML = `
      <div class="ny-journey-inner">
        <div class="ny-journey-track">
          <div class="ny-journey-rail"></div>
          <div class="ny-journey-rail-fill" style="width: ${pct}%"></div>
          ${stagesHtml}
          <div class="ny-journey-auto moving" style="left: ${(prev / (JOURNEY_STAGES.length - 1)) * 100}%;">${AUTO_SVG}</div>
        </div>
      </div>`;
    document.body.appendChild(bar);
    document.body.classList.add('has-journey');
    // Animate to current stage on next frame so the transition fires.
    requestAnimationFrame(() => {
      const auto = bar.querySelector('.ny-journey-auto');
      auto.style.left = pct + '%';
      // settle after the transition
      setTimeout(() => auto.classList.remove('moving'), 1300);
    });
  }

  /* ---- Toasts ---- */
  function toast(msg, opts = {}) {
    const stack = getStack();
    const el = document.createElement('div');
    el.className = 'toast ' + (opts.type || '');
    el.innerHTML = `<span class="toast-icon">${opts.icon || iconFor(opts.type)}</span><div class="toast-text">${escapeHtml(msg)}</div>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .4s, transform .4s';
      el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 400);
    }, opts.duration || 3200);
  }
  function iconFor(t) {
    if (t === 'error') return '✕';
    if (t === 'success') return '✓';
    return 'ℹ';
  }
  function getStack() {
    let s = document.querySelector('.toast-stack');
    if (!s) { s = document.createElement('div'); s.className = 'toast-stack'; document.body.appendChild(s); }
    return s;
  }

  /* ---- Modal ---- */
  function modal({ title, body, buttons = [], onClose } = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div class="modal-body" style="margin-bottom: 20px; color: var(--text-dim);">${body || ''}</div>
        <div class="row" style="justify-content: flex-end; gap: 10px;"></div>
      </div>`;
    const btnRow = backdrop.querySelector('.row');
    const close = (result) => {
      backdrop.style.opacity = '0';
      setTimeout(() => backdrop.remove(), 200);
      onClose?.(result);
    };
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.className || 'btn-ghost');
      btn.textContent = b.label;
      btn.onclick = () => { if (b.onClick) b.onClick(); close(b.value); };
      btnRow.appendChild(btn);
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    return close;
  }
  const confirm = (msg, title = 'Confirm') => new Promise(res => {
    modal({
      title, body: `<p>${escapeHtml(msg)}</p>`,
      buttons: [
        { label: 'Cancel',  className: 'btn-ghost',   value: false },
        { label: 'Confirm', className: 'btn-primary', value: true },
      ],
      onClose: v => res(!!v),
    });
  });

  /* ---- Nav ---- */
  function renderNav(activeKey) {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    const loggedIn = S.isLoggedIn();
    const links = loggedIn ? [
      { key: 'home',     href: 'home.html',     label: 'Book' },
      { key: 'rides',    href: 'rides.html',    label: 'My Rides' },
      { key: 'profile',  href: 'profile.html',  label: 'Profile' },
      { key: 'help',     href: 'help.html',     label: 'Help' },
      { key: 'settings', href: 'settings.html', label: 'Settings' },
    ] : [
      { key: 'index',    href: 'index.html',    label: 'Home' },
      { key: 'features', href: 'index.html#features', label: 'Features' },
      { key: 'settings', href: 'settings.html', label: 'Settings' },
    ];
    const sunIcon  = '<svg class="sun"  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const moonIcon = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    nav.innerHTML = `
      <div class="container nav-inner">
        <a class="logo" href="${loggedIn ? 'home.html' : 'index.html'}" aria-label="NammaYatri">
          <img class="logo-img" src="assets/img/brand/ny-wordmark.png" alt="NammaYatri" />
        </a>
        <div class="nav-links">
          ${links.map(l => `<a class="nav-link ${l.key === activeKey ? 'active' : ''}" href="${l.href}">${l.label}</a>`).join('')}
          <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle theme">${sunIcon}${moonIcon}</button>
          ${loggedIn
            ? `<button class="btn btn-ghost btn-sm" data-logout>Logout</button>`
            : `<a class="btn btn-primary btn-sm" href="login.html">Login</a>`}
        </div>
      </div>`;
    nav.querySelector('[data-logout]')?.addEventListener('click', async () => {
      try { await global.NY_API.logout(); } catch {}
      S.logout();
      toast('Signed out', { type: 'success' });
      setTimeout(() => location.href = 'index.html', 400);
    });
    nav.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);
  }

  /* ---- Tilt cards ---- */
  function enableTilt(root = document) {
    root.querySelectorAll('[data-tilt]').forEach(el => {
      let rect = el.getBoundingClientRect();
      const update = () => { rect = el.getBoundingClientRect(); };
      el.addEventListener('pointermove', (e) => {
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rx = (0.5 - y) * 10;
        const ry = (x - 0.5) * 14;
        el.style.setProperty('--rx', rx + 'deg');
        el.style.setProperty('--ry', ry + 'deg');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
      window.addEventListener('resize', update);
    });
  }

  /* ---- Formatters ---- */
  const fmt = {
    money(amount, currency = 'INR') {
      if (amount == null) return '—';
      try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
      catch { return (currency === 'INR' ? '₹' : currency + ' ') + Math.round(amount); }
    },
    distance(meters) {
      if (meters == null) return '—';
      return meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1) + ' km';
    },
    duration(sec) {
      if (sec == null) return '—';
      const m = Math.round(sec / 60);
      if (m < 60) return m + ' min';
      return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    },
    dateTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    },
    timeOnly(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    },
    escape: escapeHtml,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /* ---- Mode banner (deprecated — live-through-proxy only). Kept as no-op
   * so any leftover callers in HTML/JS don't throw. Safe to delete once all
   * pages drop the call. */
  function renderModeBanner() { /* no-op */ }

  /* ---- Proxy warning banner ----
   * Renders once per page when NY_CONFIG.proxy is empty. Silent otherwise.
   * Uses amber/gold tone since a missing proxy is a config issue, not an error. */
  function warnIfNoProxy() {
    if (CFG && CFG.proxy) return;
    if (document.querySelector('[data-proxy-warn]')) return;
    const body = document.body;
    if (!body) return;
    const el = document.createElement('div');
    el.setAttribute('data-proxy-warn', '');
    el.className = 'chip chip-gold pill';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px auto;max-width:960px;';
    el.innerHTML = `<span>⚠ Proxy URL not configured · <a href="settings.html" style="text-decoration:underline;color:inherit;">Open Settings</a></span>`;
    body.insertBefore(el, body.firstChild);
  }

  /* ---- Poll helper ---- */
  function poll(fn, { intervalMs = 2500, timeoutMs = 60_000, until }) {
    return new Promise((res, rej) => {
      const start = Date.now();
      let stopped = false;
      const stop = () => { stopped = true; };
      async function tick() {
        if (stopped) return;
        try {
          const v = await fn();
          if (until?.(v)) return res(v);
          if (Date.now() - start > timeoutMs) return rej(new Error('poll timeout'));
          setTimeout(tick, intervalMs);
        } catch (e) {
          if (Date.now() - start > timeoutMs) return rej(e);
          setTimeout(tick, intervalMs);
        }
      }
      tick();
      // allow external cancel via the returned promise
      Object.defineProperty(res, 'stop', { value: stop });
    });
  }

  /* ---- Reveal on scroll ----
   * Toggles .is-in on .reveal elements once they enter the viewport. */
  function reveal(root = document) {
    const els = root.querySelectorAll('.reveal');
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach(el => io.observe(el));
  }

  /* ---- Magnetic buttons ----
   * Sets --mx / --my CSS vars on .btn so ::before radial light follows cursor. */
  function magnetize(root = document) {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.btn').forEach(el => {
      if (el.__nyMagnet) return;
      el.__nyMagnet = true;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        el.style.setProperty('--mx', mx + '%');
        el.style.setProperty('--my', my + '%');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--mx', '50%');
        el.style.setProperty('--my', '50%');
      });
    });
  }

  /* ---- Auto motion ----
   * Wires tilt, reveal, and magnetize in one call. */
  function autoAnimate() {
    try { enableTilt(); } catch {}
    try { reveal(); } catch {}
    try { magnetize(); } catch {}
  }

  if (document.readyState !== 'loading') {
    autoAnimate();
  } else {
    document.addEventListener('DOMContentLoaded', autoAnimate, { once: true });
  }

  /* ---- Query ---- */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  global.NY_UI = { toast, modal, confirm, renderNav, enableTilt, reveal, magnetize, autoAnimate, renderModeBanner, warnIfNoProxy, poll, fmt, qs, qsa, tileUrl, tileAttribution, toggleTheme, currentTheme, renderJourneyBar, JOURNEY_STAGES };
})(window);
