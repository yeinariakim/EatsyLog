// nutrition-api.js
// 식품의약품안전처 "식품영양성분DB정보" (공공데이터포털 데이터: 15127578)
// Base URL: https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02
//
// 1. data.go.kr 에서 이 API에 활용신청 → "일반 인증키" 발급
// 2. 아래 API_KEY 에 그 값을 그대로 넣으세요 (URL-encode 된 값 말고 일반 값으로)
// 3. 영양성분 필드는 AMT_NUM1(에너지), AMT_NUM3(단백질), AMT_NUM4(지방), AMT_NUM6(탄수화물)로
//    확인 완료했어요 (실제 응답으로 칼로리=단백질*4+지방*9+탄수화물*4 검산해서 일치 확인함).

const API_KEY = "86bb73bbe54495f5cf722d70be2212b842691659107bf625d0f48aa34ecc2d12";
const BASE_URL = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";

const AMT_FIELD = {
  calorie: "AMT_NUM1",  // 에너지 (kcal)
  protein: "AMT_NUM3",  // 단백질 (g)
  fat: "AMT_NUM4",      // 지방 (g)
  carb: "AMT_NUM6"      // 탄수화물 (g)
};

export async function searchFood(keyword, limit = 20) {
  if (!keyword.trim()) return { needsKey: false, results: [] };
  if (API_KEY === "YOUR_FOODSAFETY_API_KEY") {
    console.warn("식약처 API 키가 아직 설정되지 않았어요. js/nutrition-api.js 의 API_KEY를 채워주세요.");
    return { needsKey: true, results: [] };
  }

  const params = new URLSearchParams({
    serviceKey: API_KEY,
    type: "json",
    pageNo: "1",
    numOfRows: String(limit),
    FOOD_NM_KR: keyword
  });

  const url = `${BASE_URL}?${params.toString()}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const items = data?.body?.items || [];
    const list = Array.isArray(items) ? items : [items];

    const results = list.map(row => ({
      name: row.FOOD_NM_KR,
      calorie: parseFloat(row[AMT_FIELD.calorie]) || 0,
      protein: parseFloat(row[AMT_FIELD.protein]) || 0,
      fat: parseFloat(row[AMT_FIELD.fat]) || 0,
      carb: parseFloat(row[AMT_FIELD.carb]) || 0,
      // "1회 섭취참고량" — 이 음식의 표준 1회 분량 (예: "260.000g" → 260)
      servingSizeGrams: row.Z10500 ? parseFloat(String(row.Z10500).replace(/[^\d.]/g, "")) || null : null,
      dbClassCode: row.DB_CLASS_CM, // "01" 품목대표(원재료 자체), "02" 상용제품(브랜드), "03" 외식
      refName: row.FOOD_REF_NM || row.FOOD_NM_KR // 같은 종류로 묶는 기준 (예: "머핀", "마카롱")
    }));

    return { needsKey: false, results: groupAndRank(results, keyword) };
  } catch (err) {
    console.error("식품 검색 실패:", err);
    return { needsKey: false, results: [], error: true };
  }
}

// 같은 refName(음식 종류, 예: "머핀")끼리 묶어서 브랜드/제품별 중복을 하나의 평균값으로 합침
function groupByType(results) {
  const groups = new Map();
  for (const item of results) {
    const key = item.refName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const merged = [];
  for (const [refName, items] of groups) {
    if (items.length === 1) {
      merged.push(items[0]);
      continue;
    }
    const sum = items.reduce((acc, r) => {
      acc.calorie += r.calorie;
      acc.protein += r.protein;
      acc.fat += r.fat;
      acc.carb += r.carb;
      if (r.servingSizeGrams) { acc.servingSum += r.servingSizeGrams; acc.servingCount++; }
      return acc;
    }, { calorie: 0, protein: 0, fat: 0, carb: 0, servingSum: 0, servingCount: 0 });
    const n = items.length;
    const hasRaw = items.some(i => i.dbClassCode === "01");

    merged.push({
      name: `${refName} 평균`,
      calorie: Math.round(sum.calorie / n),
      protein: Math.round((sum.protein / n) * 10) / 10,
      fat: Math.round((sum.fat / n) * 10) / 10,
      carb: Math.round((sum.carb / n) * 10) / 10,
      servingSizeGrams: sum.servingCount ? Math.round(sum.servingSum / sum.servingCount) : null,
      dbClassCode: hasRaw ? "01" : "avg",
      refName
    });
  }
  return merged;
}

// 검색어와 정확히 같거나 "품목대표"(원재료 자체)인 항목을 브랜드 제품보다 위로 올림
function rankResults(results, keyword) {
  const scored = results.map(item => {
    let score = 0;
    const nameForMatch = item.refName || item.name;
    if (nameForMatch === keyword) score -= 100;
    else if (nameForMatch.startsWith(keyword)) score -= 40;
    else if (item.name.includes(keyword)) score -= 10;

    if (item.dbClassCode === "01") score -= 30;      // 품목대표
    else if (item.dbClassCode === "02") score -= 5;  // 상용제품

    // 원물/단순 재료는 보통 "카테고리_구체명" 형태가 아니라 짧고 밑줄 없는 이름이에요
    if (!item.name.includes("_")) score -= 15;

    score += item.name.length * 0.3; // 짧고 단순한 이름 우선
    return { item, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map(s => s.item);
}

function groupAndRank(results, keyword) {
  const grouped = groupByType(results);
  return rankResults(grouped, keyword).slice(0, 12);
}

// 100g 기준 영양성분을 실제 섭취 그램수에 맞게 환산
export function scaleNutrition(per100, grams) {
  const ratio = grams / 100;
  return {
    calorie: Math.round(per100.calorie * ratio),
    carb: Math.round(per100.carb * ratio * 10) / 10,
    protein: Math.round(per100.protein * ratio * 10) / 10,
    fat: Math.round(per100.fat * ratio * 10) / 10
  };
}
