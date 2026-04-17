# NammaYatri — Web rider

A zero-build, static HTML/CSS/JS rider client for the NammaYatri open-mobility backend. The site ships as plain files under `docs/` and is designed to be served by GitHub Pages, with a thin Cloudflare Worker acting as the only bridge to the upstream API.

## Overview

The client is a multi-page app (no bundler, no framework) that speaks the same `pilot/app/v2` API the official mobile apps speak. Because the production API host does not emit CORS headers, the browser cannot call it directly. A tiny Cloudflare Worker at the repo root (`cloudflare-worker.js`) acts as a hidden-upstream relay: it holds the real backend URL server-side, applies a CORS allow-list, an optional shared-secret header, and per-IP rate limiting, then forwards the request. The web client never sees the upstream URL.

## Deploy to GitHub Pages

1. Commit the `docs/` folder to your repo on `main`.
2. In GitHub → **Settings → Pages**, set *Source* to **Deploy from branch**, pick branch `main` and folder `/docs`, then **Save**.
3. Wait ~60 seconds. Your site goes live at `https://<user>.github.io/<repo>/`.

No build step. Anything you push to `docs/` is what ships.

## Deploy the Cloudflare Worker

The worker file is at the **repo root**, not under `docs/`, because it is server code, not served content.

1. Go to <https://workers.cloudflare.com> and sign in.
2. Click **Create Worker** → give it a name (e.g. `ny-web`) → **Quick edit**.
3. Open `cloudflare-worker.js` from this repo root and paste its full contents into the editor, replacing the template.
4. Click **Save and Deploy**.
5. Copy the worker URL shown at the top (looks like `https://ny-web.<sub>.workers.dev`).

Sanity check: `curl https://ny-web.<sub>.workers.dev/_health` should return `{"ok":true,"ts":...}`.

## Configure the client

Two options.

**Per-user (runtime):**

1. Open `/settings.html` on your deployed Pages site.
2. Paste the Worker URL into the **Proxy URL** field.
3. (Optional) If you set `SHARED_SECRET` in the worker, paste the same value in **Secret**.
4. Click **Save**, then flip **Mode** to *Live*.

**Baked-in (for everyone):**

Edit `docs/assets/js/config.js` and set

```js
export const WORKER_URL = 'https://ny-web.<sub>.workers.dev';
```

then redeploy. Every visitor now hits your worker without having to configure it themselves.

## Cloudflare Workers free-tier limits (2026)

| Limit                    | Free plan                      | Paid plan ($5/mo)    |
| ------------------------ | ------------------------------ | -------------------- |
| Requests                 | 100,000 / day (UTC midnight)   | 10,000,000 / month   |
| CPU time per request     | 10 ms (Bundled)                | 30 s                 |
| Subrequests / invocation | 50                             | 50 (1000 on Unbound) |
| Script size              | 1 MB                           | 10 MB                |
| Egress bandwidth         | Fair use                       | Fair use             |

This relay uses roughly 1 ms of CPU per request, well inside the free budget. Each API call to the app is one subrequest, nowhere near 50.

## Security hardening

All switches live at the top of `cloudflare-worker.js`:

- **`ALLOWED_ORIGINS`** — array of allowed `Origin` values. Leave empty (`[]`) to accept any origin during first-time setup, then tighten to your Pages URL:
  ```js
  const ALLOWED_ORIGINS = ['https://<you>.github.io'];
  ```
- **`SHARED_SECRET`** — set to a random string; clients must echo it in the `x-ny-secret` header (Settings → Secret). Blocks casual drive-by use of your worker URL.
- **`RATE_LIMIT_PER_MINUTE`** — per-IP cap (default 60). Enforced with the edge cache keyed by `sha256(ip + ":" + minute)`; no Durable Objects required. Excess requests get `429` with `retry-after: 60`.
- **Upstream hiding** — `UPSTREAM` is only read server-side. The client and network responses never include the upstream host; `server`, `via`, `x-envoy-upstream-service-time`, `alt-svc` are stripped from relayed responses.
- **CORS** — every response carries `vary: origin`, so caches don't cross-pollinate between allowed origins. `OPTIONS` preflight is handled before rate-limit / auth checks.
- **Logs** — one line per request: `METHOD /path STATUS durationMs`. Query strings and bodies are never logged.

## Local development

Serve the static client:

```bash
python3 -m http.server --directory docs 8899
# or
npx serve docs -p 8899
```

Then visit <http://localhost:8899>. If you want to exercise Live mode locally, run the fallback Node relay (no Cloudflare account needed):

```bash
node docs/proxy.js   # listens on :9000, forwards to the same upstream
```

Point Settings → Proxy URL at `http://localhost:9000` and flip to *Live*. This is for development only — don't expose `docs/proxy.js` to the public internet, it has no auth.

## Ride flow covered

Splash → **login** (phone) → **otp** → **home** (map + source/drop autocomplete) → **estimates** (7 tiers, `POST /estimate/:id/select2`) → **ride** (poll `/rideBooking/v2/:id` through `NEW → TRIP_ASSIGNED → INPROGRESS → COMPLETED`, live OTP + cancel) → **rate** (`POST /feedback/rateRide`) → **receipt** (fare breakup) → **rides** (history + filters).

Aux screens: **profile** (read/edit), **referral**, **help**, **sos** (safety), **share-ride** (public tracking link), **settings** (mode / proxy / secret / merchant), **404**.

## File map

```
ny-react-native/
├── cloudflare-worker.js       Server-side relay (deploy to Cloudflare)
└── docs/                      GitHub Pages root
    ├── index.html             Landing (Three.js hero)
    ├── login.html
    ├── otp.html
    ├── home.html              Map + autocomplete
    ├── estimates.html         Quote tiles + select
    ├── ride.html              Live tracking
    ├── rate.html              Post-ride rating
    ├── receipt.html           Fare breakup + summary
    ├── rides.html             History
    ├── profile.html
    ├── referral.html
    ├── help.html
    ├── sos.html
    ├── share-ride.html        Public tracking link
    ├── settings.html          Mode / proxy / merchant
    ├── 404.html
    ├── proxy.js               Local Node relay (dev only, port 9000)
    └── assets/
        ├── css/               base · components · 3d · map
        ├── js/                config · session · api · ui · three-hero · <screen>.js
        └── img/               favicon.svg
```

## Credits

- **API**: NammaYatri open-mobility backend (`/pilot/app/v2`), built on the Beckn protocol.
- **Maps**: OpenStreetMap contributors, rendered with [Leaflet](https://leafletjs.com/).
- **3D**: [three.js](https://threejs.org/) via unpkg CDN.
- **Icons & vehicle art**: `ny.assets.juspay.in` and `assets.moving.tech`.

Community-built client, not an official NammaYatri product. In Live mode it books real rides on real vehicles — use accordingly.
