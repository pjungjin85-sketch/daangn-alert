// 임시 실험: 지역(in=) 값에 따라 검색 결과 수와 실제 적용된 지역이 어떻게 달라지는지 확인
import { parseSearch } from "./daangn.js";
const q = process.argv[2] || "아이폰";
const ins = ["", "서초4동-366", "서초구-362", "362", "서울특별시-1", "1", "전국", "all"];
for (const inParam of ins) {
  const url = `https://www.daangn.com/kr/search/buy-sell/?q=${encodeURIComponent(q)}${inParam ? `&in=${encodeURIComponent(inParam)}` : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9" } });
  const html = await res.text();
  const { articles, source } = parseSearch(html);
  const current = html.match(/href="\/kr\/search\/buy-sell\/\?in=([^&"]+)[^"]*"\s+aria-current="page"/)?.[1];
  const regions = [...new Set([...html.matchAll(/[?&](?:amp;)?in=([^&"\\]+)/g)].map((m) => decodeURIComponent(m[1])))];
  const escCount = (html.match(/buy-sell\/[^"\\]*-[a-z0-9]{8,}/g) || []).length;
  console.log(`in=${inParam || "(없음)"} → ${res.status} ${articles.length}건(${source}), 상세링크패턴 ${escCount}, 적용지역 ${current ? decodeURIComponent(current) : "-"}, 선택지 ${regions.length}개: ${regions.slice(0, 8).join(", ")}`);
  await new Promise((r) => setTimeout(r, 1500));
}
