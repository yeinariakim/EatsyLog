// app.js
import { UNIT_PRESETS, getUnitById, computeGrams, guessDefaultUnit } from "./units.js";
import { searchFood, scaleNutrition } from "./nutrition-api.js";
import { setupNotifications, isNotificationEnabled, disableNotifications } from "./notifications.js";

let fb; // firebase refs, set once firebase-config.js signals ready
let currentUser = null;
let currentDate = todayStr();     // "YYYY-MM-DD"
let goals = { calorie: 1450, protein: 105, carb: 40, fat: 95 }; // 목표 이력이 없을 때만 쓰는 기본값
let goalHistory = [];         // 목표 이력 [{ startDate, calorie, protein, carb, fat }] (시작일순)
let goalHistoryUnsub = null;
let goalHistoryMigrating = false; // 예전 목표를 첫 이력으로 옮기는 중이면 true (두 번 만들지 않도록)
let entriesUnsub = null;
let currentEntries = [];      // 홈에 보이는 날짜의 식단 기록 (목표가 바뀌면 게이지를 다시 그릴 때 씀)
let weightsUnsub = null;
let allWeights = [];
let pendingMeal = null;      // which meal the food modal is adding to
let selectedFoodPer100 = null;
let referenceServingGrams = null; // this food's own "1회 섭취참고량", if the API provided one
let favoritePerUnitBasis = null; // perUnit(1단위당) 즐겨찾기를 불러왔을 때, 수동입력 "양"을 바꾸면 다시 스케일링하기 위한 기준값
let favoriteExtrasBasis = null;       // 즐겨찾기의 추가 항목(카페인 등) 원본값 — 양이 바뀌면 이 기준으로 다시 스케일링
let favoriteExtrasBasisAmount = null; // 위 extras가 원래 몇 그램/몇 개 기준이었는지
let calendarUnsub = null;
let calendarMonth = currentDate.slice(0, 7); // 달력에 보이는 달 "YYYY-MM"
let calendarTotals = {};                      // 그 달의 { "YYYY-MM-DD": 칼로리 합계 } (기록 있는 날만)
let calendarManualUnsub = null;
let calendarManual = {};                      // 그 달의 수동 기록 { "YYYY-MM-DD": "success" | "fail" }
let inbodyUnsub = null;
let allInbody = [];        // 인바디 기록 전체 (날짜순) — 집 체중계 기록(allWeights)과 따로 관리
let editingInbodyDate = null; // 지난 인바디 기록을 고치는 중이면 그 기록의 날짜
let weightChart, inbodyChart;

// 기록에 붙이는 "양" 단위 — 그램 환산용 UNIT_PRESETS와는 별개로, 그냥 표시용 라벨이에요
const LOG_UNITS = ["g", "ml", "개", "인분", "회", "컵", "큰술", "작은술", "조각", "줌", "장"];
function renderUnitOptions(selectEl, selected) {
  selectEl.innerHTML = LOG_UNITS.map(u => `<option value="${u}" ${u === selected ? "selected" : ""}>${u}</option>`).join("");
}

// 다이어트할 때 자주 먹는 원물·기본 식품 (100g 기준) — 검색 API에 잘 안 잡히는 것들이라
// 검색할 때 API 결과랑 같이 합쳐서 보여줌 (app.js의 doFoodSearch 참고)
const LOCAL_FOODS = [
  { name: "닭가슴살(생것)", calorie: 165, protein: 31, carb: 0, fat: 3.6 },
  { name: "닭가슴살(구운것)", calorie: 165, protein: 31, carb: 0, fat: 3.6 },
  { name: "계란", calorie: 155, protein: 13, carb: 1.1, fat: 11 },
  { name: "블루베리", calorie: 57, protein: 0.7, carb: 14, fat: 0.3 },
  { name: "바나나", calorie: 89, protein: 1.1, carb: 23, fat: 0.3 },
  { name: "사과", calorie: 52, protein: 0.3, carb: 14, fat: 0.2 },
  { name: "아보카도", calorie: 160, protein: 2, carb: 9, fat: 15 },
  { name: "그릭요거트(무가당)", calorie: 59, protein: 10, carb: 3.6, fat: 0.4 },
  { name: "현미밥", calorie: 112, protein: 2.6, carb: 23.5, fat: 0.9 },
  { name: "고구마(찐것)", calorie: 90, protein: 1.6, carb: 21, fat: 0.1 },
  { name: "브로콜리", calorie: 34, protein: 2.8, carb: 7, fat: 0.4 },
  { name: "아몬드", calorie: 579, protein: 21, carb: 22, fat: 50 },
  { name: "오트밀(건조)", calorie: 389, protein: 17, carb: 66, fat: 7 },
  { name: "두부", calorie: 76, protein: 8, carb: 1.9, fat: 4.8 },
  { name: "연어(생것)", calorie: 208, protein: 20, carb: 0, fat: 13 },
  { name: "방울토마토", calorie: 18, protein: 0.9, carb: 3.9, fat: 0.2 },
  { name: "오이", calorie: 15, protein: 0.7, carb: 3.6, fat: 0.1 },
  { name: "시금치(생것)", calorie: 23, protein: 2.9, carb: 3.6, fat: 0.4 },
  { name: "참치캔(물에 담긴 것)", calorie: 116, protein: 26, carb: 0, fat: 1 },
  { name: "소고기 안심(생것)", calorie: 143, protein: 21, carb: 0, fat: 6 },
  { name: "돼지고기 안심(생것)", calorie: 143, protein: 21, carb: 0, fat: 4 },
  { name: "프로틴쉐이크(분말)", calorie: 380, protein: 75, carb: 8, fat: 5 },
  { name: "병아리콩(삶은것)", calorie: 164, protein: 9, carb: 27, fat: 2.6 },
  { name: "렌틸콩(삶은것)", calorie: 116, protein: 9, carb: 20, fat: 0.4 },
  { name: "퀴노아(조리)", calorie: 120, protein: 4.4, carb: 21, fat: 1.9 },
  { name: "새우(생것)", calorie: 85, protein: 20, carb: 0.2, fat: 0.5 },
  { name: "고등어(생것)", calorie: 205, protein: 19, carb: 0, fat: 14 },
  { name: "아메리카노", calorie: 2, protein: 0.3, carb: 0, fat: 0 },
  { name: "우유(일반)", calorie: 61, protein: 3.2, carb: 4.8, fat: 3.3 },
  { name: "두유(무가당)", calorie: 33, protein: 3.3, carb: 1.8, fat: 1.5 }
];

function searchLocalFoods(keyword) {
  return LOCAL_FOODS.filter(f => f.name.includes(keyword));
}

// ---------- Extras (카페인/나트륨 등, 탄단지와 별개인 자유 입력 항목) ----------
// 탄수화물/단백질/지방은 칼로리로 환산되는 "3대 영양소"라 게이지에 고정으로 들어가 있지만,
// 카페인/나트륨/식이섬유 같은 건 계열이 달라서(칼로리에 안 잡힘) 이름+수치+단위를 자유롭게 넣게 함
function makeExtrasController(listElId) {
  let items = []; // [{ name, value, unit }]

  function render() {
    const el = document.getElementById(listElId);
    if (!el) return;
    if (items.length === 0) { el.innerHTML = ""; return; }
    el.innerHTML = items.map((it, i) => `
      <span class="extra-chip" data-i="${i}">
        <span>${escapeHtml(it.name)} ${formatAmount(it.value)}${it.unit || ""}</span>
        <button type="button" class="extra-remove" data-remove-extra="${i}">×</button>
      </span>
    `).join("");
    el.querySelectorAll("[data-remove-extra]").forEach(btn => {
      btn.addEventListener("click", () => {
        items.splice(Number(btn.dataset.removeExtra), 1);
        render();
      });
    });
  }

  return {
    add(name, value, unit) {
      if (!name || !Number.isFinite(value)) return;
      items.push({ name, value, unit: unit || "" });
      render();
    },
    get() { return items.map(it => ({ ...it })); },
    set(newItems) { items = (newItems || []).map(it => ({ ...it })); render(); },
    reset() { items = []; render(); }
  };
}

const foodExtrasCtl = makeExtrasController("food-extras-list");
const manualExtrasCtl = makeExtrasController("manual-extras-list");
const editExtrasCtl = makeExtrasController("edit-extras-list");

function wireExtrasAddButton(prefix, ctl) {
  const btn = document.getElementById(`${prefix}-extra-add-btn`);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const nameEl = document.getElementById(`${prefix}-extra-name`);
    const valueEl = document.getElementById(`${prefix}-extra-value`);
    const unitEl = document.getElementById(`${prefix}-extra-unit`);
    const name = nameEl.value.trim();
    const value = Number(valueEl.value);
    if (!name || !Number.isFinite(value) || valueEl.value === "") return;
    ctl.add(name, value, unitEl.value);
    nameEl.value = "";
    valueEl.value = "";
    unitEl.value = "";
  });
}

wireExtrasAddButton("food", foodExtrasCtl);
wireExtrasAddButton("manual", manualExtrasCtl);
wireExtrasAddButton("edit", editExtrasCtl);

// 즐겨찾기에서 불러온 추가 항목을, 실제로 먹은 양에 비례해서 다시 계산
// (예: 100g 기준 카페인 150mg으로 저장된 즐겨찾기를 50g만 먹었다고 바꾸면 → 75mg으로)
function scaleExtras(extras, ratio) {
  return (extras || []).map(ex => ({
    name: ex.name,
    value: Math.round(ex.value * ratio * 100) / 100,
    unit: ex.unit || ""
  }));
}

