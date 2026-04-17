(function () {
  'use strict';
  const { qs, toast } = NY_UI;

  NY_UI.renderNav('profile');
  NY_UI.warnIfNoProxy();
  if (!NY_SESSION.requireAuth()) return;

  async function hydrate() {
    try {
      const p = await NY_API.getProfile();
      if (!p) return;
      NY_SESSION.profile = p;
      paint(p);
    } catch (e) {
      console.warn(e);
      if (NY_SESSION.profile) paint(NY_SESSION.profile);
    }
  }

  function paint(p) {
    const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim() || 'Rider';
    qs('#p-fullname').textContent = name;
    qs('#p-avatar').textContent = name.slice(0, 1).toUpperCase();
    qs('#p-mobile').textContent = p.maskedMobileNumber ? (NY_SESSION.countryCode + ' ' + p.maskedMobileNumber) : '—';
    qs('#p-id').textContent = p.id || '—';
    qs('#p-lang').textContent = p.language || '—';
    qs('#p-ref').textContent = p.customerReferralCode || '—';
    qs('#firstName').value = p.firstName || '';
    qs('#lastName').value = p.lastName || '';
    qs('#email').value = p.email || '';
    qs('#gender').value = p.gender || '';
    qs('#language').value = p.language || 'ENGLISH';
  }

  qs('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type=submit]');
    const label = btn.querySelector('.btn-label'), spinner = btn.querySelector('.btn-spinner');
    btn.disabled = true; spinner?.classList.remove('hidden'); if (label) label.textContent = 'Saving…';
    try {
      const patch = {
        firstName: qs('#firstName').value.trim() || undefined,
        lastName: qs('#lastName').value.trim() || undefined,
        email: qs('#email').value.trim() || undefined,
        gender: qs('#gender').value || undefined,
        language: qs('#language').value || undefined,
      };
      await NY_API.updateProfile(patch);
      // Merge patch into the cached profile so other pages see the fresh copy
      // without waiting for the re-fetch below.
      const current = NY_SESSION.profile || {};
      const merged = { ...current };
      Object.keys(patch).forEach(k => { if (patch[k] !== undefined) merged[k] = patch[k]; });
      NY_SESSION.profile = merged;
      toast('Profile updated', { type: 'success' });
      hydrate();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Update failed', { type: 'error' });
    } finally {
      btn.disabled = false; spinner?.classList.add('hidden'); if (label) label.textContent = 'Save changes';
    }
  });

  qs('#logout-btn').addEventListener('click', async () => {
    const ok = await NY_UI.confirm('Sign out of NammaYatri?', 'Log out');
    if (!ok) return;
    try { await NY_API.logout(); } catch {}
    NY_SESSION.logout();
    location.href = 'index.html';
  });

  if (NY_SESSION.profile) paint(NY_SESSION.profile);
  hydrate();
})();
