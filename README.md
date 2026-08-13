# MovieWheel

A "what should we watch tonight?" web app: set your filters, spin the wheel, and get a movie or TV show picked for you. Candidates come live from TMDB, and the result shows where the title can be streamed in your region.

## Features

- **Spin-the-wheel picker** — animated roulette wheel with custom easing that lands on a random title
- **Filters** — media type (movie/TV), genre, release year range, and minimum rating
- **Watch providers** — the result modal shows which streaming services offer the picked title in your country (auto-detected region)
- **Serverless TMDB proxy** — a Vercel function (`api/tmdb/[...path].ts`) forwards requests to TMDB so the API key never reaches the browser
- **Fully static frontend** — deployable on Vercel with zero backend to maintain

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** (rolldown), **Tailwind CSS**
- **TanStack React Query**
- **Vercel** serverless functions (`@vercel/node`) for the TMDB API proxy
- **TMDB API** for titles, genres, and watch providers

## Project Structure

```
src/
├── components/
│   ├── Wheel.tsx           Animated wheel rendering + spin logic
│   ├── FilterPanel.tsx     Genre / year / rating / type filters
│   ├── ResultModal.tsx     Winner presentation
│   └── WatchProviders.tsx  Streaming availability for the result
├── hooks/
│   ├── useWheel.ts         Spin state machine
│   └── useFilters.ts       Filter state
├── services/api.ts         TMDB calls (through the serverless proxy)
└── utils/                  Easing curves, region detection
api/
└── tmdb/[...path].ts       Vercel serverless TMDB proxy (holds the API key)
```

## Getting Started

```bash
npm install
cp .env.example .env   # add your TMDB API key
npm run dev
```

Deploy by pushing to a Vercel-connected repository — `vercel.json` wires up the API route; set the TMDB key as a Vercel environment variable.
