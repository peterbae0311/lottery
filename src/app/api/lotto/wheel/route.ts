import { NextRequest, NextResponse } from 'next/server';
import {
  generateFullWheel, generateBudgetWheel, computeWheelCoverage, scoreCombo,
} from '@/lib/lotto-engine';

function comb6(n: number): number {
  // C(n, 6)
  if (n < 6) return 0;
  return Math.round(
    (n * (n-1) * (n-2) * (n-3) * (n-4) * (n-5)) / 720
  );
}

export async function POST(req: NextRequest) {
  let body: {
    numbers?: number[];
    type?: 'full' | 'budget';
    budget?: number;
    bonusNumbers?: number[];
    topFreqNums?: number[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  const { numbers = [], type = 'full', budget, bonusNumbers = [], topFreqNums = [] } = body;

  if (!Array.isArray(numbers) || numbers.length < 7 || numbers.length > 12) {
    return NextResponse.json({ success: false, error: '번호는 7~12개 선택하세요' }, { status: 422 });
  }
  const sorted = [...new Set(numbers.filter(n => n >= 1 && n <= 45))].sort((a, b) => a - b);
  if (sorted.length !== numbers.length) {
    return NextResponse.json({ success: false, error: '중복 또는 유효하지 않은 번호가 있습니다' }, { status: 422 });
  }

  const fullWheelSize = comb6(sorted.length);

  let combos: number[][];
  if (type === 'full') {
    if (fullWheelSize > 924) {
      return NextResponse.json({ success: false, error: '풀 휠링은 최대 12개(924조합)까지 가능합니다' }, { status: 422 });
    }
    combos = generateFullWheel(sorted);
  } else {
    const b = Math.min(Math.max(Number(budget ?? 10), 1), 50);
    combos = generateBudgetWheel(sorted, b, bonusNumbers, topFreqNums);
  }

  // 점수 내림차순 정렬
  const scored = combos
    .map(c => ({ combo: c, score: scoreCombo(c, bonusNumbers, topFreqNums) }))
    .sort((a, b) => b.score - a.score);

  const coverage = computeWheelCoverage(sorted, combos);

  return NextResponse.json({
    success: true,
    data: {
      combos: scored.map(s => s.combo),
      scores: scored.map(s => s.score),
      totalCombos: combos.length,
      fullWheelSize,
      coverage,
    },
  });
}
