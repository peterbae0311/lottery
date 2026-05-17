import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('lotto_predicted')
    .select('num1,num2,num3,num4,num5,num6,prediction_type,combo_index')
    .order('prediction_type', { ascending: true })
    .order('combo_index', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  type Row = { num1: number; num2: number; num3: number; num4: number; num5: number; num6: number; prediction_type: number; combo_index: number };
  const rows = (data ?? []) as Row[];

  const type1 = rows.filter(r => r.prediction_type === 1).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6])[0] ?? [];
  const type2 = rows.filter(r => r.prediction_type === 2).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]);
  const type3 = rows.filter(r => r.prediction_type === 3).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]);

  return NextResponse.json({ success: true, data: { type1, type2, type3 } });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: { type1?: number[]; type2?: number[][]; type3?: number[][] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const rows: { num1: number; num2: number; num3: number; num4: number; num5: number; num6: number; prediction_type: number; combo_index: number }[] = [];

  if (Array.isArray(body.type1) && body.type1.length === 6) {
    const n = body.type1;
    rows.push({ num1: n[0], num2: n[1], num3: n[2], num4: n[3], num5: n[4], num6: n[5], prediction_type: 1, combo_index: 0 });
  }
  for (const [i, combo] of (body.type2 ?? []).entries()) {
    if (combo.length === 6)
      rows.push({ num1: combo[0], num2: combo[1], num3: combo[2], num4: combo[3], num5: combo[4], num6: combo[5], prediction_type: 2, combo_index: i });
  }
  for (const [i, combo] of (body.type3 ?? []).entries()) {
    if (combo.length === 6)
      rows.push({ num1: combo[0], num2: combo[1], num3: combo[2], num4: combo[3], num5: combo[4], num6: combo[5], prediction_type: 3, combo_index: i });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: '저장할 데이터가 없습니다.' }, { status: 422 });
  }

  const { error: delError } = await supabase.from('lotto_predicted').delete().gte('id', 0);
  if (delError) return NextResponse.json({ success: false, error: '기존 데이터 삭제 실패: ' + delError.message }, { status: 500 });
  const { error } = await supabase.from('lotto_predicted').insert(rows);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: { saved: rows.length } });
}
