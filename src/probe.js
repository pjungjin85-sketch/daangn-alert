// 임시 실험: 지역(in=)이 결과에 실제로 영향을 주는지 (겹치는 매물 비율, 매물 지역 분포)
import { parseSearch } from "./daangn.js";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
async function run(q, inParam) {
  const url = `https://www.daangn.com/kr/search/buy-sell/?q=${encodeURIComponent(q)}${inParam ? `&in=${encodeURIComponent(inParam)}` : ""}`;
  const html = await (await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } })).text();
  await new Promise((r) => setTimeout(r, 1500));
  return parseSearch(html).articles;
}
const top = (arts) => {
  const c = {};
  for (const a of arts) c[a.region || "?"] = (c[a.region || "?"] ?? 0) + 1;
  return `지역 ${Object.keys(c).length}종: ` + Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(", ");
};
for (const q of ["아이폰", "실리실라스"]) {
  const a = await run(q, "서초4동-366");
  const b = await run(q, "1");
  const ids = new Set(a.map((x) => x.id));
  const overlap = b.filter((x) => ids.has(x.id)).length;
  console.log(`[${q}] 서초 ${a.length}건 / 종로 ${b.length}건 / 겹침 ${overlap}건`);
  console.log(`  서초 ${top(a)}`);
  console.log(`  종로 ${top(b)}`);
  console.log(`  필드 ${a[0] ? Object.entries(a[0]).filter(([k]) => k !== "title" && k !== "url" && k !== "thumbnail").map(([k, v]) => `${k}=${v}`).join(" ") : "-"}`);
}
