// app.js
import { UNIT_PRESETS, getUnitById, computeGrams } from "./units.js";
import { searchFood, scaleNutrition } from "./nutrition-api.js";
import { setupNotifications } from "./notifications.js";

let fb; // firebase refs, set once firebase-config.js signals ready
let currentUser = null;
let currentDate = todayStr();     // "YYYY-MM-DD"
let goals = { calorie: 1450, protein: 105, carb: 40, fat: 95 };
let entriesUnsub = null;
let weightsUnsub = null;
let allWeights = [];
let allEntriesForTrend = []; // last 30 days, for the trend chart
let pendingMeal = null;      // which meal the food modal is adding to
let selectedFoodPer100 = null;
let referenceServingGrams = null; // this food's own "1회 섭취참고량", if the API provided one
let weightChart, trendChart;
let trendMode = "calorie";

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
      await loadGoals();
      subscribeToDate(currentDate);
      subscribeToWeights();
      setupNotifications(fb.app, fb.db, fb, currentUser.uid);
    } else {
      currentUser = null;
      document.getElementById("app").style.display = "none";
      document.getElementById("auth-screen").style.display = "block";
      if (entriesUnsub) entriesUnsub();
      if (weightsUnsub) weightsUnsub();
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
document.getElementById("logout-btn").addEventListener("click", async () => {
  await fb.signOut(fb.auth);
  closeModal("settings-modal");
});

// ---------- Goals / Settings ----------
async function loadGoals() {
  const snap = await fb.getDoc(fb.doc(fb.db, "users", currentUser.uid));
  if (snap.exists() && snap.data().goals) {
    goals = snap.data().goals;
  } else {
    await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid), { goals }, { merge: true });
  }
  document.getElementById("goal-calorie").value = goals.calorie;
  document.getElementById("goal-protein").value = goals.protein;
  document.getElementById("goal-carb").value = goals.carb;
  document.getElementById("goal-fat").value = goals.fat;
  renderGauges();
}

document.getElementById("settings-btn").addEventListener("click", () => openModal("settings-modal"));
document.getElementById("settings-close").addEventListener("click", () => closeModal("settings-modal"));

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  goals = {
    calorie: Number(document.getElementById("goal-calorie").value),
    protein: Number(document.getElementById("goal-protein").value),
    carb: Number(document.getElementById("goal-carb").value),
    fat: Number(document.getElementById("goal-fat").value)
  };
  await fb.setDoc(fb.doc(fb.db, "users", currentUser.uid), { goals }, { merge: true });
  renderGauges();
  closeModal("settings-modal");
});

// ---------- Date navigation ----------
document.getElementById("date-prev").addEventListener("click", () => {
  currentDate = addDays(currentDate, -1);
  document.getElementById("current-date-label").textContent = formatDateLabel(currentDate);
  subscribeToDate(currentDate);
});
document.getElementById("date-next").addEventListener("click", () => {
  if (currentDate >= todayStr()) return;
  currentDate = addDays(currentDate, 1);
  document.getElementById("current-date-label").textContent = formatDateLabel(currentDate);
  subscribeToDate(currentDate);
});

// ---------- Entries (meals) ----------
function subscribeToDate(dateStr) {
  if (entriesUnsub) entriesUnsub();
  const q = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "entries"),
    fb.where("date", "==", dateStr)
  );
  entriesUnsub = fb.onSnapshot(q, (snap) => {
    const entries = [];
    snap.forEach(docSnap => entries.push({ id: docSnap.id, ...docSnap.data() }));
    renderMeals(entries);
    renderGauges(entries);
  });
}

function renderMeals(entries) {
  ["breakfast", "lunch", "dinner", "snack"].forEach(meal => {
    const list = document.querySelector(`[data-meal-list="${meal}"]`);
    const items = entries.filter(e => e.meal === meal);
    if (items.length === 0) {
      list.innerHTML = `<li class="food-list-empty">아직 기록이 없어요</li>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <li>
        <span class="food-name">${escapeHtml(item.name)}</span>
        <span class="food-macro">${item.calorie}kcal · 탄${item.carb} 단${item.protein} 지${item.fat}</span>
        <button class="food-remove" data-remove="${item.id}">삭제</button>
      </li>
    `).join("");
  });

  document.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fb.deleteDoc(fb.doc(fb.db, "users", currentUser.uid, "entries", btn.dataset.remove));
    });
  });
}

