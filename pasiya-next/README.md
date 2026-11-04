# PASIYA API (Next.js · Vercel)

```
app/api/[[...path]]/route.js   ← the only API route (all /api/* goes through it)
public/index.html              ← dashboard (served at "/")
system/                        ← the PLATFORM (no scraping here)
  util.js  db.js  gateway.js  account.js  status.js  registry.js
scrapers/                      ← one file per site / service
  youtube  facebook  tiktok  instagram  mediafire  gdrive  catbox
  news  weather  tv  movies  ai  download      (+ _web.js = shared helpers)
```

## Add a new scraper
1. Create `scrapers/mysite.js` and `export default [{ path, category, name, cost, desc, params, run }]`
2. Add one `import` + put it in the `ALL` list in `system/registry.js`. Docs, "Test" forms, coin charging and rate limits are automatic.

## Deploy on Vercel
1. Push this folder to GitHub → Vercel → **Add New Project** → import it (Framework: Next.js, no settings to change).
2. **Settings → Environment Variables**: copy everything from `.env.example`. Required: `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_EMAIL`.
3. Firebase Console → **Authentication → Settings → Authorized domains** → add `your-project.vercel.app` (and your custom domain).
4. Deploy. Open the site, register / login with the admin email → Admin Panel appears.

Local: `npm install && cp .env.example .env.local && npm run dev` · Tests: `npm test` (offline, mocked sites).

## What changed vs the Cloudflare version
- Worker → Next.js route handler (Node runtime). `wrangler.toml` → Vercel environment variables.
- Cloudflare Workers AI binding → REST (`CF_ACCOUNT_ID` + `CF_API_TOKEN`, free). Without it, set any of Gemini / OpenRouter / Groq / DeepSeek keys.
- Cache and rate-limit are per server instance memory (Cloudflare Cache API doesn't exist on Vercel). Fine for this size; use Upstash/Vercel KV later if you need global limits.
- **Video downloads (YouTube/TikTok/Facebook/Instagram) need yt-dlp, which cannot run on Vercel.** Those 4 endpoints forward to the separate `pasiya-scraper-api` service (Railway / Render / VPS): set `SCRAPER_URL` + `SCRAPER_SHARED_SECRET`. Until then they return 503 and cost no coins. Everything else works on Vercel alone.
- `maxDuration` is 30s in `route.js` (Vercel Hobby allows up to 60).
