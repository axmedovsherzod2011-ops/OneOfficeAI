---
name: YouTube Publishing Connector
description: Architecture and runtime quirks for the YouTube video publishing feature
---

# YouTube Publishing Connector

## What was built
Full publish pipeline: product images → ffmpeg slideshow → YouTube Data API v3 resumable upload.

## Key runtime facts
- **ffmpeg**: Available at runtime as a system binary (no nix config needed). Confirmed at `/nix/store/.../bin/ffmpeg` version 6.1.2.
- **fluent-ffmpeg**: Installed in `artifacts/api-server` but we call `execFileAsync("ffmpeg", args)` directly (more control over complex filter_complex arguments).
- **DB table**: `youtube_accounts` — migrated; foreign key to `users.id`.
- **OAuth scope needed**: `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly` — backend returns this from `/api/connectors/youtube/config`, frontend uses `config.scope`.
- **Token refresh**: Handled in `ensureFreshToken()` in `youtube.ts` — runs before every API call, updates DB row in place.

## Flow states (frontend)
Create Post flow extended with: `results` → `yt-metadata` → `yt-review` → `yt-publishing` → `yt-success`. YouTube button shows only when `selectedProduct?.id` is set (product needed for metadata generation and image download).

## API endpoints (all in `artifacts/api-server/src/routes/youtube.ts`)
- `GET /connectors/youtube/config` — clientId + scope + configured flag
- `GET /connectors/youtube` — list connected channels
- `POST /connectors/youtube/exchange` — OAuth code → tokens + channel info upsert
- `DELETE /connectors/youtube/:id` — disconnect
- `POST /connectors/youtube/metadata` — AI-generated title/description/tags/hashtags
- `POST /connectors/youtube/publish` — download images, ffmpeg slideshow, resumable upload

## Gotchas
- **Resumable upload requires `duplex: "half"` on the fetch call** for Node.js streaming body.
- **postsTable** has no `platform` column — YouTube posts are saved with `telegramChannelId: null` and `telegramMessageId: null`; a future migration should add a proper `platform` column.
- **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET** must be set in Replit Secrets before any OAuth flow works. `configured: false` is returned from config endpoint when missing.
- The AI provider chain in `youtube.ts` duplicates the one in `enrich.ts` — if provider logic changes, update both.

**Why:** `generateText` in `enrich.ts` was not exported, so rather than introducing a shared lib coupling, the provider chain was duplicated. Extract to a shared utility if it diverges.
