// scripts/send-reminder.js
// GitHub Actions가 15분마다 이 스크립트를 실행해요.
// 끼니 시간(8:00 / 11:30 / 19:00 KST)이 지났는데 오늘 그 끼니 알림을 아직 안 보냈으면,
// 저장된 모든 기기 토큰으로 "OO을 기록할 시간이에요!" 알림을 한 번 보냅니다.
//
// 왜 15분마다?  GitHub 예약 실행은 몇 시간씩 늦어질 때가 있어요. 하루 세 번만 예약하면
// 그 한 번이 늦는 만큼 알림도 늦어요. 자주 실행해 두면 끼니 시간 바로 뒤에 도착한 실행이 알림을 보내요.
// 같은 끼니는 Firestore reminderLog에 기록해서 하루 한 번만 보내요.
//
// 필요한 GitHub Secret: FIREBASE_SERVICE_ACCOUNT
// (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 → JSON 전체를 시크릿 값으로 저장)

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// 끼니 시간 (KST, 0시부터 몇 분째인지). 시간을 바꾸려면 여기만 고치면 돼요.
const slots = [
  { meal: "breakfast", at: 8 * 60, emoji: "🍳", label: "아침" },
  { meal: "lunch", at: 11 * 60 + 30, emoji: "🥪", label: "점심" },
  { meal: "dinner", at: 19 * 60, emoji: "🌯", label: "저녁" }
];

// 기기에서 앱을 지웠거나 토큰이 바뀌어서 다시는 쓸 수 없는 토큰의 오류 코드
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

function getKstNow() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9, 한국은 DST 없음
  return {
    date: kst.toISOString().slice(0, 10), // "YYYY-MM-DD" (한국 날짜)
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes()
  };
}

// 지금 보내야 할 끼니: 끼니 시간이 지났고, 다음 끼니 시간(저녁은 자정) 전이면 그 끼니.
// 다음 끼니 시간이 되면 지난 끼니는 더 보내지 않아요 (점심 알림 대신 아침 알림이 가는 일 방지).
function dueSlot(minutes) {
  for (let i = slots.length - 1; i >= 0; i--) {
    const end = i + 1 < slots.length ? slots[i + 1].at : 24 * 60;
    if (minutes >= slots[i].at && minutes < end) return slots[i];
  }
  return null;
}

// 수동 실행(테스트)용: 지금 시각과 가장 가까운 끼니
function nearestSlot(minutes) {
  return [...slots].sort((a, b) => Math.abs(a.at - minutes) - Math.abs(b.at - minutes))[0];
}

async function main() {
  const db = admin.firestore();
  const now = getKstNow();
  const manual = !process.env.SCHEDULE;

  let slot;
  let logRef = null;

  if (manual) {
    // 수동 실행은 테스트용이라 기록 없이 바로 보내요
    slot = nearestSlot(now.minutes);
    console.log(`수동 실행 → ${slot.label} 알림을 바로 보내요 (기록 안 남김)`);
  } else {
    slot = dueSlot(now.minutes);
    if (!slot) {
      console.log(`지금(${now.date} KST ${fmt(now.minutes)})은 보낼 끼니가 없어요.`);
      return;
    }
    // create()는 문서가 이미 있으면 실패해요 → 같은 끼니를 두 번 보내지 않음 (동시에 실행돼도 안전)
    logRef = db.collection("reminderLog").doc(`${now.date}_${slot.meal}`);
    try {
      await logRef.create({
        date: now.date,
        meal: slot.meal,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      if (err.code === 6) { // ALREADY_EXISTS
        console.log(`${now.date} ${slot.label} 알림은 이미 보냈어요.`);
        return;
      }
      throw err;
    }
    const delay = now.minutes - slot.at;
    console.log(`${now.date} ${slot.label} 알림 보내요 (끼니 시간 ${fmt(slot.at)}, ${delay}분 뒤)`);
  }

  const message = `${slot.emoji} ${slot.label}을 기록할 시간이에요!`;
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
  let retryable = false;
  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code || "unknown";
    const tail = targets[i].token.slice(-6);
    console.log(`  실패: …${tail} (${code})`);
    if (DEAD_TOKEN_CODES.has(code)) {
      removals.push(targets[i].ref.delete().then(() => console.log(`  삭제함: …${tail}`)));
    } else {
      retryable = true;
    }
  });
  await Promise.all(removals);

  if (response.successCount === 0) {
    // 일시적인 오류로 한 건도 못 보냈으면 기록을 지워서 다음 실행(15분 뒤)이 다시 보내게 함
    if (retryable && logRef) {
      await logRef.delete();
      console.log("일시적인 오류라 다음 실행에서 다시 보낼게요.");
    }
    // 하나도 못 보냈으면 Actions를 실패(빨간색)로 표시해서 바로 알아챌 수 있게 함
    console.error("알림을 한 건도 보내지 못했어요. 계속 실패하면 앱 마이페이지에서 알림을 다시 켜 주세요.");
    process.exitCode = 1;
  }
}

function fmt(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

main().catch(err => {
  console.error("알림 전송 실패:", err);
  process.exit(1);
});
