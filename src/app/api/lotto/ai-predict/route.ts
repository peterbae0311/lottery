import { NextResponse } from 'next/server';

function uniformSample(count: number): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const result: number[] = [];
  while (result.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

function isValid(combo: number[]): boolean {
  const oddCount = combo.filter(n => n % 2 === 1).length;
  if (oddCount < 2 || oddCount > 4) return false;

  // Max 2 consecutive
  let consec = 1, maxConsec = 1;
  for (let i = 1; i < combo.length; i++) {
    if (combo[i] - combo[i - 1] === 1) { consec++; maxConsec = Math.max(maxConsec, consec); }
    else consec = 1;
  }
  if (maxConsec > 2) return false;

  // No 3-term AP with gap ≤ 5
  for (let i = 0; i < combo.length - 2; i++) {
    const g1 = combo[i + 1] - combo[i];
    const g2 = combo[i + 2] - combo[i + 1];
    if (g1 === g2 && g1 <= 5) return false;
  }

  // 끝자리 분산: 같은 끝자리 숫자 최대 2개
  const tailMap: Record<number, number> = {};
  for (const n of combo) {
    const tail = n % 10;
    tailMap[tail] = (tailMap[tail] ?? 0) + 1;
    if (tailMap[tail] > 2) return false;
  }

  return true;
}

function sharedCount(a: number[], b: number[]): number {
  const s = new Set(b);
  return a.filter(n => s.has(n)).length;
}

function generateCombinations(count: number, excludeNumbers: number[] = []): number[][] {
  const results: number[][] = [];
  for (let attempt = 0; attempt < 10000 && results.length < count; attempt++) {
    const raw = uniformSample(6).sort((a, b) => a - b);
    if (!isValid(raw)) continue;
    if (results.some(r => sharedCount(raw, r) > 2)) continue;
    // 직전 회차 제외: 이전 당첨번호와 3개 이상 겹치면 제외
    if (excludeNumbers.length > 0 && sharedCount(raw, excludeNumbers) >= 3) continue;
    results.push(raw);
  }
  return results;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const excludeNumbers: number[] = Array.isArray(body.excludeNumbers) ? body.excludeNumbers : [];
  const combinations = generateCombinations(5, excludeNumbers);
  if (combinations.length === 0) {
    return NextResponse.json({ success: false, error: '조합 생성 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { combinations } });
}