function renderGauges(entries = []) {
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
    const goal = goals[metric] || 1;
    const pct = Math.min(value / goal, 1);
    const ring = document.querySelector(`[data-ring="${metric}"]`);
    ring.style.strokeDashoffset = circumference - (pct * circumference);
    ring.classList.toggle("over", metric === "carb" ? value > goal : false);

    document.querySelector(`[data-value="${metric}"]`).textContent = Math.round(value);
    const goalEl = document.querySelector(`[data-goal="${metric}"]`);
    goalEl.textContent = metric === "carb" ? `/ ${goal} 이하` : `/ ${goal}`;
  });

  renderSummary(totals);
}

function renderSummary(totals) {
  const summaryEl = document.getElementById("daily-summary");
  const carbOk = totals.carb <= goals.carb;
  const proteinOk = totals.protein >= goals.protein * 0.9;
  const fatOk = totals.fat >= goals.fat * 0.85 && totals.fat <= goals.fat * 1.15;
  const calorieOk = totals.calorie >= goals.calorie * 0.9 && totals.calorie <= goals.calorie * 1.1;

  if (totals.calorie === 0) {
    summaryEl.textContent = "기록을 시작해보세요";
  } else if (carbOk && proteinOk && fatOk && calorieOk) {
    summaryEl.textContent = "오늘 목표 달성! 🎉";
  } else if (totals.carb > goals.carb) {
    summaryEl.textContent = `탄수화물이 목표보다 ${Math.round(totals.carb - goals.carb)}g 많아요`;
  } else {
    summaryEl.textContent = "오늘 기록 진행 중이에요";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.style.display = "none");
    document.getElementById(`view-${btn.dataset.view}`).style.display = "block";
    if (btn.dataset.view === "weight") renderWeightChart();
    if (btn.dataset.view === "trend") loadTrendData();
  });
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
  selectedFoodPer100 = null;
  referenceServingGrams = null;
}

document.getElementById("food-search-btn").addEventListener("click", doFoodSearch);
document.getElementById("food-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); doFoodSearch(); }
});

async function doFoodSearch() {
  const keyword = document.getElementById("food-search").value.trim();
  const resultsEl = document.getElementById("search-results");
  resultsEl.innerHTML = `<li>검색 중...</li>`;

  // 이 API는 입력한 순서 그대로 포함되는 문자열만 찾기 때문에,
  // "삶은 계란"처럼 입력해도 실제 음식명이 "계란_삶은것"이면 못 찾는 경우가 많아요.
  // 그래서 띄어쓰기로 나눠서 단어별로도 순서대로 다시 시도해봐요.
  const words = keyword.split(/\s+/).filter(Boolean);
  const attempts = [keyword, ...words.slice().sort((a, b) => b.length - a.length)];
  const tried = new Set();

  let finalResults = [];
  let needsKeyFlag = false;

  for (const attempt of attempts) {
    if (!attempt || tried.has(attempt)) continue;
    tried.add(attempt);
    const { results, needsKey } = await searchFood(attempt);
    if (needsKey) { needsKeyFlag = true; break; }
    if (results.length > 0) { finalResults = results; break; }
  }

  if (needsKeyFlag) {
    resultsEl.innerHTML = `<li>식약처 API 키가 아직 설정되지 않았어요. 키를 넣기 전까지는 아래 "직접 입력"이나 즐겨찾기를 이용해주세요.</li>`;
    return;
  }
  if (finalResults.length === 0) {
    resultsEl.innerHTML = `<li>검색 결과가 없어요. 다른 단어로 시도하거나 직접 입력해보세요.</li>`;
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

function selectFood(food) {
  selectedFoodPer100 = food;
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
  document.getElementById("serving-count").value = 1;
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
  document.getElementById("computed-macros").innerHTML =
    `<span>${macros.calorie}kcal</span><span>탄 ${macros.carb}g</span><span>단 ${macros.protein}g</span><span>지 ${macros.fat}g</span>`;
}

document.getElementById("add-food-btn").addEventListener("click", async () => {
  if (!selectedFoodPer100) return;
  const unitId = document.getElementById("serving-unit").value;
  const count = Number(document.getElementById("serving-count").value) || 0;
  const grams = gramsForSelectedUnit(unitId, count);
  const macros = scaleNutrition(selectedFoodPer100, grams);
  await addEntry({ name: selectedFoodPer100.name, ...macros });
  closeModal("food-modal");
});

// ---------- Manual entry ----------
document.getElementById("manual-entry-btn").addEventListener("click", () => {
  const el = document.getElementById("manual-entry");
  el.style.display = el.style.display === "none" ? "flex" : "none";
});

document.getElementById("manual-add-btn").addEventListener("click", async () => {
  const name = document.getElementById("manual-name").value.trim();
  const calorie = Number(document.getElementById("manual-calorie").value) || 0;
  const protein = Number(document.getElementById("manual-protein").value) || 0;
  const carb = Number(document.getElementById("manual-carb").value) || 0;
  const fat = Number(document.getElementById("manual-fat").value) || 0;
  if (!name) return;

  await addEntry({ name, calorie, protein, carb, fat });

  if (document.getElementById("manual-favorite").checked) {
    await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "favorites"), {
      name, calorie, protein, carb, fat
    });
  }
  closeModal("food-modal");
});