// 같은 이름의 항목을 그날 여러 번 기록했으면 합산 (예: 아메리카노 카페인150 + 비타민음료 카페인50 → 카페인 200)
function computeExtraTotals(entries) {
  const totals = {}; // name -> { value, unit }
  entries.forEach(e => {
    (e.extras || []).forEach(ex => {
      if (!ex || !ex.name) return;
      if (!totals[ex.name]) totals[ex.name] = { value: 0, unit: ex.unit || "" };
      totals[ex.name].value += Number(ex.value) || 0;
      if (!totals[ex.name].unit && ex.unit) totals[ex.name].unit = ex.unit;
    });
  });
  return totals;
}

// 홈 화면에 짧게 표시할 라벨: 기본은 첫 글자, 앞글자가 겹치는 이름끼리는 두 글자로 늘림
function abbreviateExtraNames(names) {
  const labels = {};
  names.forEach(n => { labels[n] = n.slice(0, 1); });
  const counts = {};
  names.forEach(n => { counts[labels[n]] = (counts[labels[n]] || 0) + 1; });
  names.forEach(n => {
    if (counts[labels[n]] > 1) labels[n] = n.slice(0, 2);
  });
  return labels;
}

let extrasExpanded = false; // 추가 항목이 5개 이상일 때 "더보기"로 접어두는 상태 (날짜 바뀌면 초기화)

function renderExtrasSummary(entries) {
  const el = document.getElementById("extras-summary");
  if (!el) return;
  const totals = computeExtraTotals(entries);
  const names = Object.keys(totals);
  if (names.length === 0) {
    el.innerHTML = "";
    return;
  }
  const visibleNames = extrasExpanded ? names : names.slice(0, 4);
  const chips = visibleNames.map(n => {
    const t = totals[n];
    const val = formatAmount(Math.round(t.value * 10) / 10);
    return `<span class="extra-summary-chip" title="${escapeHtml(n)}">${escapeHtml(n)} ${val}${t.unit || ""}</span>`;
  }).join("");
  const hiddenCount = names.length - visibleNames.length;
  const moreBtn = hiddenCount > 0
    ? `<button type="button" id="extras-more-btn" class="extra-summary-more">+${hiddenCount}개 더보기</button>`
    : "";
  el.innerHTML = chips + moreBtn;
  const btn = document.getElementById("extras-more-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      extrasExpanded = true;
      renderExtrasSummary(entries);
    });
  }
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return todayStr(d);
}

