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
- **Firebase 규칙(`firestore.rules`)을 바꿔야 하면, PR 설명 맨 위에 크게 알려 주세요.**
  `firestore.rules` 파일은 저장소에 올려도 Firebase에 자동으로 반영되지 않아요.
  Firebase 콘솔 > Firestore Database > 규칙 탭에 직접 붙여넣어야 해요.
  그래서 PR 설명 맨 위에 아래처럼 써 주세요.
  - `## ⚠️ Firebase 규칙 변경 필요` 같은 큰 제목을 달아요.
  - 무엇이 왜 바뀌는지 한두 줄로 설명해요.
  - 콘솔에 그대로 붙여넣을 **전체 규칙**을 코드 블록으로 보여줘요. 바뀐 부분만 보여주면 안 돼요.

## 폴더 구조

```
index.html               화면 전체 (로그인/회원가입/앱, 모달들). 탭: 운동 · 달력 · 홈 · 체중 · 마이페이지
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
6. 홈·체중·운동 탭은 위쪽 날짜 이동(‹ 오늘 ›)을 같이 써요. 날짜 라벨을 누르면 작은 날짜 선택 창(`openDatePicker()`)이 떠요.
   날짜는 항상 `setCurrentDate()`로 바꿔요 (오늘 이후는 막혀 있음). 날짜 선택 창에서는 기록한 날 숫자 아래에 점이 찍혀요.
   어떤 기록인지는 지금 탭을 따라가요 (홈 = 식단, 체중 = 체중 기록(인바디 제외), 운동 = 운동). 홈은 창이 열려 있는 동안만 그 달 식단 기록을 따로 구독해요.
   **운동** 탭은 그 날짜의 운동 기록을 보여줘요. 기록 하나는 "운동 블록" 여러 개를 순서대로 쌓아 만들어요
   (유산소 / 근력운동 / 기타 중 골라서 원하는 만큼 추가·삭제·순서 바꾸기). 시간은 분·초(10초 단위) 드롭다운으로 적고,
   근력운동은 종목마다 여러 무게(세트 그룹)를 적어요. 총 시간·칼로리는 모든 블록을 자동으로 더하지만 직접 고칠 수 있어요.
   모달 입력값은 `blockDraft`에 문자열로 들고 있다가 저장할 때 숫자로 바꿔요.
   종목 이름 추천은 `<datalist>` 대신 직접 만든 목록(`showExerciseSuggest()`)을 써요 (아이폰에서 datalist가 들쭉날쭉해서).
   목록에서는 기록마다 유산소(종류별)·근력·기타·총합을 한 줄씩(줄 높이 고정), 오른쪽에 시간·칼로리를 보여줘요.
   맨 아래 줄은 장소·종목 요약 + 오른쪽 끝 "삭제"예요.
   **운동 즐겨찾기**(`workoutFavs`): 유산소·기타 블록은 "즐겨찾기에 저장"을 체크하고 기록을 저장하면 블록 설정값이 저장되고,
   "+ 운동 블록 추가" 아래 목록에서 눌러 불러와요. 근력운동은 종목마다 "☆ 즐겨찾기" 버튼으로 종목 이름+무게/횟수/세트를 저장하고,
   근력 블록 안 목록에서 눌러 종목을 추가해요. **칼로리·심박수는 애플워치 실측값이라 저장하지 않아요** (불러오면 비어 있음).
   같은 이름(유산소는 이름+코스명)으로 다시 저장하면 새로 만들지 않고 덮어써요.
   아래 "무게 추이 보기"는 근력 종목마다 한 줄씩 이름 + 최근 최고 무게(크게) + 한 달 전 대비 변화량(작게)을 보여줘요 (`renderProgress()`).
   변화량(`monthAgoChange()`)은 최근 기록 날짜의 30일 전에 가장 가까운 기록과 비교하고, 최근 기록과 15일 이상 떨어진 기록이 없으면(새로 시작한 운동) 처음 기록과 비교해요. 기록이 1번뿐이면 안 보여줘요.
   늘면 세이지그린 알약(`.kg-change.up`) "+", 줄거나 같으면 연한 회색 글자 — 경고색(빨강/앰버)은 쓰지 않아요. 무게는 모두 "그날 최고 무게" 기준이에요.
   줄을 누르면(`progressSelected`) 그 종목만 Chart.js 큰 라인 그래프로 보여주고, "‹ 전체 종목"으로 목록에 돌아가요.
   (운동 기록은 전체를 한 번에 구독해서 `allWorkouts`에 두고, 날짜 목록·무게 추이 둘 다 여기서 걸러 써요)
7. **달력** 탭은 한 달 기록을 구독해서 날짜별 칼로리 달성 정도를 작은 도넛링으로 보여줘요.
   달력의 "달성"은 칼로리가 **그날 목표** 이하인 날이에요 (`isCalendarGoalMet()`, 목표는 `goalsFor(date)`로 찾아요). 홈 링 아래 요약 줄은 탄수화물이 목표를 넘었을 때만 경고를 보여줘요.
   연속 달성 바(스트릭)도 이 기준으로 계산해요. 날짜를 누르면 홈으로 이동해요.
   **수동 기록**: 식단 기록이 하나도 없는 날을 길게 누르면(`attachLongPress()`) 작은 선택창이 떠서 "성공/실패"를 직접 표시해요
   (`manualDayStatus`). 이미 수동 표시한 날을 다시 길게 누르면 바로 지워져요. 식단 기록이 있는 날은 길게 눌러도 아무 일 없어요.
   표시 우선순위는 식단 기록(자동 계산) → 수동 기록 → 미기록 순이고, 수동 성공도 스트릭·달성 일수에 들어가요.
   음식을 추가하면(`addEntry()`) 그 날짜의 수동 기록을 지워서 그때부터는 자동 계산으로 바뀌어요.
8. **체중** 탭 아래쪽의 **인바디** 섹션은 집 체중계 기록과 따로 체중·골격근량·체지방량을 적어요.
   날짜는 폼에서 직접 고르고(기본값은 위쪽 날짜), 지난 기록을 누르면 폼에서 고칠 수 있어요.
   그래프는 세 지표를 한 차트에 색을 나눠 그려요.
9. **마이페이지** 탭에서 목표 수정·알림 켜기/끄기(스위치)·로그아웃을 해요. (예전 "설정" 모달을 대신함)
   **목표는 이력으로 쌓여요** (`goalHistory`). 어떤 날짜의 목표는 그 날짜 이전(당일 포함)에 시작한 목표 중 가장 최근 것이에요 (`goalsFor(date)`).
   그래서 목표를 바꿔도 지난 날짜의 달력 성공/실패·홈 게이지는 그때 목표 그대로예요.
   목표 폼은 평소엔 날짜 칸을 숨겨 두고 "오늘부터" 저장해요. "다른 날짜부터 적용" 버튼을 누르면 시작일 칸이 나와요 (오늘 이후는 안 됨).
   같은 시작일로 다시 저장하면 그 날짜의 목표를 덮어써요 (오늘은 묻지 않고, 다른 날짜는 한 번 확인).
   **이력은 화면에 목록으로 보여주지 않아요.** 지난 날짜의 목표는 홈에서 날짜를 옮기면 게이지에 그날 기준으로 보여요.
   맨 처음 목표는 시작일이 `FIRST_GOAL_START`("0000-01-01", 화면에는 "처음부터")라서 그보다 앞선 모든 날짜를 덮어요.
   이력이 하나도 없으면 로그인할 때 `users/{uid}.goals`를 "처음부터" 목표로 옮겨요.

## 데이터 구조 (Firestore)

모든 데이터는 `users/{uid}` 아래에 있어요. (README보다 실제 코드 기준이 더 최신이에요)

```
users/{uid}
  goals: { calorie, protein, carb, fat }   (예전 방식 값. 지금은 오늘 목표로 맞춰 두기만 하고, 판정은 goalHistory로 해요)

