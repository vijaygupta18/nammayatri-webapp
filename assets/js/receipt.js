(function () {
  'use strict';
  const { qs, toast } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('rides');
  NY_UI.renderJourneyBar('receipt');
  if (!NY_SESSION.requireAuth()) return;

  const params = new URLSearchParams(location.search);
  const bookingId = params.get('booking') || NY_SESSION.bookingId;
  if (!bookingId) { location.replace('rides.html'); return; }

  (async () => {
    let b;
    try { b = await NY_API.booking(bookingId); }
    catch { try { const l = await NY_API.bookingList({ limit: 50 }); b = (l.list || []).find(x => x.id === bookingId); } catch {} }
    if (!b) { toast('Booking not found', { type: 'error' }); return; }
    render(b);
  })();

  function render(b) {
    const st = b.status || '—';
    qs('#rc-status').textContent = st;
    qs('#rc-status').className = 'chip ' + (st === 'COMPLETED' ? 'chip-green' : st === 'CANCELLED' ? 'chip-red' : 'chip-gold');
    qs('#rc-id').textContent = b.displayBookingId || b.id.slice(0, 8);
    const tierEl = qs('#rc-tier');
    tierEl.textContent = b.serviceTierName || b.vehicleVariant || 'Ride';
    // Prefer the API's vehicleIconUrl; fall back to the bundled local PNG.
    const remoteVeh = b.vehicleIconUrl || '';
    const localVeh  = NY_SESSION.vehicleImage(b.vehicleVariant || b.serviceTierName);
    const primaryVeh = remoteVeh || localVeh;
    if (tierEl && tierEl.parentElement && !tierEl.parentElement.querySelector('[data-rc-veh]')) {
      const fig = document.createElement('figure');
      fig.setAttribute('data-rc-veh', '1');
      fig.setAttribute('style', 'width:40px; height:28px; margin:0 8px 0 0; display:inline-flex; align-items:center; justify-content:center; vertical-align:middle;');
      const img = document.createElement('img');
      img.src = primaryVeh;
      img.alt = '';
      img.setAttribute('style', 'max-width:100%; max-height:100%; object-fit:contain;');
      img.onerror = function () {
        img.onerror = null;
        if (localVeh && img.src !== localVeh) {
          img.src = localVeh;
          img.onerror = function () { img.style.display = 'none'; };
        } else {
          img.style.display = 'none';
        }
      };
      fig.appendChild(img);
      tierEl.parentElement.insertBefore(fig, tierEl);
    }
    qs('#rc-date').textContent = fmt.dateTime(b.createdAt);
    qs('#rc-src').textContent = b.fromLocation?.title || b.fromLocation?.area || '—';
    const to = b.bookingDetails?.contents?.toLocation;
    qs('#rc-dst').textContent = to?.title || to?.area || '—';
    const d = b.estimatedDistanceWithUnit?.value ?? b.estimatedDistance;
    qs('#rc-dist').textContent = fmt.distance(d);
    qs('#rc-dur').textContent = fmt.duration(b.estimatedDuration);
    qs('#rc-rating').innerHTML = b.ratingValue ? '★'.repeat(b.ratingValue) + '☆'.repeat(5 - b.ratingValue) : '<span class="dim">Not rated</span>';

    // fare breakup
    const bk = b.estimatedFareBreakup || [];
    const total = b.estimatedTotalFareWithCurrency?.amount ?? b.estimatedFareWithCurrency?.amount;
    const rows = bk.map(x => `<dt>${fmt.escape(x.description || x.title)}</dt><dd>${fmt.money(x.amountWithCurrency?.amount ?? x.amount)}</dd>`).join('');
    qs('#rc-breakup').innerHTML = rows + `<dt><b>Total</b></dt><dd class="total">${fmt.money(total)}</dd>`;

    // map
    if (b.fromLocation?.lat && to?.lat) {
      const map = L.map('rc-map', { zoomControl: true }).setView([b.fromLocation.lat, b.fromLocation.lon], 13);
      (function(_m){ const _t=L.tileLayer(NY_UI.tileUrl(),{attribution:NY_UI.tileAttribution,maxZoom:19}).addTo(_m); window.addEventListener('ny:theme',()=>_t.setUrl(NY_UI.tileUrl())); })(map);
      L.marker([b.fromLocation.lat, b.fromLocation.lon]).addTo(map);
      L.marker([to.lat, to.lon]).addTo(map);
      const line = L.polyline([[b.fromLocation.lat, b.fromLocation.lon], [to.lat, to.lon]], { color: '#FCC32C', weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    }
  }

  qs('#print-btn').addEventListener('click', () => window.print());
})();
