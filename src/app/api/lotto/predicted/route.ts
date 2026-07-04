import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('lotto_predicted')
    .select('num1,num2,num3,num4,num5,num6,combo_index')
    .eq('prediction_type', 3)
    .order('combo_index', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  type Row = { num1: number; num2: number; num3: number; num4: number; num5: number; num6: number; combo_index: number };
  const type3 = ((data ?? []) as Row[]).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]);

  return NextResponse.json({ success: true, data: { type3 } });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: { type3?: number[][] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const rows = (body.type3 ?? [])
    .filter(combo => combo.length === 6)
    .map((combo, i) => ({
      num1: combo[0], num2: combo[1], num3: combo[2],
      num4: combo[3], num5: combo[4], num6: combo[5],
      prediction_type: 3, combo_index: i,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: '저장할 데이터가 없습니다.' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delError } = await (supabase as any).from('lotto_predicted').delete().eq('prediction_type', 3);
  if (delError) return NextResponse.json({ success: false, error: '기존 데이터 삭제 실패: ' + delError.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('lotto_predicted').insert(rows);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: { saved: rows.length } });
}
