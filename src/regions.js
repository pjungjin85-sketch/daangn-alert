// 동 이름 → 대략적 위치. 당근 매물에는 동 이름만 있어서(예: "대연동") 공개 행정동 경계 데이터로
// 만든 중심 좌표 목록(regions.json)과 이름을 맞춰 위치를 추정한다.
import { readFileSync } from "node:fs";

// "동삼제2동"·"대연3동"·"동인동3가" → "동삼동"·"대연동"·"동인동" (숫자 동은 한 동네로 본다)
export function normalizeRegion(name) {
  return String(name ?? "")
    .replace(/\s+/g, "")
    .replace(/\d+가$/, "")
    .replace(/제?[\d.,·-]+가?(?=동$)/, "");
}

let table;
function regions() {
  table ??= JSON.parse(readFileSync(new URL("./regions.json", import.meta.url), "utf8"));
  return table;
}

function distanceKm([lat1, lng1], [lat2, lng2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// 같은 이름의 동이 여러 곳이면(예: 도원동 — 대구·인천) 전부 반경 안일 때만 '근처'로 본다
export function isNear(regionName, center, radiusKm) {
  const spots = regions()[normalizeRegion(regionName)];
  return !!spots?.length && spots.every((p) => distanceKm(p, center) <= radiusKm);
}
