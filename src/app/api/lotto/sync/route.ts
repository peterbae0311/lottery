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

async function fetchFromDhlottery(round: number): Promise<LottoApiResponse | null> {
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

async function fetchFromNaver(round: number): Promise<LottoApiResponse | null> {
  try {
    const query = encodeURIComponent(`로또 ${round}회`);
    const res = await fetch(`https://search.naver.com/search.naver?query=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 요청한 회차가 실제로 선택된 탭인지 확인 (미래 회차 방지)
    if (!html.includes(`data-kgs-option="${round}" aria-selected="true"`)) return null;

    // 당첨번호 6개
    const winMatch = html.match(/<div class="winning_number">([\s\S]*?)<\/div>/);
    if (!winMatch) return null;
    const nums: number[] = [];
    const numRe = /<span class="ball[^"]*">(\d+)<\/span>/g;
    let m: RegExpExecArray | null;
    while ((m = numRe.exec(winMatch[1])) !== null) nums.push(Number(m[1]));
    if (nums.length !== 6) return null;

    // 보너스 번호
    const bonusMatch = html.match(/<div class="bonus_number">[\s\S]*?<span class="ball[^"]*">(\d+)<\/span>/);
    if (!bonusMatch) return null;

    // 추첨일: "(2026.06.27.)" 형태
    const dateRe = new RegExp(`data-kgs-option="${round}"[^>]*>[\\s\\S]{0,200}?\\((\\d{4}\\.\\d{2}\\.\\d{2})\\.?\\)`);
    const dateMatch = html.match(dateRe);
    const drawDate = dateMatch ? dateMatch[1].replace(/\./g, '-') : '';

    // 1등 당첨금
    const prizeMatch = html.match(/<p class="win_text">[\s\S]*?<strong[^>]*>([\d,]+)<\/strong>/);
    const prizeAmt = prizeMatch ? parseInt(prizeMatch[1].replace(/,/g, ''), 10) : 0;

    // 1등 당첨자 수 ("N명" 패턴)
    const winnersMatch = html.match(/<p class="win_text">[\s\S]*?(\d+)명/);
    const winners = winnersMatch ? parseInt(winnersMatch[1], 10) : 0;

    return {
      returnValue: 'success',
      drwNo: round,
      drwNoDate: drawDate,
      drwtNo1: nums[0], drwtNo2: nums[1], drwtNo3: nums[2],
      drwtNo4: nums[3], drwtNo5: nums[4], drwtNo6: nums[5],
      bnusNo: Number(bonusMatch[1]),
      firstPrzwnerCo: winners,
      firstWinamnt: prizeAmt,
    };
  } catch {
    return null;
  }
}

async function fetchLottoRound(round: number): Promise<LottoApiResponse | null> {
  const fromDhlottery = await fetchFromDhlottery(round);
  if (fromDhlottery) return fromDhlottery;
  return fetchFromNaver(round);
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

    for (let round = startRound; ; round++) {
      const data = await fetchLottoRound(round);

      if (!data) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
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
