// units.js
// 저울 없이 편하게 입력하기 위한 기본 계량 단위 프리셋.
// "그램 수를 모르는" 문제를 해결하기 위해, 일반적인 1인분/숟갈 단위를 g으로 환산합니다.
// 사용자가 "내 기준"으로 값을 바꾸면 즐겨찾기에 그 값으로 저장됩니다 (app.js 참고).

export const UNIT_PRESETS = [
  { id: "bowl_rice", label: "밥 1공기", grams: 210 },
  { id: "bowl_soup", label: "국/찌개 1대접", grams: 300 },
  { id: "roll_gimbap", label: "김밥 1줄", grams: 300 },
  { id: "egg", label: "계란 1개", grams: 50 },
  { id: "fruit_piece", label: "과일 1개(중간크기)", grams: 150 },
  { id: "piece_generic", label: "1개", grams: 80 },
  { id: "cup", label: "1컵", grams: 200 },
  { id: "tbsp", label: "1큰술(스푼)", grams: 15 },
  { id: "slice", label: "1조각/1장", grams: 30 },
  { id: "gram", label: "직접 g 입력", grams: 1 }
];

// 음식 이름을 보고 그 음식에서 실제로 많이 쓰는 단위를 기본으로 골라줌
const DEFAULT_UNIT_RULES = [
  { keywords: ["김밥"], unitId: "roll_gimbap", count: 1 },
  { keywords: ["라면", "국수", "우동", "짬뽕", "파스타"], unitId: "bowl_soup", count: 1 },
  { keywords: ["국", "찌개", "탕", "수프"], unitId: "bowl_soup", count: 1 },
  { keywords: ["볶음밥", "덮밥", "비빔밥", "밥"], unitId: "bowl_rice", count: 1 },
  { keywords: ["계란", "달걀"], unitId: "egg", count: 2 },
  { keywords: ["빵", "토스트", "샌드위치"], unitId: "slice", count: 1 },
  { keywords: ["머핀", "마카롱", "쿠키", "베이글", "만두", "찐빵"], unitId: "piece_generic", count: 1 },
  { keywords: ["사과", "바나나", "배", "오렌지", "귤", "키위", "복숭아", "자두", "감"], unitId: "fruit_piece", count: 1 }
];

export function guessDefaultUnit(foodName) {
  for (const rule of DEFAULT_UNIT_RULES) {
    if (rule.keywords.some(k => foodName.includes(k))) {
      return { unitId: rule.unitId, count: rule.count };
    }
  }
  return { unitId: "gram", count: 100 };
}

export function getUnitById(id) {
  return UNIT_PRESETS.find(u => u.id === id) || UNIT_PRESETS[UNIT_PRESETS.length - 1];
}

export function computeGrams(unitId, count) {
  const unit = getUnitById(unitId);
  return Math.round(unit.grams * count);
}
