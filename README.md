# eatsylog

먹은 음식(칼로리, 탄수화물·단백질·지방)과 체중을 기록하는 개인용 웹앱이에요.

- 주소: https://yeinariakim.github.io/eatsylog/
- 화면: **GitHub Pages** (빌드 없이 정적 파일 그대로)
- 로그인·데이터 저장: **Firebase** (Authentication + Firestore)
- 음식 영양 정보 검색: **식약처 식품영양성분 API** (data.go.kr)
- 식사 알림: **GitHub Actions** → **Firebase Cloud Messaging(FCM)**

휴대폰에서 "홈 화면에 추가"하면 앱처럼 쓸 수 있어요 (PWA).

## 할 수 있는 것

화면 아래 탭은 **운동 · 달력 · 홈 · 체중 · 마이페이지** 다섯 개예요.

- **홈**
  - 날짜를 앞뒤로 넘기며 아침·점심·저녁·간식 기록을 봐요.
  - 목표 대비 칼로리·탄단지 게이지를 보여줘요.
    목표는 **마이페이지**에서 바꿔요. 탄수화물은 "상한"이에요.
    처음 기본값은 칼로리 1450 kcal, 단백질 105 g, 탄수화물 40 g, 지방 95 g이에요.
  - 기록을 누르면 이름·양·영양값·추가 항목을 고칠 수 있어요.
  - 기록 옆 "삭제" 버튼을 누르면 확인 없이 바로 지워져요.
- **음식 추가 방법 3가지**
  1. **검색**: 식약처 API 결과 + 앱에 넣어둔 자주 먹는 음식 목록을 같이 보여줘요.
     "1그릇", "1개" 같은 단위와 개수를 고르면 그램으로 바꿔서 영양값을 계산해요.
  2. **직접 입력**: 이름, 양, 단위(g·ml·개·인분·컵 등), 영양값을 직접 넣어요.
  3. **즐겨찾기**: 추가하거나 고칠 때 "즐겨찾기에 저장"을 체크해 두면, 음식 추가 창 아래 목록에서 한 번에 넣을 수 있어요.
     지난번에 먹은 양이 기본으로 들어가고, 양을 바꾸면 영양값과 추가 항목도 비율대로 바뀌어요.
     목록의 "삭제"로 즐겨찾기를 지울 수 있어요.
- **추가 항목**: 카페인·나트륨처럼 칼로리와 상관없는 값도 이름/수치/단위로 자유롭게 적을 수 있어요.
  하루 합계는 홈에 따로 보여줘요.
- **체중**: 날짜마다 체중을 하나씩 기록해요. 같은 날 다시 적으면 덮어써요.
  최근 30개 기록은 그래프로, 최근 20개는 목록으로 보여줘요.
- **운동**: 날짜마다 운동 기록(장소, 유산소, 근력운동 종목·무게·횟수·세트, 칼로리, 심박수)을 적어요.
  총 운동시간·칼로리는 자동으로 더해 주고, 직접 고칠 수도 있어요.
  **무게 추이**에서 종목을 고르면 날짜별 최고 무게를 그래프로 봐요.
- **달력**: 한 달 동안 날짜별 칼로리 목표 달성 정도를 작은 원으로 보여줘요. 날짜를 누르면 그날 홈으로 가요.
- **마이페이지**: 목표 수정, 알림 켜기, 로그아웃.
- **알림**: 마이페이지에서 **알림 켜기**를 누르면 매일 08:00 / 11:30 / 19:00(한국 시간)에 기록 알림이 와요.
  알림은 이 버튼을 눌러 등록한 모든 기기에 가요.
  (아이폰은 홈 화면에 추가한 뒤 그 앱에서 버튼을 눌러야 알림을 받을 수 있어요)

## 파일 구성

```
index.html               화면 전체 (로그인/회원가입/앱, 팝업들)
css/style.css            스타일
manifest.json            홈 화면 설치(PWA)용 정보
icons/icon.png           앱 아이콘
firebase-messaging-sw.js 푸시 알림을 띄우는 서비스워커 (루트에 있어야 해요)
firestore.rules          Firestore 보안 규칙 (본인 데이터만 읽기/쓰기)
js/
  firebase-config.js     Firebase 연결 설정
  app.js                 앱 기능 거의 전부
  nutrition-api.js       식약처 API 검색과 영양값 계산
  units.js               "1그릇=250g" 같은 단위 정보
  notifications.js       알림 권한 받기 + 기기 토큰 저장
scripts/send-reminder.js 알림 보내는 스크립트 (GitHub Actions에서 실행)
.github/workflows/reminders.yml  알림 보내는 시간표
```

## 내 컴퓨터에서 실행해 보기

빌드 과정이나 `npm install`이 필요 없어요. 폴더에서 로컬 서버만 띄우면 돼요.

