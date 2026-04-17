<p align="center">
  <img src="assets/img/readme-hero.svg" alt="NammaYatri.web — animated auto-rickshaw driving through a Bengaluru-inspired cityscape" width="100%"/>
</p>

<h1 align="center">NammaYatri · Web rider</h1>

<p align="center">
  <strong>The complete NammaYatri rider experience, as a zero-build static site.</strong><br/>
  HTML / CSS / JavaScript against the real mobility API · signed in with your phone · tracked on a live map.
</p>

<p align="center">
  <a href="https://vijaygupta18.github.io/nammayatri-webapp/"><img src="https://img.shields.io/badge/-Live%20site-FCC32C?style=flat-square&logoColor=0F1115&labelColor=0F1115" alt="Live site"/></a>
  <img src="https://img.shields.io/badge/build-zero--build-0F1115?style=flat-square" alt="Zero build"/>
  <img src="https://img.shields.io/badge/deps-0-0F1115?style=flat-square" alt="Zero dependencies"/>
  <img src="https://img.shields.io/badge/license-MIT-0F1115?style=flat-square" alt="MIT"/>
  <img src="https://img.shields.io/badge/theme-light%20%2F%20dark-0F1115?style=flat-square" alt="Theme aware"/>
</p>

---

<p align="center">
  <img src="assets/img/readme-flow.svg" alt="The rider journey: sign in → search → pick → confirm → track → rate, with a rickshaw sliding through every stage" width="100%"/>
</p>

---

## What this is

