// 비밀번호 로그인 세션. DB 없이 "만료시각.서명" 쿠키 하나로 처리한다.
// 서명 키에 APP_PASSWORD 를 섞어 두어, 비밀번호를 바꾸면 기존 로그인이 모두 풀린다.
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'da_session';
const DAYS = 365; // 휴대폰에서 한 번 로그인하면 1년 유지

const key = () => `${process.env.SESSION_SECRET}:${process.env.APP_PASSWORD}`;
const sign = (v) => createHmac('sha256', key()).update(v).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** HttpOnly: JS 로 못 읽어 스크립트 주입에 털리지 않는다. SameSite=Lax: 다른 사이트의 POST 에는 안 실린다. */
function cookie(req, value, maxAge) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function loginCookie(req) {
  const exp = String(Date.now() + DAYS * 86400_000);
  return cookie(req, `${exp}.${sign(exp)}`, DAYS * 86400);
}

export const logoutCookie = (req) => cookie(req, '', 0);

export function isLoggedIn(req) {
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) return false;
  const [exp, sig] = (readCookie(req, COOKIE) || '').split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEqual(sig, sign(exp));
}

/** 쓰기 요청이 우리 사이트에서 온 것인지. SameSite 에 더한 2중 방어. */
export function sameOrigin(req) {
  return req.headers.get('origin') === new URL(req.url).origin;
}
