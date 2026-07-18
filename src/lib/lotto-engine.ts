// Shared computation engine — pure functions, no I/O

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LottoRow {
  round: number;
  draw_date: string;
  num1: number;
  num2: number;
  num3: number;
  num4: number;
  num5: number;
  num6: number;
  bonus1: number | null;
  first_prize_winners: number | null;
  first_prize_amount: number | null;
}

export type GenerationMode = 'anchor2' | 'anchor3' | 'anchor' | 'no-consec' | 'two-consec' | 'random';

export interface FilterParams {
  conditionType: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  years?: number;
  months?: number;
  maxWinners?: number;
  maxPrizeAmt?: number;
  maxConsec?: number; // 0=없음, 2=2개, 3+=3이상
  oddCount?: number;
  sumMin?: number;
  sumMax?: number;
  minAC?: number;     // conditionType 7: AC값 하한 (0~10)
}

export interface GenerateParams {
  count: number;
  anchorNumbers?: number[];
  bonusNumbers?: number[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreCombo(combo: number[], bonusCandidates: number[] = [], topFreqNums: number[] = []): number {
  const s = [...combo].sort((a, b) => a - b);
  let score = 0;

  // 밴드 커버리지 (3밴드=5, 4밴드=10, 5밴드=15)
  const bandCount = [
    s.some(n => n <= 9), s.some(n => n >= 10 && n <= 19),
    s.some(n => n >= 20 && n <= 29), s.some(n => n >= 30 && n <= 39),
    s.some(n => n >= 40),
  ].filter(Boolean).length;
  score += Math.max(0, (bandCount - 2) * 5);

  // 홀짝 균형 (실제 당첨 분포 반영: 3:3=20, 2:4=15, 1:5=6)
  const odds = s.filter(n => n % 2 === 1).length;
  const oddDev = Math.abs(odds - 3);
  score += oddDev === 0 ? 20 : oddDev === 1 ? 15 : oddDev === 2 ? 6 : 0;

  // 합계 범위 (평균 138 기준: ±1σ +20, ±1.5σ +10)
  const sum = s.reduce((a, b) => a + b, 0);
  if (sum >= 108 && sum <= 168) score += 20;
  else if (sum >= 93 && sum <= 183) score += 10;

  // 끝자리 다양성 (max 15)
  const tails = new Set(s.map(n => n % 10));
  score += Math.min(tails.size * 3, 15);

  // 연속쌍 3개 이상 페널티
  let consecPairs = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i + 1] - s[i] === 1) consecPairs++;
  }
  if (consecPairs >= 3) score -= 10;

  // 2등 전략: 보너스 후보 포함 시 가점
  const bonusSet = new Set(bonusCandidates);
  score += combo.filter(n => bonusSet.has(n)).length * 5;

  // 3등 전략: 빈도 상위 포함 시 가점
  const freqSet = new Set(topFreqNums);
  score += combo.filter(n => freqSet.has(n)).length * 2;

  return score;
}