users/{uid}/goalHistory/{시작일}     목표 이력 (문서 ID = 적용 시작일, "처음부터"는 "0000-01-01")
  startDate, calorie, protein, carb, fat, updatedAt

users/{uid}/entries/{자동ID}         한 번 먹은 기록
  date("YYYY-MM-DD"), meal(breakfast|lunch|dinner|snack), name,
  calorie, protein, carb, fat, amount, unit,
  perUnitCalorie, perUnitProtein, perUnitCarb, perUnitFat,
  extras: [{ name, value, unit }], createdAt
  (검색으로 넣은 항목은 unit="g", amount=그램 수. 수정할 때 perUnit 값 × 100 으로
   "100g 기준"을 되살려서 다시 계산해요)

users/{uid}/weights/{date}           하루 한 개 (문서 ID = 날짜)
  date, kg

users/{uid}/inbody/{date}            인바디 기록 (문서 ID = 날짜, 같은 날 다시 적으면 덮어씀)
  date, weightKg, muscleKg(골격근량), fatKg(체지방량), updatedAt
  (집 체중계 weights와 완전히 별개. 잰 날에만 적고, 그래프는 적은 날끼리만 이어요)

users/{uid}/favorites/{자동ID}
  name, unit, basis("per100" | "perUnit"),
  per100 또는 perUnit: { calorie, protein, carb, fat },
  defaultAmount, extras

