import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * POST /api/lotto/predicted
 * Body: { numbers: number[][] }  — 2D array, each inner array is 6 numbers from a condition row.
 * Aggregates all numbers, finds the top 6 by frequency, saves to lotto_predicted.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: { numbers?: number[][] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const numberSets = body.numbers ?? [];
  if (!Array.isArray(numberSets) || numberSets.length === 0) {
    return NextResponse.json({ success: false, error: '번호 데이터가 필요합니다.' }, { status: 400 });
  }

  // Aggregate frequency across all condition row results
  const freq: Record<number, number> = {};
  for (const set of numberSets) {
    if (!Array.isArray(set)) continue;
    for (const num of set) {
      if (typeof num === 'number' && num >= 1 && num <= 45) {
        freq[num] = (freq[num] ?? 0) + 1;
      }
    }
  }

  const sorted = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num);

  const topSix = sorted.slice(0, 6).map((x) => x.num).sort((a, b) => a - b);

  if (topSix.length < 6) {
    return NextResponse.json({ success: false, error: '충분한 데이터가 없습니다.' }, { status: 422 });
  }

  // Save predicted numbers
  const { error: insertErr } = await supabase.from('lotto_predicted').insert({
    num1: topSix[0],
    num2: topSix[1],
    num3: topSix[2],
    num4: topSix[3],
    num5: topSix[4],
    num6: topSix[5],
  });

  if (insertErr) {
    console.error('lotto_predicted insert error:', insertErr.message);
  }

  return NextResponse.json({
    success: true,
    data: { numbers: topSix },
  });
}
