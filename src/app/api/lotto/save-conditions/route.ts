import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface ConditionRow {
  condition_text: string;
  num1: number;
  num2: number;
  num3: number;
  num4: number;
  num5: number;
  num6: number;
  full_data?: Record<string, unknown> | null;
}

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('lotto_conditions')
    .select('condition_text, num1, num2, num3, num4, num5, num6, full_data')
    .order('id', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: { conditions?: ConditionRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const conditions = body.conditions ?? [];
  if (conditions.length === 0) {
    return NextResponse.json({ success: false, error: '저장할 조건이 없습니다.' }, { status: 400 });
  }

  // 기존 행 ID 수집 (삭제 대상)
  const { data: existing } = await supabase
    .from('lotto_conditions')
    .select('id');
  const oldIds = (existing ?? []).map((r: { id: number }) => r.id);

  // 새 행 삽입 먼저 — 성공해야 이전 데이터 삭제
  const { error: insertError } = await supabase.from('lotto_conditions').insert(conditions);
  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  // 삽입 성공 후 이전 행 삭제
  if (oldIds.length > 0) {
    await supabase.from('lotto_conditions').delete().in('id', oldIds);
  }

  return NextResponse.json({ success: true, data: { saved: conditions.length } });
}
