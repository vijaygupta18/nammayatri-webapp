/**
 * NammaYatri web · Cloudflare Worker (hidden-upstream relay)
 * ----------------------------------------------------------
 * Purpose
 *   Front the real NammaYatri rider API so that the browser on GitHub Pages
 *   can call it (the production host does not emit CORS headers). The real
 *   upstream URL is held ONLY here; the web client never sees it.
 *
 * Deploy
 *   1. https://workers.cloudflare.com/  →  Create Worker  →  "Quick edit"
 *   2. Paste the contents of this file, click "Save and deploy"
 *   3. Copy the worker URL (e.g. https://ny-web.<you>.workers.dev)
 *   4. Paste it in the web app → Settings → Proxy URL
 *
 * Limits (Cloudflare Workers free plan, as of 2026)
 *   · 100,000 requests / day   (resets UTC midnight)
 *   · 10 ms CPU time / request (pure relay uses <1 ms, plenty of headroom)
 *   · 1 MB worker script size
 *   · 50 subrequests per invocation
 *   · No extra charge for bandwidth on free plan (fair-use egress)
 *   The paid "Workers Paid" plan ($5/mo) lifts these to 10M req/mo and 30s CPU.
 *
 * Routes
 *   GET  /_health                 →  {ok: true, ts: <epoch-ms>}  (no upstream hit)
 *   *    /<anything>              →  proxied to UPSTREAM + same pathname/query
 *
 * Security toggles below
 *   ALLOWED_ORIGINS          : which web origins may call this worker (CORS allow-list)
 *   SHARED_SECRET            : optional; if set, requests must send x-ny-secret header
 *   RATE_LIMIT_PER_MINUTE    : per-IP cap, enforced via cache API (no Durable Objects)
 */

// ---------------------------------------------------------------------------
// Secrets / constants — edit these, then Save & Deploy
// ---------------------------------------------------------------------------

const UPSTREAM = 'https://api.sandbox.moving.tech/dev/app/v2'; // kept server-side only

const ALLOWED_ORIGINS = [
  // Put your GitHub Pages origin(s) here. Leave empty array to allow any.
  // 'https://<your-user>.github.io',
  // 'http://localhost:8899',
];

const SHARED_SECRET = ''; // set to a random string and echo it in the client via Settings → Secret

const RATE_LIMIT_PER_MINUTE = 60; // per-IP per-minute cap; set to 0 to disable

// ---------------------------------------------------------------------------
// Constants (do not need to change)
// ---------------------------------------------------------------------------

const CORS_HEADERS_BASE = {
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers':
    'content-type,token,x-client-version,x-bundle-version,x-rn-version,x-config-version,x-device,x-package,session_id,x-sender-hash,x-sdk-authorization,x-ny-secret',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
  'vary': 'origin',
};

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'origin', 'referer',
]);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const started = Date.now();
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    const corsOrigin = pickOrigin(origin);
    const cors = { ...CORS_HEADERS_BASE, 'access-control-allow-origin': corsOrigin };

    let response;
    try {
      response = await handle(request, url, cors, origin, ctx);
    } catch (e) {
      response = json({ errorCode: 'BAD_GATEWAY', errorMessage: e.message || 'upstream error' }, 502, cors);
    }

    // Minimal request log: method, path, status, duration. No query, no upstream URL.
    try {
      console.log(request.method, url.pathname, response.status, (Date.now() - started) + 'ms');
    } catch (_) { /* noop */ }

    return response;
  },
};

async function handle(request, url, cors, origin, ctx) {
  // CORS preflight — respond before any auth/rate-limit checks so browsers
  // always get a clean allow-list back.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Health probe for the Settings page "Ping proxy" button. Returns no
  // upstream identity — just proves the worker is alive.
  if (request.method === 'GET' && url.pathname === '/_health') {
    return json({ ok: true, ts: Date.now() }, 200, cors);
  }

  if (SHARED_SECRET && request.headers.get('x-ny-secret') !== SHARED_SECRET) {
    return json({ errorCode: 'FORBIDDEN', errorMessage: 'missing or bad x-ny-secret header' }, 403, cors);
  }
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ errorCode: 'FORBIDDEN', errorMessage: 'origin not allowed' }, 403, cors);
  }

  // Per-IP rate limit using caches.default (no Durable Objects, no KV).
  if (RATE_LIMIT_PER_MINUTE > 0) {
    const limited = await rateLimit(request, ctx);
    if (limited) {
      return new Response(
        JSON.stringify({ errorCode: 'RATE_LIMITED', errorMessage: 'too many requests' }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '60',
            ...cors,
          },
        },
      );
    }
  }

  const target = UPSTREAM + url.pathname + url.search;

  const headers = {};
  for (const [k, v] of request.headers.entries()) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  // swap in upstream host; never leak ours downstream
  headers['host'] = new URL(UPSTREAM).host;

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  });

  const outHeaders = new Headers(upstream.headers);
  // strip anything that could reveal upstream identity
  for (const h of ['server', 'via', 'x-envoy-upstream-service-time', 'alt-svc']) outHeaders.delete(h);
  // overwrite any CORS echoed by upstream
  for (const k of [...outHeaders.keys()]) {
    if (k.toLowerCase().startsWith('access-control-')) outHeaders.delete(k);
  }
  for (const [k, v] of Object.entries(cors)) outHeaders.set(k, v);
  // always vary on origin for correct caching in shared intermediaries
  if (!outHeaders.has('vary')) outHeaders.set('vary', 'origin');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickOrigin(reqOrigin) {
  if (!ALLOWED_ORIGINS.length) return '*';
  return ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

/**
 * Per-IP rate limit using the edge cache.
 *
 * Approach: hash (ip + current-UTC-minute) → synthetic cache key. GET from
 * cache to read the current count, PUT back the incremented value with a
 * 90-second TTL. Not strictly atomic (two parallel requests in the same
 * minute can both observe the same pre-increment count), but good enough
 * for a rough abuse shield on a free-tier proxy. Returns true if the
 * caller has exceeded RATE_LIMIT_PER_MINUTE.
 */
async function rateLimit(request, ctx) {
  const ip = request.headers.get('cf-connecting-ip')
          || request.headers.get('x-forwarded-for')
          || '0.0.0.0';
  const minute = Math.floor(Date.now() / 60000);
  const keyHash = await sha256Hex(ip + ':' + minute);
  const cacheKey = new Request('https://rl.invalid/' + keyHash, { method: 'GET' });
  const cache = caches.default;

  let count = 0;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = await hit.text();
    const n = parseInt(body, 10);
    if (Number.isFinite(n)) count = n;
  }
  count += 1;

  const putPromise = cache.put(
    cacheKey,
    new Response(String(count), {
      headers: {
        'cache-control': 'public, max-age=90',
        'content-type': 'text/plain',
      },
    }),
  );
  if (ctx && ctx.waitUntil) ctx.waitUntil(putPromise); else await putPromise;

  return count > RATE_LIMIT_PER_MINUTE;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}
