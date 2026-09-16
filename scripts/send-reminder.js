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

  const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: "eatsylog", body: message }
  });

  console.log(`전송 완료: 성공 ${response.successCount} / 실패 ${response.failureCount}`);
}

main().catch(err => {
  console.error("알림 전송 실패:", err);
  process.exit(1);
});
