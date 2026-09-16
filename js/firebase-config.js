// firebase-config.js
// 1. Firebase 콘솔(console.firebase.google.com)에서 새 프로젝트를 만드세요 (예: eatsylog)
// 2. 프로젝트 설정 > 일반 > "웹 앱 추가"로 앱을 등록하면 아래 값들을 받을 수 있어요
// 3. Authentication > Sign-in method 에서 "이메일/비밀번호" 를 켜주세요
// 4. Firestore Database 를 만들고 (프로덕션 모드 시작 후 규칙은 firestore.rules 참고)
// 5. 아래 firebaseConfig 값을 실제 값으로 교체하세요

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkqwEI86fHvDoJmFWsVpTZLr7rmL9j3R0",
  authDomain: "eatsylog.firebaseapp.com",
  projectId: "eatsylog",
  storageBucket: "eatsylog.firebasestorage.app",
  messagingSenderId: "1090563435414",
  appId: "1:1090563435414:web:0f13027e6b2d0598ac8bb7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 다른 모듈에서 쓸 수 있도록 window에 노출
window.__eatsylog = {
  app, auth, db,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  doc, setDoc, getDoc, addDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp
};

window.dispatchEvent(new Event("firebase-ready"));
