// nutrition-api.js
// 식품의약품안전처 "식품영양성분DB정보" Open API 연동
// 1. data.go.kr 에서 "식품영양성분DB정보" 검색 후 활용신청 (승인까지 보통 몇 분~몇 시간)
// 2. 발급받은 인증키를 아래 API_KEY 에 넣으세요
// 3. 참고: 공공 API는 가끔 응답 필드명이 바뀌므로, 실제 키로 한 번 테스트 검색을 해보고
//    콘솔(개발자 도구)에 찍히는 raw response를 보면서 FIELD_MAP 을 맞춰야 할 수 있어요.
//    아래 매핑은 문서 기준 일반적인 필드명으로 짜둔 것이라 100% 보장은 아니에요.

const API_KEY = "YOUR_FOODSAFETY_API_KEY";
const BASE_URL = "https://openapi.foodsafetykorea.go.kr/api";
const SERVICE_ID = "I2790"; // 식품영양성분DB정보

// 실제 응답 필드명이 다르면 이 매핑만 고치면 됩니다.
const FIELD_MAP = {
  name: "DESC_KOR",       // 식품명
  calorie: "NUTR_CONT1",  // 열량 (kcal, 100g 기준)
  carb: "NUTR_CONT2",     // 탄수화물 (g)
  protein: "NUTR_CONT3",  // 단백질 (g)
  fat: "NUTR_CONT4"       // 지방 (g)
};

export async function searchFood(keyword, limit = 15) {
  if (!keyword.trim()) return [];
  if (API_KEY === "YOUR_FOODSAFETY_API_KEY") {
    console.warn("식약처 API 키가 아직 설정되지 않았어요. js/nutrition-api.js 의 API_KEY를 채워주세요.");
    return { needsKey: true, results: [] };
  }

  const url = `${BASE_URL}/${API_KEY}/${SERVICE_ID}/json/1/${limit}/DESC_KOR=${encodeURIComponent(keyword)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const rows = data?.[SERVICE_ID]?.row || [];

    return {
      needsKey: false,
      results: rows.map(row => ({
        name: row[FIELD_MAP.name],
        calorie: parseFloat(row[FIELD_MAP.calorie]) || 0,
        carb: parseFloat(row[FIELD_MAP.carb]) || 0,
        protein: parseFloat(row[FIELD_MAP.protein]) || 0,
        fat: parseFloat(row[FIELD_MAP.fat]) || 0
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
