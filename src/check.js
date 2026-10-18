// 등록된 키워드마다 당근 전체 검색을 돌려 처음 보는 매물을 텔레그램으로 보낸다.
//   node src/check.js            실제 실행 (알림 발송 + data/seen.json 갱신)
//   node src/check.js --dry-run  검색 결과만 출력 (발송·저장 안 함)
import { readFile, writeFile } from "node:fs/promises";
import { searchArticles, searchUrl, isSoldOrReserved, describe, StopRun, resetRequestBudget } from "./daangn.js";
import { sendTelegram, escapeHtml } from "./telegram.js";
import { isNear } from "./regions.js";

// 테스트에서는 환경변수로 임시 파일을 가리킨다
const CONFIG_PATH = process.env.DAANGN_CONFIG ?? new URL("../config/keywords.json", import.meta.url);
const SEEN_PATH = process.env.DAANGN_SEEN ?? new URL("../data/seen.json", import.meta.url);
// 쉬는 시간(429 대응), 지역 추가 검색 시각, 키워드 순번 같은 실행 상태
const STATE_PATH = process.env.DAANGN_STATE ?? new URL("../data/state.json", import.meta.url);
const MAX_SEEN_PER_KEYWORD = 1000;
const MAX_ALERTS_PER_RUN = 10; // 키워드 하나에서 한 번에 너무 많이 쏟아질 때 상한
const REGIONAL_EVERY_MIN = 30; // 부산·광주 추가 검색은 키워드마다 30분에 한 번만 (요청 수 절약)
const COOLDOWN_BASE_MIN = 30; // 429를 받으면 30분 → 1시간 → 2시간 … 최대 6시간 쉰다
const COOLDOWN_MAX_MIN = 360;
const SOFT_PAUSE_MIN = 10; // 빈 페이지가 연달아 오면 알림 없이 10분만 쉰다

// 당근 검색은 기준 동네(기본 서초4동)에서 가까운 매물 위주로 ~275건만 준다.
// 결과에 아래 지역 근처 매물이 하나도 없으면 결과가 수도권에 쏠린 것으로 보고 그 지역 기준으로 한 번 더 검색한다.
// regionId는 당근 지역 ID (500 = 부산 영도구 동삼2동, 1000 = 광주 동구 산수2동)
export const EXTRA_REGIONS = [
  { name: "부산", regionId: 500, center: [35.18, 129.075], radiusKm: 25 },
  { name: "광주", regionId: 1000, center: [35.16, 126.85], radiusKm: 25 },
];

// 기본 검색 + 필요할 때만 부산·광주 기준 추가 검색. 결과는 매물 ID로 중복 제거해 합친다.
async function collect(keyword, { regional = true } = {}) {
  const base = await searchArticles(keyword);
  console.log(`  ${keyword}: ${describe(base)}`);
  if (!base.articles.length) return [];

  const merged = new Map(base.articles.map((a) => [a.id, a]));
  if (!regional) return [...merged.values()];
  for (const r of EXTRA_REGIONS) {
    const nearby = base.articles.filter((a) => isNear(a.region, r.center, r.radiusKm)).length;
    if (nearby) {
      console.log(`    ${r.name} 근처 ${nearby}건 있음 → 추가 검색 안 함`);
      continue;
    }
    const extra = await searchArticles(keyword, r.regionId);
    const before = merged.size;
    for (const a of extra.articles) if (!merged.has(a.id)) merged.set(a.id, a);
    console.log(
      `    ${r.name} 근처 없음 → ${r.name} 기준 추가 검색: ${extra.articles.length ? `${extra.articles.length}건 중 새로 합친 ${merged.size - before}건` : `빈 결과 (시도 ${extra.attempts}회)`}`
    );
  }
  return [...merged.values()];
}

const dryRun = process.argv.includes("--dry-run");
const testOnly = process.argv.includes("--test");
// --keyword "아이폰": 등록 목록 대신 이 키워드 하나로 미리보기 (--dry-run과 함께 사용)
const previewKeyword = process.argv[process.argv.indexOf("--keyword") + 1];

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}


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

// 키워드의 단어가 제목에 모두 들어 있어야 일치로 본다 (대소문자·띄어쓰기 무시)
// 예: "아이패드 미니" → "아이패드미니 6세대" 일치, "아이패드 에어" 불일치
export function matchesKeyword(title, keyword) {
  const t = String(title).toLowerCase().replace(/\s+/g, "");
  return keyword.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}

