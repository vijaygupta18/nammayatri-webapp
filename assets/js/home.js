(function () {
  'use strict';
  const { qs, toast } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('home');
  NY_UI.renderModeBanner();
  NY_UI.renderJourneyBar('search');
  if (!NY_SESSION.requireAuth()) return;

  // If there's an active ride flow, offer to resume it before letting the user
  // start over. Wiping an in-flight search/booking silently would be wrong.
  const activeState = NY_SESSION.activeFlowState();
  if (activeState !== 'none') {
    const label = activeState === 'tracking'   ? 'You have an active ride.'
                : activeState === 'confirming' ? 'A ride confirmation is still in progress.'
                :                                'You have an active ride search.';
    const targetUrl = NY_SESSION.activeFlowUrl();
    const banner = document.createElement('div');
    banner.style.cssText = 'position: sticky; top: 60px; z-index: 40; margin: 0 auto 16px; max-width: min(1240px, 94vw); padding: 12px 16px; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); border: 1px solid var(--accent); border-radius: var(--r-md); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="dot" style="background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);"></span>
        <span style="font-weight: 500;">${label}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-ghost btn-sm" data-resume-new>Start new</button>
        <a class="btn btn-primary btn-sm" href="${targetUrl}">Resume</a>
      </div>`;
    document.querySelector('main .container')?.prepend(banner);
    banner.querySelector('[data-resume-new]').addEventListener('click', async () => {
      // Best-effort clean-up before starting over.
      if (activeState === 'search' || activeState === 'confirming') {
        try {
          const ids = (NY_SESSION.estimates || []).map(e => e.id).filter(Boolean);
          await Promise.allSettled(ids.map(id => NY_API.cancelEstimate(id).catch(() => {})));
        } catch {}
      } else if (activeState === 'tracking' && NY_SESSION.bookingId) {
        // Don't auto-cancel a confirmed booking — make the user do it from the ride page.
        NY_UI.toast('Cancel the active ride from its tracking screen first.', { type: 'error', duration: 4500 });
        return;
      }
      NY_SESSION.clearFlow();
      banner.remove();
    });
  } else {
    // Fresh start — clear any stale remnants.
    NY_SESSION.clearFlow();
  }

  // ---- Map ----
  const initialView = (() => {
    const v = NY_SESSION.lastViewport;
    if (v && typeof v.lat === 'number' && typeof v.lon === 'number') {
      return { center: [v.lat, v.lon], zoom: typeof v.zoom === 'number' ? v.zoom : NY_CONFIG.DEFAULT_ZOOM };
    }
    return { center: NY_CONFIG.DEFAULT_LATLNG, zoom: NY_CONFIG.DEFAULT_ZOOM };
  })();
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView(initialView.center, initialView.zoom);
  (function(_m){ const _t=L.tileLayer(NY_UI.tileUrl(),{attribution:NY_UI.tileAttribution,maxZoom:19}).addTo(_m); window.addEventListener('ny:theme',()=>_t.setUrl(NY_UI.tileUrl())); })(map);

  map.on('moveend', () => {
    const c = map.getCenter();
    NY_SESSION.lastViewport = { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
  });

  const srcMarkerIcon = L.icon({
    iconUrl: 'assets/img/map/ny_ic_confirm_pickup_marker.webp',
    iconSize: [32, 40], iconAnchor: [16, 40],
  });
  const dstMarkerIcon = L.icon({
    iconUrl: 'assets/img/map/ny_ic_drop_location_marker.webp',
    iconSize: [32, 40], iconAnchor: [16, 40],
  });
  const markerIcon = (type) => (type === 'src' ? srcMarkerIcon : dstMarkerIcon);

  let srcMarker = null, dstMarker = null, routeLine = null;
  let src = null, dst = null;

  const setMarker = (which, loc) => {
    const m = which === 'src' ? srcMarker : dstMarker;
    const newM = L.marker([loc.lat, loc.lon], { draggable: true, icon: markerIcon(which) }).addTo(map);
    newM.on('dragend', async (e) => {
      const { lat, lng } = e.target.getLatLng();
      const next = await reverseGeocode(lat, lng) || { title: 'Pin location', lat, lon: lng };
      which === 'src' ? (src = next, qs('#src-input').value = next.title)
                      : (dst = next, qs('#dst-input').value = next.title);
      if (src && dst) fitBoth();
    });
    if (m) map.removeLayer(m);
    if (which === 'src') srcMarker = newM; else dstMarker = newM;
  };

  const fitBoth = () => {
    if (!src || !dst) return;
    map.fitBounds([[src.lat, src.lon], [dst.lat, dst.lon]], { padding: [80, 80] });
  };

  // ---- Autocomplete ----
  const ac = qs('#autocomplete-box');
  let activeField = null;
  let acTimer = null;
  const srcInput = qs('#src-input'), dstInput = qs('#dst-input');
  [srcInput, dstInput].forEach(inp => {
    inp.addEventListener('focus', () => activeField = inp);
    inp.addEventListener('input', () => scheduleSearch(inp));
    inp.addEventListener('blur', () => setTimeout(() => ac.classList.add('hidden'), 180));
  });

  function scheduleSearch(inp) {
    clearTimeout(acTimer);
    const q = inp.value.trim();
    if (q.length < 2) { ac.classList.add('hidden'); return; }
    acTimer = setTimeout(() => runAutocomplete(inp, q), 250);
  }

  async function runAutocomplete(inp, q) {
    try {
      const center = map.getCenter();
      const res = await NY_API.autoComplete({ input: q, lat: center.lat, lng: center.lng, isPickup: inp === srcInput });
      renderPredictions(inp, res?.predictions || []);
    } catch (e) {
      console.error(e);
      ac.classList.add('hidden');
    }
  }

  function renderPredictions(inp, list) {
    if (!list.length) { ac.classList.add('hidden'); return; }
    ac.innerHTML = list.map((p, i) => `
      <div class="autocomplete-item" role="option" data-idx="${i}">
        <span class="icon">${inp === srcInput ? '📍' : '📌'}</span>
        <span class="desc">${fmt.escape(p.description)}</span>
        ${p.distance ? `<span class="dist">${fmt.distance(p.distance)}</span>` : ''}
      </div>`).join('');
    ac.classList.remove('hidden');
    ac.querySelectorAll('.autocomplete-item').forEach((item, i) => {
      item.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        ac.classList.add('hidden');
        const pick = list[i];
        await selectPrediction(inp, pick);
      });
    });
  }

  async function selectPrediction(inp, pick) {
    try {
      const det = await NY_API.getPlaceDetails(pick.placeId);
      const loc = {
        title: pick.description,
        lat: det?.location?.lat,
        lon: det?.location?.lon,
        area: pick.description.split(',')[0] || '',
        city: 'Bengaluru', state: 'Karnataka', country: 'India',
        street: pick.description.split(',')[0] || '',
        placeId: pick.placeId,
      };
      inp.value = pick.description;
      if (inp === srcInput) { src = loc; setMarker('src', loc); }
      else                  { dst = loc; setMarker('dst', loc); }
      if (src && dst) fitBoth();
      else map.setView([loc.lat, loc.lon], 14);
      NY_SESSION.addRecent(loc);
      renderChips();
    } catch (e) {
      toast('Could not fetch place details', { type: 'error' });
    }
  }

  // ---- Recents & favorites chips ----
  const CHIP_STYLE = 'border: 1px solid var(--line-2); border-radius: 2px; padding: 4px 10px; background: transparent; color: var(--text-2); font-family: var(--font-mono); font-size: 11px; cursor: pointer; margin: 0 6px 6px 0; display: inline-block;';
  let chipsEl = null;
  function ensureChipsHost() {
    if (chipsEl) return chipsEl;
    // Anchor the chips row above the location inputs inside the search card.
    const card = srcInput.closest('.search-card') || srcInput.parentElement?.parentElement;
    const inputs = card?.querySelector('.location-inputs');
    const target = inputs || srcInput.parentElement;
    if (!target) return null;
    chipsEl = document.createElement('div');
    chipsEl.id = 'recent-chips';
    chipsEl.setAttribute('style', 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom: 12px;');
    target.parentElement.insertBefore(chipsEl, target);
    return chipsEl;
  }
  function chipButton(label, loc, kind) {
    const safeLabel = (label || '').replace(/[<>&"']/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
    const prefix = kind === 'fav' ? '&#9733; ' : '&#8635; ';
    return `<button type="button" class="chip-btn" data-kind="${kind}" data-lat="${loc.lat}" data-lon="${loc.lon}" data-title="${safeLabel}" data-area="${(loc.area || '').replace(/"/g, '')}" data-city="${(loc.city || '').replace(/"/g, '')}" data-state="${(loc.state || '').replace(/"/g, '')}" data-country="${(loc.country || '').replace(/"/g, '')}" data-pid="${(loc.placeId || '').replace(/"/g, '')}" style="${CHIP_STYLE}">${prefix}${safeLabel}</button>`;
  }
  function renderChips() {
    const host = ensureChipsHost();
    if (!host) return;
    const recents = NY_SESSION.recents || [];
    const favorites = NY_SESSION.favorites || [];
    if (!recents.length && !favorites.length) { host.innerHTML = ''; return; }
    const favHtml = favorites.map(f => chipButton(f.label, f.loc || {}, 'fav')).join('');
    const recHtml = recents.slice(0, 6).map(r => chipButton(r.title, r, 'rec')).join('');
    host.innerHTML = favHtml + recHtml;
    host.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => {
        const loc = {
          title: btn.dataset.title,
          lat: parseFloat(btn.dataset.lat),
          lon: parseFloat(btn.dataset.lon),
          area: btn.dataset.area || '',
          city: btn.dataset.city || '',
          state: btn.dataset.state || '',
          country: btn.dataset.country || '',
          street: btn.dataset.area || '',
          placeId: btn.dataset.pid || '',
        };
        const target = activeField || srcInput;
        target.value = loc.title;
        if (target === srcInput) { src = loc; setMarker('src', loc); }
        else                     { dst = loc; setMarker('dst', loc); }
        if (src && dst) fitBoth();
        else map.setView([loc.lat, loc.lon], 14);
        NY_SESSION.addRecent(loc);
        renderChips();
      });
    });
  }
  renderChips();

  // ---- Geolocation ----
  qs('#gps-btn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocation unavailable', { type: 'error' });
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setView([lat, lng], 15);
      const loc = (await reverseGeocode(lat, lng)) || { title: 'Current location', lat, lon: lng, area: '', city: '', state: '', country: '', street: '' };
      src = loc;
      srcInput.value = loc.title;
      setMarker('src', loc);
    }, () => toast('Location permission denied', { type: 'error' }), { enableHighAccuracy: true, timeout: 6000 });
  });

  async function reverseGeocode(lat, lng) {
    try {
      const r = await NY_API.getPlaceName({ lat, lng });
      const a = Array.isArray(r) ? r[0] : r;
      if (a) return { title: a.title || a.street || 'Nearby location', lat: a.lat ?? lat, lon: a.lon ?? lng, area: a.area || '', city: a.city || '', state: a.state || '', country: a.country || '', street: a.street || '' };
    } catch {}
    return { title: 'Pinned location', lat, lon: lng, area: '', city: '', state: '', country: '', street: '' };
  }

  // ---- Search ----
  const searchBtn = qs('#search-btn');
  const sLabel = qs('.btn-label', searchBtn);
  const sSpin = qs('.btn-spinner', searchBtn);
  searchBtn.addEventListener('click', async () => {
    if (!src || !dst) { toast('Pick both pickup and drop.', { type: 'error' }); return; }
    searchBtn.disabled = true; sSpin.classList.remove('hidden'); sLabel.textContent = 'Finding rides…';
    try {
      const body = {
        source: {
          address: { area: src.area, areaCode: '', building: '', city: src.city, country: src.country, door: null, street: src.street, state: src.state, title: src.title, ward: '' },
          gps: { lat: src.lat, lon: src.lon },
        },
        dest: {
          address: { area: dst.area, areaCode: '', building: '', city: dst.city, country: dst.country, door: null, street: dst.street, state: dst.state, title: dst.title, ward: '' },
          gps: { lat: dst.lat, lon: dst.lon },
        },
      };
      const res = await NY_API.rideSearch(body);
      NY_SESSION.searchId = res.searchId;
      NY_SESSION.source = src;
      NY_SESSION.dest = dst;
      NY_SESSION.route = res.routeInfo || null;
      NY_SESSION.touchFlow();
      // Preview route quickly before navigating
      if (res.routeInfo?.points?.length) drawRoute(res.routeInfo.points);
      qs('#route-sheet').classList.remove('hidden');
      qs('#route-src').textContent = src.title;
      qs('#route-dst').textContent = dst.title;
      qs('#route-distance').textContent = fmt.distance(res.routeInfo?.distance);
      qs('#route-duration').textContent = fmt.duration(res.routeInfo?.duration);
      setTimeout(() => location.href = 'estimates.html', 700);
    } catch (e) {
      console.error(e);
      toast(e?.message || 'Could not search rides', { type: 'error' });
    } finally {
      searchBtn.disabled = false; sSpin.classList.add('hidden'); sLabel.textContent = 'See ride options';
    }
  });

  function drawRoute(points) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(points.map(p => [p.lat, p.lon]), {
      color: '#FCC32C', weight: 5, opacity: 0.95, lineCap: 'round',
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [80, 80] });
  }

  // ---- Default pickup via geolocation on load (best-effort) ----
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setView([lat, lng], 14);
      const loc = await reverseGeocode(lat, lng);
      src = loc; srcInput.value = loc.title; setMarker('src', loc);
    }, () => {}, { timeout: 3000 });
  }
})();
