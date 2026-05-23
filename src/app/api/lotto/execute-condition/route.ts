import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface LottoResult {
  round: number;
  draw_date: string;
  num1: number;
  num2: number;
  num3: number;
  num4: number;
  num5: number;
  num6: number;
  first_prize_winners: number | null;
  first_prize_amount: number | null;
}

function getTopSixNumbers(results: LottoResult[]): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const row of results) {
    for (const num of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
      if (num != null) freq[num] = (freq[num] ?? 0) + 1;
    }
  }
  const top6 = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, 6);
  return { numbers: top6.map((x) => x.num), frequencies: top6.map((x) => x.count) };
}

// 번호대별 분포: [01-09, 10-19, 20-29, 30-39, 40-45]
function getDistribution(results: LottoResult[]): number[] {
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

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: { conditionType?: number; years?: number; months?: number; maxWinners?: number; maxPrizeAmt?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const conditionType = Number(body.conditionType ?? 1);

  // 전체 회차 페이지네이션 fetch
  const PAGE = 1000;
  const allResults: LottoResult[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('lotto_results')
      .select('round, draw_date, num1, num2, num3, num4, num5, num6, first_prize_winners, first_prize_amount')
      .order('round', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allResults.push(...(data as LottoResult[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  let filteredResults: LottoResult[];

  if (conditionType === 2) {
    // 당첨자 N명 미만
    const maxWinners = Number(body.maxWinners ?? 5);
    filteredResults = allResults.filter(
      (r) => r.first_prize_winners != null && r.first_prize_winners < maxWinners
    );
  } else if (conditionType === 3) {
    // 당첨금 N억 이상
    const maxPrizeAmt = Number(body.maxPrizeAmt ?? 20);
    filteredResults = allResults.filter(
      (r) => r.first_prize_amount != null && r.first_prize_amount >= maxPrizeAmt * 1e8
    );
  } else {
    // 기간 기준 (년/월)
    const years = Number(body.years ?? 0);
    const months = Number(body.months ?? 0);
    const limit = years > 0 || months > 0 ? years * 52 + months * 4 : null;
    filteredResults = limit != null ? allResults.slice(0, limit) : allResults;
  }

  const { numbers, frequencies } = getTopSixNumbers(filteredResults);
  if (numbers.length < 6) {
    return NextResponse.json({ success: false, error: '충분한 데이터가 없습니다.' }, { status: 422 });
  }

  const distribution = getDistribution(filteredResults);

  return NextResponse.json({
    success: true,
    data: { numbers, frequencies, rounds_analyzed: filteredResults.length, distribution },
  });
}
