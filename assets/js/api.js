/* API client. All calls go through NY_CONFIG.proxy (the Cloudflare Worker).
 * The worker knows the real upstream; the client does not. */
(function (global) {
  'use strict';

  const CFG = global.NY_CONFIG;
  const S = global.NY_SESSION;

  class ApiError extends Error {
    constructor(status, code, message, payload) {
      super(message || code || ('HTTP ' + status));
      this.status = status;
      this.code = code;
      this.payload = payload;
    }
  }

  function base() {
    const p = (CFG.proxy || '').replace(/\/$/, '');
    if (!p) {
      throw new ApiError(0, 'NO_PROXY',
        'API proxy is not configured. Open Settings → Proxy URL and paste your Cloudflare Worker URL.');
    }
    return p;
  }

  function defaultHeaders(extra) {
    const h = {
      'Content-Type':     'application/json',
      'x-client-version': CFG.CLIENT_VERSION,
      'x-bundle-version': CFG.BUNDLE_VERSION,
      'x-rn-version':     '--',
      'x-config-version': '1',
      'x-device':         CFG.DEVICE,
      'x-package':        CFG.PACKAGE,
      'session_id':       S.sessionId,
    };
    if (S.token) h['token'] = S.token;
    if (extra) Object.assign(h, extra);
    return h;
  }

  async function call(method, path, { body, headers, query, timeout = 30_000 } = {}) {
    let url = base() + path;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: defaultHeaders(headers),
        body: body ? JSON.stringify(body) : undefined,
        signal: ac.signal,
        mode: 'cors',
      });
      const text = await res.text();
      const data = text ? safeParse(text) : null;
      if (!res.ok) {
        const code = data?.errorCode || 'HTTP_' + res.status;
        const msg  = data?.errorMessage || res.statusText;
        throw new ApiError(res.status, code, msg, data);
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', 'Request timed out');
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'NETWORK_ERROR', e.message || 'Network error');
    } finally {
      clearTimeout(t);
    }
  }

  function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

  // ---- Endpoints ----
  const Api = {
    auth: (mobileNumber, mobileCountryCode) =>
      call('POST', '/auth', {
        body: {
          merchantId: CFG.merchantId,
          mobileNumber,
          mobileCountryCode: mobileCountryCode || CFG.DEFAULT_COUNTRY_CODE,
          allowBlockedUserLogin: true,
        },
      }),
    verify: (authId, otp) =>
      call('POST', `/auth/${authId}/verify`, { body: { otp, deviceToken: S.deviceToken } }),
    resendOtp: (authId) => call('POST', `/auth/otp/${authId}/resend`),
    logout: () => call('POST', '/auth/logout'),

    getProfile: () => call('GET', '/profile', { query: { includeProfileImage: 'True' } }),
    updateProfile: (patch) => call('POST', '/profile', { body: patch }),

    autoComplete: ({ input, lat, lng, isPickup = true }) =>
      call('POST', '/maps/autoComplete', {
        body: {
          autoCompleteType: isPickup ? 'PICKUP' : 'DROP',
          input,
          language: 'ENGLISH',
          location: `${lat},${lng}`,
          origin: { lat, lon: lng },
          radius: 50000,
          radiusWithUnit: { unit: 'Meter', value: 50000.0 },
          sessionToken: null,
          strictbounds: false,
          types_: null,
        },
      }),
    getPlaceDetails: (placeId) =>
      call('POST', '/maps/getPlaceDetails', { body: { placeId, sessionToken: null } }),
    getPlaceName: ({ lat, lng }) =>
      call('POST', '/maps/getPlaceName', {
        body: { sessionToken: null, getBy: { tag: 'ByLatLong', contents: { lat, lon: lng } }, language: 'ENGLISH' },
      }),

    rideSearch: ({ source, dest, stops = [], fareProductType = 'ONE_WAY' }) =>
      call('POST', '/rideSearch', {
        body: {
          contents: {
            origin: source,
            destination: dest,
            stops,
            isDestinationManuallyMoved: false,
            isReallocationEnabled: true,
            isSourceManuallyMoved: false,
            isSpecialLocation: false,
            quotesUnifiedFlow: true,
            sessionToken: '2642155c-ceab-0299-9733-d0cab1ecfbbc',
          },
          fareProductType,
        },
      }),
    searchResults: (searchId) =>
      call('GET', `/rideSearch/${searchId}/results`, { query: { allowMultiple: 'true' } }),
    estimateSelect2: (estimateId, body) =>
      call('POST', `/estimate/${estimateId}/select2`, {
        body: Object.assign({
          autoAssignEnabled: true,
          autoAssignEnabledV2: true,
          billingCategory: 'PERSONAL',
          customerExtraFee: null,
          deliveryDetails: null,
          isAdvancedBookingEnabled: false,
          otherSelectedEstimates: [],
          paymentMethodId: null,
          isPetRide: false,
          selectedOfferId: null,
        }, body || {}),
      }),
    estimateResults: (estimateId) => call('GET', `/estimate/${estimateId}/results`),
    cancelEstimate: (estimateId) => call('POST', `/estimate/${estimateId}/cancel`),

    bookingList: ({ limit = 10, offset = 0, onlyActive = false, status } = {}) => {
      const q = { limit, offset, onlyActive: String(onlyActive) };
      if (status) q.status = status;
      return call('GET', '/rideBooking/list', { query: q });
    },
    booking: (bookingId) => call('GET', `/rideBooking/v2/${bookingId}`),
    bookingDetails: (bookingId) => call('POST', `/rideBooking/${bookingId}`),
    cancelBooking: (bookingId, reason) =>
      call('POST', `/rideBooking/${bookingId}/cancel`, {
        body: reason || { reasonCode: 'CHANGE_OF_PLANS', additionalInfo: 'Cancelled from web' },
      }),
    driverLocation: (rideId) => call('GET', `/ride/${rideId}/driver/location`),
    rateRide: ({ rideId, ratingValue, feedbackDetails = '', wasOfferedAssistance = null, isVideoReview = false }) =>
      call('POST', '/feedback/rateRide', {
        body: { rideId, ratingValue, feedbackDetails, wasOfferedAssistance, isVideoReview },
      }),
  };

  global.NY_API = Api;
  global.ApiError = ApiError;
})(window);
