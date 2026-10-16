import { json } from '../lib/http.js';
import { logoutCookie, sameOrigin } from '../lib/session.js';

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  return json({ ok: true }, { headers: { 'Set-Cookie': logoutCookie(req) } });
}
