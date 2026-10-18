// 당근 웹 전체 검색 결과를 가져와 매물 목록으로 변환한다.
// 페이지 안에 서버가 심어 둔 JSON의 "buySellArticles" 배열을 꺼내 쓰고,
// 그게 없으면 HTML의 매물 링크를 긁는 방식으로 대체한다.

const BASE = "https://www.daangn.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// regionId: 기준 동네(당근 지역 ID). 없으면 당근 기본값(서초4동)으로 검색된다.
export function searchUrl(keyword, regionId) {
  return `${BASE}/kr/search/buy-sell/?q=${encodeURIComponent(keyword)}${regionId ? `&in=${regionId}` : ""}`;
}

// 요청 속도 제한. 2026-10-18 키워드 5개 × 빈 페이지 재시도(최대 5회)로 시간당 300~400회를 보내다
// 당근에게 429(요청 과다)로 막혔다. 그래서 한 회차의 요청 수·간격·재시도를 묶어 둔다.
// (테스트에서는 이 값들을 0으로 바꿔 빨리 돌린다)
export const LIMITS = {
  maxAttempts: 2, // 빈 페이지일 때 다시 시도하는 횟수 포함 최대 시도
  retryDelayMs: 10_000,
  gapMs: 5_000, // 요청 사이 최소 간격
  maxRequests: 20, // 한 회차 요청 상한
  maxEmptyStreak: 4, // 빈 페이지가 연달아 이만큼 오면 이번 회차는 접는다
};

// 이번 회차를 여기서 멈춰야 할 때. rateLimited면 당근이 429로 막은 것.
export class StopRun extends Error {
  constructor(message, { rateLimited = false, retryAfterSec = 0 } = {}) {
    super(message);
    this.rateLimited = rateLimited;
    this.retryAfterSec = retryAfterSec;
  }
}

let requests = 0;
let emptyStreak = 0;
let lastAt = 0;
export function resetRequestBudget() {
  requests = emptyStreak = lastAt = 0;
}

async function pacedFetch(url) {
  if (requests >= LIMITS.maxRequests) throw new StopRun(`이번 회차 요청 상한 ${LIMITS.maxRequests}회 도달`);
  const wait = lastAt + LIMITS.gapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  requests++;
  lastAt = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("retry-after")) || 0;
    throw new StopRun("당근이 요청을 제한함 (429)", { rateLimited: true, retryAfterSec });
  }
  return res;
}

// 당근은 해외(GitHub Actions) 요청에 매물이 빈 페이지를 자주 돌려준다.
// 빈 결과는 '매물 없음'이 아니라 '이번엔 실패'로 보고 한 번만 더 시도한다.
export async function searchArticles(keyword, regionId) {
  let last;
  for (let attempt = 1; attempt <= LIMITS.maxAttempts; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, LIMITS.retryDelayMs));
    const res = await pacedFetch(searchUrl(keyword, regionId));
    if (!res.ok) throw new Error(`당근 검색 실패 (${res.status}) — "${keyword}"`);
    last = { ...parseSearch(await res.text()), attempts: attempt };
    if (last.articles.length) {
      emptyStreak = 0;
      return last;
    }
    if (++emptyStreak >= LIMITS.maxEmptyStreak) {
      throw new StopRun(`빈 페이지가 연속 ${emptyStreak}번 — 이번 회차 중단`);
    }
  }
  return last;
}

// { articles, source } — source는 어느 경로로 읽었는지 (json | links), 진단 로그용
export function parseSearch(html) {
  const raw = extractJsonArray(html, "buySellArticles");
  const articles = raw && raw.length ? raw.map(normalize) : parseLinks(html);
  for (const a of articles) a.id = articleKey(a.url) ?? a.id;
  return { articles: articles.filter((a) => a.id && a.url), source: raw && raw.length ? "json" : "links" };
}

export const parseSearchHtml = (html) => parseSearch(html).articles;

// 상세 주소 /kr/buy-sell/<제목-슬러그>-<고유코드>/ 에서 고유코드만 뽑는다.
// 판매자가 제목을 고쳐도 같은 매물로 인식하기 위함.
export function articleKey(url) {
  const m = String(url ?? "").match(/\/buy-sell\/([^/?#]+)/);
  if (!m) return null;
  const seg = decodeURIComponent(m[1]);
  return seg.slice(seg.lastIndexOf("-") + 1) || seg;
}

// `"key":[ ... ]` 를 찾아 괄호 짝을 맞춰 배열 부분만 잘라 JSON으로 읽는다.
export function extractJsonArray(text, key) {
  const marker = `"${key}":[`;
  let from = 0;
  while (true) {
    const at = text.indexOf(marker, from);
    if (at < 0) return null;
    const start = at + marker.length - 1;
    const end = matchBracket(text, start);
    if (end > 0) {
      try {
        const arr = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(arr) && arr.length) return arr;
      } catch {}
    }
    from = at + marker.length;
  }
}

function matchBracket(text, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 필드 이름이 바뀌어도 버티도록 후보 이름을 여러 개 본다.
function normalize(a) {
  const href = pick(a, "href", "url", "link", "webUrl");
  const id = String(pick(a, "id", "articleId", "uuid") ?? href ?? "");
  let url = href ? absolute(href) : null;
  if (!url && id) url = `${BASE}/kr/buy-sell/${id}/`;
  const region = a.region ?? a.regionId ?? a.regionName;
  return {
    id,
    url,
    title: String(pick(a, "title", "name", "subject") ?? "(제목 없음)").trim(),
    price: toPrice(pick(a, "price", "priceValue", "salePrice")),
    region: typeof region === "object" && region ? region.name ?? region.fullName ?? "" : region ?? "",
    status: String(pick(a, "status", "tradeStatus", "state") ?? ""),
    createdAt: pick(a, "createdAt", "publishedAt", "boostedAt") ?? null,
    thumbnail: pick(a, "thumbnail", "thumbnailUrl", "image", "imageUrl") ?? null,
  };
}

function pick(obj, ...keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return undefined;
}

function absolute(href) {
  return href.startsWith("http") ? href : BASE + (href.startsWith("/") ? "" : "/") + href;
}

// 150000, "150000.0", "150,000원" → 150000 / "나눔"·빈 값 → 0 또는 null
export function toPrice(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const s = String(v);
  if (s.includes("나눔")) return 0;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// JSON이 없을 때의 대체 경로: 매물 상세 링크만이라도 모은다.
function parseLinks(html) {
  const seen = new Map();
  const re = /href="(\/kr\/buy-sell\/(?!s\/)[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const path = m[1];
    if (seen.has(path)) continue;
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    seen.set(path, {
      id: path,
      url: BASE + path,
      title: text || "(제목 없음)",
      price: toPrice(text.match(/[\d,]+원/)?.[0]),
      region: "",
      status: "",
      createdAt: null,
      thumbnail: null,
    });
  }
  return [...seen.values()];
}

// Actions 로그에 남길 진단 요약 (공개 로그라 매물 내용은 남기지 않고 숫자만)
export function describe({ articles, source, attempts }) {
  const n = articles.length;
  const has = (k) => articles.filter((a) => a[k] != null && a[k] !== "").length;
  const statuses = {};
  for (const a of articles) statuses[a.status || "없음"] = (statuses[a.status || "없음"] ?? 0) + 1;
  const st = Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join("·");
  return `시도 ${attempts}회, 읽기 ${source}, 가격 ${has("price")}/${n}, 지역 ${has("region")}/${n}, 상태 ${st}`;
}

export function isSoldOrReserved(article) {
  return /closed|sold|reserved|완료|예약/i.test(article.status);
}
