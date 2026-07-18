import { NextRequest, NextResponse } from 'next/server';

const MODE_LABELS: Record<string, string> = {
  anchor2: '앵커2', anchor3: '앵커3', anchor: '앵커4',
  'no-consec': '연속없음', 'two-consec': '연속2개', random: '랜덤',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return NextResponse.json({ success: false, error: '텔레그램 설정 없음' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { target_round, purchases } = body as {
    target_round: number;
    purchases: { label: string; combos: number[][]; generation_mode?: string | null }[];
  };

  if (!target_round || !Array.isArray(purchases) || purchases.length === 0) {
    return NextResponse.json({ success: false, error: '필수 데이터 누락' }, { status: 422 });
  }

  const lines: string[] = [`🎯 제${target_round}회 로또 확정번호\n`];

  for (const { label, combos, generation_mode } of purchases) {
    const modeText = generation_mode ? ` (${MODE_LABELS[generation_mode] ?? generation_mode})` : '';
    lines.push(`${label}${modeText}`);
    for (const combo of combos) {
      lines.push('  ' + combo.map(pad).join('  '));
    }
    lines.push('');
  }

  const totalGames = purchases.reduce((s, p) => s + p.combos.length, 0);
  lines.push(`총 ${purchases.length}종 · ${totalGames}게임`);

  const text = lines.join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ success: false, error: data.description ?? '전송 실패' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
