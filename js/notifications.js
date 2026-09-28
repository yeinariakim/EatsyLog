// notifications.js
// 알림(8:00 아침 / 11:30 점심 / 19:00 저녁) 은 GitHub Actions가 매일 정해진 시간에
// Firebase Cloud Messaging으로 보내는 방식이에요 (scripts/send-reminders.js 참고).
// 이 파일은 브라우저에서 알림 권한을 받고, 이 기기의 FCM 토큰을 Firestore에 저장/삭제하는 역할만 해요.

import { getMessaging, getToken, deleteToken } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

// Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서(VAPID 키)에서 발급
const VAPID_KEY = "BPLcQ6tzyrBK0jYc625TDyqmgWxdPIMKp-HS1fWgyNUUzpG_JcNjtT-L4ENtJKNQyL_qS2jCdphx42UX8e3asGQ";

export async function setupNotifications(app, db, docFns, uid) {
  if (!("Notification" in window)) {
    throw new Error("이 브라우저는 알림 자체를 지원하지 않아요.");
  }
  if (!("serviceWorker" in navigator)) {
    throw new Error("이 브라우저는 서비스워커를 지원하지 않아요.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 허용되지 않았어요. (설정에서 이 앱의 알림 권한을 확인해주세요)");
  }

  const token = await getDeviceToken(app);
  if (!token) {
    throw new Error("FCM 토큰을 받지 못했어요. (VAPID 키를 확인해주세요)");
  }

  await docFns.setDoc(docFns.doc(db, "users", uid, "fcmTokens", token), {
    token,
    updatedAt: docFns.serverTimestamp ? docFns.serverTimestamp() : new Date()
  });
}

async function getDeviceToken(app) {
  const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  return getToken(messaging, { vapidKey: VAPID_KEY.trim(), serviceWorkerRegistration: registration });
}

// 이 기기의 알림이 켜져 있는지 (권한이 있고, 토큰이 Firestore에 저장돼 있으면 켜짐)
// 권한이 이미 있을 때만 토큰을 확인해서, 권한 요청 창은 띄우지 않아요.
export async function isNotificationEnabled(app, db, docFns, uid) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission !== "granted") return false;
  const token = await getDeviceToken(app);
  if (!token) return false;
  const snap = await docFns.getDoc(docFns.doc(db, "users", uid, "fcmTokens", token));
  return snap.exists();
}

// 알림 끄기: 이 기기의 토큰을 Firestore에서 지우고 FCM 토큰도 폐기해요
export async function disableNotifications(app, db, docFns, uid) {
  if (Notification.permission !== "granted") return;
  const token = await getDeviceToken(app);
  if (!token) return;
  await docFns.deleteDoc(docFns.doc(db, "users", uid, "fcmTokens", token));
  await deleteToken(getMessaging(app)).catch(err => console.warn("FCM 토큰 폐기 실패", err));
}
