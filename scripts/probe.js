// 임시 실험: 매물 JSON의 지역(region) 필드 구조 확인 (제목 등 내용은 출력하지 않음)
import { extractJsonArray } from "../src/daangn.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
for (let i = 0; i < 6; i++) {
  const html = await (await fetch("https://www.daangn.com/kr/search/buy-sell/?q=" + encodeURIComponent("실리실라스"), { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } })).text();
  const raw = extractJsonArray(html, "buySellArticles");
  if (!raw) { await new Promise((r) => setTimeout(r, 3000)); continue; }
  console.log("article keys:", Object.keys(raw[0]).join(", "));
  for (const k of Object.keys(raw[0])) {
    const v = raw[0][k];
    if (v && typeof v === "object") console.log(`  ${k}:`, JSON.stringify(v).slice(0, 400));
  }
  break;
}
