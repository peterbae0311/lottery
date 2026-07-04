/*
 * Supabase table (run once in dashboard SQL editor):
 *
 * CREATE TABLE lotto_confirmed (
 *   id              BIGSERIAL PRIMARY KEY,
 *   target_round    INTEGER NOT NULL,
 *   combos          JSONB    NOT NULL,
 *   generation_mode TEXT,
 *   confirmed_at    TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * 기존 테이블에 컬럼 추가:
 * ALTER TABLE lotto_confirmed ADD COLUMN IF NOT EXISTS generation_mode TEXT;
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('lotto_confirmed')
    .select('id, target_round, combos, generation_mode, confirmed_at')
    .order('confirmed_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  let body: { target_round?: number; combos?: number[][]; generation_mode?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  const { target_round, combos, generation_mode } = body;
  if (!target_round || !Array.isArray(combos) || combos.length === 0) {
    return NextResponse.json({ success: false, error: '필수 데이터 누락' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('lotto_confirmed')
    .insert({ target_round, combos, generation_mode: generation_mode ?? null });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id 파라미터 필요' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('lotto_confirmed')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
