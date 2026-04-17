(function () {
  'use strict';
  const { qs, qsa, toast } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('rides');
  if (!NY_SESSION.requireAuth()) return;

  const listEl = qs('#rides-list');
  let filter = 'all';
  let rides = [];

  async function load() {
    try {
      const r = await NY_API.bookingList({ limit: 30, offset: 0, onlyActive: false });
      rides = Array.isArray(r?.list) ? r.list : [];
      render();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Could not load rides', { type: 'error' });
      listEl.innerHTML = emptyState('Could not load rides.', '⚠');
    }
  }

  function byFilter(b) {
    const st = (b.status || '').toUpperCase();
    if (filter === 'all') return true;
    if (filter === 'active') return !['COMPLETED', 'CANCELLED'].includes(st);
    if (filter === 'completed') return st === 'COMPLETED';
    if (filter === 'cancelled') return st === 'CANCELLED';
    return true;
  }

  function render() {
    const visible = rides.filter(byFilter);
    if (!visible.length) { listEl.innerHTML = emptyState('No rides to show yet.', '🚕'); return; }
    listEl.innerHTML = visible.map(b => cardFor(b)).join('');
    // Click the card body → open details
    qsa('[data-open]', listEl).forEach(el => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) return;
      NY_SESSION.bookingId = el.dataset.open;
      location.href = el.dataset.active === 'true' ? 'ride.html' : 'receipt.html?booking=' + el.dataset.open;
    }));
    // Inline cancel button on active rides
    qsa('[data-cancel]', listEl).forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.cancel;
      const ok = await NY_UI.confirm('Cancel this active ride? This cannot be undone.', 'Cancel ride');
      if (!ok) return;
      btn.disabled = true; btn.textContent = 'Cancelling…';
      try {
        await NY_API.cancelBooking(id, { reasonCode: 'CHANGE_OF_PLANS', additionalInfo: 'Cancelled from rides list', reasonStage: 'OnAssign', source: 'ByUser' });
        toast('Ride cancelled', { type: 'success' });
        load();
      } catch (err) {
        toast(err.message || 'Cancellation failed', { type: 'error' });
        btn.disabled = false; btn.textContent = 'Cancel';
      }
    }));
  }

  function cardFor(b) {
    const st = (b.status || '').toUpperCase();
    const active = !['COMPLETED', 'CANCELLED'].includes(st);
    const toLoc = b.bookingDetails?.contents?.toLocation;
    const fare = b.estimatedTotalFareWithCurrency?.amount ?? b.estimatedFareWithCurrency?.amount;
    const chipClass = st === 'COMPLETED' ? 'chip-green' : st === 'CANCELLED' ? 'chip-red' : 'chip-gold';
    // Prefer the API's vehicleIconUrl; fall back to the bundled local PNG.
    const remoteVeh = fmt.escape(b.vehicleIconUrl || '');
    const localVeh  = NY_SESSION.vehicleImage(b.vehicleVariant || b.serviceTierName);
    const primaryVeh = remoteVeh || localVeh;
    const tierTitle = fmt.escape(b.serviceTierName || b.vehicleVariant || 'Ride');
    const vehFallback = `this.onerror=null;this.src='${localVeh}';this.onerror=function(){this.style.display='none';};`;
    return `<article class="card tilt gradient-stroke" data-tilt data-open="${fmt.escape(b.id)}" data-active="${active}" style="cursor:pointer;">
      <div class="row-between">
        <span class="chip ${chipClass}">${fmt.escape(st || 'NEW')}</span>
        <span class="mono" style="color: var(--text-dim); font-size: 11px;">${fmt.escape(b.displayBookingId || b.id.slice(0, 8))}</span>
      </div>
      <div class="row" style="gap: 10px; margin-top: 10px; align-items: center;">
        <figure style="width:40px; height:28px; margin:0; display:flex; align-items:center; justify-content:center;">
          <img src="${primaryVeh}" alt="" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="${vehFallback}"/>
        </figure>
        <span class="mono" style="font-size: 12px; color: var(--text-2);">${tierTitle}</span>
      </div>
      <div style="margin-top: 12px;">
        <div class="row" style="gap: 8px;">
          <span class="loc-dot src"></span>
          <span class="mono" style="font-size: 13px;">${fmt.escape(b.fromLocation?.title || b.fromLocation?.area || '—')}</span>
        </div>
        <div class="row" style="gap: 8px; margin-top: 6px;">
          <span class="loc-dot dst"></span>
          <span class="mono" style="font-size: 13px;">${fmt.escape(toLoc?.title || toLoc?.area || '—')}</span>
        </div>
      </div>
      <div class="row-between" style="margin-top: 14px;">
        <div class="dim" style="font-size: 11px;">${fmt.dateTime(b.createdAt)}</div>
        <div class="mono" style="color: var(--accent); font-weight: 700;">${fare != null ? fmt.money(fare) : '—'}</div>
      </div>
      ${b.cancellationReason ? `<div class="help-text">Reason: ${fmt.escape(b.cancellationReason.additionalInfo || b.cancellationReason.reasonCode || '')}</div>` : ''}
      ${b.ratingValue ? `<div style="margin-top: 8px;">Your rating: ${'★'.repeat(b.ratingValue)}${'☆'.repeat(5 - b.ratingValue)}</div>` : ''}
      ${active ? `<div class="row" style="gap: 8px; margin-top: 12px;">
        <a class="btn btn-ghost btn-sm" href="ride.html" data-open-link>Track</a>
        <button class="btn btn-danger btn-sm" type="button" data-cancel="${fmt.escape(b.id)}">Cancel</button>
      </div>` : ''}
    </article>`;
  }

  function emptyState(msg, icon) {
    return `<div class="empty" style="grid-column: 1 / -1;"><div class="empty-icon">${icon || '∅'}</div><p>${fmt.escape(msg)}</p><a class="btn btn-primary" href="home.html">Book a ride</a></div>`;
  }

  qsa('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    qsa('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    render();
  }));

  load();
})();
