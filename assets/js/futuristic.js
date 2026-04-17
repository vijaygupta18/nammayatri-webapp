/* NammaYatri · web rider — Futuristic v2 motion layer
 * Smooth scroll, magnetic cursor, 3D tilts, reveals, scramble text, parallax, HUD updates.
 * Pure vanilla JS — no build, no dependencies. Gracefully degrades.
 */
(function (global) {
  'use strict';

  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = () => matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  const now = () => performance.now();
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ======================================================================
   *  1.  SMOOTH SCROLL (Lenis-lite — wheel + touch, buttery inertia)
   * ====================================================================== */
  function SmoothScroll() {
    // Respect user preference; disable on touch (native is already smooth there).
    if (reduced() || isTouch()) return { destroy() {} };

    const html = document.documentElement;
    let target = window.scrollY;
    let current = window.scrollY;
    const lerpFactor = 0.09;          // lower = smoother / slower
    let rafId = 0;
    let running = true;

    function tick() {
      if (!running) return;
      const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight);
      target = clamp(target, 0, maxScroll);
      current = lerp(current, target, lerpFactor);

      // Snap when close enough to avoid sub-pixel jitter.
      if (Math.abs(current - target) < 0.2) current = target;

      // Don't fight the browser — only scroll if it's actually different.
      if (Math.abs(window.scrollY - current) > 0.1) {
        window.scrollTo(0, current);
      }
      rafId = requestAnimationFrame(tick);
    }

    function onWheel(e) {
      // ctrl/cmd = browser zoom; let it through
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      target += e.deltaY;
      target = clamp(target, 0, Math.max(0, document.body.scrollHeight - window.innerHeight));
    }

    function onKey(e) {
      const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight);
      const vh = window.innerHeight;
      if (e.key === 'PageDown' || e.key === 'Space' && !e.shiftKey) target = clamp(target + vh * 0.92, 0, maxScroll);
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) target = clamp(target - vh * 0.92, 0, maxScroll);
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End')  target = maxScroll;
      else if (e.key === 'ArrowDown') target = clamp(target + 80, 0, maxScroll);
      else if (e.key === 'ArrowUp')   target = clamp(target - 80, 0, maxScroll);
      else return;
      e.preventDefault();
    }

    function onSpy() {
      // When the user scrolls natively (anchor link, scrollIntoView), snap our state to it.
      if (!running) return;
      if (Math.abs(window.scrollY - target) > 5 && Math.abs(window.scrollY - current) > 5) {
        // some outside force — follow it
        target = window.scrollY;
        current = window.scrollY;
      }
    }

    // Anchor links — scroll smoothly by nudging target.
    function onAnchorClick(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const node = document.getElementById(id);
      if (!node) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      target = clamp(window.scrollY + rect.top - 70, 0,
        Math.max(0, document.body.scrollHeight - window.innerHeight));
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onSpy, { passive: true });
    document.addEventListener('click', onAnchorClick);
    rafId = requestAnimationFrame(tick);
    html.classList.add('has-smooth-scroll');

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onSpy);
        document.removeEventListener('click', onAnchorClick);
        html.classList.remove('has-smooth-scroll');
      }
    };
  }

  /* ======================================================================
   *  2.  SCROLL PROGRESS RAIL
   * ====================================================================== */
  function installScrollRail() {
    if (document.querySelector('.scroll-rail')) return;
    const rail = document.createElement('div');
    rail.className = 'scroll-rail';
    const bar = document.createElement('div');
    bar.className = 'scroll-rail__bar';
    rail.appendChild(bar);
    document.body.appendChild(rail);

    function update() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? clamp(window.scrollY / h, 0, 1) : 0;
      document.documentElement.style.setProperty('--scroll-progress', p.toFixed(4));
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ======================================================================
   *  3.  NAV SCROLL CLASS
   * ====================================================================== */
  function installNavScrollClass() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const onScroll = () => {
      if (window.scrollY > 24) nav.classList.add('is-scrolled');
      else nav.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ======================================================================
   *  4.  INTERSECTION-TRIGGERED REVEALS
   * ====================================================================== */
  function installReveals() {
    const targets = document.querySelectorAll('[data-reveal], [data-reveal-wave]');
    if (!targets.length || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => io.observe(el));
  }

  /* ======================================================================
   *  5.  MAGNETIC CURSOR / SPOTLIGHT + RETICLE
   * ====================================================================== */
  function installCursor() {
    if (isTouch() || reduced()) return;

    const spot = document.createElement('div');
    spot.className = 'cursor-spot';
    document.body.appendChild(spot);

    const ret = document.createElement('div');
    ret.className = 'cursor-reticle';
    document.body.appendChild(ret);

    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    let sx = x, sy = y;   // smoothed spot
    let rx = x, ry = y;   // smoothed reticle
    let visible = false;

    function onMove(e) {
      x = e.clientX; y = e.clientY;
      if (!visible) {
        visible = true;
        spot.classList.add('is-visible');
        ret.classList.add('is-visible');
      }
      const t = e.target.closest('a, button, .tile, .holo-card, .btn, [data-magnetic]');
      if (t) ret.classList.add('is-hover');
      else   ret.classList.remove('is-hover');
    }
    function onLeave() {
      visible = false;
      spot.classList.remove('is-visible');
      ret.classList.remove('is-visible');
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    document.body.addEventListener('pointerleave', onLeave);

    function tick() {
      sx = lerp(sx, x, 0.18);
      sy = lerp(sy, y, 0.18);
      rx = lerp(rx, x, 0.38);
      ry = lerp(ry, y, 0.38);
      spot.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
      ret.style.transform  = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${ret.classList.contains('is-hover') ? 1.8 : 1})`;
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ======================================================================
   *  6.  MAGNETIC BUTTONS (attract cursor within radius)
   * ====================================================================== */
  function installMagnetic() {
    if (isTouch() || reduced()) return;
    const targets = document.querySelectorAll('[data-magnetic]');
    if (!targets.length) return;

    targets.forEach(el => {
      el.classList.add('is-magnetic');
      const radius = Number(el.dataset.magnetic) || 60;
      let rx = 0, ry = 0, tx = 0, ty = 0, rafId = 0;

      function tick() {
        rx = lerp(rx, tx, 0.2);
        ry = lerp(ry, ty, 0.2);
        el.style.setProperty('--mx', rx.toFixed(2) + 'px');
        el.style.setProperty('--my', ry.toFixed(2) + 'px');
        if (Math.abs(rx - tx) > 0.1 || Math.abs(ry - ty) > 0.1) rafId = requestAnimationFrame(tick);
      }

      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        const strength = Math.max(0, 1 - d / (radius + Math.max(r.width, r.height) / 2));
        tx = dx * 0.32 * strength;
        ty = dy * 0.32 * strength;
        el.dataset.magneticActive = '1';
        cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick);
      });
      el.addEventListener('pointerleave', () => {
        tx = 0; ty = 0;
        el.dataset.magneticActive = '0';
        cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick);
      });
    });
  }

  /* ======================================================================
   *  7.  3D TILT (mouse-tracked, gyroscope fallback)
   * ====================================================================== */
  function installTilt() {
    const targets = document.querySelectorAll('[data-tilt-3d]');
    if (!targets.length) return;

    targets.forEach(el => {
      el.classList.add('tilt-3d');
      const maxDeg = Number(el.dataset.tiltMax) || 8;
      const scale  = Number(el.dataset.tiltScale) || 8;
      let tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, rafId = 0;
      let active = false;

      function tick() {
        rx = lerp(rx, tx, 0.15);
        ry = lerp(ry, ty, 0.15);
        rz = lerp(rz, tz, 0.15);
        el.style.setProperty('--tx', rx.toFixed(2) + 'deg');
        el.style.setProperty('--ty', ry.toFixed(2) + 'deg');
        el.style.setProperty('--tz', rz.toFixed(2) + 'px');
        if (active || Math.abs(rx) > 0.05 || Math.abs(ry) > 0.05 || Math.abs(rz) > 0.1) {
          rafId = requestAnimationFrame(tick);
        }
      }

      if (!isTouch()) {
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;  // -0.5..0.5
          const ny = (e.clientY - r.top)  / r.height - 0.5;
          tx =  nx * maxDeg;          // rotateY
          ty = -ny * maxDeg;          // rotateX
          tz = scale;
          active = true;
          el.dataset.tiltActive = '1';
          // spotlight params for .holo-card[data-spotlight]
          el.style.setProperty('--mx', ((nx + 0.5) * 100).toFixed(1) + '%');
          el.style.setProperty('--my', ((ny + 0.5) * 100).toFixed(1) + '%');
          cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick);
        });
        el.addEventListener('pointerleave', () => {
          tx = 0; ty = 0; tz = 0;
          active = false;
          el.dataset.tiltActive = '0';
          cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick);
        });
      }
    });
  }

  /* ======================================================================
   *  8.  PARALLAX LAYERS — pointer-driven
   * ====================================================================== */
  function installPointerParallax() {
    if (reduced()) return;
    const scopes = document.querySelectorAll('[data-parallax-scope]');
    if (!scopes.length) return;

    scopes.forEach(scope => {
      const layers = scope.querySelectorAll('[data-parallax-layer]');
      if (!layers.length) return;
      let tx = 0, ty = 0, rx = 0, ry = 0, raf = 0;
      function tick() {
        rx = lerp(rx, tx, 0.1);
        ry = lerp(ry, ty, 0.1);
        layers.forEach(l => {
          l.style.setProperty('--px', rx.toFixed(3));
          l.style.setProperty('--py', ry.toFixed(3));
        });
        if (Math.abs(rx - tx) > 0.01 || Math.abs(ry - ty) > 0.01) raf = requestAnimationFrame(tick);
      }
      scope.addEventListener('pointermove', (e) => {
        const r = scope.getBoundingClientRect();
        tx = (e.clientX - r.left) / r.width - 0.5;
        ty = (e.clientY - r.top)  / r.height - 0.5;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      });
      scope.addEventListener('pointerleave', () => {
        tx = 0; ty = 0;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      });
    });
  }

  /* ======================================================================
   *  9.  TEXT SCRAMBLE (for data-scramble targets on reveal / hover)
   * ====================================================================== */
  const SCRAMBLE_CHARS = '01!<>-_\\/[]{}—=+*^?#@$%&';
  function scramble(el, toText, { duration = 900, delay = 0 } = {}) {
    if (reduced()) { el.textContent = toText; return; }
    const from = el.textContent || '';
    const len = Math.max(from.length, toText.length);
    const start = now() + delay;
    const queue = [];
    for (let i = 0; i < len; i++) {
      const c1 = from[i] || '';
      const c2 = toText[i] || '';
      const startAt = Math.random() * duration * 0.4;
      const endAt   = startAt + duration * 0.4 + Math.random() * duration * 0.35;
      queue.push({ c1, c2, startAt, endAt, char: '' });
    }
    function frame() {
      const t = now() - start;
      if (t < 0) { requestAnimationFrame(frame); return; }
      let out = '';
      let complete = 0;
      queue.forEach(q => {
        if (t >= q.endAt) { complete++; out += q.c2; }
        else if (t >= q.startAt) {
          if (!q.char || Math.random() < 0.3) q.char = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          out += q.char;
        } else out += q.c1;
      });
      el.textContent = out;
      if (complete < queue.length) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function installScramble() {
    const targets = document.querySelectorAll('[data-scramble]');
    if (!targets.length || !('IntersectionObserver' in window)) return;
    targets.forEach(el => {
      const truth = el.dataset.scramble || el.textContent;
      el.dataset.scrambleOriginal = truth;
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            scramble(el, truth, { duration: 1100 });
            io.unobserve(el);
          }
        });
      }, { threshold: 0.4 });
      io.observe(el);
    });
    // Re-scramble on hover for labels
    document.querySelectorAll('[data-scramble-hover]').forEach(el => {
      const truth = el.textContent;
      el.addEventListener('pointerenter', () => scramble(el, truth, { duration: 600 }));
    });
  }

  /* ======================================================================
   *  10. SPLIT TEXT (character-level reveal on hero headlines)
   * ====================================================================== */
  function installSplitText() {
    document.querySelectorAll('[data-split-text]').forEach(el => {
      if (el.dataset.splitDone) return;
      const text = el.textContent;
      el.textContent = '';
      let idx = 0;
      text.split('').forEach(ch => {
        const span = document.createElement('span');
        span.setAttribute('data-char', '');
        span.style.setProperty('--char-index', idx++);
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        el.appendChild(span);
      });
      el.classList.add('ny-split');
      el.dataset.splitDone = '1';
    });
    // reveal on intersection
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('.ny-split').forEach(el => io.observe(el));
  }

  /* ======================================================================
   *  11. SPOTLIGHT FOR HOLO CARDS (pure CSS var pipe)
   * ====================================================================== */
  function installCardSpotlights() {
    document.querySelectorAll('[data-spotlight]').forEach(el => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      });
    });
  }

  /* ======================================================================
   *  12. CITY CLUSTER AUTOMATION (optional enhancement)
   * ====================================================================== */
  function installCityCluster() {
    document.querySelectorAll('[data-city-cluster]').forEach(root => {
      if (root.dataset.clusterDone) return;
      const cities = (root.dataset.cities || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!cities.length) return;
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute; inset:0; overflow:hidden;';
      root.appendChild(layer);

      const rect = root.getBoundingClientRect();
      const W = rect.width || 600, H = rect.height || 280;
      const nodes = cities.map((name, i) => {
        const angle = (i / cities.length) * Math.PI * 2 + Math.random() * 0.3;
        const r = 0.3 + Math.random() * 0.3;
        const x = 50 + Math.cos(angle) * r * 45;
        const y = 50 + Math.sin(angle) * r * 30;
        const dot = document.createElement('div');
        dot.className = 'city-node';
        dot.style.left = x + '%';
        dot.style.top = y + '%';
        dot.style.animationDelay = (Math.random() * 2.4) + 's';
        dot.setAttribute('data-label', name);
        layer.appendChild(dot);
        return { x: x / 100 * W, y: y / 100 * H, el: dot };
      });
      // connect some nodes
      const connections = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (Math.random() > 0.68) continue;
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          const line = document.createElement('div');
          line.className = 'city-line';
          line.style.left = a.x + 'px';
          line.style.top = a.y + 'px';
          line.style.width = len + 'px';
          line.style.transform = `rotate(${ang}rad)`;
          layer.appendChild(line);
          connections.push(line);
        }
      }
      root.dataset.clusterDone = '1';
    });
  }

  /* ======================================================================
   *  13. INIT
   * ====================================================================== */
  function boot() {
    try { installScrollRail(); }     catch {}
    try { installNavScrollClass(); } catch {}
    try { installReveals(); }        catch {}
    try { installCursor(); }         catch {}
    try { installMagnetic(); }       catch {}
    try { installTilt(); }           catch {}
    try { installPointerParallax(); }catch {}
    try { installScramble(); }       catch {}
    try { installSplitText(); }      catch {}
    try { installCardSpotlights(); } catch {}
    try { installCityCluster(); }    catch {}
    // Smooth scroll is opt-in via body data attribute to avoid fighting pages with sticky maps.
    if (document.body.dataset.smoothScroll === '1') {
      try { SmoothScroll(); } catch {}
    }
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });

  global.NY_FX = { scramble, SmoothScroll };
})(window);
