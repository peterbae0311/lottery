import { NextResponse } from 'next/server';

function uniformSample(pool: number[]): number[] {
  const p = [...pool];
  const result: number[] = [];
  while (result.length < 6 && p.length > 0) {
    const idx = Math.floor(Math.random() * p.length);
    result.push(p[idx]);
    p.splice(idx, 1);
  }
  return result;
}

function getMaxConsecRun(combo: number[]): number {
  let maxRun = 1, curRun = 1;
  for (let i = 1; i < combo.length; i++) {
    if (combo[i] - combo[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
    else curRun = 1;
  }
  return maxRun;
}

function sharedCount(a: number[], b: number[]): number {
  const s = new Set(b);
  return a.filter(n => s.has(n)).length;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode: string = typeof body.mode === 'string' ? body.mode : 'random';
  const maxCount = mode === 'anchor' ? 350 : 100;
  const count = Math.min(Math.max(Number(body.count ?? 5), 1), maxCount);

  const fullPool = Array.from({ length: 45 }, (_, i) => i + 1);

  if (mode === 'random') {
    const combinations: number[][] = Array.from({ length: count }, () =>
      uniformSample(fullPool).sort((a, b) => a - b)
    );
    return NextResponse.json({ success: true, data: { combinations } });
  }

  if (mode === 'no-consec') {
    const combinations: number[][] = [];
    for (let attempt = 0; attempt < 20000 && combinations.length < count; attempt++) {
      const raw = uniformSample(fullPool).sort((a, b) => a - b);
      if (getMaxConsecRun(raw) !== 1) continue;
      if (combinations.some(r => sharedCount(raw, r) > 2)) continue;
      combinations.push(raw);
    }
    return NextResponse.json({ success: true, data: { combinations } });
  }

  if (mode === 'two-consec') {
    const combinations: number[][] = [];
    for (let attempt = 0; attempt < 20000 && combinations.length < count; attempt++) {
      const raw = uniformSample(fullPool).sort((a, b) => a - b);
      if (getMaxConsecRun(raw) !== 2) continue;
      if (combinations.some(r => sharedCount(raw, r) > 2)) continue;
      combinations.push(raw);
    }
    return NextResponse.json({ success: true, data: { combinations } });
  }

  if (mode === 'anchor') {
    const anchorNums: number[] = Array.isArray(body.anchorNumbers)
      ? (body.anchorNumbers as unknown[]).filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 45)
      : [];

    if (anchorNums.length < 2 || anchorNums.length > 5) {
      return NextResponse.json({ success: false, error: '앵커 번호 2~5개 필요' }, { status: 422 });
    }

    const anchorSet = new Set(anchorNums);
    const pool = fullPool.filter(n => !anchorSet.has(n));
    const fillCount = 6 - anchorNums.length;
    const combinations: number[][] = [];
    const usedFills = new Set<string>();
    const maxFillOverlap = Math.max(0, fillCount - 2);

    // 2등 전략: 보너스 후보 번호를 fill 슬롯에 강제 포함 (전체의 30%)
    const bonusCandidates: number[] = Array.isArray(body.bonusNumbers)
      ? (body.bonusNumbers as unknown[])
          .filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 45 && !anchorSet.has(n))
          .slice(0, 5)
      : [];

    const bonusTarget = bonusCandidates.length > 0 && fillCount >= 2
      ? Math.max(bonusCandidates.length, Math.floor(count * 0.3))
      : 0;

    // Phase 1A: 각 보너스 후보 번호를 포함하는 조합 생성 (2등 전략)
    for (const bc of bonusCandidates) {
      const reducedPool = pool.filter(n => n !== bc);
      const perCandidate = Math.ceil(bonusTarget / bonusCandidates.length);
      let bcCount = 0;
      for (let attempt = 0; attempt < 10000 && bcCount < perCandidate; attempt++) {
        const extraFill: number[] = [];
        const poolCopy = [...reducedPool];
        while (extraFill.length < fillCount - 1 && poolCopy.length > 0) {
          const idx = Math.floor(Math.random() * poolCopy.length);
          extraFill.push(poolCopy[idx]);
          poolCopy.splice(idx, 1);
        }
        const sortedFill = [bc, ...extraFill].sort((a, b) => a - b);
        const fillKey = sortedFill.join(',');
        if (usedFills.has(fillKey)) continue;
        const prevFills = combinations.map(c => c.filter(n => !anchorSet.has(n)));
        if (prevFills.some(pf => sharedCount(sortedFill, pf) > maxFillOverlap)) continue;
        usedFills.add(fillKey);
        combinations.push([...anchorNums, ...sortedFill].sort((a, b) => a - b));
        bcCount++;
      }
    }

    // Phase 1B: 일반 조합 생성 (다양성 필터 포함)
    const PHASE1_ATTEMPTS = 40000;
    for (let attempt = 0; attempt < PHASE1_ATTEMPTS && combinations.length < count; attempt++) {
      const poolCopy = [...pool];
      const fill: number[] = [];
      while (fill.length < fillCount && poolCopy.length > 0) {
        const idx = Math.floor(Math.random() * poolCopy.length);
        fill.push(poolCopy[idx]);
        poolCopy.splice(idx, 1);
      }
      const sortedFill = [...fill].sort((a, b) => a - b);
      const fillKey = sortedFill.join(',');
      if (usedFills.has(fillKey)) continue;
      const prevFills = combinations.map(c => c.filter(n => !anchorSet.has(n)));
      if (prevFills.some(pf => sharedCount(sortedFill, pf) > maxFillOverlap)) continue;
      usedFills.add(fillKey);
      combinations.push([...anchorNums, ...fill].sort((a, b) => a - b));
    }

    // Phase 2: 폴백 (완전중복 방지만)
    if (combinations.length < count) {
      const PHASE2_ATTEMPTS = 20000;
      for (let attempt = 0; attempt < PHASE2_ATTEMPTS && combinations.length < count; attempt++) {
        const poolCopy = [...pool];
        const fill: number[] = [];
        while (fill.length < fillCount && poolCopy.length > 0) {
          const idx = Math.floor(Math.random() * poolCopy.length);
          fill.push(poolCopy[idx]);
          poolCopy.splice(idx, 1);
        }
        const fillKey = [...fill].sort((a, b) => a - b).join(',');
        if (usedFills.has(fillKey)) continue;
        usedFills.add(fillKey);
        combinations.push([...anchorNums, ...fill].sort((a, b) => a - b));
      }
    }

    if (combinations.length === 0) {
      return NextResponse.json({ success: false, error: '조합 생성 실패' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { combinations } });
  }

  return NextResponse.json({ success: false, error: '알 수 없는 모드' }, { status: 400 });
}
