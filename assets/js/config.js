/* Global config.
 *
 * All API calls go through a Cloudflare Worker that fronts the real NammaYatri
 * backend. The worker URL is the ONLY host the client knows about — the true
 * production upstream is hidden server-side in the worker.
 *
 * Set WORKER_URL below (once, on deploy), or override at runtime via
 * Settings → Proxy URL.
 */
(function (global) {
  'use strict';

  // ⬇ Proxy URL. The site always talks to the NammaYatri API through this URL.
  //
  // Local dev (default): run `node docs/proxy.js` — starts a local relay on :9000.
  // GitHub Pages (production): deploy cloudflare-worker.js (see README) and replace
  //   the value below with your worker URL, e.g. 'https://ny-web.<sub>.workers.dev'.
  //
  // Users can also override this at runtime via Settings → Proxy URL.
  const WORKER_URL = '';

  const DEFAULTS = {
    API_PROXY: WORKER_URL,
    MERCHANT_ID: 'NAMMA_YATRI',
    DEFAULT_COUNTRY_CODE: '+91',

    CLIENT_VERSION: '0.1.0',
    BUNDLE_VERSION: '0.0.149',
    PACKAGE: 'in.juspay.nammayatri.web',
    DEVICE: 'web/' + (typeof navigator !== 'undefined'
      ? (navigator.userAgent.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/)?.[0] || 'browser')
      : 'browser'),

    DEFAULT_LATLNG: [12.9716, 77.5946],   // Bengaluru
    DEFAULT_ZOOM: 13,

    POLL_INTERVAL_MS: 2500,
    POLL_TIMEOUT_MS: 60_000,
  };

  const read = (k) => { try { return localStorage.getItem('ny:cfg:' + k) || ''; } catch { return ''; } };
  const write = (k, v) => {
    try {
      if (v == null || v === '') localStorage.removeItem('ny:cfg:' + k);
      else localStorage.setItem('ny:cfg:' + k, String(v));
    } catch {}
  };

  const CONFIG = {
    ...DEFAULTS,
    get proxy()      { return read('proxy') || DEFAULTS.API_PROXY; },
    set proxy(v)     { write('proxy', v); },
    get merchantId() { return read('merchant') || DEFAULTS.MERCHANT_ID; },
    set merchantId(v){ write('merchant', v); },
  };

  global.NY_CONFIG = CONFIG;
})(window);
