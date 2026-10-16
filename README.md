# 🥕 당근 키워드 알림

당근 **전체 검색**을 5분마다 돌려서, 등록한 키워드에 새 매물이 올라오면 텔레그램으로 제목·가격·지역·링크를 보내 줍니다.
키워드와 가격 범위는 GitHub Pages 관리 페이지에서 추가·수정·삭제합니다.

```
GitHub Actions (5분마다) → 당근 검색 → data/seen.json과 비교 → 새 매물만 텔레그램 발송
관리 페이지 (docs/index.html) → GitHub API로 config/keywords.json 수정
```

## 구성

```
cron-job.org (5분마다) → Vercel /api/tick → GitHub Actions 실행 (예비: GitHub 예약 실행 매시 7·37분)
GitHub Actions → 당근 검색 → data/seen.json과 비교 → 새 매물만 텔레그램 발송
관리 페이지 https://daangn-alert.vercel.app (Vercel) → 비밀번호 로그인 → config/keywords.json 수정
```

- 관리 페이지와 API: `public/index.html`, `api/*.js`, `lib/*.js` — Vercel CLI로 배포 (`vercel deploy --prod`).
  Git 연동 자동 배포는 꺼 둠 (`vercel.json`) — 5분마다 기록 커밋이 생겨 배포가 폭주하지 않도록.
- Vercel 환경변수: `GITHUB_TOKEN`(이 저장소 Contents·Actions 쓰기), `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`
- GitHub Secrets: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` (`npm run setup-telegram`으로 등록)

## 동작 방식

- 키워드를 새로 추가하면 첫 실행 때는 기존 매물을 기록만 하고, 그다음부터 올라오는 매물만 알립니다.
- 판매완료·예약중 매물은 제외합니다. 가격을 못 읽은 매물은 놓치지 않도록 가격 조건과 상관없이 보냅니다.
- 키워드 하나에서 한 번에 10건이 넘으면 10건만 보내고 나머지는 검색 링크로 묶어 보냅니다.
- 당근 검색은 기준 동네(기본 서초4동) 근처 위주로 약 275건만 줍니다. 결과에 **부산·광주 근처(반경 25km) 매물이 하나도 없으면**
  그 지역 기준으로 한 번 더 검색해 합칩니다 (`src/check.js`의 `EXTRA_REGIONS`). 동 이름 → 위치는 `src/regions.json`
  ([vuski/admdongkor](https://github.com/vuski/admdongkor) 행정동 경계로 생성, `scripts/build-regions.js`).
- GitHub의 예약 실행은 부하에 따라 몇 분씩 늦어질 수 있습니다.

## 로컬 확인

```bash
npm run dry   # 검색 결과만 출력 (발송·저장 안 함)
npm test
```

검색 결과가 0건으로 나오면 당근 페이지 구조가 바뀐 것이므로 `src/daangn.js`의 파서를 고쳐야 합니다.
