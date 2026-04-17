(function () {
  'use strict';
  const { qs, toast, confirm } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('home');
  NY_UI.warnIfNoProxy();
  // Default to "waiting" on first load; refresh() below will bump to the
  // correct stage once status arrives from the backend.
  NY_UI.renderJourneyBar('waiting');
  if (!NY_SESSION.requireAuth()) return;

  // The user arrives here in one of two states:
  //   (a) They came from estimates.html with selectedEstimateId set but no
  //       bookingId yet — we need to poll /estimate/:id/results until the
  //       backend assigns a bookingIdV2.
  //   (b) They already have a bookingId (reload, or deep-link).
  let bookingId = NY_SESSION.bookingId;
  const pendingEstimateId = NY_SESSION.selectedEstimateId;
  if (!bookingId && !pendingEstimateId) {
    toast('No active booking', { type: 'error' });
    location.replace('home.html');
    return;
  }

  // Show a "Confirming your ride…" UI while we poll for bookingIdV2.
  const titleElEarly = qs('#status-title');
  const subElEarly = qs('#status-sub');
  const liveElEarly = qs('#live-status');
  const bookingIdEl = qs('#booking-id');
  if (!bookingId) {
    bookingIdEl.textContent = 'Confirming ride…';
    if (titleElEarly) titleElEarly.textContent = 'Confirming your ride';
    if (subElEarly)   subElEarly.textContent   = 'Holding your seat and matching you with a driver.';
    if (liveElEarly)  liveElEarly.textContent  = 'Confirming';
  } else {
    bookingIdEl.textContent = 'Booking · ' + bookingId.slice(0, 8);
  }

  // Always light up the first stage pill immediately. Keeps the confirming
  // screen from looking frozen while we wait for the backend to register.
  (function primeStages(){
    const order = ['NEW', 'TRIP_ASSIGNED', 'INPROGRESS', 'COMPLETED'];
    order.forEach(k => { const el = qs('[data-step="' + k + '"]'); if (el) el.classList.remove('active', 'done'); });
    const first = qs('[data-step="NEW"]');
    if (first) first.classList.add('active');
  })();

  // Pre-fill distance / ETA / fare / tier from the estimate the user just
  // selected, so the user never sees a row of "—" while we're waiting for the
  // backend to register the booking. Once the booking record lands, refresh()
  // will overwrite these with the authoritative values.
  const est = NY_SESSION.selectedEstimate;
  const route = NY_SESSION.route;
  if (route?.distance != null) qs('#meta-distance').textContent = fmt.distance(route.distance);
  if (route?.duration != null) qs('#meta-eta').textContent = fmt.duration(route.duration);
  if (est?.estimatedFareWithCurrency?.amount != null) {
    const min = est?.totalFareRange?.minFareWithCurrency?.amount ?? est.estimatedFareWithCurrency.amount;
    const max = est?.totalFareRange?.maxFareWithCurrency?.amount ?? est.estimatedFareWithCurrency.amount;
    qs('#meta-fare').textContent = (min === max) ? fmt.money(min) : `${fmt.money(min)} – ${fmt.money(max)}`;
  }
  if (est?.serviceTierName) {
    // Surface the selected tier in the confirming sub-line so the user sees
    // "Booking AC Cab · matching driver…" not just a generic message.
    if (subElEarly && !bookingId) {
      subElEarly.textContent = `Booking your ${est.serviceTierName} · matching you with a driver nearby.`;
    }
    // Populate the driver card's tier slot early so the layout stays stable.
    const tierLine = qs('#driver-meta');
    if (tierLine) tierLine.textContent = est.serviceTierName + (est.isAirConditioned === true ? ' · AC' : '');
  }

  async function resolveBookingId() {
    if (bookingId) return bookingId;
    const id = pendingEstimateId;
    for (let i = 0; i < 20; i++) {
      try {
        const r = await NY_API.estimateResults(id);
        const bid = r?.bookingIdV2 || r?.bookingId;
        if (bid) {
          bookingId = bid;
          NY_SESSION.bookingId = bid;
          NY_SESSION.selectedEstimateId = null;
          NY_SESSION.touchFlow();
          bookingIdEl.textContent = 'Booking · ' + bid.slice(0, 8);
          return bid;
        }
      } catch (e) {
        // Treat 4xx as "not ready yet" and keep retrying a few times.
        console.warn('[estimate/results] retry', e?.code || e?.message);
      }
      await new Promise(r => setTimeout(r, 1800));
    }
    throw new Error('Ride could not be assigned — please try again.');
  }

  // ---- Map ----
  const src = NY_SESSION.source;
  const dst = NY_SESSION.dest;
  const map = L.map('track-map', { zoomControl: true }).setView(src ? [src.lat, src.lon] : NY_CONFIG.DEFAULT_LATLNG, 14);
  (function (_m) {
    const _t = L.tileLayer(NY_UI.tileUrl(), { attribution: NY_UI.tileAttribution, maxZoom: 19 }).addTo(_m);
    window.addEventListener('ny:theme', () => _t.setUrl(NY_UI.tileUrl()));
  })(map);
  const srcIcon = L.icon({ iconUrl: 'assets/img/map/ny_ic_confirm_pickup_marker.webp', iconSize: [32, 40], iconAnchor: [16, 40] });
  const dstIcon = L.icon({ iconUrl: 'assets/img/map/ny_ic_drop_location_marker.webp',  iconSize: [32, 40], iconAnchor: [16, 40] });
  if (src) L.marker([src.lat, src.lon], { icon: srcIcon }).addTo(map).bindTooltip('Pickup');
  if (dst) L.marker([dst.lat, dst.lon], { icon: dstIcon }).addTo(map).bindTooltip('Drop');
  let routeLine = null;
  if (NY_SESSION.route?.points?.length) {
    routeLine = L.polyline(NY_SESSION.route.points.map(p => [p.lat, p.lon]), { color: '#FCC32C', weight: 5, opacity: 0.9 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
  }

  const carIcon = L.divIcon({
    className: 'ny-marker',
    html: '<div class="car-marker" style="background: var(--accent); color: var(--accent-ink); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 0 0 2px var(--ink), 0 0 0 3px var(--accent);">🚗</div>',
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
  const carMarker = L.marker(src ? [src.lat, src.lon] : NY_CONFIG.DEFAULT_LATLNG, { icon: carIcon }).addTo(map);

  // ---- Driver location ----
  // Primary source of truth for the car marker: poll GET /ride/:rideId/driver/location.
  // Fallback, when the driver feed is unavailable (pre-pickup, reassignment, etc.),
  // march the marker along the pre-computed route polyline so the UI never looks frozen.
  let driverRideId = null;
  let lastStatus = null;
  let driverPollTimer = null;
  let fallbackTimer = null;
  let fallbackIdx = 0;
  let animRaf = 0;
  const routePoints = NY_SESSION.route?.points || [];

  // Smoothly animate the car marker between positions (tween over ~900ms).
  let animFrom = carMarker.getLatLng();
  let animTo = animFrom;
  let animStart = 0;
  const ANIM_MS = 900;
  function scheduleMove(lat, lon) {
    animFrom = carMarker.getLatLng();
    animTo = L.latLng(lat, lon);
    animStart = performance.now();
    cancelAnimationFrame(animRaf);
    const step = () => {
      const t = Math.min(1, (performance.now() - animStart) / ANIM_MS);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      carMarker.setLatLng([
        animFrom.lat + (animTo.lat - animFrom.lat) * e,
        animFrom.lng + (animTo.lng - animFrom.lng) * e,
      ]);
      if (t < 1) animRaf = requestAnimationFrame(step);
    };
    animRaf = requestAnimationFrame(step);
  }

  async function pollDriverLocation() {
    if (!driverRideId) return;
    try {
      const loc = await NY_API.driverLocation(driverRideId);
      // Accept several known response shapes:
      // { lat, lon }  |  { location: { lat, lon } }  |  { currPoint: { lat, lon } }
      const p = loc?.location || loc?.currPoint || loc;
      const lat = p?.lat ?? p?.latitude;
      const lon = p?.lon ?? p?.lng ?? p?.longitude;
      if (typeof lat === 'number' && typeof lon === 'number') {
        scheduleMove(lat, lon);
        // stop the fallback polyline march once we have a real feed
        if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      }
    } catch (e) {
      // 404 / 400 means driver feed not ready yet — keep the fallback going.
      if (!fallbackTimer) startFallback();
    }
  }

  function startDriverPolling() {
    if (driverPollTimer) return;
    driverPollTimer = setInterval(pollDriverLocation, 4000);
    pollDriverLocation(); // immediate
  }
  function stopDriverPolling() {
    if (driverPollTimer) { clearInterval(driverPollTimer); driverPollTimer = null; }
  }

  function startFallback() {
    if (fallbackTimer || !routePoints.length) return;
    fallbackTimer = setInterval(() => {
      if (lastStatus !== 'INPROGRESS') return; // only march during trip
      fallbackIdx = Math.min(fallbackIdx + 1, routePoints.length - 1);
      const p = routePoints[fallbackIdx];
      scheduleMove(p.lat, p.lon);
    }, 2000);
  }

  // ---- Status UI ----
  const stepEls = {
    NEW: qs('[data-step="NEW"]'),
    TRIP_ASSIGNED: qs('[data-step="TRIP_ASSIGNED"]'),
    INPROGRESS: qs('[data-step="INPROGRESS"]'),
    COMPLETED: qs('[data-step="COMPLETED"]'),
  };
  const titleEl = qs('#status-title');
  const subEl = qs('#status-sub');
  const liveEl = qs('#live-status');
  const driverCard = qs('#driver-card');
  const otpCard = qs('#otp-card');

  let lastActiveStage = null;
  function setStage(status) {
    const order = ['NEW', 'TRIP_ASSIGNED', 'INPROGRESS', 'COMPLETED'];
    const idx = order.indexOf(status);
    Object.entries(stepEls).forEach(([k, el]) => {
      if (!el) return;
      el.classList.remove('active', 'done');
      const i = order.indexOf(k);
      if (i < idx) el.classList.add('done');
      else if (i === idx) el.classList.add('active');
    });
    // Animate the bar fill on NEW stage activations only (avoid replay on every poll).
    if (status && status !== lastActiveStage) {
      const newEl = stepEls[status];
      if (newEl) {
        newEl.classList.remove('just-activated');
        // force reflow so the animation can replay on transition
        void newEl.offsetWidth;
        newEl.classList.add('just-activated');
        setTimeout(() => newEl.classList.remove('just-activated'), 600);
      }
      lastActiveStage = status;
    }
  }

  const labels = {
    NEW:                   { title: 'Finding a driver',      sub: 'Matching you with the nearest partner.',                 live: 'Searching' },
    CONFIRMED:             { title: 'Confirmed',             sub: 'Driver is being assigned.',                              live: 'Confirmed' },
    TRIP_ASSIGNED:         { title: 'Driver assigned',       sub: 'Your driver is on the way to pick you up.',              live: 'Driver assigned' },
    AWAITING_REASSIGNMENT: { title: 'Reassigning…',          sub: 'Finding a nearby partner for you.',                      live: 'Reassigning' },
    INPROGRESS:            { title: 'Trip in progress',      sub: 'Enjoy the ride. We’ll be there shortly.',                live: 'On trip' },
    COMPLETED:             { title: 'Trip completed',        sub: 'Thanks for riding with NammaYatri.',                     live: 'Completed' },
    CANCELLED:             { title: 'Trip cancelled',        sub: 'This booking was cancelled.',                            live: 'Cancelled' },
  };

  async function refresh() {
    try {
      if (!bookingId) {
        await resolveBookingId();
      }
      const b = await NY_API.booking(bookingId);
      if (!b) return;
      const st = b.status || 'NEW';
      lastStatus = st;
      const lab = labels[st] || labels.NEW;
      titleEl.textContent = lab.title; subEl.textContent = lab.sub; liveEl.textContent = lab.live;
      setStage(st);
      // Journey bar: advance the auto as status progresses.
      const stageKey = st === 'TRIP_ASSIGNED' ? 'assigned'
                     : st === 'INPROGRESS'    ? 'onride'
                     : st === 'COMPLETED'     ? 'receipt'
                     : 'waiting';
      NY_UI.renderJourneyBar(stageKey);

      // Active rideId for the driver-location feed. Production returns it inside
      // b.rideList[0].id once a driver is assigned.
      const ride = Array.isArray(b.rideList) ? b.rideList[0] : null;
      const newRideId = ride?.id || b.rideId || null;
      if (newRideId && newRideId !== driverRideId) {
        driverRideId = newRideId;
        if (['TRIP_ASSIGNED', 'INPROGRESS'].includes(st)) startDriverPolling();
      }
      if (st === 'INPROGRESS' && !fallbackTimer && !driverPollTimer) startFallback();

      if (b.driverName || b.driver?.name) {
        driverCard.classList.remove('hidden');
        const name = b.driverName || b.driver?.name || 'Driver';
        qs('#driver-avatar').textContent = name.slice(0, 1).toUpperCase();
        qs('#driver-name').textContent = name;
        qs('#driver-meta').textContent = [b.serviceTierName, b.vehicleColor, b.driverRating ? ('★ ' + b.driverRating) : ''].filter(Boolean).join(' · ');
        qs('#vehicle-number').textContent = b.vehicleNumber || b.vehicleVariant || '';
        const phone = b.driverNumber || b.driver?.number;
        qs('#call-btn').href = phone ? 'tel:' + phone.replace(/\s/g, '') : '#';
      }
      if (b.rideOtp) {
        otpCard.classList.remove('hidden');
        qs('#ride-otp').textContent = b.rideOtp.split('').join(' ');
      }
      const dM = b.estimatedDistanceWithUnit?.value ?? b.estimatedDistance;
      qs('#meta-distance').textContent = fmt.distance(dM);
      qs('#meta-eta').textContent = fmt.duration(b.estimatedDuration);
      const fare = b.estimatedTotalFareWithCurrency?.amount ?? b.estimatedFareWithCurrency?.amount;
      qs('#meta-fare').textContent = fmt.money(fare);

      // Disable cancel once the trip has started — backend usually refuses it.
      const cancelBtn = qs('#cancel-btn');
      if (cancelBtn) {
        const allowCancel = ['NEW', 'CONFIRMED', 'TRIP_ASSIGNED', 'AWAITING_REASSIGNMENT'].includes(st);
        cancelBtn.disabled = !allowCancel;
        cancelBtn.textContent = allowCancel ? 'Cancel ride' : (st === 'INPROGRESS' ? 'Trip in progress' : (st === 'COMPLETED' ? 'Completed' : 'Cancelled'));
      }

      if (st === 'COMPLETED') {
        stopAll();
        NY_SESSION.clearFlow(); // clear flow markers once trip closes
        toast('Ride completed!', { type: 'success' });
        setTimeout(() => location.href = 'rate.html?booking=' + bookingId, 1200);
      } else if (st === 'CANCELLED') {
        stopAll();
        NY_SESSION.clearFlow();
        toast('Ride cancelled', { type: 'error' });
      } else {
        NY_SESSION.touchFlow(); // keep the flow TTL fresh while tracking
        setTimeout(refresh, NY_CONFIG.POLL_INTERVAL_MS);
      }
    } catch (e) {
      console.warn(e);
      // If we still don't have a booking id and resolve repeatedly fails,
      // surface the error and send the user back to home.
      if (!bookingId && /could not be assigned/i.test(e?.message || '')) {
        toast(e.message, { type: 'error', duration: 4500 });
        setTimeout(() => location.replace('home.html'), 1800);
        return;
      }
      setTimeout(refresh, NY_CONFIG.POLL_INTERVAL_MS);
    }
  }

  function stopAll() {
    stopDriverPolling();
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    cancelAnimationFrame(animRaf);
  }

  qs('#cancel-btn').addEventListener('click', async () => {
    // If we're still waiting on a bookingId (pre-match), cancel the estimate instead.
    if (!bookingId && pendingEstimateId) {
      const ok = await confirm('Cancel this request? We\u2019ll release the quote.', 'Cancel');
      if (!ok) return;
      try {
        await NY_API.cancelEstimate(pendingEstimateId);
      } catch {}
      NY_SESSION.selectedEstimateId = null;
      NY_SESSION.clearFlow();
      toast('Request cancelled', { type: 'success' });
      setTimeout(() => location.href = 'home.html', 600);
      return;
    }
    const ok = await confirm('Cancel this ride? A cancellation fee may apply once a driver is assigned.', 'Cancel ride');
    if (!ok) return;
    try {
      await NY_API.cancelBooking(bookingId, {
        reasonCode: 'CHANGE_OF_PLANS',
        additionalInfo: 'Cancelled from web',
        reasonStage: lastStatus === 'TRIP_ASSIGNED' ? 'OnAssign' : 'OnSearch',
        source: 'ByUser',
      });
      toast('Ride cancelled', { type: 'success' });
      stopAll();
      NY_SESSION.clearFlow();
      setTimeout(() => location.href = 'rides.html', 700);
    } catch (e) {
      toast(e.message || 'Cancellation failed', { type: 'error' });
    }
  });
  qs('#support-btn').addEventListener('click', () => location.href = 'help.html?booking=' + bookingId);

  window.addEventListener('beforeunload', stopAll);

  refresh();
})();