A community-built web rider for [NammaYatri](https://nammayatri.in), India's first zero-commission ride-hailing network (a project of the [Beckn](https://becknprotocol.io/) open commerce initiative). Ships as plain HTML / CSS / JS — no framework, no bundler — and speaks the same `/app/v2` API the official mobile apps speak, through a thin Cloudflare Worker that hides the upstream.

- 🧭 **Full journey** — sign in, search, live estimates, booking, driver tracking, cancel, rate, history, receipt, referral, help, SOS
- 🎨 **Brand-native** — single yellow accent (`#FCC32C`), real NammaYatri wordmark, real vehicle art
- 🌓 **Theme-aware** — auto-detects system preference, toggle in the nav, persisted in `localStorage`
- 🎥 **3D + motion** — Three.js hero scenes, animated SVG auto-rickshaws, scroll-linked parallax, stagger reveals, confetti on 5★, journey progress bar that slides to the current stage
- 🔐 **Hidden upstream** — the real API URL lives only inside the Cloudflare Worker; the browser never learns it
- 🗺️ **Real maps** — OpenStreetMap tiles via CARTO (dark/light per theme), pickup + drop markers from the NY asset set
- ⚡ **Fast** — 70+ files, ~560 KB total, one CDN each for Leaflet / Three.js / fonts

## Deploy to GitHub Pages

```bash
# Fork or clone this repo, push it to your own GitHub account, then:
# Settings → Pages → Deploy from a branch → main → / (root) → Save
```

Wait ~60 seconds. Your site is live at `https://<user>.github.io/<repo>/`. No build step — what you push is what ships.

## Deploy the Cloudflare Worker

The browser cannot call the NammaYatri API directly — the production host does not emit CORS headers. A tiny worker bridges that gap and hides the upstream URL.

1. Go to [workers.cloudflare.com](https://workers.cloudflare.com) and sign in.
2. **Create Worker** → name it (e.g. `ny-web`) → **Quick edit**.
3. Paste the full contents of `cloudflare-worker.js` from this repo.
4. **Save and Deploy**.
5. Copy the URL (`https://ny-web.<sub>.workers.dev`).

Sanity check:

```bash
curl https://ny-web.<sub>.workers.dev/_health
# {"ok":true,"ts":...}
```

## Configure the client

### Per-user (runtime, no redeploy)

1. Open `/settings.html` on your deployed site.
2. Paste the Worker URL into **Proxy URL**, click **Save**.
3. Optional: if you set `SHARED_SECRET` in the worker, paste the same value.

### Baked-in (ships for everyone)

Edit `assets/js/config.js`:

```js
const WORKER_URL = 'https://ny-web.<sub>.workers.dev';
```

Redeploy. Every visitor now hits your worker without having to configure it.

## Cloudflare Workers free-tier limits

|                          | Free plan                       | Paid plan ($5/mo)    |
| ------------------------ | ------------------------------- | -------------------- |
| Requests                 | 100,000 / day (UTC midnight)    | 10,000,000 / month   |
| CPU per request          | 10 ms (Bundled)                 | 30 s                 |
| Subrequests / invocation | 50                              | 50 (1,000 on Unbound)|
| Script size              | 1 MB                            | 10 MB                |

This relay uses roughly 1 ms of CPU per request, comfortably inside the free budget.

## Security hardening

All switches live at the top of `cloudflare-worker.js`:

- **`ALLOWED_ORIGINS`** — tighten to your Pages URL after first setup:
  ```js
  const ALLOWED_ORIGINS = ['https://<you>.github.io'];
  ```
- **`SHARED_SECRET`** — set a random string; the client echoes it in the `x-ny-secret` header. Blocks drive-by use of your worker URL.
- **`RATE_LIMIT_PER_MINUTE`** — per-IP cap (default 60), enforced via the edge cache. No Durable Objects required.
- **Upstream hiding** — `UPSTREAM` is read server-side only. Relayed responses strip `server`, `via`, `x-envoy-upstream-service-time`, `alt-svc`.

## Local development

```bash
# Static site
python3 -m http.server 8899
# or
npx serve -p 8899

# Local CORS proxy (dev only)
node proxy.js        # :9000 — forwards to the NammaYatri sandbox
```

Open `/settings.html`, point **Proxy URL** to `http://localhost:9000`, **Save**.

Override the upstream if you want a different environment:

```bash
UPSTREAM=https://api.c2.moving.tech/pilot/app/v2 node proxy.js
```

## Screen map

| Page | What happens |
|------|--------------|
| `index.html` | Cinematic landing — animated SVG hero, Three.js overlay, marquee, testimonials, trust row |
| `login.html` | Phone number entry |
| `otp.html` | 4-digit OTP verification |
| `home.html` | Map + source/drop autocomplete + favourites + recents |
| `estimates.html` | Map sidebar + 7 ride tiles with live fares + sticky confirm |
| `ride.html` | Live tracking — status stages, driver card, ride OTP, cancel |
| `rate.html` | 5-star rating with confetti on 4★/5★ |
| `receipt.html` | Fare breakup + route map + rating stars |
| `rides.html` | History with filter chips + inline cancel for active rides |
| `profile.html` | Read + edit name, email, gender, language |
| `referral.html` | Referral code, share link |
| `help.html` | Ticket creation + topic chooser |
| `sos.html` | Emergency contacts + SOS broadcast |
| `share-ride.html` | Public read-only tracking link |
| `settings.html` | Proxy URL, merchant id, diagnostics |
| `404.html` | Not found |

## File map

```
nammayatri-webapp/
├── cloudflare-worker.js       Server-side relay (deploy to Cloudflare)
├── proxy.js                   Local Node relay (dev only, port 9000)
├── index.html                 Landing page
├── <15 other html pages>
└── assets/
    ├── css/                   base · components · 3d · premium · scenes · map
    ├── js/                    config · session · api · ui · motion · three-hero · scenes · <screen>.js
    └── img/
        ├── brand/             NammaYatri wordmark + marks (from the consumer app)
        ├── ride/              Tier-specific vehicle art
        ├── map/               Pickup + drop markers
        ├── hero/              Hero illustrations
        ├── auto-animated.svg  Compact animated rickshaw (SMIL)
        ├── readme-hero.svg    README hero banner
        └── readme-flow.svg    README journey rail
```

## Credits

- **API** — NammaYatri open mobility backend, built on the [Beckn protocol](https://becknprotocol.io/)
- **Maps** — [OpenStreetMap](https://www.openstreetmap.org) contributors · [CARTO](https://carto.com) dark/light tiles · [Leaflet](https://leafletjs.com)
- **3D** — [three.js](https://threejs.org)
- **Vehicle art** — NammaYatri consumer app assets
- **Fonts** — Space Grotesk, Inter Tight, Fraunces, JetBrains Mono via Google Fonts

## License

MIT — see [`LICENSE`](./LICENSE).

> Community-built client, not an official NammaYatri product. In Live mode it books real rides on real vehicles — use accordingly. Open a PR if you spot a bug or want to add a city.
