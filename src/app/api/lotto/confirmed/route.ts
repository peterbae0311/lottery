/*
 * Supabase table (run once in dashboard SQL editor):
 *
 * CREATE TABLE lotto_confirmed (
 *   id              BIGSERIAL PRIMARY KEY,
 *   target_round    INTEGER NOT NULL,
 *   combos          JSONB    NOT NULL,
 *   generation_mode TEXT,
 *   confirmed_at    TIMESTAMPTZ DEFAULT NOW(),
 *   prize_tier      TEXT,         -- 최고 등수 (예: '5등', '낙첨')
 *   matched_numbers JSONB         -- 조합별 일치 번호 수 배열 (예: [3,2,4,...])
 * );
 *
 * 기존 테이블에 컬럼 추가 (Supabase 대시보드 SQL 에디터에서 실행):
 * ALTER TABLE lotto_confirmed ADD COLUMN IF NOT EXISTS generation_mode TEXT;
 * ALTER TABLE lotto_confirmed ADD COLUMN IF NOT EXISTS prize_tier TEXT;
 * ALTER TABLE lotto_confirmed ADD COLUMN IF NOT EXISTS matched_numbers JSONB;
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('lotto_confirmed')
    .select('id, target_round, combos, generation_mode, confirmed_at, prize_tier, matched_numbers')
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

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  let body: { id: number; prize_tier: string; matched_numbers: number[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }
  const { id, prize_tier, matched_numbers } = body;
  if (!id) return NextResponse.json({ success: false, error: 'id 필요' }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('lotto_confirmed')
    .update({ prize_tier, matched_numbers })
    .eq('id', id);

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
