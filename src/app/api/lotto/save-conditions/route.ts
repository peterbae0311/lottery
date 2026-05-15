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
}

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('lotto_conditions')
    .select('condition_text, num1, num2, num3, num4, num5, num6')
    .order('id', { ascending: true })
    .limit(9999);

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

  // 기존 데이터 전체 삭제 후 새로 삽입 (항상 최신 상태 유지)
  const { error: deleteError } = await supabase.from('lotto_conditions').delete().gte('id', 0);
  if (deleteError) {
    return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
  }

  const { error } = await supabase.from('lotto_conditions').insert(conditions);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { saved: conditions.length } });
}
