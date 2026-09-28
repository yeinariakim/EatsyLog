# CLAUDE.md

이 파일은 Claude가 이 저장소에서 작업할 때 참고하는 안내서예요.

## 이 앱은 뭐예요?

**eatsylog**는 식단(칼로리, 탄수화물·단백질·지방)과 체중을 기록하는 개인용 웹앱이에요.

- 화면은 **GitHub Pages**에서 그냥 정적 파일로 보여줘요. (빌드 과정 없음)
- 로그인과 데이터 저장은 **Firebase**(Authentication + Firestore)를 써요.
- 음식 영양 정보는 **식약처 식품영양성분 API**(data.go.kr)에서 검색해요.
- 식사 알림은 **GitHub Actions**가 정해진 시간에 **Firebase Cloud Messaging(FCM)** 으로 보내요.

## 꼭 알아둘 점

- **빌드 도구·npm·번들러가 없어요.** `package.json`도 없어요. 브라우저가 `index.html`과 `js/*.js`를 그대로 읽어요.
- JS는 브라우저 기본 **ES 모듈**(`import`/`export`)이에요. Firebase SDK(10.13.0)는 `https://www.gstatic.com/...` 주소에서 직접 불러와요.
- 차트는 CDN의 **Chart.js**(4.4.4)를 써요. 전역 `Chart`로 사용해요.
- 테스트·린트 설정은 없어요. 확인하려면 로컬 서버로 띄워서 브라우저로 직접 봐야 해요.
  ```
  python3 -m http.server 8000   # 그 다음 http://localhost:8000 열기
  ```
  (서비스워커·모듈 때문에 `file://`로 열면 제대로 안 돌아가요.)
- 코드 주석과 화면 문구는 **한국어**예요. 새로 쓰는 것도 한국어로 맞춰 주세요.

## 작업 규칙 (Git)

- **`main`에 바로 올리지 마세요.** `main`은 GitHub Pages로 바로 배포돼서, 올리는 순간 실제 앱이 바뀌어요.
- 항상 **새 브랜치에서 작업**하고, 끝나면 그 브랜치를 push한 뒤 **PR을 만들어 주세요.**
- `main`에 합치는 건 PR을 확인한 다음에 해요.

## 폴더 구조

```
index.html               화면 전체 (로그인/회원가입/앱, 모달들). 탭: 홈 · 체중 · 추이
css/style.css            스타일
manifest.json            홈 화면에 설치(PWA)용 정보
icons/icon.png           앱 아이콘
firebase-messaging-sw.js 푸시 알림 서비스워커 (★ 실제로 쓰이는 파일, 루트에 있어야 함)
firestore.rules          Firestore 보안 규칙 (본인 데이터만 읽기/쓰기)
js/
  firebase-config.js     Firebase 초기화. 필요한 함수들을 window.__eatsylog 에 담고
                         "firebase-ready" 이벤트를 보냄
  app.js                 앱 로직 거의 전부 (아래 참고)
  nutrition-api.js       식약처 API 검색, 결과 묶기/정렬, 100g 기준 → 실제 양 환산
  units.js               "1그릇=250g" 같은 단위 프리셋, 음식 이름으로 기본 단위 추측
  notifications.js       알림 권한 받기 + 이 기기의 FCM 토큰을 Firestore에 저장
scripts/send-reminder.js GitHub Actions에서 실행. 모든 기기 토큰에 식사 알림 전송
.github/workflows/reminders.yml  매일 08:00 / 11:30 / 19:00 (KST) 실행
```

## 동작 흐름 (쉽게)

1. `index.html`이 `firebase-config.js`와 `app.js`를 불러와요.
2. `firebase-config.js`가 준비되면 `app.js`가 `window.__eatsylog`(줄여서 `fb`)를 받아 로그인 상태를 확인해요.
   - Firebase 함수는 직접 import하지 말고 `fb.addDoc(...)`, `fb.collection(...)`처럼 `fb`를 통해 써요.
