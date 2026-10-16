// 텔레그램 봇 연결 도우미 (로컬 터미널에서 실행)
//   npm run setup-telegram
// 봇 토큰을 입력받아 → 봇에게 온 메시지에서 chat id를 찾고 → 테스트 메시지를 보낸 뒤
// → GitHub 저장소 Secrets(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID)에 바로 등록한다.
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

const REPO = "pjungjin85-sketch/daangn-alert";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description);
  return json.result;
}

function setSecret(name, value) {
  const r = spawnSync("gh", ["secret", "set", name, "-R", REPO], { input: value, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} 등록 실패: ${r.stderr.trim()}`);
  console.log(`  ✓ ${name} 등록`);
}

const token = (await rl.question("BotFather에게 받은 봇 토큰: ")).trim();
const me = await tg(token, "getMe").catch((e) => {
  console.error(`토큰이 올바르지 않아요 (${e.message})`);
  process.exit(1);
});
console.log(`\n봇 확인: @${me.username}`);
console.log(`알림 받을 텔레그램 계정에서 @${me.username} 을 열고 [시작]을 누르거나 아무 메시지나 보내 주세요. (2분 대기)`);

let chat;
for (let i = 0; i < 24 && !chat; i++) {
  const updates = await tg(token, "getUpdates");
  chat = updates.map((u) => u.message?.chat).filter((c) => c?.type === "private").at(-1);
  if (!chat) await sleep(5000);
}
if (!chat) {
  console.error("메시지를 찾지 못했어요. 봇에게 메시지를 보낸 뒤 다시 실행해 주세요.");
  process.exit(1);
}
const who = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username;
console.log(`\n받는 사람: ${who} (chat id ${chat.id})`);

await tg(token, "sendMessage", { chat_id: chat.id, text: "🥕 당근 키워드 알림이 연결됐어요. 이 대화방으로 새 매물 알림이 옵니다." });
console.log("테스트 메시지를 보냈어요. 텔레그램에서 확인해 보세요.");

const ok = (await rl.question(`\nGitHub(${REPO}) Secrets에 등록할까요? (Y/n) `)).trim().toLowerCase();
rl.close();
if (ok === "n") process.exit(0);
setSecret("TELEGRAM_TOKEN", token);
setSecret("TELEGRAM_CHAT_ID", String(chat.id));
console.log("\n완료! 관리 페이지에서 키워드를 추가하면 됩니다.");
