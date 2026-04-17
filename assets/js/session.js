/* localStorage-backed session store. All keys namespaced under ny:*
 * Surface a small, explicit API so pages never poke localStorage directly. */
(function (global) {
  'use strict';

  const PREFIX = 'ny:';
  const get = (k, fallback = null) => {
    try {
      const raw = localStorage.getItem(PREFIX + k);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };
  const set = (k, v) => {
    try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {}
  };
  const del = (k) => { try { localStorage.removeItem(PREFIX + k); } catch {} };

  // session id stays stable per browser
  let sid = get('sid');
  if (!sid) {
    sid = 'web-' + (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
    set('sid', sid);
  }

  // device token (stable per browser, sent on OTP verify)
  let dtok = get('deviceToken');
  if (!dtok) {
    dtok = 'web-dt-' + (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
    set('deviceToken', dtok);
  }

  const Session = {
    // auth state
    get token()   { return get('token'); },
    set token(v)  { v ? set('token', v) : del('token'); },
    get authId()  { return get('authId'); },
    set authId(v) { v ? set('authId', v) : del('authId'); },
    get mobile()  { return get('mobile'); },
    set mobile(v) { v ? set('mobile', v) : del('mobile'); },
    get countryCode() { return get('countryCode') || '+91'; },
    set countryCode(v){ v ? set('countryCode', v) : del('countryCode'); },

    // user
    get profile() { return get('profile'); },
    set profile(v){ v ? set('profile', v) : del('profile'); },

    // flow
    get searchId() { return get('searchId'); },
    set searchId(v){ v ? set('searchId', v) : del('searchId'); },
    get bookingId(){ return get('bookingId'); },
    set bookingId(v){ v ? set('bookingId', v) : del('bookingId'); },

    // search context
    get source() { return get('source'); },
    set source(v){ v ? set('source', v) : del('source'); },
    get dest()   { return get('dest'); },
    set dest(v)  { v ? set('dest', v) : del('dest'); },
    get estimates(){ return get('estimates') || []; },
    set estimates(v){ v && v.length ? set('estimates', v) : del('estimates'); },
    get selectedEstimate() { return get('selectedEstimate'); },
    set selectedEstimate(v){ v ? set('selectedEstimate', v) : del('selectedEstimate'); },
    get selectedEstimateId() { return get('selectedEstimateId'); },
    set selectedEstimateId(v){ v ? set('selectedEstimateId', v) : del('selectedEstimateId'); },

    // Freshness marker for the in-flight flow. Writes happen as side effects in
    // the setters below so the TTL moves forward whenever something real changes.
    get flowTimestamp() { return get('flowTimestamp') || 0; },
    set flowTimestamp(v){ v ? set('flowTimestamp', v) : del('flowTimestamp'); },

    // Flow TTL — anything older than this is considered stale and gets wiped.
    FLOW_TTL_MS: 30 * 60 * 1000,

    /**
     * Returns the most meaningful state of the current ride flow:
     *   'tracking'   → an active bookingId is set (ride is being matched / on)
     *   'confirming' → user picked an estimate but bookingId hasn't come back yet
     *   'search'     → a searchId exists (user started a search, hasn't picked yet)
     *   'none'       → nothing in flight
     *
     * If the flow timestamp is older than FLOW_TTL_MS the flow is cleared and
     * 'none' is returned.
     */
    activeFlowState() {
      const ts = this.flowTimestamp;
      const fresh = ts && (Date.now() - ts) < this.FLOW_TTL_MS;
      if (!fresh) { this.clearFlow(); return 'none'; }
      if (this.bookingId)          return 'tracking';
      if (this.selectedEstimateId) return 'confirming';
      if (this.searchId)           return 'search';
      return 'none';
    },

    /** Returns the page the active flow belongs on, or null. */
    activeFlowUrl() {
      switch (this.activeFlowState()) {
        case 'tracking':
        case 'confirming': return 'ride.html';
        case 'search':     return 'estimates.html';
        default:           return null;
      }
    },

    touchFlow() { this.flowTimestamp = Date.now(); },
    get route(){ return get('route'); },
    set route(v){ v ? set('route', v) : del('route'); },

    // recent pickups/drops, favorites, last map viewport
    get recents()   { return get('recents') || []; },
    set recents(v)  { Array.isArray(v) && v.length ? set('recents', v) : del('recents'); },
    get favorites() { return get('favorites') || []; },
    set favorites(v){ Array.isArray(v) && v.length ? set('favorites', v) : del('favorites'); },
    get lastViewport()  { return get('lastViewport'); },
    set lastViewport(v) { v ? set('lastViewport', v) : del('lastViewport'); },

    addRecent(loc) {
      if (!loc || typeof loc !== 'object') return;
      if (loc.lat == null || loc.lon == null) return;
      const entry = {
        title: loc.title || loc.area || 'Pinned location',
        lat: loc.lat, lon: loc.lon,
        area: loc.area || '', city: loc.city || '',
        state: loc.state || '', country: loc.country || '',
        placeId: loc.placeId || '',
      };
      const list = (get('recents') || []).filter(r => {
        if (entry.placeId && r.placeId) return r.placeId !== entry.placeId;
        const sameTitle = (r.title || '') === entry.title;
        const sameCoord = Math.abs((r.lat || 0) - entry.lat) < 1e-5 && Math.abs((r.lon || 0) - entry.lon) < 1e-5;
        return !(sameTitle && sameCoord);
      });
      list.unshift(entry);
      set('recents', list.slice(0, 8));
    },

    addFavorite(label, loc) {
      if (!label || !loc) return;
      const list = get('favorites') || [];
      list.push({ label: String(label), loc });
      set('favorites', list);
    },

    removeFavorite(idx) {
      const list = get('favorites') || [];
      if (idx < 0 || idx >= list.length) return;
      list.splice(idx, 1);
      if (list.length) set('favorites', list); else del('favorites');
    },

    vehicleImage(variantOrTier) {
      const v = String(variantOrTier || '').toUpperCase();
      const base = 'assets/img/ride/';
      if (v === 'AUTO_RICKSHAW' || v === 'AUTO_PLUS' || v === 'AUTO') return base + 'ride-express.webp';
      if (v === 'TAXI') return base + 'new-ride-black.webp';
      if (v === 'ECO' || v === 'SEDAN') return base + 'ride-black.webp';
      if (v === 'COMFY') return base + 'ride-premium.webp';
      if (v === 'SUV') return base + 'ride-xl.webp';
      if (v === 'SUV_PLUS') return base + 'new-ride-black-xl.webp';
      return base + 'ride-black.webp';
    },

    // device identity (stable strings)
    sessionId: sid,
    deviceToken: dtok,

    isLoggedIn() { return !!this.token; },

    requireAuth(redirectTo) {
      if (!this.token) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace((redirectTo || 'login.html') + '?next=' + next);
        return false;
      }
      return true;
    },

    clearFlow() {
      del('searchId');
      del('bookingId');
      del('estimates');
      del('selectedEstimate');
      del('selectedEstimateId');
      del('route');
      del('flowTimestamp');
    },

    logout() {
      del('token'); del('authId'); del('profile');
      this.clearFlow();
    },

    // debug / settings helpers
    raw: { get, set, del, PREFIX },
  };

  global.NY_SESSION = Session;
})(window);
