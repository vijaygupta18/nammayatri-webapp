(function () {
  'use strict';
  const { qs, qsa, toast } = NY_UI;
  const fmt = NY_UI.fmt;

  NY_UI.renderNav('rides');
  NY_UI.renderJourneyBar('rate');
  if (!NY_SESSION.requireAuth()) return;

  const params = new URLSearchParams(location.search);
  const bookingId = params.get('booking') || NY_SESSION.bookingId;
  if (!bookingId) { location.replace('rides.html'); return; }

  const DESC = { 1: 'Not good at all', 2: 'Could be better', 3: 'It was okay', 4: 'Nice ride!', 5: 'Amazing ride!' };
  let rating = 0;
  const tags = new Set();

  // Fetch booking for summary
  (async () => {
    try {
      const b = await NY_API.booking(bookingId);
      const fare = b.estimatedTotalFareWithCurrency?.amount ?? b.estimatedFareWithCurrency?.amount;
      const dist = b.estimatedDistanceWithUnit?.value ?? b.estimatedDistance;
      qs('#trip-summary').textContent = `${b.serviceTierName || 'Ride'} · ${fmt.distance(dist)} · ${fmt.money(fare)}`;
    } catch {}
  })();

  const burst = (opts) => { try { window.NY_MOTION && NY_MOTION.burstConfetti && NY_MOTION.burstConfetti(opts); } catch {} };

  qsa('.star').forEach(btn => {
    btn.addEventListener('click', () => {
      rating = +btn.dataset.v;
      qsa('.star').forEach(s => s.classList.toggle('filled', +s.dataset.v <= rating));
      qs('#rating-desc').textContent = DESC[rating];
      if (rating === 5) burst({ pieces: 120, durationMs: 3000 });
      else if (rating === 4) burst({ pieces: 60, durationMs: 2000 });
    });
  });

  qsa('.tag').forEach(t => t.addEventListener('click', () => {
    const v = t.dataset.tag;
    if (tags.has(v)) { tags.delete(v); t.classList.remove('active'); }
    else { tags.add(v); t.classList.add('active'); }
  }));

  const btn = qs('#submit-btn');
  btn.addEventListener('click', async () => {
    if (!rating) { toast('Please tap a star to rate.', { type: 'error' }); return; }
    btn.disabled = true;
    try {
      const details = [qs('#fb').value.trim(), [...tags].join(', ')].filter(Boolean).join(' · ');
      await NY_API.rateRide({ rideId: bookingId, ratingValue: rating, feedbackDetails: details });
      burst({ pieces: 80 });
      toast('Thanks for your feedback 🙌', { type: 'success' });
      setTimeout(() => location.href = 'receipt.html?booking=' + bookingId, 700);
    } catch (e) {
      console.error(e);
      toast(e.message || 'Rating failed', { type: 'error' });
      btn.disabled = false;
    }
  });
})();