async function addEntry({ name, calorie, protein, carb, fat }) {
  await fb.addDoc(fb.collection(fb.db, "users", currentUser.uid, "entries"), {
    date: currentDate,
    meal: pendingMeal,
    name, calorie, protein, carb, fat,
    createdAt: fb.serverTimestamp()
  });
}

// ---------- Favorites ----------
async function loadFavorites() {
  const q = fb.query(fb.collection(fb.db, "users", currentUser.uid, "favorites"), fb.orderBy("name"));
  const listEl = document.getElementById("favorites-list");
  fb.onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<li style="cursor:default">즐겨찾기한 음식이 없어요</li>`;
      return;
    }
    const favs = [];
    snap.forEach(d => favs.push({ id: d.id, ...d.data() }));
    listEl.innerHTML = favs.map((f, i) => `
      <li data-fav-idx="${i}">
        <span>${escapeHtml(f.name)}</span>
        <span class="fav-macro">${f.calorie}kcal</span>
      </li>
    `).join("");
    listEl.querySelectorAll("li[data-fav-idx]").forEach(li => {
      li.addEventListener("click", async () => {
        const f = favs[Number(li.dataset.favIdx)];
        await addEntry({ name: f.name, calorie: f.calorie, protein: f.protein, carb: f.carb, fat: f.fat });
        closeModal("food-modal");
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

// ---------- Trend ----------
document.querySelectorAll(".trend-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".trend-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    trendMode = btn.dataset.trend;
    renderTrendChart();
  });
});

async function loadTrendData() {
  const startDate = addDays(todayStr(), -29);
  const q = fb.query(
    fb.collection(fb.db, "users", currentUser.uid, "entries"),
    fb.where("date", ">=", startDate)
  );
  const snap = await new Promise(resolve => {
    const unsub = fb.onSnapshot(q, (s) => { resolve(s); unsub(); });
  });
  allEntriesForTrend = [];
  snap.forEach(d => allEntriesForTrend.push(d.data()));
  renderTrendChart();
}

function renderTrendChart() {
  const ctx = document.getElementById("trend-chart");
  if (!ctx || typeof Chart === "undefined") return;

  const days = [];
  for (let i = 29; i >= 0; i--) days.push(addDays(todayStr(), -i));

  const byDate = {};
  days.forEach(d => byDate[d] = { calorie: 0, protein: 0, carb: 0, fat: 0 });
  allEntriesForTrend.forEach(e => {
    if (byDate[e.date]) {
      byDate[e.date].calorie += e.calorie || 0;
      byDate[e.date].protein += e.protein || 0;
      byDate[e.date].carb += e.carb || 0;
      byDate[e.date].fat += e.fat || 0;
    }
  });

  if (trendChart) trendChart.destroy();

  if (trendMode === "calorie") {
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: days.map(d => d.slice(5)),
        datasets: [{
          data: days.map(d => byDate[d].calorie),
          borderColor: "#5B7B6C",
          backgroundColor: "rgba(91,123,108,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          annotation: undefined
        },
        scales: { x: { ticks: { maxTicksLimit: 6 } } }
      }
    });
  } else {
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: days.map(d => d.slice(5)),
        datasets: [
          { label: "탄수화물", data: days.map(d => byDate[d].carb), borderColor: "#B8763E", tension: 0.3, pointRadius: 0 },
          { label: "단백질", data: days.map(d => byDate[d].protein), borderColor: "#5B7B6C", tension: 0.3, pointRadius: 0 },
          { label: "지방", data: days.map(d => byDate[d].fat), borderColor: "#8FA89A", tension: 0.3, pointRadius: 0 }
        ]
      },
      options: {
        plugins: { legend: { display: true, position: "bottom" } },
        scales: { x: { ticks: { maxTicksLimit: 6 } } }
      }
    });
  }
}

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
