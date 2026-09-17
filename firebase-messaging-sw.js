// firebase-messaging-sw.js
// 이 파일은 저장소 루트에 있어야 해요 (GitHub Pages 루트 경로에서 서비스워커로 등록됨)
//
// Firebase SDK의 자동 처리(messaging.onBackgroundMessage)에 맡기지 않고,
// 푸시 이벤트를 직접 받아서 우리가 원하는 문구 한 줄만 뜨도록 만듦.
// (자동 처리에 맡기면 기기에 따라 "eatsylog / from eatsylog" 같은
//  브라우저 기본 알림으로 대체되는 경우가 있어서 직접 제어하는 게 더 확실함)

// 새 서비스워커를 즉시 활성화 (예전 버전이 계속 남아있는 문제 방지)
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const data = payload.data || payload.notification || {};
  const title = data.title || "EatsyLog";
  const body = data.body || "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "icons/icon.png"
    })
  );
});
