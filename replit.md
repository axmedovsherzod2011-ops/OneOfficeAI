# OneOffice AI

AI-powered SaaS platform for Uzbek e-commerce sellers to auto-generate and publish product posts to Telegram channels. Users enter a product name and price; the app generates professional copy, picks a design style, and publishes directly to their Telegram channel via a connected bot.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/oneoffice-ai run dev` — run the frontend (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (pre-provisioned by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, TanStack Query, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Telegram: Native fetch to Telegram Bot API (no SDK)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/oneoffice-ai/` — React frontend (dark-themed, state-driven single-page app)
- `artifacts/api-server/src/routes/` — Express route handlers (connect, publish, posts, stats)
- `lib/db/src/schema/` — Drizzle schema (users, posts tables)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Generated Zod schemas used by server routes

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/connect | Verify Telegram bot token, store user + channel |
| POST | /api/publish | Publish post to Telegram channel via stored bot |
| GET | /api/posts | List user's post history |
| GET | /api/stats | Get user statistics (total, published, pending, rejected) |
| GET | /api/healthz | Health check |

## Architecture decisions

- Bot tokens are stored in plaintext in the DB (acceptable for MVP; should be encrypted at rest in production)
- App uses React state machine (not URL routing) for screen/view navigation — matches the SPA design
- Telegram verification happens server-side on connect: getMe → getChat → getChatMember (admin check)
- On publish, the backend decrypts the stored token and calls Telegram directly — the frontend never sees the token after signup
- Seed data is shown before login for UI demo purposes; real data loads after connect

## Product

- **Landing** — hero page with social proof stats
- **Signup wizard** — 4-step Telegram onboarding (name → create channel → create bot → paste token)
- **Dashboard** — stats cards, CTA, recent posts
- **Create Post** — form → animated AI pipeline → results (image style picker + post preview) → Telegram preview modal → publish
- **History** — searchable/filterable post list
- **Settings** — toggles for auto-publish, notifications, dark mode, language
- **Profile** — user info, channel connection status, subscription

## User preferences

_Populate as you build._

## Gotchas

- After any OpenAPI spec change, always run codegen before touching backend or frontend code
- Telegram getChatMember with bot username may fail for some channel types — the publish step surfaces the real error so the admin check failure on connect is non-fatal
- `pnpm --filter @workspace/db run push` must be run after schema changes before the API server can start

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
