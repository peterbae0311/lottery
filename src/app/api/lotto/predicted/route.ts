import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('lotto_predicted')
    .select('num1,num2,num3,num4,num5,num6,prediction_type,combo_index,ai_provider,ai_model,ai_cutoff')
    .order('prediction_type', { ascending: true })
    .order('combo_index', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  type Row = {
    num1: number; num2: number; num3: number; num4: number; num5: number; num6: number;
    prediction_type: number; combo_index: number;
    ai_provider?: string | null; ai_model?: string | null; ai_cutoff?: string | null;
  };
  const rows = (data ?? []) as Row[];

  const type1 = rows.filter(r => r.prediction_type === 1).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6])[0] ?? [];
  const type2 = rows.filter(r => r.prediction_type === 2).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]);
  const type3 = rows.filter(r => r.prediction_type === 3).map(r => [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6]);

  const type2First = rows.find(r => r.prediction_type === 2);
  const type3First = rows.find(r => r.prediction_type === 3);

  return NextResponse.json({
    success: true,
    data: {
      type1, type2, type3,
      type2Provider: type2First?.ai_provider ?? '',
      type2Model:    type2First?.ai_model    ?? '',
      type2Cutoff:   type2First?.ai_cutoff   ?? '',
      type3Provider: type3First?.ai_provider ?? '',
      type3Model:    type3First?.ai_model    ?? '',
      type3Cutoff:   type3First?.ai_cutoff   ?? '',
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: {
    type1?: number[]; type2?: number[][]; type3?: number[][];
    type2Provider?: string; type2Model?: string; type2Cutoff?: string;
    type3Provider?: string; type3Model?: string; type3Cutoff?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  if (Array.isArray(body.type1) && body.type1.length === 6) {
    const n = body.type1;
    rows.push({ num1: n[0], num2: n[1], num3: n[2], num4: n[3], num5: n[4], num6: n[5], prediction_type: 1, combo_index: 0 });
  }
  for (const [i, combo] of (body.type2 ?? []).entries()) {
    if (combo.length === 6)
      rows.push({
        num1: combo[0], num2: combo[1], num3: combo[2], num4: combo[3], num5: combo[4], num6: combo[5],
        prediction_type: 2, combo_index: i,
        ai_provider: body.type2Provider ?? null,
        ai_model:    body.type2Model    ?? null,
        ai_cutoff:   body.type2Cutoff   ?? null,
      });
  }
  for (const [i, combo] of (body.type3 ?? []).entries()) {
    if (combo.length === 6)
      rows.push({
        num1: combo[0], num2: combo[1], num3: combo[2], num4: combo[3], num5: combo[4], num6: combo[5],
        prediction_type: 3, combo_index: i,
        ai_provider: body.type3Provider ?? null,
        ai_model:    body.type3Model    ?? null,
        ai_cutoff:   body.type3Cutoff   ?? null,
      });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: '저장할 데이터가 없습니다.' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delError } = await (supabase as any).from('lotto_predicted').delete().gte('id', 0);
  if (delError) return NextResponse.json({ success: false, error: '기존 데이터 삭제 실패: ' + delError.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('lotto_predicted').insert(rows);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: { saved: rows.length } });
}
