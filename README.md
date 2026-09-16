# eatsylog

식단(칼로리/탄단지) + 체중 기록 개인 웹앱. GitHub Pages + Firebase.

## 1. 저장소에 파일 올리기

```
git clone https://github.com/yeinariakim/eatsylog.git
# 이 폴더의 파일들을 저장소에 복사한 뒤
git add .
git commit -m "init"
git push
```

Settings > Pages 에서 배포 브랜치를 설정하면 `https://yeinariakim.github.io/eatsylog/` 로 열려요.

## 2. Firebase 설정

1. [console.firebase.google.com](https://console.firebase.google.com) 에서 새 프로젝트 생성 (예: `eatsylog`)
2. 프로젝트 개요 > 웹 앱 추가(</> 아이콘) → 나오는 `firebaseConfig` 값을 복사
3. `js/firebase-config.js` 와 `firebase-messaging-sw.js` 두 곳의 `YOUR_API_KEY` 등을 실제 값으로 교체
4. **Authentication** > Sign-in method > "이메일/비밀번호" 사용 설정
5. **Firestore Database** 만들기 (프로덕션 모드로 시작해도 OK, 아래 규칙을 적용하면 됨)
   - Firestore Rules 탭에 이 저장소의 `firestore.rules` 내용을 붙여넣고 게시
6. **Cloud Messaging** > 웹 구성 > "웹 푸시 인증서" 생성 → 나오는 키 값을 `js/notifications.js`의 `VAPID_KEY`에 채우기
7. 알림 발송용 서비스 계정 키 발급: 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성" → JSON 파일 다운로드

## 3. 식약처 식품영양성분 API 키

1. [data.go.kr](https://www.data.go.kr) 에서 "식품영양성분DB정보" 검색 → 활용신청 (승인까지 몇 분~몇 시간)
2. 승인된 인증키를 `js/nutrition-api.js` 의 `API_KEY` 에 넣기
3. **중요**: 처음 검색해보고 브라우저 개발자도구 콘솔에서 실제 응답 구조를 한 번 확인해보세요.
   공공 API는 필드명이 바뀌는 경우가 있어서, `FIELD_MAP` 부분을 실제 응답에 맞게 조정해야 할 수도 있어요.

## 4. 알림(GitHub Actions) 설정

1. 6번에서 받은 서비스 계정 JSON 파일 전체 내용을 복사
2. 저장소 Settings > Secrets and variables > Actions > New repository secret
   - 이름: `FIREBASE_SERVICE_ACCOUNT`
   - 값: JSON 파일 내용 전체 붙여넣기
3. `.github/workflows/reminders.yml` 이 매일 8:00 / 11:30 / 19:00 (KST) 에 자동 실행돼요.
4. Actions 탭에서 "Run workflow" 버튼으로 수동 테스트도 가능해요.

## 데이터 구조 (Firestore)

```
users/{uid}
  goals: { calorie, protein, carb, fat }

users/{uid}/entries/{entryId}
  date, meal (breakfast|lunch|dinner|snack), name, calorie, protein, carb, fat, createdAt

users/{uid}/weights/{date}
  date, kg

users/{uid}/favorites/{favId}
  name, calorie, protein, carb, fat

users/{uid}/fcmTokens/{token}
  token, updatedAt
```

## 아직 안 채운 부분

- `js/firebase-config.js`, `firebase-messaging-sw.js` — Firebase 프로젝트 값
- `js/nutrition-api.js` — 식약처 API 키 + 실제 응답 필드명 확인
- `js/notifications.js` — VAPID 키
- `manifest.json` icons — 앱 아이콘 이미지 있으면 추가 (선택)
