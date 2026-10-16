import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchHtml, toPrice, isSoldOrReserved, articleKey } from "../src/daangn.js";
import { inPriceRange, formatPrice, matchesKeyword, isFreshListing, formatPosted } from "../src/check.js";

const html = `<html><script>window.__ctx = {"state":{"loaderData":{"search":{"buySellArticles":[
  {"id":"abc123","href":"/kr/buy-sell/ipad-mini-abc123/","title":"아이패드 미니 6 \\"S급\\" [급처]","price":"350000.0","region":{"name":"역삼동"},"status":"Ongoing"},
  {"id":"def456","title":"아이패드 케이스","price":15000,"regionId":{"name":"서교동"},"status":"Closed"}
]}}}};</script></html>`;

test("임베디드 JSON에서 매물을 읽는다", () => {
  const list = parseSearchHtml(html);
  assert.equal(list.length, 2);
  assert.deepEqual(
    { id: list[0].id, url: list[0].url, title: list[0].title, price: list[0].price, region: list[0].region },
    { id: "abc123", url: "https://www.daangn.com/kr/buy-sell/ipad-mini-abc123/", title: '아이패드 미니 6 "S급" [급처]', price: 350000, region: "역삼동" }
  );
  assert.equal(list[1].url, "https://www.daangn.com/kr/buy-sell/def456/");
  assert.equal(isSoldOrReserved(list[1]), true);
  assert.equal(isSoldOrReserved(list[0]), false);
});

test("JSON이 없으면 링크로 대체한다", () => {
  const list = parseSearchHtml(`<a href="/kr/buy-sell/foo-1/"><span>맥북 에어</span><span>900,000원</span></a><a href="/kr/buy-sell/foo-1/">x</a>`);
  assert.equal(list.length, 1);
  assert.equal(list[0].price, 900000);
});

test("가격 변환과 범위", () => {
  assert.equal(toPrice("150,000원"), 150000);
  assert.equal(toPrice("나눔"), 0);
  assert.equal(toPrice(null), null);
  assert.equal(inPriceRange(300000, { minPrice: 100000, maxPrice: 300000 }), true);
  assert.equal(inPriceRange(300001, { minPrice: null, maxPrice: 300000 }), false);
  assert.equal(inPriceRange(5000, { minPrice: 10000 }), false);
  assert.equal(inPriceRange(null, { maxPrice: 1 }), true);
  assert.equal(formatPrice(0), "나눔");
});

test("매물 고유코드는 제목이 바뀌어도 같다", () => {
  assert.equal(articleKey("https://www.daangn.com/kr/buy-sell/%EC%8B%A4%EB%A6%AC-%EC%B0%A8%EC%BD%9C-8yu7ko316jnv/"), "8yu7ko316jnv");
  assert.equal(articleKey("/kr/buy-sell/%EC%8B%A4%EB%A6%AC-%EC%83%88%EC%A0%9C%ED%92%88-8yu7ko316jnv/"), "8yu7ko316jnv");
  assert.equal(articleKey("/kr/buy-sell/def456/"), "def456");
});

test("키워드 일치: 단어가 모두 제목에 있어야 한다", () => {
  assert.equal(matchesKeyword("아이패드미니 6세대 S급", "아이패드 미니"), true);
  assert.equal(matchesKeyword("iPad Mini 6", "ipad mini"), true);
  assert.equal(matchesKeyword("아이패드 에어 5", "아이패드 미니"), false);
  assert.equal(matchesKeyword("실리실라스 유발 타이즈", "실리실라스"), true);
});

test("최신 등록: 키워드 등록 이후 + 24시간 이내만", () => {
  const init = "2026-10-16T13:30:00Z";
  const now = Date.parse("2026-10-16T14:00:00Z");
  assert.equal(isFreshListing("2026-10-16T13:50:00Z", init, now), true);
  assert.equal(isFreshListing("2026-10-16T13:25:00Z", init, now), true); // 여유 10분
  assert.equal(isFreshListing("2026-10-16T13:00:00Z", init, now), false);
  assert.equal(isFreshListing("2024-11-05T04:28:00Z", init, now), false);
  assert.equal(isFreshListing(null, init, now), false);
  // 등록한 지 오래된 키워드도 24시간 넘은 매물은 제외
  assert.equal(isFreshListing("2026-10-14T00:00:00Z", "2026-10-01T00:00:00Z", now), false);
});

test("등록일시 표시 (한국 시간)", () => {
  assert.equal(formatPosted("2026-10-16T13:35:00Z", Date.parse("2026-10-16T13:38:00Z")), "10월 16일(금) 22:35 · 3분 전");
  assert.equal(formatPosted(null), null);
});
