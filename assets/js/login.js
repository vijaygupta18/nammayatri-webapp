(function () {
  'use strict';
  const { qs } = NY_UI;

  NY_UI.renderNav('login');
  NY_UI.warnIfNoProxy();
  NY_UI.renderJourneyBar('login');
  NY_UI.enableTilt();

  // If already logged in, show a notice but still allow re-login.
  if (NY_SESSION.isLoggedIn()) {
    const notice = document.createElement('div');
    notice.className = 'chip chip-green';
    notice.style.marginBottom = '12px';
    notice.innerHTML = `Already signed in · <a href="home.html" style="margin-left:8px;">Go to Book</a> · <a href="#" id="relogin-link" style="margin-left:8px;">Sign in as someone else</a>`;
    const card = document.querySelector('.glass');
    if (card) card.prepend(notice);
    document.getElementById('relogin-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      NY_SESSION.logout();
      notice.remove();
      NY_UI.toast('Session cleared. Enter your mobile to sign in.', { type: 'success' });
    });
  }

  const form = qs('#login-form');
  const phone = qs('#phone');
  const err = qs('#phone-err');
  const btn = qs('#submit-btn');
  const label = qs('.btn-label', btn);
  const spinner = qs('.btn-spinner', btn);

  phone.focus();

  // Live-through-proxy only: if the proxy isn't configured, lock the form.
  if (!NY_CONFIG.proxy) {
    btn.disabled = true;
    phone.readOnly = true;
    phone.placeholder = 'Configure proxy first.';
  }

  function setError(msg) {
    if (!msg) { err.classList.add('hidden'); phone.classList.remove('has-error'); return; }
    err.textContent = msg; err.classList.remove('hidden');
    phone.classList.add('has-error');
  }
  function busy(b) {
    btn.disabled = b;
    btn.classList.toggle('is-loading', b);
    spinner.classList.toggle('hidden', !b);
    label.textContent = b ? 'Sending…' : 'Send OTP';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    const raw = phone.value.trim();
    if (!/^\d{10}$/.test(raw)) {
      setError('Enter a valid 10-digit mobile number.');
      phone.focus(); return;
    }
    busy(true);
    console.info('[login] sending /auth', { mobile: raw, proxy: NY_CONFIG.proxy });
    try {
      const res = await NY_API.auth(raw, NY_CONFIG.DEFAULT_COUNTRY_CODE);
      console.info('[login] /auth response', res);
      if (!res?.authId) throw new Error('Missing authId');
      NY_SESSION.authId = res.authId;
      NY_SESSION.mobile = raw;
      NY_SESSION.countryCode = NY_CONFIG.DEFAULT_COUNTRY_CODE;
      NY_UI.toast('OTP sent to +91 ' + raw, { type: 'success' });
      setTimeout(() => location.href = 'otp.html', 400);
    } catch (e) {
      console.error(e);
      const code = e?.code || 'ERROR';
      if (code === 'NETWORK_ERROR') {
        setError('Network / CORS blocked. Check Settings → Proxy URL.');
      } else {
        setError(e?.message || 'Login failed');
      }
    } finally {
      busy(false);
    }
  });
})();
