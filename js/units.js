// units.js
// 저울 없이 편하게 입력하기 위한 기본 계량 단위 프리셋.
// "그램 수를 모르는" 문제를 해결하기 위해, 일반적인 1인분/숟갈 단위를 g으로 환산합니다.
// 사용자가 "내 기준"으로 값을 바꾸면 즐겨찾기에 그 값으로 저장됩니다 (app.js 참고).

export const UNIT_PRESETS = [
  { id: "bowl_rice", label: "밥 1공기", grams: 210 },
  { id: "bowl_soup", label: "국/찌개 1대접", grams: 300 },
  { id: "plate", label: "1접시", grams: 250 },
  { id: "egg", label: "계란 1개", grams: 50 },
  { id: "piece_meat", label: "고기 1덩이(손바닥 크기)", grams: 100 },
  { id: "cup", label: "1컵", grams: 200 },
  { id: "tbsp", label: "1큰술(스푼)", grams: 15 },
  { id: "tsp", label: "1작은술", grams: 5 },
  { id: "handful", label: "1줌", grams: 30 },
  { id: "slice", label: "1조각/1장", grams: 30 },
  { id: "gram", label: "직접 g 입력", grams: 1 }
];

export function getUnitById(id) {
  return UNIT_PRESETS.find(u => u.id === id) || UNIT_PRESETS[UNIT_PRESETS.length - 1];
}

export function computeGrams(unitId, count) {
  const unit = getUnitById(unitId);
  return Math.round(unit.grams * count);
}