function formatDateLabel(dateStr) {
  if (dateStr === todayStr()) return "오늘";
  if (dateStr === addDays(todayStr(), -1)) return "어제";
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(m)}월 ${parseInt(d)}일`;
}

if (window.__eatsylog) {
  // 이미 firebase-config.js가 먼저 끝난 경우 (이벤트를 놓쳤을 수 있으니 바로 시작)
  fb = window.__eatsylog;
  initAuth();
} else {
  window.addEventListener("firebase-ready", () => {
    fb = window.__eatsylog;
    initAuth();
  });
}

// ---------- Auth ----------
function initAuth() {
  fb.onAuthStateChanged(fb.auth, async (user) => {
    document.getElementById("loading-screen").style.display = "none";
    if (user) {
      currentUser = user;
      document.getElementById("auth-screen").style.display = "none";
      document.getElementById("signup-screen").style.display = "none";
      document.getElementById("app").style.display = "block";
      document.getElementById("mypage-email").textContent = user.email || "";
      await loadGoals();
      subscribeToGoalHistory();
      subscribeToDate(currentDate);
      subscribeToWeights();
      subscribeToInbody();
      // iOS Safari는 사용자가 직접 누른 동작이 아니면 알림 권한 요청을 막을 수 있어서,
      // 여기서는 상태만 확인하고 켜기/끄기는 마이페이지의 알림 스위치에서 해요 (아래 참고)
      refreshNotificationToggle();
    } else {
      currentUser = null;
      document.getElementById("app").style.display = "none";
      document.getElementById("auth-screen").style.display = "block";
      if (entriesUnsub) entriesUnsub();
      if (weightsUnsub) weightsUnsub();
      if (goalHistoryUnsub) { goalHistoryUnsub(); goalHistoryUnsub = null; }
      goalHistory = [];
      goalHistoryMigrating = false;
      currentEntries = [];
      if (inbodyUnsub) { inbodyUnsub(); inbodyUnsub = null; }
      if (calendarUnsub) { calendarUnsub(); calendarUnsub = null; }
      if (calendarManualUnsub) { calendarManualUnsub(); calendarManualUnsub = null; }
      closeManualDayPopup();
      switchView("home"); // 다음에 로그인하면 홈부터 보이도록
    }
  });
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const pw = document.getElementById("login-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  try {
    await fb.signInWithEmailAndPassword(fb.auth, email, pw);
  } catch (err) {
    errEl.textContent = "로그인에 실패했어요. 이메일/비밀번호를 확인해주세요.";
  }
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const pw = document.getElementById("signup-password").value;
  const errEl = document.getElementById("signup-error");
  errEl.textContent = "";
  try {
    const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pw);
    await fb.setDoc(fb.doc(fb.db, "users", cred.user.uid), { goals });
  } catch (err) {
    errEl.textContent = "가입에 실패했어요. (비밀번호는 6자 이상이어야 해요)";
  }
});

document.getElementById("show-signup").addEventListener("click", () => {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("signup-screen").style.display = "block";
});
document.getElementById("show-login").addEventListener("click", () => {
  document.getElementById("signup-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "block";
});
// 알림 스위치: 켜면 권한 요청 + 토큰 저장, 끄면 이 기기 토큰 삭제
// (iOS Safari는 사용자가 직접 누른 동작에서만 권한 요청이 돼서, 스위치를 누를 때 요청해요)
async function refreshNotificationToggle() {
  const toggle = document.getElementById("notify-toggle");
  try {
    toggle.checked = await isNotificationEnabled(fb.app, fb.db, fb, currentUser.uid);
  } catch (err) {
    console.warn("알림 상태 확인 실패", err);
    toggle.checked = false;
  }
}

document.getElementById("notify-toggle").addEventListener("change", async (e) => {
  const toggle = e.target;
  const errEl = document.getElementById("notify-error");
  const turnOn = toggle.checked;
  errEl.textContent = "";
  toggle.disabled = true;
  try {
    if (turnOn) await setupNotifications(fb.app, fb.db, fb, currentUser.uid);
    else await disableNotifications(fb.app, fb.db, fb, currentUser.uid);
  } catch (err) {
    console.error("알림 설정 실패:", err);
    toggle.checked = !turnOn;
    errEl.textContent = `실패: ${err.message || err}`;
  } finally {
    toggle.disabled = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fb.signOut(fb.auth);
});

// ---------- Goals (마이페이지) ----------
// 목표는 "언제부터 적용했는지"와 같이 이력으로 쌓아요: users/{uid}/goalHistory/{시작일}
// 어떤 날짜의 목표 = 그 날짜 이전(당일 포함)에 시작한 목표 중 가장 최근 것.
// 그래서 목표를 바꿔도 지난 날짜의 달력 성공/실패·홈 게이지는 그때 목표 그대로예요.
// 맨 처음 목표는 시작일이 FIRST_GOAL_START("처음부터")라서 모든 지난 날짜를 덮어요.
// 이력은 화면에 목록으로 보여주지 않아요 — 지난 날짜의 목표는 홈 게이지·달력에서 그날 기준으로 보여요.
// users/{uid}.goals 는 예전 방식 값 — 이력이 하나도 없을 때 첫 이력으로 옮기는 데 쓰고, 오늘 목표로 맞춰 둬요.
const GOAL_KEYS = ["calorie", "protein", "carb", "fat"];
const FIRST_GOAL_START = "0000-01-01";

function goalStartLabel(startDate) {
  return startDate === FIRST_GOAL_START ? "처음부터" : `${formatDateLabel(startDate)}부터`;
}

function goalsFor(date, history = goalHistory) {
  if (history.length === 0) return goals;
  let found = history[0];
  for (const g of history) {
    if (g.startDate <= date) found = g;
    else break;
  }
  return found;
}

async function loadGoals() {
  const snap = await fb.getDoc(fb.doc(fb.db, "users", currentUser.uid));
  if (snap.exists() && snap.data().goals) {
    goals = snap.data().goals;
  } else {
    await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid), { goals }, { merge: true });
  }
  resetGoalForm();
  renderGauges();
}

function goalHistoryRef(startDate) {
  return fb.doc(fb.db, "users", currentUser.uid, "goalHistory", startDate);
}

function subscribeToGoalHistory() {
  if (goalHistoryUnsub) goalHistoryUnsub();
  const q = fb.query(fb.collection(fb.db, "users", currentUser.uid, "goalHistory"), fb.orderBy("startDate"));
  let first = true;
  goalHistoryUnsub = fb.onSnapshot(q, (snap) => {
    // 이력이 아직 없으면(이 기능 전에 가입했거나 막 가입한 경우) 지금 목표를 "처음부터" 목표로 만들어요.
    // 그래서 지난 날짜들은 지금까지처럼 이 목표로 보이고, 이후에 바꾼 목표는 바꾼 날부터만 적용돼요.
    if (snap.empty && !snap.metadata.fromCache && !goalHistoryMigrating) {
      goalHistoryMigrating = true;
      fb.setDoc(goalHistoryRef(FIRST_GOAL_START), { startDate: FIRST_GOAL_START, ...pickGoalValues(goals), updatedAt: fb.serverTimestamp() })
        .catch(err => { goalHistoryMigrating = false; console.warn("목표 이력 만들기 실패", err); });
      return;
    }
    goalHistory = [];
    snap.forEach(d => goalHistory.push({ ...d.data(), startDate: d.id }));
    if (first && goalHistory.length > 0) { first = false; resetGoalForm(); }
    renderGauges();
    renderCalendar(); // 목표 이력이 바뀌면 달력의 달성 여부도 다시 계산
  }, (err) => console.warn("목표 이력 불러오기 실패", err));
}

function pickGoalValues(g) {
  const out = {};
  GOAL_KEYS.forEach(k => { out[k] = Number(g[k]) || 0; });
  return out;
}

function fillGoalForm(g) {
  document.getElementById("goal-calorie").value = g.calorie;
  document.getElementById("goal-protein").value = g.protein;
  document.getElementById("goal-carb").value = g.carb;
  document.getElementById("goal-fat").value = g.fat;
}

// 날짜 칸 보이기/숨기기 — 숨기면 "다른 날짜부터 적용" 버튼을 대신 보여줘요
function showGoalStartField(show) {
  document.getElementById("goal-start-label").style.display = show ? "" : "none";
  document.getElementById("goal-start-toggle").style.display = show ? "none" : "";
}

// 기본 상태: 오늘부터 적용할 새 목표 (칸에는 지금 목표를 채워 둠). 날짜 칸은 숨겨 둬요
function resetGoalForm() {
  const startEl = document.getElementById("goal-start");
  startEl.value = todayStr();
  startEl.max = todayStr();
  showGoalStartField(false);
  fillGoalForm(goalsFor(todayStr()));
  document.getElementById("goal-cancel").style.display = "none";
}

document.getElementById("goal-cancel").addEventListener("click", resetGoalForm);
document.getElementById("goal-start-toggle").addEventListener("click", () => {
  showGoalStartField(true);
  document.getElementById("goal-cancel").style.display = ""; // 취소하면 다시 오늘부터로 돌아가요
  document.getElementById("goal-start").focus();
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const startDate = document.getElementById("goal-start").value;
  if (!startDate) return;
  if (startDate > todayStr()) { alert("오늘 이후 날짜부터 적용할 수는 없어요"); return; }
  const values = pickGoalValues({
    calorie: document.getElementById("goal-calorie").value,
    protein: document.getElementById("goal-protein").value,
    carb: document.getElementById("goal-carb").value,
    fat: document.getElementById("goal-fat").value
  });
  const exists = goalHistory.some(g => g.startDate === startDate);
  // 오늘 목표를 다시 바꾸는 건 그냥 덮어써요. 그 외에 이미 있는 시작일로 저장하면 한 번 물어봐요
  if (exists && startDate !== todayStr()
    && !confirm(`${goalStartLabel(startDate)} 적용한 목표가 이미 있어요. 덮어쓸까요?`)) return;

  // 저장 후 이력을 미리 계산해서, 오늘 목표를 users/{uid}.goals 에도 맞춰 둬요
  const nextHistory = goalHistory
    .filter(g => g.startDate !== startDate)
    .concat({ startDate, ...values })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  goals = pickGoalValues(goalsFor(todayStr(), nextHistory));

  try {
    await fb.setDoc(goalHistoryRef(startDate), { startDate, ...values, updatedAt: fb.serverTimestamp() });
    await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid), { goals }, { merge: true });
  } catch (err) {
    console.error("목표 저장 실패", err);
    alert("목표를 저장하지 못했어요");
    return;
  }
  resetGoalForm();
  const saveBtn = document.getElementById("settings-save-btn");
  saveBtn.textContent = "저장됨 ✓";
  setTimeout(() => { saveBtn.textContent = "저장"; }, 1500);
});

// ---------- Date navigation ----------
// 홈·체중 탭이 같이 보는 날짜를 바꿈 (오늘 이후로는 못 감) — 달력에서 날짜를 눌렀을 때도 이걸 써요
function setCurrentDate(dateStr) {
  if (dateStr > todayStr()) return;
  currentDate = dateStr;
  document.getElementById("current-date-label").textContent = formatDateLabel(currentDate);
  subscribeToDate(currentDate);
  if (!editingInbodyDate) document.getElementById("inbody-date").value = currentDate; // 인바디 날짜 기본값도 같이 따라감
}
document.getElementById("date-prev").addEventListener("click", () => {
  setCurrentDate(addDays(currentDate, -1));
});
document.getElementById("date-next").addEventListener("click", () => {
  setCurrentDate(addDays(currentDate, 1));
});

// ----- 날짜 선택 창: 위쪽 날짜 라벨을 누르면 작은 달력이 떠서 바로 이동 (홈·체중 탭 공통) -----
let pickerMonth = currentDate.slice(0, 7); // 선택 창에 보이는 달 "YYYY-MM"
// 기록한 날은 숫자 아래에 점을 찍어요. 어떤 기록인지는 지금 탭을 따라가요
//   홈 = 식단 기록한 날, 체중 = 체중 적은 날 (인바디 제외)
let pickerEntryDates = new Set(); // 홈 탭용: 선택 창에 보이는 달의 식단 기록 날짜
let pickerEntriesUnsub = null;

function activeView() {
  return document.querySelector(".tab-btn.active")?.dataset.view || "home";
}

function pickerMarkedDates() {
  const view = activeView();
  if (view === "weight") return new Set(allWeights.map(x => x.date)); // 인바디는 빼고 집 체중계 기록만
  return pickerEntryDates;
}

// 식단 기록은 평소에 선택한 하루만 구독하고 있어서, 선택 창이 열려 있는 동안만 그 달 기록을 따로 구독해요
function subscribePickerEntries() {
  if (pickerEntriesUnsub) { pickerEntriesUnsub(); pickerEntriesUnsub = null; }
  pickerEntryDates = new Set();
  if (activeView() !== "home" || !currentUser) return;
  const month = pickerMonth;
  const q = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "entries"),
    fb.where("date", ">=", `${month}-01`),
    fb.where("date", "<=", `${month}-${String(daysInMonth(month)).padStart(2, "0")}`)
  );
  pickerEntriesUnsub = fb.onSnapshot(q, (snap) => {
    if (pickerMonth !== month) return;
    const dates = new Set();
    snap.forEach(d => dates.add(d.data().date));
    pickerEntryDates = dates;
    renderDatePicker();
  });
}

function refreshDatePickerIfOpen() {
  if (document.getElementById("date-picker").style.display === "block") renderDatePicker();
}

function openDatePicker() {
  pickerMonth = currentDate.slice(0, 7);
  subscribePickerEntries();
  renderDatePicker();
  document.getElementById("date-picker").style.display = "block";
  document.getElementById("date-picker-backdrop").style.display = "block";
  document.getElementById("date-label-btn").setAttribute("aria-expanded", "true");
}

function closeDatePicker() {
  if (pickerEntriesUnsub) { pickerEntriesUnsub(); pickerEntriesUnsub = null; }
  document.getElementById("date-picker").style.display = "none";
  document.getElementById("date-picker-backdrop").style.display = "none";
  document.getElementById("date-label-btn").setAttribute("aria-expanded", "false");
}

function renderDatePicker() {
  const [y, m] = pickerMonth.split("-").map(Number);
  const today = todayStr();
  document.getElementById("dp-month-label").textContent = `${y}년 ${m}월`;
  // 오늘이 속한 달보다 미래로는 못 감
  document.getElementById("dp-next").disabled = pickerMonth >= today.slice(0, 7);

  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0 = 일요일
  const markedDates = pickerMarkedDates();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(`<span></span>`);
  for (let day = 1; day <= daysInMonth(pickerMonth); day++) {
    const date = `${pickerMonth}-${String(day).padStart(2, "0")}`;
    const classes = ["dp-day"];
    if (date === currentDate) classes.push("selected");
    if (date === today) classes.push("today");
    if (markedDates.has(date)) classes.push("has-record");
    cells.push(`<button type="button" class="${classes.join(" ")}" data-dp-date="${date}"
      ${date > today ? "disabled" : ""}>${day}</button>`);
  }
  document.getElementById("dp-grid").innerHTML = cells.join("");
}

document.getElementById("date-label-btn").addEventListener("click", () => {
  if (document.getElementById("date-picker").style.display === "block") closeDatePicker();
  else openDatePicker();
});
document.getElementById("date-picker-backdrop").addEventListener("click", closeDatePicker);
document.getElementById("dp-prev").addEventListener("click", () => {
  pickerMonth = addMonths(pickerMonth, -1);
  subscribePickerEntries();
  renderDatePicker();
});
document.getElementById("dp-next").addEventListener("click", () => {
  if (pickerMonth >= todayStr().slice(0, 7)) return;
  pickerMonth = addMonths(pickerMonth, 1);
  subscribePickerEntries();
  renderDatePicker();
});
document.getElementById("dp-today").addEventListener("click", () => {
  setCurrentDate(todayStr());
  closeDatePicker();
});
document.getElementById("dp-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dp-date]");
  if (!btn || btn.disabled) return;
  setCurrentDate(btn.dataset.dpDate);
  closeDatePicker();
});

// ---------- Entries (meals) ----------
function subscribeToDate(dateStr) {
  if (entriesUnsub) entriesUnsub();
  extrasExpanded = false; // 날짜를 옮기면 "더보기" 상태도 초기화
  const q = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "entries"),
    fb.where("date", "==", dateStr)
  );
  entriesUnsub = fb.onSnapshot(q, (snap) => {
    const entries = [];
    snap.forEach(docSnap => entries.push({ id: docSnap.id, ...docSnap.data() }));
    currentEntries = entries;
    renderMeals(entries);
    renderGauges(entries);
  });
}

// 홈 식사 목록 한 줄 요약: 0인 탄단지는 빼고, 빈 자리만큼 추가 항목(카페인·나트륨 등)을 채워서 보여줌
// (탄단지 3칸이 기준 — 예: 탄8만 있으면 남는 2칸에 "카30mg 나10mg")
const MEAL_MACRO_SLOTS = 3;
function formatEntryMacro(item, extraLabels) {
  const parts = [["탄", item.carb], ["단", item.protein], ["지", item.fat]]
    .filter(([, v]) => Number(v) > 0)
    .map(([label, v]) => `${label}${v}`);
  const extras = (item.extras || []).filter(ex => Number(ex.value) > 0);
  extras.slice(0, MEAL_MACRO_SLOTS - parts.length).forEach(ex => {
    const label = extraLabels[ex.name] || ex.name;
    parts.push(`${label}${formatAmount(Math.round(ex.value * 10) / 10)}${ex.unit || ""}`);
  });
  return [`${item.calorie}kcal`, parts.join(" ")].filter(Boolean).join(" · ");
}

function renderMeals(entries) {
  // 한 줄에 들어가도록 줄임말(카·나 등)을 씀 — 그날 기록 전체 이름 기준이라 겹치면 두 글자(카페·카카)로
  const extraLabels = abbreviateExtraNames(Object.keys(computeExtraTotals(entries)));
  ["breakfast", "lunch", "dinner", "snack"].forEach(meal => {
    const list = document.querySelector(`[data-meal-list="${meal}"]`);
    const items = entries.filter(e => e.meal === meal);
    if (items.length === 0) {
      list.innerHTML = `<li class="food-list-empty">아직 기록이 없어요</li>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <li>
        <button class="food-edit-trigger" data-edit="${item.id}">
          <span class="food-name">${escapeHtml(item.name)}${item.amount ? ` <span class="food-amount">${formatAmount(item.amount)}${item.unit}</span>` : ""}</span>
          <span class="food-macro">${escapeHtml(formatEntryMacro(item, extraLabels))}</span>
        </button>
        <button class="food-remove" data-remove="${item.id}">삭제</button>
      </li>
    `).join("");
  });

  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = entries.find(e => e.id === btn.dataset.edit);
      if (item) openEditModal(item);
    });
  });

  document.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fb.deleteDoc(fb.doc(fb.db, "users", currentUser.uid, "entries", btn.dataset.remove));
    });
  });
}

function renderGauges(entries = currentEntries) {
  const dayGoals = goalsFor(currentDate); // 그날 적용된 목표 (지난 날짜는 그때 목표)
  const totals = entries.reduce((acc, e) => {
    acc.calorie += e.calorie || 0;
    acc.protein += e.protein || 0;
    acc.carb += e.carb || 0;
    acc.fat += e.fat || 0;
    return acc;
  }, { calorie: 0, protein: 0, carb: 0, fat: 0 });

  const circumference = 326.7;

  ["calorie", "protein", "carb", "fat"].forEach(metric => {
    const value = totals[metric];
    const goal = dayGoals[metric] || 1;
    const pct = Math.min(value / goal, 1);
    const ring = document.querySelector(`[data-ring="${metric}"]`);
    ring.style.strokeDashoffset = circumference - (pct * circumference);
    ring.classList.toggle("over", metric === "carb" ? value > goal : false);

    document.querySelector(`[data-value="${metric}"]`).textContent = Math.round(value);
    const goalEl = document.querySelector(`[data-goal="${metric}"]`);
    goalEl.textContent = metric === "carb" ? `/ ${goal} 이하` : `/ ${goal}`;
  });

  renderSummary(totals, dayGoals);
  renderExtrasSummary(entries);
}

// 달력의 "목표 달성" 기준: 칼로리가 그날 목표 이하면 달성 (탄단지는 안 봄, 적게 먹은 날도 달성)
function isCalendarGoalMet(calorie, date) {
  return calorie <= goalsFor(date).calorie;
}

// 홈 요약: 탄수화물이 목표를 넘었을 때만 경고 한 줄 (그 외에는 비워 둠)
function renderSummary(totals, dayGoals) {
  const summaryEl = document.getElementById("daily-summary");
  summaryEl.textContent = totals.carb > dayGoals.carb
    ? `탄수화물이 목표보다 ${Math.round(totals.carb - dayGoals.carb)}g 많아요`
    : "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatAmount(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// ---------- Tabs ----------
// 위쪽 날짜 이동(‹ 오늘 ›)은 날짜별로 보는 탭에서만 보여줘요 (달력·마이페이지는 숨김)
const VIEWS_WITH_DATE_BAR = ["home", "weight"];

function switchView(view) {
  // 날짜 선택 창의 점은 탭마다 다른 기록을 보여줘서, 탭을 바꾸면 창을 닫아요
  if (document.getElementById("date-picker").style.display === "block") closeDatePicker();
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  // 위쪽 브랜드 자리의 탭 이름은 아래 탭바 라벨을 그대로 가져와요
  const tabLabel = document.querySelector(`.tab-btn[data-view="${view}"] .tab-label`);
  if (tabLabel) document.getElementById("brand-title").textContent = tabLabel.textContent;
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  document.getElementById(`view-${view}`).style.display = "block";
  document.getElementById("topbar").style.display = VIEWS_WITH_DATE_BAR.includes(view) ? "" : "none";
  if (!currentUser) return;
  if (view === "weight") { renderWeightChart(); renderInbodyChart(); }
  if (view === "calendar") {
    calendarMonth = currentDate.slice(0, 7); // 홈에서 보던 날짜의 달부터 보여줌
    subscribeToCalendarMonth();
  }
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ---------- Food modal ----------
document.querySelectorAll(".meal-add").forEach(btn => {
  btn.addEventListener("click", () => {
    pendingMeal = btn.dataset.meal;
    const titles = { breakfast: "🍳 아침 기록", lunch: "🥪 점심 기록", dinner: "🌯 저녁 기록", snack: "🍎 간식 기록" };
    document.getElementById("modal-meal-title").textContent = titles[pendingMeal];
    resetFoodModal();
    loadFavorites();
    openModal("food-modal");
  });
});
document.getElementById("modal-close").addEventListener("click", () => closeModal("food-modal"));

function resetFoodModal() {
  document.getElementById("food-search").value = "";
  document.getElementById("search-results").innerHTML = "";
  document.getElementById("food-detail").style.display = "none";
  document.getElementById("manual-entry").style.display = "none";
  document.getElementById("manual-name").value = "";
  document.getElementById("manual-amount").value = "1";
  renderUnitOptions(document.getElementById("manual-unit"), "회");
  document.getElementById("manual-calorie").value = "";
  document.getElementById("manual-protein").value = "";
  document.getElementById("manual-carb").value = "";
  document.getElementById("manual-fat").value = "";
  document.getElementById("manual-favorite").checked = false;
  const foodFavCheckbox = document.getElementById("food-favorite");
  if (foodFavCheckbox) foodFavCheckbox.checked = false;
  selectedFoodPer100 = null;
  referenceServingGrams = null;
  favoritePerUnitBasis = null;
  favoriteExtrasBasis = null;
  favoriteExtrasBasisAmount = null;
  foodExtrasCtl.reset();
  manualExtrasCtl.reset();
}

document.getElementById("food-search-btn").addEventListener("click", doFoodSearch);
document.getElementById("food-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); doFoodSearch(); }
});

async function doFoodSearch() {
  const keyword = document.getElementById("food-search").value.trim();
  const resultsEl = document.getElementById("search-results");
  resultsEl.innerHTML = `<li>검색 중...</li>`;

  const localMatches = searchLocalFoods(keyword);

  // 이 API는 입력한 순서 그대로 포함되는 문자열만 찾기 때문에,
  // "삶은 계란"처럼 입력해도 실제 음식명이 "계란_삶은것"이면 못 찾는 경우가 많아요.
  // 그래서 띄어쓰기로 나눠서 단어별로도 시도해보는데, 순서대로 기다리면 느려서 한꺼번에 병렬로 요청함.
  const words = keyword.split(/\s+/).filter(Boolean);
  const attemptList = [keyword, ...words.slice().sort((a, b) => b.length - a.length)];
  const attempts = [...new Set(attemptList.filter(Boolean))];

  const settled = await Promise.all(attempts.map(attempt => searchFood(attempt)));

  let apiResults = [];
  let needsKeyFlag = false;
  for (const { results, needsKey } of settled) {
    if (needsKey) needsKeyFlag = true;
    if (results.length > 0 && apiResults.length === 0) apiResults = results;
  }

  // 로컬 목록(원물·기본 식품)을 API 결과보다 위에 먼저 보여줌
  const finalResults = [...localMatches, ...apiResults];

  if (needsKeyFlag && localMatches.length === 0) {
    resultsEl.innerHTML = `<li>식약처 API 키가 아직 설정되지 않았어요. 키를 넣기 전까지는 아래 "직접 입력"이나 즐겨찾기를 이용해주세요.</li>`;
    return;
  }
  if (finalResults.length === 0) {
    resultsEl.innerHTML = `<li>검색 결과가 없어요</li>`;
    return;
  }

  resultsEl.innerHTML = finalResults.map((r, i) => `
    <li data-idx="${i}">
      <span>${escapeHtml(r.name)}</span>
      <span class="sr-macro">${r.calorie}kcal/100g</span>
    </li>
  `).join("");

  resultsEl.querySelectorAll("li[data-idx]").forEach(li => {
    li.addEventListener("click", () => selectFood(finalResults[Number(li.dataset.idx)]));
  });
}

function selectFood(food, opts = {}) {
  selectedFoodPer100 = food;
  favoritePerUnitBasis = null; // 검색으로 새 음식을 고르면 이전에 불러온 즐겨찾기 기준은 무시
  if (!opts.keepExtrasBasis) {
    favoriteExtrasBasis = null;
    favoriteExtrasBasisAmount = null;
    foodExtrasCtl.reset();
  }
  document.getElementById("food-detail").style.display = "block";
  document.getElementById("food-detail-name").textContent = food.name;
  document.getElementById("food-detail-per100").textContent =
    `${food.calorie}kcal · 탄${food.carb}g 단${food.protein}g 지${food.fat}g`;

  const unitSelect = document.getElementById("serving-unit");
  const options = [...UNIT_PRESETS];
  referenceServingGrams = food.servingSizeGrams || null;
  if (referenceServingGrams) {
    options.unshift({ id: "reference", label: `이 음식 1회 분량 (${Math.round(referenceServingGrams)}g)`, grams: referenceServingGrams });
  }
  unitSelect.innerHTML = options.map(u => `<option value="${u.id}">${u.label}</option>`).join("");
  if (opts.preferReference && referenceServingGrams) {
    // 즐겨찾기에서 불러온 경우: 예전에 먹었던 양(gram)을 그대로 "1회 분량"으로 기본 선택
    unitSelect.value = "reference";
    document.getElementById("serving-count").value = 1;
  } else {
    // 음식 이름을 보고 실제로 많이 쓰는 단위를 기본값으로 (예: 김밥→1줄, 밥류→1공기)
    const guess = guessDefaultUnit(food.name);
    unitSelect.value = guess.unitId;
    document.getElementById("serving-count").value = guess.count;
  }
  updateServingPreview();
}

document.getElementById("serving-unit").addEventListener("change", updateServingPreview);
document.getElementById("serving-count").addEventListener("input", updateServingPreview);

function gramsForSelectedUnit(unitId, count) {
  if (unitId === "reference" && referenceServingGrams) {
    return Math.round(referenceServingGrams * count);
  }
  return computeGrams(unitId, count);
}

function updateServingPreview() {
  if (!selectedFoodPer100) return;
  const unitId = document.getElementById("serving-unit").value;
  const count = Number(document.getElementById("serving-count").value) || 0;
  const grams = gramsForSelectedUnit(unitId, count);
  document.getElementById("serving-grams").textContent = `≈ ${grams}g`;
  const macros = scaleNutrition(selectedFoodPer100, grams);
  document.getElementById("computed-calorie").value = macros.calorie;
  document.getElementById("computed-protein").value = macros.protein;
  document.getElementById("computed-carb").value = macros.carb;
  document.getElementById("computed-fat").value = macros.fat;

  // 즐겨찾기의 추가 항목(카페인 등)도 양이 바뀐 만큼 비례해서 다시 계산
  if (favoriteExtrasBasis && favoriteExtrasBasisAmount) {
    foodExtrasCtl.set(scaleExtras(favoriteExtrasBasis, grams / favoriteExtrasBasisAmount));
  }
}

document.getElementById("add-food-btn").addEventListener("click", async () => {
  if (!selectedFoodPer100) return;
  const unitId = document.getElementById("serving-unit").value;
  const count = Number(document.getElementById("serving-count").value) || 0;
  const grams = gramsForSelectedUnit(unitId, count);
  const calorie = Number(document.getElementById("computed-calorie").value) || 0;
  const protein = Number(document.getElementById("computed-protein").value) || 0;
  const carb = Number(document.getElementById("computed-carb").value) || 0;
  const fat = Number(document.getElementById("computed-fat").value) || 0;
  await addEntry({ name: selectedFoodPer100.name, calorie, protein, carb, fat, amount: grams, unit: "g", extras: foodExtrasCtl.get() });

  const foodFavCheckbox = document.getElementById("food-favorite");
  if (foodFavCheckbox && foodFavCheckbox.checked) {
    await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "favorites"), {
      name: selectedFoodPer100.name,
      unit: "g",
      basis: "per100",
      per100: {
        calorie: selectedFoodPer100.calorie,
        protein: selectedFoodPer100.protein,
        carb: selectedFoodPer100.carb,
        fat: selectedFoodPer100.fat
      },
      defaultAmount: grams,
      extras: foodExtrasCtl.get()
    });
  }
  closeModal("food-modal");
});

// ---------- Manual entry ----------
document.getElementById("manual-entry-btn").addEventListener("click", () => {
  const el = document.getElementById("manual-entry");
  el.style.display = el.style.display === "none" ? "flex" : "none";
});

// 즐겨찾기(perUnit 기준)를 불러온 상태에서 "양"을 바꾸면, 저장된 1단위당 값으로 다시 계산
document.getElementById("manual-amount").addEventListener("input", () => {
  if (!favoritePerUnitBasis) return;
  const amount = Number(document.getElementById("manual-amount").value) || 0;
  document.getElementById("manual-calorie").value = Math.round(favoritePerUnitBasis.calorie * amount);
  document.getElementById("manual-protein").value = Math.round(favoritePerUnitBasis.protein * amount * 10) / 10;
  document.getElementById("manual-carb").value = Math.round(favoritePerUnitBasis.carb * amount * 10) / 10;
  document.getElementById("manual-fat").value = Math.round(favoritePerUnitBasis.fat * amount * 10) / 10;
  // 즐겨찾기의 추가 항목(카페인 등)도 양이 바뀐 만큼 비례해서 다시 계산
  if (favoriteExtrasBasis && favoriteExtrasBasisAmount) {
    manualExtrasCtl.set(scaleExtras(favoriteExtrasBasis, amount / favoriteExtrasBasisAmount));
  }
});

document.getElementById("manual-add-btn").addEventListener("click", async () => {
  const name = document.getElementById("manual-name").value.trim();
  const amount = Number(document.getElementById("manual-amount").value) || 1;
  const unit = document.getElementById("manual-unit").value;
  const calorie = Number(document.getElementById("manual-calorie").value) || 0;
  const protein = Number(document.getElementById("manual-protein").value) || 0;
  const carb = Number(document.getElementById("manual-carb").value) || 0;
  const fat = Number(document.getElementById("manual-fat").value) || 0;
  if (!name) return;

  await addEntry({ name, calorie, protein, carb, fat, amount, unit, extras: manualExtrasCtl.get() });

  if (document.getElementById("manual-favorite").checked) {
    const safeAmount = amount > 0 ? amount : 1;
    await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "favorites"), {
      name,
      unit,
      basis: "perUnit",
      perUnit: {
        calorie: calorie / safeAmount,
        protein: protein / safeAmount,
        carb: carb / safeAmount,
        fat: fat / safeAmount
      },
      defaultAmount: safeAmount,
      extras: manualExtrasCtl.get()
    });
  }
  closeModal("food-modal");
});

async function addEntry({ name, calorie, protein, carb, fat, amount = 1, unit = "회", extras = [] }) {
  const safeAmount = amount > 0 ? amount : 1;
  await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "entries"), {
    date: currentDate,
    meal: pendingMeal,
    name, calorie, protein, carb, fat,
    amount: safeAmount, unit,
    perUnitCalorie: calorie / safeAmount,
    perUnitProtein: protein / safeAmount,
    perUnitCarb: carb / safeAmount,
    perUnitFat: fat / safeAmount,
    extras,
    createdAt: fb.serverTimestamp()
  });
  // 달력에서 수동으로 성공/실패를 표시해 둔 날이면, 실제 기록이 생겼으니 수동 표시는 지움
  // (없는 문서를 지워도 오류가 아님. 실패해도 음식 추가는 이미 끝났으니 경고만 남김)
  fb.deleteDoc(manualDayRef(currentDate)).catch(err => console.warn("수동 기록 삭제 실패", err));
}

// ---------- Edit entry ----------
let editingEntryId = null;
let editPerUnit = { calorie: 0, protein: 0, carb: 0, fat: 0 }; // 직접입력 항목용
let editPer100 = null; // 식품검색(그램 기반) 항목용 — 100g당 영양성분
let editIsGramBased = false;

function openEditModal(item) {
  editingEntryId = item.id;
  document.getElementById("edit-name").value = item.name;
  document.getElementById("edit-favorite").checked = false;
  editExtrasCtl.set(item.extras || []);

  editIsGramBased = item.unit === "g";

  if (editIsGramBased) {
    document.getElementById("edit-serving-block").style.display = "flex";
    document.getElementById("edit-computed-macros").style.display = "grid";
    document.getElementById("edit-manual-block").style.display = "none";

    const amount = item.amount > 0 ? item.amount : 100;
    // 저장된 1g당 영양성분(perUnit)을 100배 해서 "100g당" 기준으로 되돌림
    const perGram = {
      calorie: item.perUnitCalorie ?? item.calorie / amount,
      protein: item.perUnitProtein ?? item.protein / amount,
      carb: item.perUnitCarb ?? item.carb / amount,
      fat: item.perUnitFat ?? item.fat / amount
    };
    editPer100 = {
      calorie: perGram.calorie * 100,
      protein: perGram.protein * 100,
      carb: perGram.carb * 100,
      fat: perGram.fat * 100
    };

    const unitSelect = document.getElementById("edit-serving-unit");
    unitSelect.innerHTML = UNIT_PRESETS.map(u => `<option value="${u.id}">${u.label}</option>`).join("");

    // 이 음식 이름에 맞는 단위를 기본으로 고르고, 지금 그램수에 맞춰 개수를 역산
    const guess = guessDefaultUnit(item.name);
    unitSelect.value = guess.unitId;
    const unitGrams = getUnitById(guess.unitId).grams;
    document.getElementById("edit-serving-count").value = Math.round((amount / unitGrams) * 10) / 10;
    updateEditServingPreview();
  } else {
    document.getElementById("edit-serving-block").style.display = "none";
    document.getElementById("edit-computed-macros").style.display = "none";
    document.getElementById("edit-manual-block").style.display = "block";

    const amount = item.amount > 0 ? item.amount : 1;
    document.getElementById("edit-amount").value = amount;
    renderUnitOptions(document.getElementById("edit-unit"), item.unit || "회");
    document.getElementById("edit-calorie").value = item.calorie;
    document.getElementById("edit-protein").value = item.protein;
    document.getElementById("edit-carb").value = item.carb;
    document.getElementById("edit-fat").value = item.fat;

    editPerUnit = {
      calorie: item.perUnitCalorie ?? item.calorie / amount,
      protein: item.perUnitProtein ?? item.protein / amount,
      carb: item.perUnitCarb ?? item.carb / amount,
      fat: item.perUnitFat ?? item.fat / amount
    };
  }

  openModal("edit-modal");
}

document.getElementById("edit-close").addEventListener("click", () => closeModal("edit-modal"));

// 양(amount)을 바꾸면 저장된 1단위당 영양성분 기준으로 칼로리/탄단지를 자동으로 다시 계산 (직접입력 항목)
document.getElementById("edit-amount").addEventListener("input", () => {
  const amount = Number(document.getElementById("edit-amount").value) || 0;
  document.getElementById("edit-calorie").value = Math.round(editPerUnit.calorie * amount);
  document.getElementById("edit-protein").value = Math.round(editPerUnit.protein * amount * 10) / 10;
  document.getElementById("edit-carb").value = Math.round(editPerUnit.carb * amount * 10) / 10;
  document.getElementById("edit-fat").value = Math.round(editPerUnit.fat * amount * 10) / 10;
});

// 단위/개수를 바꾸면 100g 기준값으로 다시 계산 (식품검색으로 넣은 항목)
document.getElementById("edit-serving-unit").addEventListener("change", updateEditServingPreview);
document.getElementById("edit-serving-count").addEventListener("input", updateEditServingPreview);

let editComputedGrams = 0;

function updateEditServingPreview() {
  if (!editPer100) return;
  const unitId = document.getElementById("edit-serving-unit").value;
  const count = Number(document.getElementById("edit-serving-count").value) || 0;
  const grams = computeGrams(unitId, count);
  editComputedGrams = grams;
  document.getElementById("edit-serving-grams").textContent = `≈ ${grams}g`;
  const macros = scaleNutrition(editPer100, grams);
  document.getElementById("edit-serving-calorie").value = macros.calorie;
  document.getElementById("edit-serving-protein").value = macros.protein;
  document.getElementById("edit-serving-carb").value = macros.carb;
  document.getElementById("edit-serving-fat").value = macros.fat;
}

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingEntryId) return;

  const name = document.getElementById("edit-name").value.trim();
  let amount, unit, calorie, protein, carb, fat;

  if (editIsGramBased) {
    amount = editComputedGrams;
    unit = "g";
    calorie = Number(document.getElementById("edit-serving-calorie").value) || 0;
    protein = Number(document.getElementById("edit-serving-protein").value) || 0;
    carb = Number(document.getElementById("edit-serving-carb").value) || 0;
    fat = Number(document.getElementById("edit-serving-fat").value) || 0;
  } else {
    amount = Number(document.getElementById("edit-amount").value) || 1;
    unit = document.getElementById("edit-unit").value;
    calorie = Number(document.getElementById("edit-calorie").value) || 0;
    protein = Number(document.getElementById("edit-protein").value) || 0;
    carb = Number(document.getElementById("edit-carb").value) || 0;
    fat = Number(document.getElementById("edit-fat").value) || 0;
  }

  await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid, "entries", editingEntryId), {
    name, amount, unit, calorie, protein, carb, fat,
    perUnitCalorie: calorie / amount,
    perUnitProtein: protein / amount,
    perUnitCarb: carb / amount,
    perUnitFat: fat / amount,
    extras: editExtrasCtl.get()
  }, { merge: true });

  if (document.getElementById("edit-favorite").checked) {
    if (editIsGramBased) {
      await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "favorites"), {
        name,
        unit: "g",
        basis: "per100",
        per100: {
          calorie: editPer100.calorie,
          protein: editPer100.protein,
          carb: editPer100.carb,
          fat: editPer100.fat
        },
        defaultAmount: amount,
        extras: editExtrasCtl.get()
      });
    } else {
      const safeAmount = amount > 0 ? amount : 1;
      await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "favorites"), {
        name,
        unit,
        basis: "perUnit",
        perUnit: {
          calorie: calorie / safeAmount,
          protein: protein / safeAmount,
          carb: carb / safeAmount,
          fat: fat / safeAmount
        },
        defaultAmount: safeAmount,
        extras: editExtrasCtl.get()
      });
    }
  }

  closeModal("edit-modal");
});

// ---------- Favorites ----------
let favoritesUnsub = null;

// 즐겨찾기에 저장된 기준(basis)으로부터 "지난번에 먹은 양"만큼의 실제 총량을 계산
function favoriteTotal(f) {
  if (f.basis === "per100" && f.per100) {
    return scaleNutrition(f.per100, f.defaultAmount || 100);
  }
  if (f.basis === "perUnit" && f.perUnit) {
    const amt = f.defaultAmount || 1;
    return {
      calorie: Math.round(f.perUnit.calorie * amt),
      protein: Math.round(f.perUnit.protein * amt * 10) / 10,
      carb: Math.round(f.perUnit.carb * amt * 10) / 10,
      fat: Math.round(f.perUnit.fat * amt * 10) / 10
    };
  }
  // 구버전 즐겨찾기 (양/단위 정보 없이 저장된 것) — 그대로 표시
  return { calorie: f.calorie, protein: f.protein, carb: f.carb, fat: f.fat };
}

async function loadFavorites() {
  if (favoritesUnsub) favoritesUnsub();
  const q = fb.query(fb.collection(fb.db, "users", currentUser.uid, "favorites"), fb.orderBy("name"));
  const listEl = document.getElementById("favorites-list");
  favoritesUnsub = fb.onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<li style="cursor:default">즐겨찾기한 음식이 없어요</li>`;
      return;
    }
    const favs = [];
    snap.forEach(d => favs.push({ id: d.id, ...d.data() }));
    listEl.innerHTML = favs.map((f, i) => {
      const total = favoriteTotal(f);
      const amountLabel = f.defaultAmount ? ` · ${formatAmount(f.defaultAmount)}${f.unit || ""}` : "";
      const extrasLabel = f.extras && f.extras.length > 0 ? ` · +${f.extras.map(ex => ex.name).join(", ")}` : "";
      return `
      <li data-fav-idx="${i}">
        <button class="fav-select" data-fav-select="${i}">
          <span>${escapeHtml(f.name)}</span>
          <span class="fav-macro">${total.calorie}kcal${amountLabel}${escapeHtml(extrasLabel)}</span>
        </button>
        <button class="food-remove" data-fav-remove="${f.id}">삭제</button>
      </li>
    `;
    }).join("");
    listEl.querySelectorAll("[data-fav-select]").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = favs[Number(btn.dataset.favSelect)];
        if (f.basis === "per100" && f.per100) {
          // 그램 기반 음식: 식품검색 때와 같은 "양 조절" 화면을 그대로 재사용
          selectFood({
            name: f.name,
            calorie: f.per100.calorie,
            protein: f.per100.protein,
            carb: f.per100.carb,
            fat: f.per100.fat,
            servingSizeGrams: f.defaultAmount || null
          }, { preferReference: true, keepExtrasBasis: true });
          // 저장된 추가 항목(카페인 등)도 같이 불러오고, 기준량을 기억해뒀다가 양이 바뀌면 비례해서 재계산
          if (f.extras && f.extras.length > 0) {
            favoriteExtrasBasis = f.extras;
            favoriteExtrasBasisAmount = f.defaultAmount || 100;
            foodExtrasCtl.set(f.extras);
          } else {
            favoriteExtrasBasis = null;
            favoriteExtrasBasisAmount = null;
            foodExtrasCtl.reset();
          }
        } else if (f.basis === "perUnit" && f.perUnit) {
          // 개/인분/컵 등 단위 기반 음식: 직접 입력 화면에 불러와서 양만 조절
          document.getElementById("manual-entry").style.display = "flex";
          document.getElementById("manual-name").value = f.name;
          renderUnitOptions(document.getElementById("manual-unit"), f.unit || "회");
          const amt = f.defaultAmount || 1;
          document.getElementById("manual-amount").value = amt;
          favoritePerUnitBasis = f.perUnit;
          document.getElementById("manual-calorie").value = Math.round(f.perUnit.calorie * amt);
          document.getElementById("manual-protein").value = Math.round(f.perUnit.protein * amt * 10) / 10;
          document.getElementById("manual-carb").value = Math.round(f.perUnit.carb * amt * 10) / 10;
          document.getElementById("manual-fat").value = Math.round(f.perUnit.fat * amt * 10) / 10;
          // 저장된 추가 항목(카페인 등)도 같이 불러오고, 기준량을 기억해뒀다가 양이 바뀌면 비례해서 재계산
          if (f.extras && f.extras.length > 0) {
            favoriteExtrasBasis = f.extras;
            favoriteExtrasBasisAmount = amt;
            manualExtrasCtl.set(f.extras);
          } else {
            favoriteExtrasBasis = null;
            favoriteExtrasBasisAmount = null;
            manualExtrasCtl.reset();
          }
        } else {
          // 구버전 즐겨찾기 — 양/단위 기준이 없어서 예전처럼 1회로 바로 추가
          addEntry({ name: f.name, calorie: f.calorie, protein: f.protein, carb: f.carb, fat: f.fat });
          closeModal("food-modal");
        }
      });
    });
    listEl.querySelectorAll("[data-fav-remove]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fb.deleteDoc(fb.doc(fb.db, "users", currentUser.uid, "favorites", btn.dataset.favRemove));
      });
    });
  });
}