// 최신 등록 매물: 등록 시각이 키워드 등록 이후(여유 10분)이면서 최근 24시간 이내
export function isFreshListing(createdAt, initializedAt, now = Date.now()) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  const since = Math.max(Date.parse(initializedAt) - 10 * 60 * 1000, now - 24 * 60 * 60 * 1000);
  return t >= since;
}

const formatKst = (iso) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "10월 16일(목) 22:35 · 3분 전"
export function formatPosted(createdAt, now = Date.now()) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(t)).map((x) => [x.type, x.value])
  );
  const min = Math.max(0, Math.round((now - t) / 60000));
  const ago = min < 1 ? "방금 전" : min < 60 ? `${min}분 전` : `${Math.floor(min / 60)}시간 전`;
  return `${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute} · ${ago}`;
}

function formatMessage(kw, a) {
  const posted = formatPosted(a.createdAt);
  const lines = [
    `🥕 <b>[${escapeHtml(kw.keyword)}]</b> 새 매물`,
    `<b>${escapeHtml(a.title)}</b>`,
    `${formatPrice(a.price)}${a.region ? ` · ${escapeHtml(a.region)}` : ""}`,
    ...(posted ? [`🕒 ${posted} 등록`] : []),
    escapeHtml(a.url),
  ];
  return lines.join("\n");
}

