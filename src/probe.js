// 임시 실험: 지역 ID → 실제 지역 이름 매핑, 결과 정렬(최신순 여부) 확인
import { parseSearch } from "./daangn.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const q = "실리실라스";
for (const id of [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500]) {
  const url = `https://www.daangn.com/kr/search/buy-sell/?q=${encodeURIComponent(q)}&in=${id}`;
  const html = await (await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } })).text();
  const current = html.match(/href="\/kr\/search\/buy-sell\/\?in=([^&"]+)[^"]*"\s+aria-current="page"/)?.[1];
  const arts = parseSearch(html).articles;
  const times = arts.map((a) => Date.parse(a.createdAt)).filter(Boolean);
  const desc = times.every((t, i) => i === 0 || t <= times[i - 1]);
  const oldest = times.length ? new Date(Math.min(...times)).toISOString().slice(0, 16) : "-";
  console.log(`in=${id} → ${current ? decodeURIComponent(current) : "-"} | ${arts.length}건, 최신순정렬 ${desc}, 가장 오래된 ${oldest}, 상위지역 ${arts.slice(0, 4).map((a) => a.region).join("/")}`);
  await new Promise((r) => setTimeout(r, 1500));
}
