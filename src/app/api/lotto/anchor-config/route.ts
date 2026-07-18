import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('lotto_anchor_config')
    .select('*')
    .order('saved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: {
    target_round?: number;
    anchor2?: number[];
    anchor3?: number[];
    anchor4?: number[];
    bonus_candidates?: number[];
    top_freq_nums?: number[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  const { error } = await supabase.from('lotto_anchor_config').insert({
    target_round: body.target_round ?? 0,
    anchor2: body.anchor2 ?? [],
    anchor3: body.anchor3 ?? [],
    anchor4: body.anchor4 ?? [],
    bonus_candidates: body.bonus_candidates ?? [],
    top_freq_nums: body.top_freq_nums ?? [],
  });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 30일 이상 오래된 행 정리 (테이블 무한 누적 방지)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('lotto_anchor_config').delete().lt('saved_at', cutoff);

  return NextResponse.json({ success: true });
}
