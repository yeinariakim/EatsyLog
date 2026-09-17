// notifications.js
// 알림(8:00 아침 / 11:30 점심 / 19:00 저녁) 은 GitHub Actions가 매일 정해진 시간에
// Firebase Cloud Messaging으로 보내는 방식이에요 (scripts/send-reminders.js 참고).
// 이 파일은 브라우저에서 알림 권한을 받고, 이 기기의 FCM 토큰을 Firestore에 저장하는 역할만 해요.

import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

// Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서(VAPID 키)에서 발급
const VAPID_KEY = "YOUR_VAPID_KEY";

export async function setupNotifications(app, db, docFns, uid) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

    if (token) {
      await docFns.setDoc(docFns.doc(db, "users", uid, "fcmTokens", token), {
        token,
        updatedAt: docFns.serverTimestamp ? docFns.serverTimestamp() : new Date()
      });
    }
  } catch (err) {
    console.warn("알림 설정을 건너뛰었어요:", err);
  }
}
