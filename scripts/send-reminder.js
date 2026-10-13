// scripts/send-reminder.js
// GitHub Actions가 하루 세 번(8:00 / 11:30 / 19:00 KST) 이 스크립트를 실행해서
// 저장된 모든 기기 토큰으로 "OO을 기록할 시간이에요!" 알림을 보냅니다.
//
// 필요한 GitHub Secret: FIREBASE_SERVICE_ACCOUNT
// (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 → JSON 전체를 시크릿 값으로 저장)

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

function getKstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9, 한국은 DST 없음
}

function pickMeal() {
  const kst = getKstNow();
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const minutes = h * 60 + m;

  // 각 실행 시각과 가장 가까운 끼니를 고름 (cron 오차 몇 분은 허용)
  const slots = [
    { meal: "breakfast", at: 8 * 60, emoji: "🍳", label: "아침" },
    { meal: "lunch", at: 11 * 60 + 30, emoji: "🥪", label: "점심" },
    { meal: "dinner", at: 19 * 60, emoji: "🌯", label: "저녁" }
  ];
  slots.sort((a, b) => Math.abs(a.at - minutes) - Math.abs(b.at - minutes));
  return slots[0];
}

async function main() {
  const { emoji, label } = pickMeal();
  const message = `${emoji} ${label}을 기록할 시간이에요!`;

  const db = admin.firestore();
  const tokensSnap = await db.collectionGroup("fcmTokens").get();

  if (tokensSnap.empty) {
    console.log("등록된 기기 토큰이 없어요. 앱에서 알림 권한을 한 번 허용해야 해요.");
    return;
  }

  // 토큰과 그 토큰이 저장된 문서를 같은 순서로 묶어 둠 (실패한 토큰 문서를 지우려고)
  const targets = tokensSnap.docs
    .map(d => ({ ref: d.ref, token: d.data().token }))
    .filter(t => t.token);
  const tokens = targets.map(t => t.token);

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { body: message }
  });

  console.log(`전송 완료: 성공 ${response.successCount} / 실패 ${response.failureCount}`);

  // 실패한 토큰마다 이유를 남기고, 더 이상 쓸 수 없는 토큰은 Firestore에서 지움
  // (저장소가 공개라 Actions 기록도 공개돼요. 토큰은 끝 6자리만 남겨요)
  const removals = [];
  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code || "unknown";
    const tail = targets[i].token.slice(-6);
    console.log(`  실패: …${tail} (${code})`);
    if (DEAD_TOKEN_CODES.has(code)) {
      removals.push(targets[i].ref.delete().then(() => console.log(`  삭제함: …${tail}`)));
    }
  });
  await Promise.all(removals);

  // 하나도 못 보냈으면 Actions를 실패(빨간색)로 표시해서 바로 알아챌 수 있게 함
  if (response.successCount === 0) {
    console.error("알림을 한 건도 보내지 못했어요. 앱 마이페이지에서 알림을 다시 켜 주세요.");
    process.exitCode = 1;
  }
}

// 기기에서 앱을 지웠거나 토큰이 바뀌어서 다시는 쓸 수 없는 토큰의 오류 코드
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

main().catch(err => {
  console.error("알림 전송 실패:", err);
  process.exit(1);
});