export async function main() {
  if (testOnly) {
    await sendTelegram("✅ 당근 키워드 알림 테스트 메시지입니다. 이 대화방으로 새 매물 알림이 옵니다.");
    console.log("테스트 메시지 발송 완료");
    return;
  }
  const config = await readJson(CONFIG_PATH, { keywords: [] });
  const seen = await readJson(SEEN_PATH, {});
  const active =
    dryRun && process.argv.includes("--keyword")
      ? [{ id: "preview", keyword: previewKeyword }]
      : config.keywords.filter((k) => k.enabled !== false && k.keyword?.trim());
  const state = { cooldownUntil: null, cooldownLevel: 0, nextIndex: 0, regionalAt: {}, ...(await readJson(STATE_PATH, {})) };
  const stateBefore = JSON.stringify(state);
  let changed = false;
  let failures = 0;
  let succeeded = 0;
  let rateLimited = null;
  let softLimited = false;

  // 당근이 막아서 쉬는 중이면 아무 요청도 보내지 않는다
  if (!dryRun && state.cooldownUntil && Date.parse(state.cooldownUntil) > Date.now()) {
    console.log(`⏸ 당근 요청 제한으로 쉬는 중 — ${formatKst(state.cooldownUntil)}까지`);
    return;
  }
  resetRequestBudget();

  // 삭제된 키워드의 기록은 정리한다
  for (const id of Object.keys(seen)) {
    if (!config.keywords.some((k) => k.id === id)) {
      delete seen[id];
      delete state.regionalAt[id];
      changed = true;
    }
  }

  // 요청 상한 때문에 회차 중간에 멈추면 뒤쪽 키워드가 계속 밀리지 않도록 시작 순번을 돌린다
  const start = active.length ? state.nextIndex % active.length : 0;
  const ordered = [...active.slice(start), ...active.slice(0, start)];
  let processed = 0;

  for (const kw of ordered) {
    let articles;
    const regionalDue =
      Date.now() - (Date.parse(state.regionalAt[kw.id] ?? 0) || 0) >= REGIONAL_EVERY_MIN * 60_000;
    try {
      articles = (await collect(kw.keyword.trim(), { regional: regionalDue })).filter((a) => !isSoldOrReserved(a));
    } catch (e) {
      if (e instanceof StopRun) {
        console.log(`⏹ ${e.message} — 남은 키워드는 다음 회차에`);
        if (e.rateLimited) rateLimited = e;
        if (e.softLimited) softLimited = true;
        break;
      }
      failures++;
      processed++;
      console.error(`✗ ${kw.keyword}: ${e.message}`);
      continue;
    }
    processed++;
    if (articles.length) {
      succeeded++;
      if (regionalDue) state.regionalAt[kw.id] = new Date().toISOString();
    }

    if (dryRun) {
      console.log(`\n▶ ${kw.keyword} — ${articles.length}건  ${searchUrl(kw.keyword)}`);
      for (const a of articles.slice(0, 10)) {
        const mark = !matchesKeyword(a.title, kw.keyword) ? "≠" : inPriceRange(a.price, kw) ? " " : "×";
        console.log(` ${mark} ${formatPrice(a.price).padStart(10)}  ${a.title}  [${a.region}]  ${formatPosted(a.createdAt) ?? ""}  ${a.url}`);
      }
      continue;
    }

    const record = seen[kw.id] ?? { ids: [], initializedAt: null };
    const known = new Set(record.ids);
    let fresh = articles.filter((a) => !known.has(a.id));

    // 재시도해도 0건이면 당근이 빈 페이지를 준 것으로 보고 이번 회차는 건너뛴다.
    // (특히 첫 기록을 0건으로 해 두면 다음 실행에서 기존 매물이 전부 새 매물로 잡힌다)
    if (!articles.length) {
      console.log(`● ${kw.keyword}: 빈 결과 — 이번 회차 건너뜀`);
      continue;
    }

    // 키워드를 처음 등록했을 때는 기존 매물을 '본 것'으로만 처리하고 알림은 보내지 않는다
    if (!record.initializedAt) {
      record.initializedAt = new Date().toISOString();
      console.log(`● ${kw.keyword}: 첫 실행 — 기존 매물 ${articles.length}건 기록, 알림 없음`);
    } else {
      // 알림 조건: ① 처음 보는 매물 ② 제목이 키워드와 일치 ③ 키워드 등록 이후 새로 올라온 매물 ④ 가격 조건
      const matched = fresh.filter((a) => matchesKeyword(a.title, kw.keyword));
      const recent = matched.filter((a) => isFreshListing(a.createdAt, record.initializedAt));
      const targets = recent.filter((a) => inPriceRange(a.price, kw));
      console.log(
        `● ${kw.keyword}: 처음 보는 매물 ${fresh.length} → 키워드 일치 ${matched.length} → 최신 등록 ${recent.length} → 가격 통과(알림) ${targets.length}`
      );
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

  if (dryRun) return;
  state.nextIndex = active.length ? (start + processed) % active.length : 0;

  if (rateLimited) {
    // 429: 쉬는 시간을 두 배씩 늘린다. 처음 막혔을 때만 텔레그램으로 알린다.
    state.cooldownLevel += 1;
    const minutes = Math.max(
      Math.min(COOLDOWN_BASE_MIN * 2 ** (state.cooldownLevel - 1), COOLDOWN_MAX_MIN),
      Math.ceil(rateLimited.retryAfterSec / 60)
    );
    state.cooldownUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    console.log(`⏸ ${minutes}분 쉬기 (${state.cooldownLevel}단계) — ${formatKst(state.cooldownUntil)}까지`);
    if (state.cooldownLevel === 1) {
      await sendTelegram(
        `⚠️ 당근이 요청이 많다며 잠시 막았어요. ${minutes}분 쉬었다가 다시 확인할게요.\n(쉬는 동안은 새 매물 알림이 늦어져요)`
      ).catch((e) => console.error(`✗ 안내 발송 실패: ${e.message}`));
    }
  } else if (softLimited) {
    state.cooldownUntil = new Date(Date.now() + SOFT_PAUSE_MIN * 60_000).toISOString();
    console.log(`⏸ 빈 페이지가 계속 와서 ${SOFT_PAUSE_MIN}분 쉬기 — ${formatKst(state.cooldownUntil)}까지`);
  } else if (succeeded && state.cooldownLevel > 0) {
    state.cooldownLevel = 0;
    state.cooldownUntil = null;
    await sendTelegram("✅ 당근 확인을 다시 시작했어요.").catch((e) => console.error(`✗ 안내 발송 실패: ${e.message}`));
  }

  if (changed) await writeFile(SEEN_PATH, JSON.stringify(seen, null, 1) + "\n");
  if (JSON.stringify(state) !== stateBefore) await writeFile(STATE_PATH, JSON.stringify(state, null, 1) + "\n");

  // 코드나 설정 문제처럼 '예상 못한 오류'로 처리한 키워드가 전부 실패했을 때만 실패로 표시한다.
  // (당근의 요청 제한·빈 페이지는 실패로 보지 않는다 — 5분마다 실패 메일이 가지 않게)
  if (processed && failures === processed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
