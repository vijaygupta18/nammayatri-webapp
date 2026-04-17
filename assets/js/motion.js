/* Motion polish — GSAP scroll-reveals, count-up stats, marquee, page transitions,
 * confetti, smooth link interceptor using View Transitions API where available. */
(function (global) {
  'use strict';

  const prefersReducedMotion = () =>
    window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Count-up animation ---- */
  function countUp(el, to, { duration = 1600, prefix = '', suffix = '' } = {}) {
    if (prefersReducedMotion()) { el.textContent = prefix + to + suffix; return; }
    const from = 0;
    const start = performance.now();
    const n = Number(to) || 0;
    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const val = Math.round(from + (n - from) * e);
      el.textContent = prefix + val.toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function countUpAll(root = document) {
    root.querySelectorAll('[data-countup]').forEach(el => {
      const to = el.getAttribute('data-countup');
      const pre = el.getAttribute('data-prefix') || '';
      const suf = el.getAttribute('data-suffix') || '';
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            countUp(el, to, { prefix: pre, suffix: suf });
            obs.unobserve(el);
          }
        });
      }, { threshold: 0.4 });
      obs.observe(el);
    });
  }

  /* ---- Marquee duplication (so it loops seamlessly) ---- */
  function prepareMarquees(root = document) {
    root.querySelectorAll('.marquee-track').forEach(t => {
      if (t.dataset.cloned) return;
      const clone = t.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      t.parentNode.appendChild(clone);
      t.dataset.cloned = '1';
    });
  }

  /* ---- Confetti ---- */
  function burstConfetti({ pieces = 90, durationMs = 2600 } = {}) {
    if (prefersReducedMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const colors = ['#FCC32C', '#FFD75C', '#22C06B', '#F2F3F7'];
    for (let i = 0; i < pieces; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-piece';
      p.style.background = colors[i % colors.length];
      p.style.left = Math.random() * 100 + 'vw';
      p.style.top = '-10px';
      const dx = (Math.random() - 0.5) * 400;
      const dy = window.innerHeight + 40;
      const rot = (Math.random() - 0.5) * 720;
      p.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: durationMs + Math.random() * 600, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'forwards' });
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), durationMs + 800);
  }

  /* ---- Smooth link navigation with top progress bar + View Transitions ---- */
  function installPageTransitions() {
    // skip on local file: or cross-origin
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.href === location.href) return;
      if (a.dataset.noTransition != null) return;
      // Ignore #anchor same-page jumps
      if (url.pathname === location.pathname && url.hash) return;

      e.preventDefault();
      showProgress();
      const go = () => { location.href = url.href; };
      if (document.startViewTransition) {
        document.startViewTransition(() => new Promise(r => { go(); r(); }));
      } else {
        go();
      }
    });
  }

  let progressEl = null;
  function showProgress() {
    if (progressEl) return;
    progressEl = document.createElement('div');
    progressEl.className = 'ny-nav-progress';
    document.body.appendChild(progressEl);
  }

  /* ---- Scroll-triggered parallax (data-parallax="0.2" shifts Y by % of scroll) ---- */
  function installParallax() {
    if (prefersReducedMotion()) return;
    const els = [...document.querySelectorAll('[data-parallax]')];
    if (!els.length) return;
    function update() {
      const h = window.innerHeight;
      els.forEach(el => {
        const rect = el.getBoundingClientRect();
        const centre = rect.top + rect.height / 2;
        const offset = (centre - h / 2) / h;      // -1 at top, +1 at bottom
        const amt = Number(el.dataset.parallax) || 0.15;
        el.style.transform = `translate3d(0, ${offset * amt * 100}px, 0)`;
      });
    }
    let raf = 0;
    window.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function init() {
    try { countUpAll(); } catch {}
    try { prepareMarquees(); } catch {}
    try { installParallax(); } catch {}
    try { installPageTransitions(); } catch {}
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });

  global.NY_MOTION = { countUp, countUpAll, burstConfetti, prepareMarquees };
})(window);