// ---------- Weight ----------
function subscribeToWeights() {
  const q = fb.query(fb.collection(fb.db, "users", currentUser.uid, "weights"), fb.orderBy("date"));
  weightsUnsub = fb.onSnapshot(q, (snap) => {
    allWeights = [];
    snap.forEach(d => allWeights.push({ id: d.id, ...d.data() }));
    renderWeightHistory();
    renderWeightChart();
    refreshDatePickerIfOpen();
  });
}

document.getElementById("weight-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kg = Number(document.getElementById("weight-input").value);
  if (!kg) return;
  await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid, "weights", currentDate), {
    date: currentDate, kg
  });
  document.getElementById("weight-input").value = "";
});

function renderWeightHistory() {
  const el = document.getElementById("weight-history");
  const recent = [...allWeights].reverse().slice(0, 20);
  el.innerHTML = recent.map(w => `
    <li><span class="w-date">${formatDateLabel(w.date)}</span><span>${w.kg}kg</span></li>
  `).join("");
}

function renderWeightChart() {
  const ctx = document.getElementById("weight-chart");
  if (!ctx || typeof Chart === "undefined") return;
  const data = allWeights.slice(-30);
  if (weightChart) weightChart.destroy();
  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(w => w.date.slice(5)),
      datasets: [{
        data: data.map(w => w.kg),
        borderColor: "#5B7B6C",
        backgroundColor: "rgba(91,123,108,0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false } }
    }
  });
}

