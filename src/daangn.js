// 당근 웹 전체 검색 결과를 가져와 매물 목록으로 변환한다.
// 페이지 안에 서버가 심어 둔 JSON의 "buySellArticles" 배열을 꺼내 쓰고,
// 그게 없으면 HTML의 매물 링크를 긁는 방식으로 대체한다.

const BASE = "https://www.daangn.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function searchUrl(keyword) {
  return `${BASE}/kr/search/buy-sell/?q=${encodeURIComponent(keyword)}`;
}

export async function searchArticles(keyword) {
  const res = await fetch(searchUrl(keyword), {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
  });
  if (!res.ok) throw new Error(`당근 검색 실패 (${res.status}) — "${keyword}"`);
  return parseSearchHtml(await res.text());
}

export function parseSearchHtml(html) {
  const raw = extractJsonArray(html, "buySellArticles");
  if (raw && raw.length) return raw.map(normalize).filter((a) => a.id && a.url);
  return parseLinks(html);
}

// `"key":[ ... ]` 를 찾아 괄호 짝을 맞춰 배열 부분만 잘라 JSON으로 읽는다.
function extractJsonArray(text, key) {
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

export function isSoldOrReserved(article) {
  return /closed|sold|reserved|완료|예약/i.test(article.status);
}
