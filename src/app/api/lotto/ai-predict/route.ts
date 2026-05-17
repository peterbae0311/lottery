import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createServerClient } from '@/lib/supabase';

interface FreqMap { [num: number]: number }

class RateLimitError extends Error {
  constructor(provider: string) { super(`RATE_LIMIT:${provider}`); }
}
class NoKeyError extends Error {}

async function getLottoFrequencies(): Promise<FreqMap> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from('lotto_results').select('num1,num2,num3,num4,num5,num6');
    const freq: FreqMap = {};
    for (let i = 1; i <= 45; i++) freq[i] = 0;
    if (data) {
      for (const row of data as { num1:number; num2:number; num3:number; num4:number; num5:number; num6:number }[]) {
        for (const n of [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]) {
          if (n >= 1 && n <= 45) freq[n] = (freq[n] ?? 0) + 1;
        }
      }
    }
    return freq;
  } catch {
    const freq: FreqMap = {};
    for (let i = 1; i <= 45; i++) freq[i] = 1;
    return freq;
  }
}

function freqSummary(freq: FreqMap): string {
  return Object.entries(freq)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, f]) => `${n}:${f}`)
    .join(' ');
}

function buildPrompt(type: 2 | 3, combCount: number, freqStr: string, pool?: number[]): string {
  const rolePrompt = `당신은 로또 번호 생성 전문 AI입니다. 다음 5가지 역할을 동시에 수행합니다:
1. 데이터 분석가: 번호별 출현 빈도·패턴·시계열 분석
2. 확률 모델러: 빈출(Hot)/미출현(Cold) 번호에 가중치 부여, 조건부 확률 계산
3. 번호 생성기: 가중 랜덤 샘플링으로 다중 조합 병렬 생성
4. 전략 조언가: 번호대 분산, 홀짝 균형, 합계 범위 최적화
5. 결과 검증자: 합계 100~175, 비현실적 연속 번호 필터링, 다양성 점수 검증`;

  const rules = `생성 규칙:
- 각 조합: 6개의 서로 다른 번호, 오름차순 정렬
- 번호 합계: 100~175 범위
- 홀수 2~4개 (홀짝 균형)
- 번호대(1~9, 10~19, 20~29, 30~39, 40~45) 가급적 분산
- 연속 번호 최대 2개
- 조합 간 중복 최소화`;

  const jsonExample = Array.from({ length: combCount }, () => '[n,n,n,n,n,n]').join(',');

  if (type === 2 && pool) {
    return `${rolePrompt}

역대 번호별 출현 빈도 (번호:횟수): ${freqStr}

섹션2 분석 결과 고빈도 번호 풀: [${pool.join(', ')}]
이 번호 풀에서만 선택하여 조합 ${combCount}개를 생성하세요.

${rules}

반드시 JSON만 응답 (설명 없이):
{"combinations":[${jsonExample}]}`;
  }

  return `${rolePrompt}

역대 번호별 출현 빈도 (번호:횟수): ${freqStr}

1~45 전체 번호를 대상으로 통계 분석과 확률 모델링을 적용하여 최적 조합 ${combCount}개를 생성하세요.
빈출(Hot) 번호와 장기 미출현(Cold) 번호를 적절히 혼합하세요.

${rules}

반드시 JSON만 응답 (설명 없이):
{"combinations":[${jsonExample}]}`;
}

function parseText(text: string, combCount: number): number[][] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
  const result = JSON.parse(jsonMatch[0]) as { combinations: number[][] };
  return result.combinations
    .slice(0, combCount)
    .map(combo => [...new Set(combo.filter((n: number) => n >= 1 && n <= 45))].sort((a, b) => a - b))
    .filter(combo => combo.length === 6);
}

function isRateLimit(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new NoKeyError();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    if (isRateLimit(err)) throw new RateLimitError('Gemini');
    throw err;
  }
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new NoKeyError();
  try {
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    if (isRateLimit(err)) throw new RateLimitError('Groq');
    throw err;
  }
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new NoKeyError();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.status === 429) throw new RateLimitError('OpenRouter');
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropic(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NoKeyError();
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = message.content[0];
  return content.type === 'text' ? content.text : '';
}

const PROVIDERS = [
  { name: 'Gemini', fn: callGemini },
  { name: 'Groq', fn: callGroq },
  { name: 'OpenRouter', fn: callOpenRouter },
  { name: 'Anthropic', fn: callAnthropic },
];

export async function POST(req: NextRequest) {
  let body: { type: 2 | 3; section2Numbers?: number[][] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const combCount = body.type === 2 ? 4 : 5;
  let pool: number[] | undefined;

  if (body.type === 2) {
    pool = [...new Set((body.section2Numbers ?? []).flat().filter(n => n >= 1 && n <= 45))].sort((a, b) => a - b);
    if (pool.length < 6) {
      return NextResponse.json({ success: false, error: '섹션2 데이터가 부족합니다. 조건을 실행해주세요.' }, { status: 422 });
    }
  }

  const freq = await getLottoFrequencies();
  const prompt = buildPrompt(body.type, combCount, freqSummary(freq), pool);

  const errors: string[] = [];

  for (const { name, fn } of PROVIDERS) {
    try {
      const text = await fn(prompt);
      const combinations = parseText(text, combCount);
      if (combinations.length === 0) throw new Error('유효한 조합 없음');
      return NextResponse.json({ success: true, data: { combinations, provider: name } });
    } catch (err) {
      if (err instanceof NoKeyError) continue;
      if (err instanceof RateLimitError) { errors.push(`${name}: rate limit`); continue; }
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    { success: false, error: `모든 AI 서비스 실패 (${errors.join(' / ')})` },
    { status: 503 }
  );
}