users/{uid}/workouts/{자동ID}         운동 한 번 기록
  date, place,
  blocks: [ 적은 순서대로
    { type: "cardio",   name, durationSec, course(화면 라벨 "코스명"), distanceKm, calorie, avgHr }
    { type: "strength", durationSec, exercises: [{ name, sets: [{ kg, reps, sets }] }], calorie, avgHr }
    { type: "other",    name, durationSec, reps, sets, calorie, memo }   (웜업·쿨다운·맨몸운동 등)
  ],
  totalSec, totalCalorie,
  totalTimeManual, totalCalorieManual  (true면 자동 합계 대신 직접 적은 값), createdAt
  (선택 칸을 비우면 null로 저장해요. 시간은 모두 "초" 단위)
  (예전 형식 cardio/strength/totalMinutes 문서는 workoutBlocksOf()·workoutTotalSec()가 읽을 때 바꿔 줘요.
   수정해서 저장하면 새 형식으로 덮어써요)

users/{uid}/workoutFavorites/{자동ID}  운동 즐겨찾기 (칼로리·심박수는 저장 안 함)
  { kind: "block", blockType: "cardio" | "other", name, course, durationSec, distanceKm, reps, sets, memo, updatedAt }
  { kind: "exercise", name, sets: [{ kg, reps, sets }], updatedAt }   (근력운동은 종목 하나 단위)

users/{uid}/manualDayStatus/{date}   달력 수동 기록 (문서 ID = 날짜, 식단 기록 없는 날에만)
  date, status("success" | "fail"), updatedAt

users/{uid}/fcmTokens/{token}
  token, updatedAt
```

새 컬렉션을 추가하면 `firestore.rules`에도 규칙을 꼭 추가해야 해요. (PR 설명 쓰는 법은 위 "작업 규칙" 참고)

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
- 입력칸(`input`·`select`·`textarea`) 글자는 **16px 이상**으로 해 주세요. 16px보다 작으면 아이폰이 누를 때 화면을 자동으로 확대해요.

## 배포

PR이 `main`에 합쳐지면 GitHub Pages에 바로 반영돼요 (`https://yeinariakim.github.io/eatsylog/`).
알림 스크립트는 GitHub Secret `FIREBASE_SERVICE_ACCOUNT`(서비스 계정 JSON)가 필요해요.
자세한 초기 설정 방법은 `README.md`를 보세요.
