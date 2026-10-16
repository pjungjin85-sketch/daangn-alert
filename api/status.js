// 마지막 실행 상태
import { json } from '../lib/http.js';
import { isLoggedIn } from '../lib/session.js';
import { lastRun } from '../lib/github.js';

export async function GET(req) {
  if (!isLoggedIn(req)) return json({ error: 'login' }, { status: 401 });
  try {
    return json({ run: await lastRun() });
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, { status: 502 });
  }
}
