// firebase-messaging-sw.js
// 이 파일은 저장소 루트에 있어야 해요 (GitHub Pages 루트 경로에서 서비스워커로 등록됨)
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// js/firebase-config.js 와 동일한 값을 넣어주세요
firebase.initializeApp({
  apiKey: "AIzaSyDkqwEI86fHvDoJmFWsVpTZLr7rmL9j3R0",
  authDomain: "eatsylog.firebaseapp.com",
  projectId: "eatsylog",
  storageBucket: "eatsylog.firebasestorage.app",
  messagingSenderId: "1090563435414",
  appId: "1:1090563435414:web:0f13027e6b2d0598ac8bb7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "eatsylog", {
    body: body || "",
    icon: icon || "/eatsylog/icons/icon.png"
  });
});
