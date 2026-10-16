import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchHtml, toPrice, isSoldOrReserved } from "../src/daangn.js";
import { inPriceRange, formatPrice } from "../src/check.js";

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