// ---------- InBody (인바디) ----------
// users/{uid}/inbody/{date}   하루 한 개 (문서 ID = 날짜, 같은 날 다시 기록하면 덮어써요)
//   date, weightKg, muscleKg, fatKg, updatedAt
// 주 단위로 재는 값이라 매일 적을 필요 없고, 적은 날끼리만 이어서 그래프로 보여줘요
const INBODY_METRICS = [
  { key: "weightKg", label: "체중",     color: "#5B7B6C" },
  { key: "muscleKg", label: "골격근량", color: "#4E7A9E" },
  { key: "fatKg",    label: "체지방량", color: "#B8763E" }
];

function subscribeToInbody() {
  if (inbodyUnsub) inbodyUnsub();
  const q = fb.query(fb.collection(fb.db, "users", currentUser.uid, "inbody"), fb.orderBy("date"));
  inbodyUnsub = fb.onSnapshot(q, (snap) => {
    allInbody = [];
    snap.forEach(d => allInbody.push({ id: d.id, ...d.data() }));
    renderInbodyHistory();
    if (document.getElementById("view-weight").style.display !== "none") renderInbodyChart();
  });
}

function resetInbodyForm() {
  editingInbodyDate = null;
  document.getElementById("inbody-form").reset();
  document.getElementById("inbody-date").value = currentDate;
  document.getElementById("inbody-date").max = todayStr();
  document.getElementById("inbody-save-btn").textContent = "기록";
  document.getElementById("inbody-cancel").style.display = "none";
  renderInbodyHistory();
}

