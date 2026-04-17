(function () {
  'use strict';
  const { qs, qsa, toast } = NY_UI;

  NY_UI.renderNav('login');
  NY_UI.warnIfNoProxy();
  NY_UI.renderJourneyBar('otp');

  if (!NY_SESSION.authId || !NY_SESSION.mobile) {
    location.replace('login.html');
    return;
  }

  const mobile = NY_SESSION.mobile;
  qs('#mask-mobile').textContent = NY_SESSION.countryCode + ' ' + mobile.slice(0, 3) + '·····' + mobile.slice(-2);

  const boxes = qsa('.otp-box');
  boxes[0].focus();

  boxes.forEach((el, i) => {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 1);
      if (el.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (boxes.every(b => b.value)) form.requestSubmit();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !el.value && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    el.addEventListener('paste', (e) => {
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      if (t.length) {
        e.preventDefault();
        [...t].forEach((ch, k) => boxes[k] && (boxes[k].value = ch));
        boxes[Math.min(t.length, boxes.length - 1)].focus();
        if (boxes.every(b => b.value)) form.requestSubmit();
      }
    });
  });

  const form = qs('#otp-form');
  const err = qs('#otp-err');
  const verifyBtn = qs('#verify-btn');
  const vLabel = qs('.btn-label', verifyBtn);
  const vSpin = qs('.btn-spinner', verifyBtn);
  const setErr = m => { if (!m) return err.classList.add('hidden'); err.textContent = m; err.classList.remove('hidden'); };
  const busy = b => { verifyBtn.disabled = b; vSpin.classList.toggle('hidden', !b); vLabel.textContent = b ? 'Verifying…' : 'Verify & continue'; };

  // Live-through-proxy only: if the proxy isn't configured, lock the form.
  if (!NY_CONFIG.proxy) {
    verifyBtn.disabled = true;
    boxes.forEach(b => { b.readOnly = true; });
    setErr('Configure proxy first.');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setErr('');
    const otp = boxes.map(b => b.value).join('');
    if (!/^\d{4}$/.test(otp)) { setErr('Enter all 4 digits.'); return; }
    busy(true);
    try {
      const res = await NY_API.verify(NY_SESSION.authId, otp);
      if (!res?.token) throw new Error('Token missing');
      NY_SESSION.token = res.token;
      NY_SESSION.profile = res.person;
      NY_SESSION.authId = null;
      toast('Signed in ✨', { type: 'success' });
      const next = new URL(location.href).searchParams.get('next') || 'home.html';
      setTimeout(() => location.href = decodeURIComponent(next), 500);
    } catch (e) {
      console.error(e);
      setErr((e.code === 'TOKEN_EXPIRED' || e.code === 'AUTH_EXPIRED') ? 'OTP expired — please request a new one.' : (e.message || 'Verification failed'));
      boxes.forEach(b => b.value = ''); boxes[0].focus();
    } finally { busy(false); }
  });

  // resend timer
  const resendBtn = qs('#resend-btn');
  const timerEl = qs('#resend-timer');
  let seconds = 30;
  const tick = () => {
    seconds--; timerEl.textContent = seconds;
    if (seconds <= 0) { resendBtn.disabled = false; resendBtn.textContent = 'Resend OTP'; }
    else setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
  resendBtn.addEventListener('click', async () => {
    if (resendBtn.disabled) return;
    resendBtn.disabled = true; resendBtn.textContent = 'Sending…';
    try {
      // Prefer resend endpoint; fall back to /auth again
      try { await NY_API.resendOtp(NY_SESSION.authId); }
      catch { const r = await NY_API.auth(NY_SESSION.mobile, NY_SESSION.countryCode); NY_SESSION.authId = r.authId; }
      toast('New OTP sent', { type: 'success' });
      seconds = 30; resendBtn.textContent = 'Resend in '; resendBtn.innerHTML = 'Resend in <span id="resend-timer">30</span>s'; setTimeout(tick, 1000);
    } catch (e) {
      NY_UI.toast(e?.message || 'Failed to resend', { type: 'error' });
      resendBtn.disabled = false; resendBtn.textContent = 'Resend OTP';
    }
  });
})();
