import { NextRequest, NextResponse } from 'next/server';

interface ConditionResult {
  conditionText: string;
  numbers: number[];
  roundsAnalyzed: number | null;
}

interface AnchorNumbers {
  anchor2: number[];
  anchor3: number[];
  anchor4: number[];
}

interface PerformanceSummary {
  totalRounds: number;
  hitRate: number;
}

const SYSTEM_PROMPT = `당신은 한국 로또 6/45 번호 전략 분석 전문가입니다. 조건 분석 결과를 바탕으로 최적 전략을 JSON으로만 반환하세요.

전략 모드:
- anchor: 4개 번호 고정, 나머지 2슬롯 변형 (가장 집중적)
- anchor3: 3개 번호 고정, 나머지 3슬롯 변형 (균형)
- anchor2: 2개 번호 고정, 나머지 4슬롯 변형 (광역 커버)
- no-consec: 연속번호 없는 순수 통계 조합
- two-consec: 연속번호 1쌍 포함 통계 조합
- random: 완전 무작위

반환 형식(JSON만, 설명 없음):
{
  "recommendedMode": "anchor3",
  "recommendedGames": 10,
  "watchNumbers": [7, 23, 31],
  "insight": "...",
  "modeReason": "..."
}

규칙: insight 100자 이내, modeReason 80자 이내, watchNumbers 최대 6개, recommendedGames 5~50`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: {
    conditionResults?: ConditionResult[];
    anchorNumbers?: AnchorNumbers;
    latestRound?: number;
    performanceSummary?: PerformanceSummary | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  const { conditionResults = [], anchorNumbers, latestRound = 0, performanceSummary } = body;

  if (conditionResults.length === 0) {
    return NextResponse.json({ success: false, error: '조건 분석 결과가 없습니다. 섹션 2에서 조건을 실행하세요.' }, { status: 422 });
  }

  // 조건별 결과 요약
  const conditionLines = conditionResults.map((c, i) =>
    `[조건${i + 1}] ${c.conditionText} → ${c.numbers.join(', ')} (분석 ${c.roundsAnalyzed ?? '?'}회차)`
  ).join('\n');

  // 앵커 번호 요약
  const anchorLines = anchorNumbers ? [
    `앵커2 (2개 고정): ${anchorNumbers.anchor2.join(', ') || '없음'}`,
    `앵커3 (3개 고정): ${anchorNumbers.anchor3.join(', ') || '없음'}`,
    `앵커4 (4개 고정): ${anchorNumbers.anchor4.join(', ') || '없음'}`,
  ].join('\n') : '앵커 번호 없음';

  // 번호별 출현 빈도 계산 (조건 간 공통 출현)
  const freqMap: Record<number, number> = {};
  conditionResults.forEach(c => {
    c.numbers.forEach(n => { freqMap[n] = (freqMap[n] ?? 0) + 1; });
  });
  const topFreq = Object.entries(freqMap)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10)
    .map(([n, cnt]) => `${n}번(${cnt}개 조건)`)
    .join(', ');

  const perfLine = performanceSummary
    ? `성과 현황: ${performanceSummary.totalRounds}회차 분석, 적중률 ${performanceSummary.hitRate}%`
    : '성과 현황: 없음';

  const userPrompt = `최신 회차: 제${latestRound}회
분석 조건 수: ${conditionResults.length}개
${conditionLines}

앵커 번호:
${anchorLines}

번호 빈도 상위 10개: ${topFreq}

${perfLine}

위 데이터를 분석하여 제${latestRound + 1}회 최적 전략을 추천하세요. JSON만 반환.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lotto-app.vercel.app',
        'X-Title': 'Lotto Strategy',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ success: false, error: `AI 호출 실패: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const aiData = await res.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? '';
    // think 블록 및 마크다운 코드 펜스 제거
    const content = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();

    // recommendedMode 키가 포함된 JSON 객체 추출 (그리디 매칭으로 전체 캡처)
    const jsonMatch = content.match(/\{[^{}]*"recommendedMode"[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: `AI 응답 파싱 실패. 응답: ${content.slice(0, 400)}` }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // JSON이 불완전한 경우 닫는 괄호 보완 시도
      try {
        parsed = JSON.parse(jsonMatch[0] + '}');
      } catch {
        return NextResponse.json({ success: false, error: `JSON 파싱 실패. 응답: ${jsonMatch[0].slice(0, 200)}` }, { status: 500 });
      }
    }
    const VALID_MODES = ['anchor', 'anchor3', 'anchor2', 'no-consec', 'two-consec', 'random'];
    const result = {
      recommendedMode: VALID_MODES.includes(parsed.recommendedMode) ? parsed.recommendedMode : 'anchor3',
      recommendedGames: Math.min(50, Math.max(5, Number(parsed.recommendedGames ?? 10))),
      watchNumbers: Array.isArray(parsed.watchNumbers)
        ? parsed.watchNumbers.filter((n: unknown) => typeof n === 'number' && n >= 1 && n <= 45).slice(0, 6)
        : [],
      insight: String(parsed.insight ?? '').slice(0, 150),
      modeReason: String(parsed.modeReason ?? '').slice(0, 120),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