function startEditInbody(rec) {
  editingInbodyDate = rec.date;
  document.getElementById("inbody-date").value = rec.date;
  document.getElementById("inbody-weight").value = rec.weightKg ?? "";
  document.getElementById("inbody-muscle").value = rec.muscleKg ?? "";
  document.getElementById("inbody-fat").value = rec.fatKg ?? "";
  document.getElementById("inbody-save-btn").textContent = "수정";
  document.getElementById("inbody-cancel").style.display = "";
  renderInbodyHistory();
  document.getElementById("inbody-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

document.getElementById("inbody-date").value = currentDate;
document.getElementById("inbody-date").max = todayStr();
document.getElementById("inbody-cancel").addEventListener("click", resetInbodyForm);

document.getElementById("inbody-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const date = document.getElementById("inbody-date").value;
  const weightKg = Number(document.getElementById("inbody-weight").value);
  const muscleKg = Number(document.getElementById("inbody-muscle").value);
  const fatKg = Number(document.getElementById("inbody-fat").value);
  if (!date || !weightKg || !muscleKg || !fatKg) return;
  if (date > todayStr()) { alert("오늘 이후 날짜에는 기록할 수 없어요"); return; }
  const exists = allInbody.some(r => r.date === date);
  // 새로 적는데 그 날짜에 이미 기록이 있거나, 고치다가 다른 기록이 있는 날짜로 옮기면 덮어쓰기 전에 한 번 물어봐요
  if (exists && date !== editingInbodyDate && !confirm(`${formatDateLabel(date)} 인바디 기록이 이미 있어요. 덮어쓸까요?`)) return;
  const ref = (d) => fb.doc(fb.db, "users", currentUser.uid, "inbody", d);
  await fb.setDoc(ref(date), {
    date,
    weightKg: Math.round(weightKg * 10) / 10,
    muscleKg: Math.round(muscleKg * 10) / 10,
    fatKg: Math.round(fatKg * 10) / 10,
    updatedAt: fb.serverTimestamp()
  });
  // 고치면서 날짜를 바꿨으면 예전 날짜 문서는 지워요 (문서 ID = 날짜라서)
  if (editingInbodyDate && editingInbodyDate !== date) await fb.deleteDoc(ref(editingInbodyDate));
  resetInbodyForm();
});

function renderInbodyHistory() {
  const el = document.getElementById("inbody-history");
  if (!el) return;
  if (allInbody.length === 0) {
    el.innerHTML = `<li class="food-list-empty">아직 인바디 기록이 없어요</li>`;
    return;
  }
  const recent = [...allInbody].reverse().slice(0, 30);
  el.innerHTML = recent.map(r => `
    <li>
      <button type="button" class="inbody-edit-trigger${r.date === editingInbodyDate ? " editing" : ""}" data-inbody-edit="${escapeHtml(r.date)}">
        <span class="w-date">${escapeHtml(formatDateLabel(r.date))}</span>
        <span class="inbody-values"><i>체중</i>${formatAmount(r.weightKg)} · <i>골격근</i>${formatAmount(r.muscleKg)} · <i>체지방</i>${formatAmount(r.fatKg)}kg</span>
      </button>
      <button type="button" class="food-remove" data-inbody-remove="${escapeHtml(r.date)}">삭제</button>
    </li>
  `).join("");

  el.querySelectorAll("[data-inbody-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const rec = allInbody.find(r => r.date === btn.dataset.inbodyEdit);
      if (rec) startEditInbody(rec);
    });
  });
  el.querySelectorAll("[data-inbody-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const date = btn.dataset.inbodyRemove;
      if (!confirm(`${formatDateLabel(date)} 인바디 기록을 삭제할까요?`)) return;
      await fb.deleteDoc(fb.doc(fb.db, "users", currentUser.uid, "inbody", date));
      if (editingInbodyDate === date) resetInbodyForm();
    });
  });
}

