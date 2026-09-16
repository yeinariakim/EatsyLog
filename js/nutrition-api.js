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

export async function searchFood(keyword, limit = 15) {
  if (!keyword.trim()) return { needsKey: false, results: [] };
  if (API_KEY === "YOUR_FOODSAFETY_API_KEY") {
    console.warn("식약처 API 키가 필요해요.");
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

    return {
      needsKey: false,
      results: list.map(row => ({
        name: row.FOOD_NM_KR,
        calorie: parseFloat(row[AMT_FIELD.calorie]) || 0,
        protein: parseFloat(row[AMT_FIELD.protein]) || 0,
        fat: parseFloat(row[AMT_FIELD.fat]) || 0,
        carb: parseFloat(row[AMT_FIELD.carb]) || 0
      }))
    };
  } catch (err) {
    console.error("식품 검색 실패:", err);
    return { needsKey: false, results: [], error: true };
  }
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
