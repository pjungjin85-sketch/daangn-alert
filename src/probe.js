// 임시 실험: 같은 요청 반복 시 빈 결과가 나오는 빈도 (간격별)
import { parseSearch } from "./daangn.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
async function once(label, url) {
  const t = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
  const html = await res.text();
  const n = parseSearch(html).articles.length;
  const cache = ["x-cache", "cf-cache-status", "age", "x-vercel-cache", "cache-control"].map((h) => res.headers.get(h) ? `${h}=${res.headers.get(h)}` : "").filter(Boolean).join(" ");
  console.log(`${label} ${res.status} ${n}건 ${Math.round(html.length / 1024)}KB ${Date.now() - t}ms ${cache}`);
}
const q = encodeURIComponent("실리실라스");
for (let i = 0; i < 6; i++) { await once(`in=366 #${i}`, `https://www.daangn.com/kr/search/buy-sell/?q=${q}&in=366`); await new Promise((r) => setTimeout(r, 5000)); }
for (let i = 0; i < 4; i++) { await once(`no-in #${i}`, `https://www.daangn.com/kr/search/buy-sell/?q=${q}`); await new Promise((r) => setTimeout(r, 5000)); }
for (let i = 0; i < 3; i++) { await once(`in=서초4동-366 #${i}`, `https://www.daangn.com/kr/search/buy-sell/?in=${encodeURIComponent("서초4동-366")}&q=${q}`); await new Promise((r) => setTimeout(r, 5000)); }
