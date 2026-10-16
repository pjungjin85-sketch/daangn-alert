// regions.json 생성: node scripts/build-regions.js <HangJeongDong_*.geojson>
// 데이터: https://github.com/vuski/admdongkor (행정동 경계)
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeRegion } from "../src/regions.js";

const geo = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = {};
for (const f of geo.features) {
  const pts = f.geometry.coordinates.flat(2); // MultiPolygon → [lng, lat] 목록
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const name = f.properties.adm_nm.split(" ").at(-1);
  (out[normalizeRegion(name)] ??= []).push([+lat.toFixed(3), +lng.toFixed(3)]);
}
writeFileSync(new URL("../src/regions.json", import.meta.url), JSON.stringify(out));
console.log(`${geo.features.length}개 행정동 → ${Object.keys(out).length}개 이름`);
