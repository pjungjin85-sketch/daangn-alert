// cron-job.org 가 5분마다 부르는 주소: /api/tick?key=<CRON_SECRET>
// GitHub 예약 실행은 크게 밀리거나 빠지기 때문에, 외부에서 정확한 간격으로 실행을 요청한다.
import { json } from '../lib/http.js';
import { safeEqual } from '../lib/session.js';
import { runWorkflow } from '../lib/github.js';

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!process.env.CRON_SECRET || !safeEqual(key, process.env.CRON_SECRET)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    await runWorkflow();
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, { status: 502 });
  }
}
