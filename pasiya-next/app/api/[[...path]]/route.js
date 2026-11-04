// The single entry point for every /api/* request on Vercel.
import { after } from 'next/server';
import { HttpError, json, CORS, SITE, CREATOR, stamp } from '../../../system/util.js';
import { serve } from '../../../system/gateway.js';
import { account } from '../../../system/account.js';
import { status } from '../../../system/status.js';
import { ENDPOINTS, CATALOG } from '../../../system/registry.js';

export const runtime = 'nodejs';
export const maxDuration = 30; // seconds (Vercel function limit; raise on Pro if your scrapers are slow)
export const dynamic = 'force-dynamic';

async function route(req) {
  const env = process.env;
  const url = new URL(req.url), m = req.method;
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (m === 'OPTIONS') return new Response(null, { headers: CORS });

  if (p === '/api/health' || p === '/api/ping') return json({ ok: true, service: SITE, creator: CREATOR, time: stamp() });
  if (p === '/api/status') return json({ success: true, ...(await status(req, env)) }, 200, { 'Cache-Control': 'no-store' });
  if (p === '/api/catalog') return json({ success: true, apis: CATALOG }, 200, { 'Cache-Control': 'public, max-age=300' });

  const def = ENDPOINTS.get(p);
  if (def && (m === 'GET' || m === 'POST')) return serve(req, env, (task) => after(task), def);
  if (def) throw new HttpError(405, 'Use GET or POST.');

  const r = await account(req, env, p, m);
  if (r !== undefined) return json(r);
  throw new HttpError(404, 'Endpoint not found. See /api/catalog.');
}

async function handle(req) {
  try { return await route(req); }
  catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e?.stack || e);
    return json({ success: false, error: e instanceof HttpError ? e.message : 'Unexpected error.' }, status);
  }
}
export { handle as GET, handle as POST, handle as OPTIONS, handle as PUT, handle as DELETE, handle as PATCH };