```
python3 -m http.server 8000
```

그 다음 브라우저에서 http://localhost:8000 을 열어요.
(`index.html`을 더블클릭해서 `file://`로 열면 제대로 동작하지 않아요)

## 코드를 고칠 때

- **`main`에 바로 올리지 않아요.** 새 브랜치에서 작업하고 PR을 만든 뒤 확인하고 합쳐요.
  `main`에 합쳐지는 순간 실제 사이트가 바뀌기 때문이에요.
- `js/app.js`나 `css/style.css`를 고치면 `index.html`에 있는 `?v=` 값(예: `?v=20260928b`)도 바꿔 주세요.
  안 바꾸면 휴대폰이 예전 파일을 계속 쓸 수 있어요.

## 처음부터 새로 설정하는 방법

지금 저장소에는 아래 값들이 이미 채워져 있어요. 다른 Firebase 프로젝트나 새 키로 바꿀 때만 따라 하면 돼요.

### 1. GitHub Pages

저장소 **Settings > Pages**에서 배포 브랜치를 `main`으로 고르면 끝이에요.
PR이 `main`에 합쳐지면 바로 사이트에 반영돼요.

### 2. Firebase

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만들어요.
2. **프로젝트 설정 > 일반 > 웹 앱 추가**를 하고, 나오는 `firebaseConfig` 값을 `js/firebase-config.js`에 넣어요.
3. **Authentication > Sign-in method**에서 "이메일/비밀번호"를 켜요.
4. **Firestore Database**를 만들고, **규칙** 탭에 이 저장소의 `firestore.rules` 내용을 붙여넣고 게시해요.
5. **프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서**에서 키를 만들어 `js/notifications.js`의 `VAPID_KEY`에 넣어요.
6. **프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성**으로 JSON 파일을 받아 둬요. (4번 알림 설정에서 써요)

### 3. 식약처 식품영양성분 API

1. [data.go.kr](https://www.data.go.kr/data/15127578/openapi.do)에서 "식품의약품안전처_식품영양성분DB정보"를 활용신청해요. (개발 단계는 자동 승인)
2. 받은 **일반 인증키(Decoding 값)**를 `js/nutrition-api.js`의 `API_KEY`에 넣어요.

참고로 응답 필드는 번호로 되어 있어요.

| 필드 | 뜻 |
| --- | --- |
| `AMT_NUM1` | 칼로리 (kcal) |
| `AMT_NUM3` | 단백질 (g) |
| `AMT_NUM4` | 지방 (g) |
| `AMT_NUM6` | 탄수화물 (g) |

값은 모두 **100g 기준**이에요. 같은 음식은 평균값 하나로 묶고, 검색어와 딱 맞는 것이나 원재료를 위로 올려서 보여줘요.

### 4. 알림 (GitHub Actions)

1. 저장소 **Settings > Secrets and variables > Actions > New repository secret**에서
   - 이름: `FIREBASE_SERVICE_ACCOUNT`
   - 값: 2-6번에서 받은 JSON 파일 내용 전체
2. `.github/workflows/reminders.yml`이 매일 08:00 / 11:30 / 19:00(한국 시간)에 알아서 실행돼요.
3. **Actions** 탭에서 "Run workflow"를 누르면 바로 테스트할 수 있어요.

알림 시간을 바꾸려면 `reminders.yml`의 cron(UTC 기준, 한국 시간 − 9시간)과
`scripts/send-reminder.js`의 `slots`를 **같이** 고쳐야 해요. 문구도 `send-reminder.js`에서 바꿔요.

## 데이터 구조 (Firestore)

모든 데이터는 `users/{uid}` 아래에 저장돼요.

```
users/{uid}
  goals: { calorie, protein, carb, fat }          목표값

users/{uid}/entries/{자동ID}                      먹은 기록 하나
  date("YYYY-MM-DD"), meal(breakfast|lunch|dinner|snack), name,
  calorie, protein, carb, fat,                    실제 먹은 양 기준 값
  amount, unit,                                   양과 단위 (검색으로 넣으면 unit="g")
  perUnitCalorie, perUnitProtein, perUnitCarb, perUnitFat,   1단위당 값 (양 수정할 때 사용)
  extras: [{ name, value, unit }],                추가 항목 (카페인 등)
  createdAt

users/{uid}/weights/{날짜}                        하루 한 개
  date, kg

users/{uid}/favorites/{자동ID}                    즐겨찾기
  name, unit, basis("per100" | "perUnit"),
  per100 또는 perUnit: { calorie, protein, carb, fat },
  defaultAmount, extras

users/{uid}/fcmTokens/{토큰}                      알림 받을 기기
  token, updatedAt
```

새 컬렉션을 만들면 `firestore.rules`에도 규칙을 꼭 추가해 주세요.
