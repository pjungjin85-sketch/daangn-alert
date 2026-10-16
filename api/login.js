// 비밀번호 확인 후 로그인 쿠키를 심는다.
import { json } from '../lib/http.js';
import { loginCookie, safeEqual, sameOrigin } from '../lib/session.js';

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return json({ error: '서버에 비밀번호가 설정되지 않았어요' }, { status: 500 });
  }
  const { password } = await req.json().catch(() => ({}));
  if (!safeEqual(password ?? '', process.env.APP_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 1500)); // 비밀번호 마구 대입하기를 느리게
    return json({ error: '비밀번호가 틀렸어요' }, { status: 401 });
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': loginCookie(req) } });
}
