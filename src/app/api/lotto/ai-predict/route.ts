import { NextRequest, NextResponse } from 'next/server';

function weightedSample(count: number): number[] {
  const pool: [number, number][] = [];
  for (let i = 1; i <= 31; i++) pool.push([i, 1]);
  for (let i = 32; i <= 45; i++) pool.push([i, 3]);

  const result: number[] = [];
  const available = [...pool];

  while (result.length < count && available.length > 0) {
    const total = available.reduce((s, [, w]) => s + w, 0);
    const r = Math.random() * total;
    let cumulative = 0;
    for (let i = 0; i < available.length; i++) {
      cumulative += available[i][1];
      if (r <= cumulative) {
        result.push(available[i][0]);
        available.splice(i, 1);
        break;
      }
    }
  }
  return result;
}

function isValid(combo: number[], lastDrawSet: Set<number>): boolean {
  const sum = combo.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;

  const oddCount = combo.filter(n => n % 2 === 1).length;
  if (oddCount < 2 || oddCount > 4) return false;

  if (combo.filter(n => n <= 31).length > 3) return false;

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

  // 직전 회차 제외: 직전 당첨번호와 4개 이상 겹치면 제외
  if (lastDrawSet.size > 0) {
    const shared = combo.filter(n => lastDrawSet.has(n)).length;
    if (shared >= 4) return false;
  }

  return true;
}

function sharedCount(a: number[], b: number[]): number {
  const s = new Set(b);
  return a.filter(n => s.has(n)).length;
}

function generateCombinations(count: number, lastDrawSet: Set<number>): number[][] {
  const results: number[][] = [];
  for (let attempt = 0; attempt < 10000 && results.length < count; attempt++) {
    const raw = weightedSample(6).sort((a, b) => a - b);
    if (isValid(raw, lastDrawSet) && !results.some(r => sharedCount(raw, r) > 3)) {
      results.push(raw);
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  let body: { lastDrawNumbers?: number[] } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const lastDrawSet = new Set<number>(
    (body.lastDrawNumbers ?? []).filter(n => typeof n === 'number' && n >= 1 && n <= 45)
  );

  const combinations = generateCombinations(5, lastDrawSet);
  if (combinations.length === 0) {
    return NextResponse.json({ success: false, error: '조합 생성 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { combinations } });
}
