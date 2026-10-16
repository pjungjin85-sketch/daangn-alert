// 키워드 목록 읽기(GET) / 통째로 저장(PUT). 실제 저장소는 GitHub 의 config/keywords.json.
import { json } from '../lib/http.js';
import { isLoggedIn, sameOrigin } from '../lib/session.js';
import { readConfig, writeConfig } from '../lib/github.js';

const fail = (e) => {
  console.error(e);
  if (e.status === 409) return json({ error: '다른 곳에서 먼저 바뀌었어요. 새로 불러올게요', conflict: true }, { status: 409 });
  return json({ error: `GitHub 오류: ${e.message}` }, { status: 502 });
};

export async function GET(req) {
  if (!isLoggedIn(req)) return json({ error: 'login' }, { status: 401 });
  try {
    return json(await readConfig());
  } catch (e) {
    return fail(e);
  }
}

const price = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : undefined);

// 페이지에서 온 값을 그대로 믿지 않고 필요한 필드만 검사해서 다시 만든다
function clean(keywords) {
  if (!Array.isArray(keywords) || keywords.length > 50) return null;
  const out = [];
  for (const k of keywords) {
    const keyword = String(k?.keyword ?? '').trim();
    const id = String(k?.id ?? '');
    const minPrice = price(k?.minPrice);
    const maxPrice = price(k?.maxPrice);
    if (!keyword || keyword.length > 50 || !/^[\w-]{1,40}$/.test(id) || minPrice === undefined || maxPrice === undefined) return null;
    out.push({ id, keyword, minPrice, maxPrice, enabled: k.enabled !== false });
  }
  return out;
}

export async function PUT(req) {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, { status: 403 });
  if (!isLoggedIn(req)) return json({ error: 'login' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const keywords = clean(body.keywords);
  if (!keywords) return json({ error: '키워드 형식이 올바르지 않아요' }, { status: 400 });
  const message = String(body.message || '키워드 변경').slice(0, 80);
  try {
    const sha = await writeConfig({ keywords }, body.sha, message);
    return json({ sha });
  } catch (e) {
    return fail(e);
  }
}