export function selectExpertPicks(
  combos: number[][],
  anchorNums: number[] = [],
  bonusCandidates: number[] = [],
  topFreqNums: number[] = [],
): number[][] {
  if (combos.length <= 5) return combos;
  const anchorSet = new Set(anchorNums);
  const scored = [...combos]
    .map((combo, i) => ({
      combo, i,
      // Math.random() * 10 노이즈: 비슷한 점수 조합의 풀 진입 순위를 매 호출마다 다르게
      // → 상위 20개 후보가 달라지고 그리디 결과도 달라짐
      score: scoreCombo(combo, bonusCandidates, topFreqNums)
        + combo.filter(n => anchorSet.has(n)).length * 5
        + Math.random() * 10,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  // 상위 20개(최소 15%) 후보 추출
  const poolSize = Math.min(scored.length, Math.max(20, Math.ceil(scored.length * 0.15)));
  const pool = scored.slice(0, poolSize);

  // 다양성 우선 그리디 선택
  const selected: number[][] = [];
  const remaining = [...pool];
  while (selected.length < 5 && remaining.length > 0) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const penalty = selected.reduce((pen, sel) => {
        const shared = remaining[i].combo.filter(n => sel.includes(n)).length;
        return pen + Math.max(0, shared - 2) * 8;
      }, 0);
      const adj = remaining[i].score - penalty;
      if (adj > bestAdj) { bestAdj = adj; bestIdx = i; }
    }
    selected.push(remaining[bestIdx].combo);
    remaining.splice(bestIdx, 1);
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Prize
// ---------------------------------------------------------------------------

export function getPrizeTier(matchCount: number, bonusMatch: boolean): string {
  if (matchCount === 6) return '1등';
  if (matchCount === 5 && bonusMatch) return '2등';
  if (matchCount === 5) return '3등';
  if (matchCount === 4) return '4등';
  if (matchCount === 3) return '5등';
  return '낙첨';
}

// 평균 당첨금 (ROI 추정용)
const PRIZE_AMOUNTS: Record<string, number> = {
  '1등': 2_000_000_000,
  '2등': 60_000_000,
  '3등': 1_500_000,
  '4등': 50_000,
  '5등': 5_000,
  '낙첨': 0,
};

export function calcROI(gameTiers: string[], costPerGame = 1000): number {
  const totalCost = gameTiers.length * costPerGame;
  const totalPrize = gameTiers.reduce((s, t) => s + (PRIZE_AMOUNTS[t] ?? 0), 0);
  return totalCost === 0 ? 0 : (totalPrize - totalCost) / totalCost * 100;
}

// ---------------------------------------------------------------------------
// Wheeling System
// ---------------------------------------------------------------------------

// Full wheel: chosen 숫자의 모든 C(n,6) 조합 (n=7~12)
export function generateFullWheel(numbers: number[]): number[][] {
  const s = [...numbers].sort((a, b) => a - b);
  const n = s.length;
  const result: number[][] = [];
  for (let a = 0; a < n - 5; a++)
    for (let b = a + 1; b < n - 4; b++)
      for (let c = b + 1; c < n - 3; c++)
        for (let d = c + 1; d < n - 2; d++)
          for (let e = d + 1; e < n - 1; e++)
            for (let f = e + 1; f < n; f++)
              result.push([s[a], s[b], s[c], s[d], s[e], s[f]]);
  return result;
}

// Budget wheel: 예산 내에서 커버리지 최대화 (다양성 우선 그리디)
export function generateBudgetWheel(
  numbers: number[],
  budget: number,
  bonusCandidates: number[] = [],
  topFreqNums: number[] = [],
): number[][] {
  const allCombos = generateFullWheel(numbers);
  if (allCombos.length <= budget) return allCombos;

  const scored = allCombos
    .map((combo, i) => ({ combo, i, score: scoreCombo(combo, bonusCandidates, topFreqNums) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const selected: number[][] = [];
  const remaining = [...scored];
  while (selected.length < budget && remaining.length > 0) {
    let bestIdx = 0, bestAdj = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const penalty = selected.reduce((pen, sel) => {
        const shared = remaining[i].combo.filter(n => sel.includes(n)).length;
        return pen + Math.max(0, shared - 2) * 8;
      }, 0);
      const adj = remaining[i].score - penalty;
      if (adj > bestAdj) { bestAdj = adj; bestIdx = i; }
    }
    selected.push(remaining[bestIdx].combo);
    remaining.splice(bestIdx, 1);
  }
  return selected;
}

export interface WheelCoverage {
  // "chosen 번호 중 drawn 번호 6개가 모두 포함된 시나리오" 기준
  rate6: number;    // 1등 보장 시나리오 비율 (full wheel=100%)
  rate5plus: number;  // 2~3등 가능 시나리오 비율
  rate4plus: number;  // 4등+ 시나리오 비율
  rate3plus: number;  // 5등+ 시나리오 비율
  totalScenarios: number;
}

// 선택 번호 중 6개가 당첨번호인 모든 시나리오에서 최소 보장 등수 계산
export function computeWheelCoverage(
  chosenNums: number[],
  wheelCombos: number[][],
): WheelCoverage {
  const scenarios = generateFullWheel(chosenNums); // all 6-subsets of chosen
  let cnt3 = 0, cnt4 = 0, cnt5 = 0, cnt6 = 0;
  for (const scenario of scenarios) {
    const sset = new Set(scenario);
    let best = 0;
    for (const combo of wheelCombos) {
      const m = combo.filter(n => sset.has(n)).length;
      if (m > best) best = m;
    }
    if (best >= 3) cnt3++;
    if (best >= 4) cnt4++;
    if (best >= 5) cnt5++;
    if (best >= 6) cnt6++;
  }
  const t = scenarios.length || 1;
  const r = (n: number) => Math.round(n / t * 1000) / 10;
  return { rate3plus: r(cnt3), rate4plus: r(cnt4), rate5plus: r(cnt5), rate6: r(cnt6), totalScenarios: t };
}

// ---------------------------------------------------------------------------
// AC값 — 조합 다양성 지표 (range: 0~10 for 6 numbers)
// ---------------------------------------------------------------------------

export function calcAC(combo: number[]): number {
  const diffs = new Set<number>();
  for (let i = 0; i < combo.length; i++) {
    for (let j = i + 1; j < combo.length; j++) {
      diffs.add(Math.abs(combo[i] - combo[j]));
    }
  }
  return diffs.size - (combo.length - 1);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function getTopKNumbers(results: LottoRow[], k: number): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const row of results) {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num != null) freq[num] = (freq[num] ?? 0) + 1;
    }
  }
  const topK = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, k);
  return { numbers: topK.map(x => x.num), frequencies: topK.map(x => x.count) };
}

export function getTopBonusNumbers(results: LottoRow[]): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const row of results) {
    if (row.bonus1 != null) freq[row.bonus1] = (freq[row.bonus1] ?? 0) + 1;
  }
  const top = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, 10);
  return { numbers: top.map(x => x.num), frequencies: top.map(x => x.count) };
}