3. 로그인하면 목표값을 불러오고, 선택한 날짜의 기록과 체중을 `onSnapshot`으로 실시간 구독해요.
4. 음식 추가 방법은 세 가지예요.
   - **검색**: 식약처 API 결과 + `app.js`의 `LOCAL_FOODS`(자주 먹는 기본 식품 목록)를 합쳐 보여줌.
     영양값은 **100g 기준**이고, 고른 단위·개수로 그램을 계산해서 환산해요.
   - **직접 입력**: 양(amount)과 단위(`LOG_UNITS`, 표시용 라벨)를 넣으면 1단위당 값으로 계산해요.
   - **즐겨찾기**: 저장해 둔 기준(`per100` 또는 `perUnit`)으로 다시 계산해서 넣어요.
5. **추가 항목(extras)**: 카페인·나트륨처럼 칼로리와 상관없는 값을 이름/수치/단위로 자유롭게 기록해요.
   양을 바꾸면 비율대로 같이 바뀌고, 하루 합계는 이름별로 더해서 홈에 보여줘요.
6. **추이** 탭은 최근 30일 기록으로 차트를 그려요.

## 데이터 구조 (Firestore)

모든 데이터는 `users/{uid}` 아래에 있어요. (README보다 실제 코드 기준이 더 최신이에요)

```
users/{uid}
  goals: { calorie, protein, carb, fat }

users/{uid}/entries/{자동ID}         한 번 먹은 기록
  date("YYYY-MM-DD"), meal(breakfast|lunch|dinner|snack), name,
  calorie, protein, carb, fat, amount, unit,
  perUnitCalorie, perUnitProtein, perUnitCarb, perUnitFat,
  extras: [{ name, value, unit }], createdAt
  (검색으로 넣은 항목은 unit="g", amount=그램 수. 수정할 때 perUnit 값 × 100 으로
   "100g 기준"을 되살려서 다시 계산해요)

users/{uid}/weights/{date}           하루 한 개 (문서 ID = 날짜)
  date, kg

users/{uid}/favorites/{자동ID}
  name, unit, basis("per100" | "perUnit"),
  per100 또는 perUnit: { calorie, protein, carb, fat },
  defaultAmount, extras

users/{uid}/fcmTokens/{token}
  token, updatedAt
```

새 컬렉션을 추가하면 `firestore.rules`에도 규칙을 꼭 추가해야 해요.

## 수정할 때 주의할 점

- **Firebase 설정값은 `js/firebase-config.js` 한 곳에만 있어요.**
  루트 `firebase-messaging-sw.js`는 설정값 없이 `push` 이벤트를 직접 처리해요.
- **서비스워커는 저장소 루트의 `firebase-messaging-sw.js`** 예요 (`notifications.js`에서 등록).
  루트에 있어야 사이트 전체에서 동작하니 `js/` 같은 하위 폴더로 옮기지 마세요.
- 알림은 `data.body`에 문구를 담아 보내고, 서비스워커가 그 문구 한 줄만 띄워요.
  문구를 바꾸려면 `scripts/send-reminder.js`를, 시간을 바꾸려면 `reminders.yml`의 cron(UTC 기준)과
  `send-reminder.js`의 `slots`를 **같이** 고쳐야 해요.
- 식약처 API 응답의 영양 필드: `AMT_NUM1`=칼로리, `AMT_NUM3`=단백질, `AMT_NUM4`=지방, `AMT_NUM6`=탄수화물.
- 같은 종류 음식(`FOOD_REF_NM`)은 평균값 하나로 묶고, 검색어와 딱 맞거나 원재료(`DB_CLASS_CM`="01")인 것을 위로 올려요.
- 사용자 입력을 HTML에 넣을 때는 `escapeHtml()`을 써요.
- `js/app.js`나 `css/style.css`를 고치면 `index.html`의 `?v=` 값도 바꿔 주세요. 안 그러면 휴대폰이 예전 파일을 계속 쓸 수 있어요.
- 모달은 `openModal(id)` / `closeModal(id)`로 열고 닫아요.
- 숫자 반올림 규칙: 칼로리는 정수, 탄단지는 소수점 한 자리.
- iOS Safari는 사용자가 직접 누른 버튼에서만 알림 권한을 요청할 수 있어요.

## 배포

PR이 `main`에 합쳐지면 GitHub Pages에 바로 반영돼요 (`https://yeinariakim.github.io/eatsylog/`).
알림 스크립트는 GitHub Secret `FIREBASE_SERVICE_ACCOUNT`(서비스 계정 JSON)가 필요해요.
자세한 초기 설정 방법은 `README.md`를 보세요.
