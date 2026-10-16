// 새 글 감지 실측: 한 키워드를 일정 시간 반복 검색해서, 새로 나타난 매물이
// 실제로 방금 올라온 글인지와 올라온 뒤 몇 분 만에 잡히는지 기록한다. (텔레그램 발송 없음)
//   node scripts/detect-test.js <키워드> <분> <간격초>
import { searchArticles } from "../src/daangn.js";
import { matchesKeyword, isFreshListing } from "../src/check.js";

const [keyword = "아이폰", minutes = "20", intervalSec = "120"] = process.argv.slice(2);
const end = Date.now() + minutes * 60_000;
const seen = new Set();
let baselineAt = null;
let polls = 0, empty = 0;
const found = [];
const kst = (t) => new Date(t).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

while (Date.now() < end) {
  polls++;
  const { articles, attempts } = await searchArticles(keyword);
  const now = Date.now();
  if (!articles.length) {
    empty++;
    console.log(`${kst(now)} 빈 결과 (시도 ${attempts}회)`);
  } else if (!baselineAt) {
    baselineAt = new Date(now).toISOString();
    articles.forEach((a) => seen.add(a.id));
    console.log(`${kst(now)} 기준 기록 ${articles.length}건 (시도 ${attempts}회)`);
  } else {
    const fresh = articles.filter((a) => !seen.has(a.id));
    fresh.forEach((a) => seen.add(a.id));
    for (const a of fresh) {
      const created = Date.parse(a.createdAt);
      const r = {
        id: a.id,
        created: a.createdAt ? kst(created) : "-",
        delayMin: a.createdAt ? ((now - created) / 60000).toFixed(1) : "-",
        match: matchesKeyword(a.title, keyword),
        recent: isFreshListing(a.createdAt, baselineAt, now),
      };
      found.push(r);
      console.log(`${kst(now)}   새로 보임 ${r.id} 등록 ${r.created} (${r.delayMin}분 전) 키워드일치 ${r.match} 최신등록 ${r.recent}`);
    }
    console.log(`${kst(now)} ${articles.length}건 중 새로 보인 매물 ${fresh.length}건 (시도 ${attempts}회)`);
  }
  await new Promise((r) => setTimeout(r, intervalSec * 1000));
}

const alerts = found.filter((r) => r.match && r.recent);
const delays = alerts.map((r) => +r.delayMin).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`\n=== 요약: ${keyword} / ${minutes}분 ===`);
console.log(`검색 ${polls}회, 빈 결과 ${empty}회`);
console.log(`새로 보인 매물 ${found.length}건 → 알림 대상(키워드일치+최신등록) ${alerts.length}건, 예전 매물로 걸러짐 ${found.filter((r) => !r.recent).length}건, 키워드 불일치 ${found.filter((r) => !r.match).length}건`);
if (delays.length) console.log(`등록→감지 지연: 최소 ${delays[0]}분, 중간 ${delays[Math.floor(delays.length / 2)]}분, 최대 ${delays.at(-1)}분`);
