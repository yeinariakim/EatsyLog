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

export async function searchFood(keyword, limit = 30) {
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
      dbClassCode: row.DB_CLASS_CM // "01" 품목대표(원재료 자체), "02" 상용제품(브랜드), "03" 외식
    }));

    return { needsKey: false, results: rankResults(results, keyword) };
  } catch (err) {
    console.error("식품 검색 실패:", err);
    return { needsKey: false, results: [], error: true };
  }
}

// 검색어와 정확히 같거나 "품목대표"(원재료 자체)인 항목을 브랜드 제품보다 위로 올림
function rankResults(results, keyword) {
  const scored = results.map(item => {
    let score = 0;
    if (item.name === keyword) score -= 100;
    else if (item.name.startsWith(keyword)) score -= 40;
    else if (item.name.includes(keyword)) score -= 10;

    if (item.dbClassCode === "01") score -= 30;      // 품목대표
    else if (item.dbClassCode === "02") score -= 5;  // 상용제품

    score += item.name.length * 0.5; // 짧고 단순한 이름 우선
    return { item, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 15).map(s => s.item);
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