export function getDistribution(results: LottoRow[]): number[] {
  const ranges = [0, 0, 0, 0, 0];
  for (const row of results) {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num == null) continue;
      if      (num <= 9)  ranges[0]++;
      else if (num <= 19) ranges[1]++;
      else if (num <= 29) ranges[2]++;
      else if (num <= 39) ranges[3]++;
      else                ranges[4]++;
    }
  }
  return ranges;
}

// results는 round 내림차순(최신순)으로 정렬되어 있어야 함
export function filterByCondition(results: LottoRow[], params: FilterParams): LottoRow[] {
  const { conditionType } = params;

  if (conditionType === 2) {
    const maxWinners = params.maxWinners ?? 5;
    return results.filter(r => r.first_prize_winners != null && r.first_prize_winners < maxWinners);
  }
  if (conditionType === 3) {
    const maxPrizeAmt = params.maxPrizeAmt ?? 20;
    return results.filter(r => r.first_prize_amount != null && r.first_prize_amount >= maxPrizeAmt * 1e8);
  }
  if (conditionType === 4) {
    const maxConsec = params.maxConsec ?? 0;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b);
      let maxRun = 1, curRun = 1;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
        else curRun = 1;
      }
      if (maxConsec === 0) return maxRun === 1;
      if (maxConsec === 2) return maxRun === 2;
      return maxRun >= 3;
    });
  }
  if (conditionType === 5) {
    const oddCount = params.oddCount ?? 3;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return nums.filter(n => n % 2 === 1).length === oddCount;
    });
  }
  if (conditionType === 6) {
    const sumMin = params.sumMin ?? 115;
    const sumMax = params.sumMax ?? 185;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      const s = nums.reduce((a, b) => a + b, 0);
      return s >= sumMin && s <= sumMax;
    });
  }
  if (conditionType === 7) {
    // AC값 기준: 당첨 조합의 AC값 >= minAC인 회차만
    const minAC = params.minAC ?? 5;
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return calcAC(nums) >= minAC;
    });
  }
  if (conditionType === 8) {
    // 5밴드 전체 커버: 1~9, 10~19, 20~29, 30~39, 40~45 모두 포함한 회차만
    return results.filter(r => {
      const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].filter((n): n is number => n != null);
      return nums.some(n => n <= 9) && nums.some(n => n >= 10 && n <= 19) &&
             nums.some(n => n >= 20 && n <= 29) && nums.some(n => n >= 30 && n <= 39) &&
             nums.some(n => n >= 40);
    });
  }
  // conditionType === 1: 기간 기준
  const years = params.years ?? 0;
  const months = params.months ?? 0;
  const limit = years > 0 || months > 0 ? Math.round(years * 52 + months * (52 / 12)) : null;
  return limit != null ? results.slice(0, limit) : results;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function uniformSample(pool: number[]): number[] {
  const p = [...pool];
  const result: number[] = [];
  while (result.length < 6 && p.length > 0) {
    const idx = Math.floor(Math.random() * p.length);
    result.push(p[idx]);
    p.splice(idx, 1);
  }
  return result;
}