function renderInbodyChart() {
  const ctx = document.getElementById("inbody-chart");
  if (!ctx || typeof Chart === "undefined") return;
  if (inbodyChart) { inbodyChart.destroy(); inbodyChart = null; }
  // 기록이 2개 이상일 때만 선으로 이어 보여줘요 (기록한 날끼리만 이어요)
  const data = allInbody.slice(-20);
  document.getElementById("inbody-chart-body").style.display = data.length >= 2 ? "" : "none";
  if (data.length < 2) return;
  inbodyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(r => r.date.slice(5)),
      datasets: INBODY_METRICS.map(m => ({
        label: m.label,
        data: data.map(r => (typeof r[m.key] === "number" ? r[m.key] : null)),
        borderColor: m.color,
        backgroundColor: m.color,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true
      }))
    },
    options: {
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label} ${c.parsed.y}kg` } }
      },
      scales: { y: { beginAtZero: false, ticks: { callback: (v) => `${v}kg` } } }
    }
  });

  // 세 지표가 한 축을 같이 써서 작은 변화는 선으로 잘 안 보이니, 처음 → 최근 변화량을 한 줄로 같이 보여줘요
  const first = data[0], last = data[data.length - 1];
  document.getElementById("inbody-summary").textContent = `${first.date.slice(5)} 대비 ` + INBODY_METRICS.map(m => {
    const diff = Math.round(((last[m.key] ?? 0) - (first[m.key] ?? 0)) * 10) / 10;
    return `${m.label} ${diff > 0 ? "+" : ""}${formatAmount(diff)}kg`;
  }).join(" · ");
}

// ---------- Calendar ----------
const CAL_RING_CIRCUMFERENCE = 2 * Math.PI * 17; // 달력 칸 도넛링 (r=17)
// 수동 기록 링의 점선: 둘레를 16칸으로 딱 나눠서 이음매가 어긋나지 않게 (선 60% + 빈칸 40%)
const CAL_RING_DASH = CAL_RING_CIRCUMFERENCE / 16;
const CAL_RING_DASHED = `${CAL_RING_DASH * 0.6} ${CAL_RING_DASH * 0.4}`;

function addMonths(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  return todayStr(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function subscribeToCalendarMonth() {
  if (calendarUnsub) calendarUnsub();
  if (calendarManualUnsub) calendarManualUnsub();
  closeManualDayPopup();
  calendarTotals = {};
  calendarManual = {};
  renderCalendar();
  const month = calendarMonth;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const q = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "entries"),
    fb.where("date", ">=", monthStart),
    fb.where("date", "<=", monthEnd)
  );
  calendarUnsub = fb.onSnapshot(q, (snap) => {
    const totals = {};
    snap.forEach(d => {
      const e = d.data();
      totals[e.date] = (totals[e.date] || 0) + (e.calorie || 0);
    });
    calendarTotals = totals;
    renderCalendar();
  });
  // 수동 기록(식단을 못 적은 날의 성공/실패 표시)
  const mq = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "manualDayStatus"),
    fb.where("date", ">=", monthStart),
    fb.where("date", "<=", monthEnd)
  );
  calendarManualUnsub = fb.onSnapshot(mq, (snap) => {
    const manual = {};
    snap.forEach(d => {
      const v = d.data();
      if (v.status === "success" || v.status === "fail") manual[v.date] = v.status;
    });
    calendarManual = manual;
    renderCalendar();
  }, (err) => console.warn("수동 기록 불러오기 실패", err));
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calendarMonth = addMonths(calendarMonth, -1);
  subscribeToCalendarMonth();
});
document.getElementById("cal-next").addEventListener("click", () => {
  // 오늘이 속한 달보다 미래로는 못 감 (홈 날짜 이동과 같은 규칙)
  if (calendarMonth >= todayStr().slice(0, 7)) return;
  calendarMonth = addMonths(calendarMonth, 1);
  subscribeToCalendarMonth();
});

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  if (!grid) return;
  const [y, m] = calendarMonth.split("-").map(Number);
  document.getElementById("cal-month-label").textContent = `${y}년 ${m}월`;
  document.getElementById("cal-next").disabled = calendarMonth >= todayStr().slice(0, 7);

  const today = todayStr();
  const lastDay = daysInMonth(calendarMonth);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0 = 일요일
  const dateOf = day => `${calendarMonth}-${String(day).padStart(2, "0")}`;
  // 식단 기록이 있으면 자동 계산, 없으면 수동 기록, 둘 다 없으면 null(미기록)
  const statusOf = day => {
    if (day < 1 || day > lastDay) return null;
    const date = dateOf(day);
    const cal = calendarTotals[date];
    if (cal !== undefined) return isCalendarGoalMet(cal, date) ? "success" : "fail";
    return calendarManual[date] || null;
  };
  const achieved = day => statusOf(day) === "success";

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="cal-cell cal-blank"></div>`);

  let achievedCount = 0;
  for (let day = 1; day <= lastDay; day++) {
    const date = dateOf(day);
    const col = (firstWeekday + day - 1) % 7;
    const cal = calendarTotals[date];
    const hasRecord = cal !== undefined;
    const manual = hasRecord ? null : (calendarManual[date] || null);
    const done = achieved(day);
    if (done) achievedCount++;

    const classes = ["cal-cell"];
    if (date === today) classes.push("today");
    if (date > today) classes.push("future");
    if (done) classes.push("done");
    // 연속 달성(스트릭): 이틀 이상 이어지면 뒤에 옅은 바를 깔아서 이어 보이게
    // 줄의 처음/끝(일·토)에서는 끝을 둥글게 하지 않아서 다음 줄로 이어지는 느낌을 줌
    const prevDone = achieved(day - 1);
    const nextDone = achieved(day + 1);
    if (done && (prevDone || nextDone)) {
      classes.push("streak");
      if (!prevDone) classes.push("streak-start");
      if (!nextDone) classes.push("streak-end");
      if (col === 0) classes.push("row-start");
      if (col === 6) classes.push("row-end");
    }

    let ring = "";
    if (hasRecord || manual) {
      // 수동 기록은 칼로리 값이 없으니 링을 한 바퀴 점선으로 그려서 자동 계산(실선)과 구분
      const goalCal = goalsFor(date).calorie;
      const pct = manual ? 1 : (goalCal ? Math.min(cal / goalCal, 1) : 0);
      const state = done ? "done" : "over";
      ring = `
        <svg viewBox="0 0 40 40" class="cal-ring">
          <circle cx="20" cy="20" r="17" class="cal-ring-track"/>
          <circle cx="20" cy="20" r="17" class="cal-ring-progress ${state}${manual ? " manual" : ""}"
            stroke-dasharray="${manual ? CAL_RING_DASHED : CAL_RING_CIRCUMFERENCE}"
            stroke-dashoffset="${CAL_RING_CIRCUMFERENCE * (1 - pct)}"/>
        </svg>`;
    }
    const title = hasRecord ? `${m}월 ${day}일 · ${Math.round(cal)}kcal`
      : manual ? `${m}월 ${day}일 · 수동 기록(${manual === "success" ? "성공" : "실패"})`
      : `${m}월 ${day}일 · 기록 없음`;
    cells.push(`
      <button type="button" class="${classes.join(" ")}" data-cal-date="${date}" title="${title}"
        ${date > today ? "disabled" : ""}>
        <span class="cal-day${hasRecord || manual ? "" : " empty"}">${ring}<span class="cal-num">${day}</span></span>
      </button>`);
  }
  grid.innerHTML = cells.join("");

  grid.querySelectorAll("[data-cal-date]").forEach(btn => {
    attachLongPress(btn, () => onCalendarLongPress(btn));
    btn.addEventListener("click", () => {
      // 길게 누른 직후 따라오는 click은 무시 (홈으로 넘어가지 않게)
      if (btn.dataset.longPressed) { delete btn.dataset.longPressed; return; }
      setCurrentDate(btn.dataset.calDate);
      switchView("home");
    });
  });

  document.getElementById("cal-summary").textContent =
    achievedCount > 0 ? `${m}월 칼로리 목표 달성 ${achievedCount}일` : "";
}

