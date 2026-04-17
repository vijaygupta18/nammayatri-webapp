#!/usr/bin/env node
/*
 * Local CORS proxy — zero dependencies. Mirrors the Cloudflare Worker.
 *
 * The client calls THIS origin with clean paths (e.g. GET /profile). The
 * UPSTREAM URL is hidden server-side here, exactly like the production
 * Cloudflare worker — so the client code is identical in local and prod.
 *
 * Run:   node docs/proxy.js
 * Stop:  Ctrl+C
 *
 * Env vars:
 *   PORT=9001                                         listen port (default 9000)
 *   UPSTREAM=https://api.c2.moving.tech/pilot/app/v2  override the API target
 *
 * DO NOT expose this on a public network. Dev-only.
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9000;
const UPSTREAM = (process.env.UPSTREAM || 'https://api.sandbox.moving.tech/dev/app/v2').replace(/\/$/, '');

const CORS = {
  'access-control-allow-origin': '*',
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

const server = http.createServer((req, res) => {
  // CORS on every response, including errors
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  const reqUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && reqUrl.pathname === '/_health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    return;
  }

  // Forward to UPSTREAM + same path + query
  const target = UPSTREAM + reqUrl.pathname + reqUrl.search;
  const u = new URL(target);
  const client = u.protocol === 'https:' ? https : http;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers['host'] = u.host;

  const opts = {
    method: req.method,
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    headers,
  };

  const fwd = client.request(opts, (upRes) => {
    const out = { ...upRes.headers };
    // strip identity-leaking + upstream CORS headers
    for (const h of ['server', 'via', 'x-envoy-upstream-service-time', 'alt-svc']) delete out[h];
    for (const k of Object.keys(out)) {
      if (k.toLowerCase().startsWith('access-control-')) delete out[k];
    }
    for (const [k, v] of Object.entries(CORS)) out[k] = v;
    res.writeHead(upRes.statusCode || 502, out);
    upRes.pipe(res);
  });

  fwd.on('error', (e) => {
    console.error('[proxy] upstream error', e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ errorCode: 'BAD_GATEWAY', errorMessage: e.message }));
  });

  req.pipe(fwd);

  const start = Date.now();
  res.on('finish', () => {
    console.info(`[proxy] ${req.method} ${reqUrl.pathname} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.info(`[proxy] listening on http://localhost:${PORT}`);
  console.info(`[proxy] forwarding to ${UPSTREAM}`);
  console.info(`[proxy] point the web app's WORKER_URL (config.js) or Settings → Proxy URL here`);
});
