import { NextResponse } from 'next/server';
import { type GenerationMode, generateCombinations } from '@/lib/lotto-engine';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode: GenerationMode = typeof body.mode === 'string' ? (body.mode as GenerationMode) : 'random';
  const isAnchor = mode === 'anchor2' || mode === 'anchor3' || mode === 'anchor';
  const maxCount = isAnchor ? 350 : 100;
  const count = Math.min(Math.max(Number(body.count ?? 5), 1), maxCount);

  const anchorNumbers: number[] = Array.isArray(body.anchorNumbers)
    ? (body.anchorNumbers as unknown[]).filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 45)
    : [];

  const bonusNumbers: number[] = Array.isArray(body.bonusNumbers)
    ? (body.bonusNumbers as unknown[]).filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 45)
    : [];

  if (isAnchor) {
    const required = mode === 'anchor2' ? 2 : mode === 'anchor3' ? 3 : 4;
    if (anchorNumbers.length < required) {
      return NextResponse.json({ success: false, error: `앵커 번호 ${required}개 필요` }, { status: 422 });
    }
  }

  const combinations = generateCombinations(mode, { count, anchorNumbers, bonusNumbers });

  if (combinations.length === 0) {
    return NextResponse.json({ success: false, error: '조합 생성 실패' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { combinations } });
}
