# MovieWheel

[![CI](https://github.com/CMaintz/movie-wheel/actions/workflows/ci.yml/badge.svg)](https://github.com/CMaintz/movie-wheel/actions/workflows/ci.yml)

"What do we watch tonight?" can eat a whole evening, so I handed the decision to a wheel. Set your filters, spin, and it picks a movie or TV show for you. Candidates come live from TMDB, and the result shows where you can stream the title in your region.

I spun it out of my [movie-db-webapp](https://github.com/CMaintz/movie-db-webapp) into its own repo, which is why the history starts with a single import commit.

Live: https://movie-wheel.cmaintz-site.workers.dev

![The wheel mid-spin, with the filter sidebar](docs/wheel.png)

![Result modal for the picked title](docs/result.png)

## What it does

- Spin-the-wheel picker: a 12-slot canvas wheel with ease-out animation that lands on a randomly chosen title
- Filters: media type (movie / TV / both), genres (match any or all), release year range, minimum rating, minimum vote count and original language, saved in `localStorage`
- Genre combos: Rom-Com, Horror Comedy, Action Thriller and a dozen more. A combo only matches titles that have both genres, and you can mix combos with plain genres
- Result details: runtime or season count, genres, director (or creator for TV), cast, trailer, and TMDB/IMDb links
- Watch providers: streaming, rent and buy options for the title in your region (detected from your time zone, and you can change it)
- Server-side TMDB proxy: in production the browser only calls `/api/tmdb/*`, and the API key stays on the server

## Tech Stack

- React 19 + TypeScript (strict), Vite, Tailwind CSS, TanStack React Query
- Cloudflare Workers (static assets + Worker for `/api/*`); a Vercel function adapter is kept as well
- Vitest + Testing Library, v8 coverage, GitHub Actions CI

## Architecture

```
Browser (React SPA)
   │  production: GET /api/tmdb/<path>?<query>          dev: calls TMDB directly
   ▼
Cloudflare Worker (worker/index.ts)  or  Vercel function (api/tmdb/[...path].ts)
   │  thin adapters over one Fetch-API core: server/tmdbProxy.ts
   │   - origin check: same origin + ALLOWED_ORIGINS, anything else gets a 403
   │   - path allow-list: /genre, /discover, /movie, /tv, and every segment matches [A-Za-z0-9_-]
   │   - rate limit per client IP (60 req/min)
   │   - injects TMDB_API_KEY (or the TMDB_READ_TOKEN bearer), drops any client-supplied api_key
   ▼
api.themoviedb.org/3
```

```
src/
├── components/   Wheel (canvas), FilterPanel, ResultModal, WatchProviders
├── hooks/        useWheel (spin state machine), useFilters (persisted filter state)
├── services/     api.ts: TMDB calls, candidate selection
└── utils/        wheelMath (spin/landing angles), genreCombos, easing, region detection
server/           tmdbProxy.ts: platform-neutral proxy core
worker/           Cloudflare Worker entry (serves dist/ + proxies /api/*)
api/              Vercel function adapter
```

The wheel math lives in `utils/wheelMath.ts` as pure functions. A property test checks that the wheel lands on the chosen segment from any starting angle, which is how I found a bug where repeat spins landed on the wrong slot.

## Getting Started

```bash
npm install
cp .env.example .env   # add your TMDB API key (https://www.themoviedb.org/settings/api)
npm run dev            # dev mode calls TMDB directly using the VITE_ key
```

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc -b` over the app, Vite config, API/server and Worker projects |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:coverage` | Vitest (coverage thresholds are enforced) |
| `npm run build` | Type-check and build the SPA into `dist/` |
| `npm run preview:worker` | Build, then run the Worker locally with `wrangler dev` (put `TMDB_API_KEY=...` in `.dev.vars`) |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

### Deploying to Cloudflare Workers

```bash
npx wrangler login
npm run deploy                            # first deploy creates the Worker on <name>.<subdomain>.workers.dev
npx wrangler secret put TMDB_API_KEY      # prompts for the value; never commit it
```

Optionally add `TMDB_READ_TOKEN` as a second secret. Without it, watch-provider requests use the API key.

## Limitations

- Dev mode exposes the key. `npm run dev` calls TMDB directly with `VITE_TMDB_API_KEY`, which Vite embeds in the dev bundle. Only production builds go through the proxy. Use `npm run preview:worker` to test the proxied setup locally.
- Rate limiting is approximate. On Cloudflare it uses the Workers rate-limit binding, which counts per Cloudflare location, not globally. On Vercel, or without the binding, it falls back to an in-memory counter per function instance. It limits casual abuse; it doesn't enforce a hard global quota.
- The origin check only affects browsers. It stops other websites from using the proxy from their visitors' browsers. Scripts that don't send an `Origin` header can still call the allowed TMDB paths, up to the rate limit.
- Caching: successful responses send `Cache-Control: max-age=300, s-maxage=300`, so browsers (and Vercel's CDN) cache them. The Worker doesn't use the Cloudflare Cache API.
- Discovery sorts by popularity and only samples the first 100 result pages.
- TMDB can't do "(A and B) or C" in one query, so each spin picks one genre selection or combo per request and mixes the results.
- TV has no Romance, Horror or Thriller genres on TMDB, so combos using them are greyed out for TV.
- The wheel is a canvas animation with no text alternative for screen readers. Not great, I know.

## License

MIT. Data provided by [TMDB](https://www.themoviedb.org/); this product uses the TMDB API but is not endorsed or certified by TMDB.
