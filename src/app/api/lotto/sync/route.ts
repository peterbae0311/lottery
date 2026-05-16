import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const LOTTO_API_BASE = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';

interface LottoApiResponse {
  returnValue: string;
  drwNo: number;
  drwNoDate: string;
  drwtNo1: number;
  drwtNo2: number;
  drwtNo3: number;
  drwtNo4: number;
  drwtNo5: number;
  drwtNo6: number;
  bnusNo: number;
  firstPrzwnerCo: number;
  firstWinamnt: number;
}

async function fetchLottoRound(round: number): Promise<LottoApiResponse | null> {
  try {
    const res = await fetch(`${LOTTO_API_BASE}${round}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data: LottoApiResponse = await res.json();
    if (data.returnValue !== 'success') return null;
    return data;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = createServerClient();

  try {
    // Get the maximum round currently stored in DB
    const { data: maxRow, error: maxErr } = await supabase
      .from('lotto_results')
      .select('round')
      .order('round', { ascending: false })
      .limit(1)
      .single();

    const startRound = maxErr || !maxRow ? 1 : (maxRow.round as number) + 1;

    const upserted: number[] = [];
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    const MAX_ROUND = 1200;

    for (let round = startRound; round <= MAX_ROUND; round++) {
      const data = await fetchLottoRound(round);

      if (!data) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Reached the end of available rounds
          break;
        }
        continue;
      }

      consecutiveFailures = 0;

      const { error: upsertErr } = await supabase.from('lotto_results').upsert(
        {
          round: data.drwNo,
          draw_date: data.drwNoDate,
          num1: data.drwtNo1,
          num2: data.drwtNo2,
          num3: data.drwtNo3,
          num4: data.drwtNo4,
          num5: data.drwtNo5,
          num6: data.drwtNo6,
          bonus1: data.bnusNo,
          bonus2: null,
          first_prize_winners: data.firstPrzwnerCo,
          first_prize_amount: data.firstWinamnt,
        },
        { onConflict: 'round' }
      );

      if (!upsertErr) {
        upserted.push(round);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        syncedRounds: upserted.length,
        rounds: upserted,
        startedFrom: startRound,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
