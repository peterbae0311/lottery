import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface GeneratedCondition {
  conditionType: number;
  years: number;
  months: number;
  maxWinners: number;
  maxPrizeAmt: number;
  maxConsec: number;
  oddCount: number;
  sumMin: number;
  sumMax: number;
  minAC: number;
}

const SYSTEM_PROMPT = `한국 로또 6/45 당첨 번호 빈도 분석 조건을 JSON 배열로만 반환하세요. 코드블록 없이 순수 JSON만 출력.

조건 타입:
1=기간(years:0~20,months:0~12), 2=당첨자수미만(maxWinners:1~20), 3=당첨금이상(maxPrizeAmt:5~50억),
4=연속번호(maxConsec:0=없음,2=2개,3=3개이상), 5=홀수개수(oddCount:0~6), 6=합계범위(sumMin,sumMax:21~270),
7=AC값하한(minAC:3~8), 8=5밴드커버(별도 파라미터 없음)

형식(압축JSON): [{"conditionType":1,"years":0,"months":3,"maxWinners":0,"maxPrizeAmt":0,"maxConsec":0,"oddCount":3,"sumMin":115,"sumMax":185,"minAC":5},...]

규칙: 총 12개, 타입1~8 적절히 포함, 타입1은 최소 4개(단기/중기/장기/전체), 타입5는 oddCount 2,3,4 각각, 타입6은 두 가지 범위, 타입7은 minAC 5~7로 1개, 타입8은 1개`;


export async function POST() {
  const supabase = createServerClient();

  // DB 통계 수집
  const { data: statsRow } = await supabase
    .from('lotto_results')
    .select('round, draw_date')
    .order('round', { ascending: false })
    .limit(1)
    .single();

  const { data: firstRow } = await supabase
    .from('lotto_results')
    .select('round, draw_date')
    .order('round', { ascending: true })
    .limit(1)
    .single();

  const { count } = await supabase
    .from('lotto_results')
    .select('round', { count: 'exact', head: true });

  const latestRound = statsRow?.round ?? 0;
  const latestDate = statsRow?.draw_date ?? '';
  const firstDate = firstRow?.draw_date ?? '';
  const totalRounds = count ?? 0;

  const userPrompt = `현재 로또 DB 현황:
- 최신 회차: ${latestRound}회 (${latestDate})
- 최초 회차: ${firstRow?.round ?? 1}회 (${firstDate})
- 전체 데이터: 총 ${totalRounds}회차

위 현황을 바탕으로 당첨 번호 빈도 분석에 유용한 조건 세트를 생성해주세요.
JSON 배열만 반환하세요.`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lotto-app.vercel.app',
        'X-Title': 'Lotto Analysis',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ success: false, error: `AI 호출 실패: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const aiData = await res.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? '';
    // thinking 모델의 <think>...</think> 블록 제거
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // JSON 배열 파싱
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      const preview = content.slice(0, 300);
      return NextResponse.json({ success: false, error: `AI 응답에서 조건을 파싱할 수 없습니다. 응답 미리보기: ${preview}` }, { status: 500 });
    }

    const parsed: GeneratedCondition[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ success: false, error: '유효한 조건이 생성되지 않았습니다.' }, { status: 500 });
    }

    // 유효성 검증 및 정규화
    const validated = parsed
      .filter(c => [1, 2, 3, 4, 5, 6, 7, 8].includes(Number(c.conditionType)))
      .map(c => ({
        conditionType: Number(c.conditionType),
        years: Math.max(0, Math.min(20, Number(c.years ?? 0))),
        months: Math.max(0, Math.min(12, Number(c.months ?? 0))),
        maxWinners: Math.max(0, Math.min(30, Number(c.maxWinners ?? 0))),
        maxPrizeAmt: Math.max(0, Math.min(100, Number(c.maxPrizeAmt ?? 0))),
        maxConsec: [0, 2, 3].includes(Number(c.maxConsec)) ? Number(c.maxConsec) : 0,
        oddCount: Math.max(0, Math.min(6, Number(c.oddCount ?? 3))),
        sumMin: Math.max(21, Math.min(270, Number(c.sumMin ?? 115))),
        sumMax: Math.max(21, Math.min(270, Number(c.sumMax ?? 185))),
        minAC: Math.max(3, Math.min(10, Number(c.minAC ?? 5))),
      }));

    return NextResponse.json({ success: true, data: { conditions: validated, latestRound, totalRounds } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