// ---------- 달력 수동 기록 (식단을 못 적은 날의 성공/실패) ----------
const LONG_PRESS_MS = 500;

function manualDayRef(date) {
  return fb.doc(fb.db, "users", currentUser.uid, "manualDayStatus", date);
}

// 길게 누르기: 손가락이 조금만 움직여도(스크롤) 취소. 성공하면 뒤따르는 click을 막도록 표시해 둠
function attachLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0, startY = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    delete el.dataset.longPressed;
    startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      el.dataset.longPressed = "1";
      onLongPress();
    }, LONG_PRESS_MS);
  });
  el.addEventListener("pointermove", (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
  });
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault()); // 안드로이드 길게 누르기 메뉴 막기
}

async function onCalendarLongPress(btn) {
  const date = btn.dataset.calDate;
  if (!date || date > todayStr()) return;
  if (calendarTotals[date] !== undefined) return; // 식단 기록이 있는 날은 자동 계산만 (덮어쓰기 안 됨)
  if (navigator.vibrate) navigator.vibrate(10);
  if (calendarManual[date]) {
    // 이미 수동 표시한 날 → 바로 미기록으로 되돌림
    closeManualDayPopup();
    try {
      await fb.deleteDoc(manualDayRef(date));
    } catch (err) {
      alert("수동 기록을 지우지 못했어요: " + err.message);
    }
    return;
  }
  openManualDayPopup(btn);
}

let manualPopupDate = null;

function openManualDayPopup(btn) {
  manualPopupDate = btn.dataset.calDate;
  const popup = document.getElementById("manual-day-popup");
  popup.style.display = "block";
  document.getElementById("manual-day-backdrop").style.display = "block";
  // 누른 칸 바로 아래(공간이 없으면 위)에 띄우고, 화면 밖으로 나가지 않게 좌우를 맞춤
  const rect = btn.getBoundingClientRect();
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  const margin = 12;
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
  let top = rect.bottom + 6;
  if (top + ph > window.innerHeight - margin) top = rect.top - ph - 6;
  popup.style.left = `${left}px`;
  popup.style.top = `${Math.max(margin, top)}px`;
}

function closeManualDayPopup() {
  manualPopupDate = null;
  const popup = document.getElementById("manual-day-popup");
  if (!popup) return;
  popup.style.display = "none";
  document.getElementById("manual-day-backdrop").style.display = "none";
}

document.getElementById("manual-day-backdrop").addEventListener("click", closeManualDayPopup);
document.querySelectorAll("[data-manual-status]").forEach(b => {
  b.addEventListener("click", async () => {
    const date = manualPopupDate;
    const status = b.dataset.manualStatus;
    closeManualDayPopup();
    if (!date || calendarTotals[date] !== undefined) return;
    try {
      await fb.setDoc(manualDayRef(date), { date, status, updatedAt: fb.serverTimestamp() });
    } catch (err) {
      alert("수동 기록을 저장하지 못했어요: " + err.message);
    }
  });
});

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
