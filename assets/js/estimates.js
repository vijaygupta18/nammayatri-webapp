(function () {
  'use strict';
  const { qs, toast } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('home');
  NY_UI.warnIfNoProxy();
  NY_UI.renderJourneyBar('estimates');
  if (!NY_SESSION.requireAuth()) return;

  // Cancel every live estimate from this search before navigating away. Releases
  // the held quotes on the backend and prevents "dangling" selections.
  let bookingStarted = false;
  async function cancelAllEstimates() {
    if (bookingStarted) return;
    const ids = (NY_SESSION.estimates || []).map(e => e.id).filter(Boolean);
    if (!ids.length) return;
    await Promise.allSettled(ids.map(id => NY_API.cancelEstimate(id).catch(() => {})));
  }
  function armBackHandlers() {
    // Any link back to home.html or a nav link → cancel estimates first.
    document.querySelectorAll('a[href="home.html"], [data-back]').forEach(a => {
      a.addEventListener('click', (e) => {
        if (bookingStarted) return;
        e.preventDefault();
        const href = a.getAttribute('href') || 'home.html';
        cancelAllEstimates().finally(() => { NY_SESSION.clearFlow(); location.href = href; });
      }, { once: true });
    });
    // Tab close / page hide → best-effort release via sendBeacon-ish fire-and-forget.
    window.addEventListener('pagehide', () => { if (!bookingStarted) cancelAllEstimates(); });
  }

  const src = NY_SESSION.source, dst = NY_SESSION.dest, searchId = NY_SESSION.searchId;
  if (!src || !dst || !searchId) { toast('Missing trip data. Start over.', { type: 'error' }); location.replace('home.html'); return; }

  qs('#trip-src').textContent = src.title;
  qs('#trip-dst').textContent = dst.title;
  qs('#trip-distance').textContent = NY_SESSION.route ? fmt.distance(NY_SESSION.route.distance) : '—';
  qs('#trip-duration').textContent = NY_SESSION.route ? fmt.duration(NY_SESSION.route.duration) : '—';

  // map
  const map = L.map('estimate-map', { zoomControl: true }).setView([src.lat, src.lon], 13);
  (function(_m){ const _t=L.tileLayer(NY_UI.tileUrl(),{attribution:NY_UI.tileAttribution,maxZoom:19}).addTo(_m); window.addEventListener('ny:theme',()=>_t.setUrl(NY_UI.tileUrl())); })(map);
  const srcIcon = L.icon({ iconUrl: 'assets/img/map/ny_ic_confirm_pickup_marker.webp', iconSize: [32, 40], iconAnchor: [16, 40] });
  const dstIcon = L.icon({ iconUrl: 'assets/img/map/ny_ic_drop_location_marker.webp',  iconSize: [32, 40], iconAnchor: [16, 40] });
  L.marker([src.lat, src.lon], { icon: srcIcon }).addTo(map);
  L.marker([dst.lat, dst.lon], { icon: dstIcon }).addTo(map);
  if (NY_SESSION.route?.points?.length) {
    const pl = L.polyline(NY_SESSION.route.points.map(p => [p.lat, p.lon]), { color: '#FCC32C', weight: 4, opacity: 0.95 }).addTo(map);
    map.fitBounds(pl.getBounds(), { padding: [60, 60] });
  } else {
    map.fitBounds([[src.lat, src.lon], [dst.lat, dst.lon]], { padding: [60, 60] });
  }

  // estimates
  let estimates = [];
  let selectedId = null;
  let pollAlive = true;

  const list = qs('#estimates-list');
  const confirmBtn = qs('#confirm-btn');
  const cLabel = qs('.btn-label', confirmBtn);
  const cSpin = qs('.btn-spinner', confirmBtn);

  async function loadResults() {
    let tries = 0;
    while (pollAlive && tries < 20) {
      try {
        const r = await NY_API.searchResults(searchId);
        if (Array.isArray(r?.estimates) && r.estimates.length) {
          estimates = r.estimates;
          NY_SESSION.estimates = estimates;
          renderEstimates();
          return;
        }
      } catch (e) {
        console.warn('estimates poll error', e);
      }
      tries++;
      await new Promise(r => setTimeout(r, 1800));
    }
    if (pollAlive) {
      list.innerHTML = `<div class="empty"><div class="empty-icon">😕</div><p>No rides found. Please try again.</p></div>`;
    }
  }

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attachTilt(tile) {
    if (prefersReducedMotion) return;
    tile.addEventListener('pointermove', (ev) => {
      const r = tile.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (ev.clientX - cx) / (r.width / 2);
      const dy = (ev.clientY - cy) / (r.height / 2);
      const max = 6;
      const ry = Math.max(-max, Math.min(max, dx * max));
      const rx = Math.max(-max, Math.min(max, -dy * max));
      tile.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      tile.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      tile.style.transform = 'rotateX(var(--rx)) rotateY(var(--ry)) translateZ(2px)';
    });
    tile.addEventListener('pointerleave', () => {
      tile.style.removeProperty('--rx');
      tile.style.removeProperty('--ry');
      tile.style.transform = '';
    });
  }

  function renderEstimates() {
    if (!estimates.length) return;
    const cnt = qs('#count-pill');
    if (cnt) cnt.textContent = estimates.length + ' option' + (estimates.length === 1 ? '' : 's');
    // Trigger the CSS stagger reveal on each re-render by re-applying the class.
    list.classList.remove('stagger-in');
    // force reflow so the animation can replay
    void list.offsetWidth;
    list.classList.add('stagger-in');
    list.innerHTML = estimates.map(e => {
      const min = e.totalFareRange?.minFareWithCurrency?.amount ?? e.estimatedFareWithCurrency?.amount;
      const max = e.totalFareRange?.maxFareWithCurrency?.amount ?? e.estimatedFareWithCurrency?.amount;
      const priceLabel = (min === max) ? fmt.money(min) : `${fmt.money(min)}–${fmt.money(max)}`;
      const remotePath = fmt.escape(e.vehicleIconUrl || '');
      const localPath  = NY_SESSION.vehicleImage(e.vehicleVariant || e.serviceTierType || e.serviceTierName);
      const primarySrc = remotePath || localPath;
      const acChip = e.isAirConditioned === true ? `<span class="chip chip-gold">AC</span>` : '';
      const seatTxt = (e.vehicleServiceTierSeatingCapacity || 4) + ' seats';
      const desc = e.serviceTierShortDesc ? fmt.escape(e.serviceTierShortDesc) : '';
      return `<article class="tile" role="button" tabindex="0" data-id="${fmt.escape(e.id)}" aria-selected="${selectedId === e.id}">
        <div class="tile-icon"><img src="${primarySrc}" alt="" onerror="this.onerror=null;this.src='${localPath}';this.onerror=function(){this.style.display='none';};"/></div>
        <div>
          <div class="tile-name">${fmt.escape(e.serviceTierName || e.vehicleVariant)}</div>
          <div class="tile-meta">
            ${acChip}
            ${desc ? `<span>${desc}</span>` : ''}
            <span>${seatTxt}</span>
          </div>
        </div>
        <div class="tile-price">${priceLabel}<span class="sub">est. fare</span></div>
      </article>`;
    }).join('');

    list.querySelectorAll('.tile').forEach(t => {
      t.addEventListener('click', () => select(t.dataset.id));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.dataset.id); } });
      attachTilt(t);
    });

    if (!selectedId && estimates[0]) select(estimates[0].id);
  }

  function select(id) {
    selectedId = id;
    const est = estimates.find(e => e.id === id);
    NY_SESSION.selectedEstimate = est;
    list.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-selected', t.dataset.id === id ? 'true' : 'false'));
    confirmBtn.disabled = false;
    cLabel.innerHTML = `Confirm ${fmt.escape(est?.serviceTierName || 'ride')} <span class="btn-sub">${fmt.money(est?.estimatedFareWithCurrency?.amount)} · tap to book</span>`;
  }

  confirmBtn.addEventListener('click', async () => {
    if (!selectedId) return;
    const est = estimates.find(e => e.id === selectedId);
    const fare = est?.estimatedFareWithCurrency?.amount != null ? ' for ' + fmt.money(est.estimatedFareWithCurrency.amount) : '';
    const ok = await NY_UI.confirm(`Confirm your ${est.serviceTierName} ride${fare}?`, 'Confirm ride');
    if (!ok) return;
    bookingStarted = true; // suppress cancel-on-leave
    confirmBtn.disabled = true; cSpin.classList.remove('hidden'); cLabel.textContent = 'Confirming…';
    try {
      const body = {
        autoAssignEnabled: true,
        autoAssignEnabledV2: true,
        billingCategory: 'PERSONAL',
        otherSelectedEstimates: estimates.filter(e => e.id !== selectedId).map(e => e.id).slice(0, 2),
      };
      const sel = await NY_API.estimateSelect2(selectedId, body);
      // Store the selected estimate id + any bookingId we got back immediately,
      // then hand off to ride.html which will keep polling until a driver is matched.
      NY_SESSION.selectedEstimateId = selectedId;
      NY_SESSION.touchFlow();
      const immediateBookingId = sel?.bookingIdV2 || sel?.bookingId || null;
      if (immediateBookingId) NY_SESSION.bookingId = immediateBookingId;
      location.href = 'ride.html';
    } catch (e) {
      console.error(e);
      toast(e?.message || 'Booking failed', { type: 'error' });
      bookingStarted = false;
      confirmBtn.disabled = false; cSpin.classList.add('hidden');
      cLabel.textContent = `Confirm ${est?.serviceTierName || 'ride'}`;
    }
  });

  loadResults();
  armBackHandlers();
  window.addEventListener('beforeunload', () => { pollAlive = false; });
})();
