# SF Radar web app

The frontend for SF Radar: a Vite + React + TypeScript single page app, plain CSS, deployed on Vercel. See the [project README](../../README.md) for how events are scraped, scored and served.

Live: <https://sf-radar-ingest.vercel.app>

## Run it

```sh
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

The anon key is read only (Row Level Security allows `SELECT` only), so it is safe in the browser bundle. Server only keys (`SUPABASE_SERVICE_ROLE_KEY`, `GROUP_TOKEN_SECRET`) are for the `api/` functions and must never be `VITE_` prefixed.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Type check and production build into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |

## Routes

| Path | Page | Indexed |
| --- | --- | --- |
| `/` | The ranked event list | Yes |
| `/plan/<slug>` | A shared, read only plan | No |
| `/group/<slug>` | A trip group calendar (passphrase gated) | No |
| `/feed/<slug>`, `/group/feed/<token>` | Calendar feeds (`.ics`) | No |
| `/api/*` | Vercel functions for groups and feeds | No |

There is no router library: `src/main.tsx` picks the page from the path, and `vercel.json` rewrites the private paths to `index.html` and marks them `noindex`.

## Where things live

- `src/App.tsx`: the main page (month and day picker, filters, ranked list, saved events).
- `src/components/`: `DatePicker`, `Dropdown` (the one dropdown pattern: bottom sheet on phones, dropdown on bigger screens), `FilterOptions`, `EventCard`, and the Group & share panel (`PlanActions` and the group components).
- `src/lib/`: date keys in Pacific time, filters, local storage, plan sharing, calendar export.
- `src/styles/modernist.css`: design tokens (colour, type, spacing, radius) for light and dark.
- `public/`: icons, `og-image.png` (1200 × 630 link preview), `robots.txt`, `sitemap.xml`.
