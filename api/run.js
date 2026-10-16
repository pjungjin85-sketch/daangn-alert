// "지금 확인" / "테스트 알림" 버튼 → GitHub Actions 실행
import { json } from '../lib/http.js';
import { isLoggedIn, sameOrigin } from '../lib/session.js';
import { runWorkflow } from '../lib/github.js';

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  if (!isLoggedIn(req)) return json({ error: 'login' }, { status: 401 });
  const { test } = await req.json().catch(() => ({}));
  try {
    await runWorkflow(test ? { test: true } : {});
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: `실행 실패: ${e.message}` }, { status: 502 });
  }
}
