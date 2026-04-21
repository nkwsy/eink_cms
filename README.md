# eink_cms

Content manager for eink signage. Rewrite of the original Flask app as a Next.js
app on Vercel with MongoDB. Every page renders to a crisp 1-bit BMP that the
device can pull over HTTP.

## Features

- Multi-device support — register any screen size, with presets for common
  Waveshare panels (2.13", 2.9", 4.2", 7.5", 10.3").
- Layout editor — drag/resize blocks on the actual device canvas, snap grid,
  canned 2×2 / 3×2 / 4-across grids.
- Three block types: **Text**, **Image**, **Asset** (reusable sub-layout).
- Image upload → crop (aspect-locked to target block) → resize → threshold or
  Floyd–Steinberg dither → stored as a 1-bit PNG on the block.
- Text blocks: font size/family/align, soft character limit with overflow
  warning, bold, inversion.
- Reusable **assets** (building blocks) — e.g. an "event card" with its own
  text + image layout that you drop into multiple devices.
- Byte-accurate preview (we render the same pipeline that produces the BMP).
- Per-device public pull URL:
  - `GET /<slug>/current.bmp` → 1-bit BMP
  - `GET /<slug>/current.png` → same image as PNG (for debugging)
- Password-protected CMS (single shared password from `.env`).

## Stack

- Next.js 14 (App Router, TypeScript) — runs fine on Vercel
- MongoDB (Atlas recommended in prod; `mongodb://localhost` works locally)
- `@napi-rs/canvas` for server-side rendering
- Tailwind for UI

## Setup

```bash
cp .env.example .env
# fill MONGODB_URI, MONGODB_DB, APP_PASSWORD, SESSION_SECRET

npm install
npm run dev
```

Open http://localhost:3000 → log in with `APP_PASSWORD`.

## Environment variables

| Var              | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `MONGODB_URI`    | Mongo connection string                                 |
| `MONGODB_DB`     | DB name (default `eink_cms`)                            |
| `APP_PASSWORD`   | Shared password for the CMS                             |
| `SESSION_SECRET` | HMAC secret for session cookies — use a random string   |

## Deploying to Vercel

1. Push this branch.
2. `vercel` → import the project (framework auto-detected as Next.js).
3. In the Vercel project settings, set the env vars above.
4. Use MongoDB Atlas (free tier works). Whitelist `0.0.0.0/0` or Vercel
   egress CIDRs.
5. On the device, pull `https://<your-app>.vercel.app/<slug>/current.bmp` on
   whatever refresh cadence your firmware supports.

## Device-side pull example

```sh
curl -o current.bmp https://eink-cms.example.com/lobby/current.bmp
```

The endpoint is not authenticated, so keep slugs unguessable if you care.

## Legacy

The original Flask app is archived in `legacy/` for reference.
