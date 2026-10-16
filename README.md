# 🥕 당근 키워드 알림

당근 **전체 검색**을 5분마다 돌려서, 등록한 키워드에 새 매물이 올라오면 텔레그램으로 제목·가격·지역·링크를 보내 줍니다.
키워드와 가격 범위는 GitHub Pages 관리 페이지에서 추가·수정·삭제합니다.

```
GitHub Actions (5분마다) → 당근 검색 → data/seen.json과 비교 → 새 매물만 텔레그램 발송
관리 페이지 (docs/index.html) → GitHub API로 config/keywords.json 수정
```

## 처음 설정

1. **텔레그램 봇**: 알림 받을 계정에서 @BotFather → `/newbot` → 토큰을 받습니다.
2. **연결 + Secrets 등록**: 터미널에서 `npm run setup-telegram` 실행 → 토큰 입력 → 봇에게 메시지 보내기.
   chat id를 찾아 테스트 메시지를 보내고 `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` Secrets까지 등록합니다 (gh CLI 로그인 필요).
3. **GitHub Pages** (Settings → Pages): Branch `main`, 폴더 `/docs`
4. **관리 페이지용 토큰**: Settings(개인) → Developer settings → Fine-grained tokens →
   이 저장소만 선택, 권한 `Contents: Read and write`, `Actions: Read and write`
5. 관리 페이지에서 **설정** → 토큰 입력 → **테스트 알림**으로 Actions에서 발송되는지 확인 → 키워드 추가

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
