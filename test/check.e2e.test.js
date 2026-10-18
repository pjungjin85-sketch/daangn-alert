// 알림 흐름 전체 확인: 가짜 당근 페이지와 가짜 텔레그램으로 실제 main()을 돌린다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "daangn-"));
process.env.DAANGN_CONFIG = join(dir, "keywords.json");
process.env.DAANGN_SEEN = join(dir, "seen.json");
process.env.DAANGN_STATE = join(dir, "state.json");
process.env.TELEGRAM_TOKEN = "t";
process.env.TELEGRAM_CHAT_ID = "c";

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const art = (id, title, price, region, createdAt, status = "Ongoing") =>
  ({ id, href: `/kr/buy-sell/${encodeURIComponent(title)}-${id}/`, title, price: String(price), region: { name: region }, status, createdAt });

let listings = [];
let sent = [];
let daangnStatus = 200;
let daangnCalls = 0;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url, opts) => {
    url = String(url);
    if (url.startsWith("https://api.telegram.org/")) {
      sent.push(JSON.parse(opts.body).text);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (url.startsWith("https://www.daangn.com/")) {
      daangnCalls++;
      if (daangnStatus !== 200) return new Response("", { status: daangnStatus });
      const html = `<script>window.x={"buySellArticles":${JSON.stringify(listings)}}</script>`;
      return new Response(html);
    }
    throw new Error(`예상 못한 요청 ${url}`);
  };
});
after(() => { globalThis.fetch = realFetch; });

const { main } = await import("../src/check.js");
const { LIMITS } = await import("../src/daangn.js");
Object.assign(LIMITS, { retryDelayMs: 0, gapMs: 0 }); // 테스트는 기다리지 않는다
const stateFile = () => JSON.parse(readFileSync(process.env.DAANGN_STATE, "utf8"));
const seenFile = () => JSON.parse(readFileSync(process.env.DAANGN_SEEN, "utf8"));

test("첫 실행은 기록만, 다음 실행부터 조건 맞는 새 글만 알림", async () => {
  writeFileSync(process.env.DAANGN_CONFIG, JSON.stringify({
    keywords: [{ id: "k1", keyword: "아이패드 미니", minPrice: 100000, maxPrice: 400000, enabled: true }],
  }));
  writeFileSync(process.env.DAANGN_SEEN, "{}");
  writeFileSync(process.env.DAANGN_STATE, "{}");

  // 1회차: 기존 매물들 → 기록만 하고 알림 없음 (부산·광주 근처 매물을 넣어 추가 검색은 생략되게)
  listings = [
    art("old1", "아이패드 미니 6", 350000, "대연동", iso(600)),
    art("old2", "아이패드 미니 5", 250000, "수완동", iso(900)),
  ];
  sent = [];
  await main();
  assert.equal(sent.length, 0);
  assert.deepEqual(seenFile().k1.ids.sort(), ["old1", "old2"]);

  // 2회차: 여러 종류의 '처음 보는' 매물
  listings = [
    ...listings,
    art("new1", "아이패드미니 6세대 S급", 300000, "역삼동", iso(3)),     // ✅ 알림
    art("cheap", "아이패드 미니 케이스", 15000, "역삼동", iso(2)),       // 가격 미달
    art("air", "아이패드 에어 5", 300000, "역삼동", iso(2)),             // 키워드 불일치
    art("resurf", "아이패드 미니 4", 200000, "역삼동", iso(60 * 24 * 30)), // 예전 매물이 순위 변동으로 보임
    art("sold", "아이패드 미니 6 판매완료", 300000, "역삼동", iso(1), "Closed"), // 판매완료
  ];
  await main();
  assert.equal(sent.length, 1, `알림 ${sent.length}건: ${sent.join(" / ")}`);
  assert.match(sent[0], /아이패드미니 6세대 S급/);
  assert.match(sent[0], /300,000원 · 역삼동/);
  assert.match(sent[0], /🕒 .*분 전 등록/);
  assert.match(sent[0], /new1/);

  // 3회차: 같은 결과 → 중복 알림 없음
  sent = [];
  await main();
  assert.equal(sent.length, 0);

  // 4회차: 당근이 빈 페이지를 줌 → 기록 유지, 알림 없음
  const before = seenFile();
  listings = [];
  await main();
  assert.equal(sent.length, 0);
  assert.deepEqual(seenFile(), before);
});

test("429를 받으면 즉시 멈추고, 쉬는 동안은 요청하지 않고, 풀리면 알린다", async () => {
  writeFileSync(process.env.DAANGN_CONFIG, JSON.stringify({
    keywords: ["가", "나", "다"].map((k, i) => ({ id: `r${i}`, keyword: k, minPrice: null, maxPrice: null, enabled: true })),
  }));
  writeFileSync(process.env.DAANGN_SEEN, "{}");
  writeFileSync(process.env.DAANGN_STATE, "{}");
  listings = [art("x1", "가나다", 1000, "대연동", iso(600)), art("x2", "가나다", 1000, "수완동", iso(600))];

  // 막힘 → 첫 요청에서 멈춤(나머지 키워드 요청 안 함), 30분 쉬기, 안내 1번, 실패 처리 아님
  daangnStatus = 429; daangnCalls = 0; sent = []; process.exitCode = 0;
  await main();
  assert.equal(daangnCalls, 1);
  assert.equal(process.exitCode, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /30분 쉬었다가/);
  const st = stateFile();
  assert.equal(st.cooldownLevel, 1);
  assert.ok(Date.parse(st.cooldownUntil) - Date.now() > 29 * 60000);

  // 쉬는 중 → 당근 요청 0번
  daangnStatus = 200; daangnCalls = 0;
  await main();
  assert.equal(daangnCalls, 0);

  // 쉬는 시간이 지나 다시 정상 → "다시 시작" 안내, 단계 초기화
  writeFileSync(process.env.DAANGN_STATE, JSON.stringify({ ...stateFile(), cooldownUntil: iso(1) }));
  sent = [];
  await main();
  assert.ok(daangnCalls > 0);
  assert.equal(stateFile().cooldownLevel, 0);
  assert.deepEqual(sent, ["✅ 당근 확인을 다시 시작했어요."]);
});

test("요청 상한에 걸리면 다음 회차는 밀린 키워드부터", async () => {
  const keep = LIMITS.maxRequests;
  LIMITS.maxRequests = 1;
  writeFileSync(process.env.DAANGN_STATE, "{}");
  daangnStatus = 200;
  await main(); // 첫 키워드(가)만 처리하고 멈춤
  assert.equal(stateFile().nextIndex, 1);
  await main(); // 이번엔 '나'부터
  assert.equal(stateFile().nextIndex, 2);
  LIMITS.maxRequests = keep;
});

test("빈 페이지가 연달아 오면 알림 없이 10분 쉰다", async () => {
  writeFileSync(process.env.DAANGN_STATE, "{}");
  listings = [];
  daangnStatus = 200; sent = []; process.exitCode = 0;
  await main();
  const st = stateFile();
  assert.equal(sent.length, 0);
  assert.equal(process.exitCode, 0);
  assert.equal(st.cooldownLevel, 0);
  const left = Date.parse(st.cooldownUntil) - Date.now();
  assert.ok(left > 9 * 60000 && left <= 10 * 60000);
});
