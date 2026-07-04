import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerClient();

    const PAGE = 1000;
    const all: unknown[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('lotto_results')
        .select('*')
        .order('round', { ascending: false })
        .range(from, from + PAGE - 1);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json({ success: true, data: all });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { round, draw_date, num1, num2, num3, num4, num5, num6, bonus1, first_prize_winners, first_prize_amount } = body;

    if (!round || !num1) {
      return NextResponse.json({ success: false, error: '필수 필드 누락' }, { status: 422 });
    }

    const { error } = await supabase.from('lotto_results').upsert(
      { round, draw_date, num1, num2, num3, num4, num5, num6, bonus1, bonus2: null, first_prize_winners, first_prize_amount },
      { onConflict: 'round' }
    );

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
