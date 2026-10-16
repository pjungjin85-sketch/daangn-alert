// 등록된 키워드마다 당근 전체 검색을 돌려 처음 보는 매물을 텔레그램으로 보낸다.
//   node src/check.js            실제 실행 (알림 발송 + data/seen.json 갱신)
//   node src/check.js --dry-run  검색 결과만 출력 (발송·저장 안 함)
import { readFile, writeFile } from "node:fs/promises";
import { searchArticles, searchUrl, isSoldOrReserved } from "./daangn.js";
import { sendTelegram, escapeHtml } from "./telegram.js";

const CONFIG_PATH = new URL("../config/keywords.json", import.meta.url);
const SEEN_PATH = new URL("../data/seen.json", import.meta.url);
const MAX_SEEN_PER_KEYWORD = 1000;
const MAX_ALERTS_PER_RUN = 10; // 키워드 하나에서 한 번에 너무 많이 쏟아질 때 상한
const DELAY_MS = 1500;

const dryRun = process.argv.includes("--dry-run");
const testOnly = process.argv.includes("--test");

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function inPriceRange(price, { minPrice, maxPrice }) {
  if (price == null) return true; // 가격을 못 읽었으면 놓치지 않도록 일단 보낸다
  if (minPrice != null && minPrice !== "" && price < Number(minPrice)) return false;
  if (maxPrice != null && maxPrice !== "" && price > Number(maxPrice)) return false;
  return true;
}

export function formatPrice(price) {
  if (price == null) return "가격 정보 없음";
  if (price === 0) return "나눔";
  return `${price.toLocaleString("ko-KR")}원`;
}

function formatMessage(kw, a) {
  const lines = [
    `🥕 <b>[${escapeHtml(kw.keyword)}]</b> 새 매물`,
    `<b>${escapeHtml(a.title)}</b>`,
    `${formatPrice(a.price)}${a.region ? ` · ${escapeHtml(a.region)}` : ""}`,
    escapeHtml(a.url),
  ];
  return lines.join("\n");
}

async function main() {
  if (testOnly) {
    await sendTelegram("✅ 당근 키워드 알림 테스트 메시지입니다. 이 대화방으로 새 매물 알림이 옵니다.");
    console.log("테스트 메시지 발송 완료");
    return;
  }
  const config = await readJson(CONFIG_PATH, { keywords: [] });
  const seen = await readJson(SEEN_PATH, {});
  const active = config.keywords.filter((k) => k.enabled !== false && k.keyword?.trim());
  let changed = false;
  let failures = 0;

  // 삭제된 키워드의 기록은 정리한다
  for (const id of Object.keys(seen)) {
    if (!config.keywords.some((k) => k.id === id)) {
      delete seen[id];
      changed = true;
    }
  }

  for (const [i, kw] of active.entries()) {
    if (i > 0) await sleep(DELAY_MS);
    let articles;
    try {
      articles = (await searchArticles(kw.keyword.trim())).filter((a) => !isSoldOrReserved(a));
    } catch (e) {
      failures++;
      console.error(`✗ ${kw.keyword}: ${e.message}`);
      continue;
    }

    if (dryRun) {
      console.log(`\n▶ ${kw.keyword} — ${articles.length}건  ${searchUrl(kw.keyword)}`);
      for (const a of articles.slice(0, 10)) {
        const mark = inPriceRange(a.price, kw) ? " " : "×";
        console.log(` ${mark} ${formatPrice(a.price).padStart(10)}  ${a.title}  [${a.region}]  ${a.url}`);
      }
      continue;
    }

    const record = seen[kw.id] ?? { ids: [], initializedAt: null };
    const known = new Set(record.ids);
    let fresh = articles.filter((a) => !known.has(a.id));

    // 키워드를 처음 등록했을 때는 기존 매물을 '본 것'으로만 처리하고 알림은 보내지 않는다
    if (!record.initializedAt) {
      record.initializedAt = new Date().toISOString();
      console.log(`● ${kw.keyword}: 첫 실행 — 기존 매물 ${articles.length}건 기록, 알림 없음`);
    } else {
      const targets = fresh.filter((a) => inPriceRange(a.price, kw));
      console.log(`● ${kw.keyword}: 새 매물 ${fresh.length}건 / 가격조건 통과 ${targets.length}건`);
      const unsent = new Set();
      for (const a of targets.slice(0, MAX_ALERTS_PER_RUN)) {
        try {
          await sendTelegram(formatMessage(kw, a));
        } catch (e) {
          // 발송 실패한 매물은 '본 것'으로 기록하지 않아 다음 실행 때 다시 시도한다
          unsent.add(a.id);
          console.error(`✗ 발송 실패 ${a.title}: ${e.message}`);
        }
      }
      fresh = fresh.filter((a) => !unsent.has(a.id));
      if (targets.length > MAX_ALERTS_PER_RUN) {
        await sendTelegram(
          `🥕 <b>[${escapeHtml(kw.keyword)}]</b> 외 ${targets.length - MAX_ALERTS_PER_RUN}건 더 있어요\n${escapeHtml(searchUrl(kw.keyword))}`
        ).catch((e) => console.error(`✗ 요약 발송 실패: ${e.message}`));
      }
    }

    if (fresh.length || !seen[kw.id]) {
      record.ids = [...fresh.map((a) => a.id), ...record.ids].slice(0, MAX_SEEN_PER_KEYWORD);
      seen[kw.id] = record;
      changed = true;
    }
  }

  if (!dryRun && changed) {
    await writeFile(SEEN_PATH, JSON.stringify(seen, null, 1) + "\n");
  }
  // 전부 실패했을 때만 실패로 표시 (일시적 오류 하나로 매번 메일이 오지 않게)
  if (active.length && failures === active.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