export function getMaxConsecRun(combo: number[]): number {
  let maxRun = 1, curRun = 1;
  for (let i = 1; i < combo.length; i++) {
    if (combo[i] - combo[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
    else curRun = 1;
  }
  return maxRun;
}

export function sharedCount(a: number[], b: number[]): number {
  const s = new Set(b);
  return a.filter(n => s.has(n)).length;
}

export function generateCombinations(mode: GenerationMode, params: GenerateParams): number[][] {
  const { count, anchorNumbers = [], bonusNumbers = [] } = params;
  const fullPool = Array.from({ length: 45 }, (_, i) => i + 1);

  if (mode === 'random') {
    return Array.from({ length: count }, () => uniformSample(fullPool).sort((a, b) => a - b));
  }

  if (mode === 'no-consec') {
    const combinations: number[][] = [];
    for (let attempt = 0; attempt < 20000 && combinations.length < count; attempt++) {
      const raw = uniformSample(fullPool).sort((a, b) => a - b);
      if (getMaxConsecRun(raw) !== 1) continue;
      if (combinations.some(r => sharedCount(raw, r) > 2)) continue;
      combinations.push(raw);
    }
    return combinations;
  }

  if (mode === 'two-consec') {
    const combinations: number[][] = [];
    for (let attempt = 0; attempt < 20000 && combinations.length < count; attempt++) {
      const raw = uniformSample(fullPool).sort((a, b) => a - b);
      if (getMaxConsecRun(raw) !== 2) continue;
      if (combinations.some(r => sharedCount(raw, r) > 2)) continue;
      combinations.push(raw);
    }
    return combinations;
  }

  // anchor2 / anchor3 / anchor(4개)
  const anchorCount = mode === 'anchor2' ? 2 : mode === 'anchor3' ? 3 : 4;
  const anchorNums = anchorNumbers.slice(0, anchorCount);
  if (anchorNums.length < anchorCount) return [];

  const anchorSet = new Set(anchorNums);
  const pool = fullPool.filter(n => !anchorSet.has(n));
  const fillCount = 6 - anchorNums.length;
  const combinations: number[][] = [];
  const usedFills = new Set<string>();
  const maxFillOverlap = Math.max(0, fillCount - 2);

  const bonusCandidates = bonusNumbers.filter(n => !anchorSet.has(n)).slice(0, 5);
  const bonusTarget = bonusCandidates.length > 0 && fillCount >= 2
    ? Math.max(bonusCandidates.length, Math.floor(count * 0.3))
    : 0;

  // Phase 1A: 각 보너스 후보 포함 조합
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

  // Phase 1B: 일반 조합
  for (let attempt = 0; attempt < 40000 && combinations.length < count; attempt++) {
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

  // Phase 2: 폴백 (중복 방지만)
  if (combinations.length < count) {
    for (let attempt = 0; attempt < 20000 && combinations.length < count; attempt++) {
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

  return combinations;
}
