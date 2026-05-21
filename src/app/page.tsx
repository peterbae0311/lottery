'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LottoResult {
  id: number;
  round: number;
  draw_date: string;
  num1: number | null;
  num2: number | null;
  num3: number | null;
  num4: number | null;
  num5: number | null;
  num6: number | null;
  bonus1: number | null;
  bonus2: number | null;
  first_prize_winners: number | null;
  first_prize_amount: number | null;
}

type ConditionType = 1 | 2 | 3;

interface ConditionRow {
  id: string;
  conditionType: ConditionType;
  years: number;
  months: number;
  maxWinners: number;
  maxPrizeAmt: number;
  roundsAnalyzed: number | null;
  numbers: number[] | null;
  frequencies: number[] | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number | null): string {
  if (amount == null) return '-';
  return amount.toLocaleString('ko-KR') + '원';
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildConditionText(conditionType: ConditionType, years: number, months: number, maxWinners: number, maxPrizeAmt: number): string {
  if (conditionType === 2) return `당첨자 ${maxWinners}명 미만 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 3) return `당첨금 ${maxPrizeAmt}억 이상 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
  if (years === 0 && months === 0) return '전체 당첨번호에서 가장 많이 나온 숫자 6개 추출';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  return `최근 ${parts.join(' ')} 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
}

function parseConditionText(text: string): { conditionType: ConditionType; years: number; months: number; maxWinners: number; maxPrizeAmt: number } {
  if (text.includes('당첨자')) {
    const m = text.match(/당첨자 (\d+)명/);
    return { conditionType: 2, years: 0, months: 0, maxWinners: m ? parseInt(m[1]) : 5, maxPrizeAmt: 0 };
  }
  if (text.includes('당첨금')) {
    const m = text.match(/당첨금 (\d+(?:\.\d+)?)억/);
    return { conditionType: 3, years: 0, months: 0, maxWinners: 0, maxPrizeAmt: m ? parseFloat(m[1]) : 25 };
  }
  const yearMatch = text.match(/(\d+)년/);
  const monthMatch = text.match(/(\d+)개월/);
  return { conditionType: 1, years: yearMatch ? parseInt(yearMatch[1]) : 0, months: monthMatch ? parseInt(monthMatch[1]) : 0, maxWinners: 0, maxPrizeAmt: 0 };
}

function getTopSixFromNumberSets(numberSets: number[][]): { numbers: number[]; frequencies: number[] } {
  const freq: Record<number, number> = {};
  for (const set of numberSets) {
    for (const num of set) {
      if (typeof num === 'number' && num >= 1 && num <= 45) {
        freq[num] = (freq[num] ?? 0) + 1;
      }
    }
  }
  const top6 = Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num)
    .slice(0, 6);
  return { numbers: top6.map((x) => x.num), frequencies: top6.map((x) => x.count) };
}

const BLANK_ROW = { roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false };
const DEFAULT_CONDITIONS: ConditionRow[] = [
  { id: makeId(), conditionType: 1, years: 0, months: 1,  maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 3,  maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 6,  maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 1, months: 0,  maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 0,  maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
];

// ---------------------------------------------------------------------------
// NumberBall
// ---------------------------------------------------------------------------

function NumberBall({ num, size = 'md', freq }: { num: number | null; size?: 'sm' | 'md' | 'lg'; freq?: number }) {
  if (num == null) {
    const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
    return <span className={`inline-flex items-center justify-center ${dim} rounded-full bg-gray-100 text-gray-400 font-bold`}>-</span>;
  }

  let colorClass = '';
  if (num <= 10) colorClass = 'bg-yellow-400 text-white';
  else if (num <= 20) colorClass = 'bg-blue-500 text-white';
  else if (num <= 30) colorClass = 'bg-red-500 text-white';
  else if (num <= 40) colorClass = 'bg-gray-600 text-white';
  else colorClass = 'bg-green-500 text-white';

  if (freq != null) {
    const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
    const numText = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm';
    const freqText = size === 'lg' ? 'text-[10px]' : 'text-[9px]';
    return (
      <span className={`inline-flex flex-col items-center justify-center ${dim} rounded-full ${colorClass} font-bold shadow-sm leading-none gap-0.5`}>
        <span className={numText}>{String(num).padStart(2, '0')}</span>
        <span className={`${freqText} opacity-80`}>{freq}회</span>
      </span>
    );
  }

  const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
  return (
    <span className={`inline-flex items-center justify-center ${dim} rounded-full ${colorClass} font-bold shadow-sm`}>
      {String(num).padStart(2, '0')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold">{step}</span>
      <h2 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Home() {
  const [results, setResults] = useState<LottoResult[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>(DEFAULT_CONDITIONS);
  const [isSavingConditions, setIsSavingConditions] = useState(false);
  const [saveConditionsMsg, setSaveConditionsMsg] = useState('');

  // Section 3 state
  const [type1Numbers, setType1Numbers] = useState<number[]>([]);
  const [type1Freqs, setType1Freqs] = useState<number[]>([]);
  const [type2Numbers, setType2Numbers] = useState<number[][]>([]);
  const [type3Numbers, setType3Numbers] = useState<number[][]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [isSavingPredicted, setIsSavingPredicted] = useState(false);
  const [type2Provider, setType2Provider] = useState('');
  const [type3Provider, setType3Provider] = useState('');
  const [type2Model, setType2Model] = useState('');
  const [type2Cutoff, setType2Cutoff] = useState('');
  const [type3Model, setType3Model] = useState('');
  const [type3Cutoff, setType3Cutoff] = useState('');
  // DB에서 불러온 직후 auto-save 방지용 플래그
  const skipSaveRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Load saved conditions from DB on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/lotto/save-conditions');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.data) || data.data.length === 0) return;

        type DbRow = { condition_text: string; num1: number; num2: number; num3: number; num4: number; num5: number; num6: number };

        const initial: ConditionRow[] = data.data.map((row: DbRow) => {
          const { conditionType, years, months, maxWinners, maxPrizeAmt } = parseConditionText(row.condition_text);
          return {
            id: makeId(), conditionType, years, months, maxWinners, maxPrizeAmt,
            roundsAnalyzed: null,
            numbers: [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6],
            frequencies: null, isLoading: true,
          };
        });
        setConditions(initial);

        const executed = await Promise.all(
          initial.map(async (row) => {
            try {
              const r = await fetch('/api/lotto/execute-condition', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt }),
              });
              const d = await r.json();
              if (d.success && Array.isArray(d.data?.numbers)) {
                return { ...row, numbers: d.data.numbers, frequencies: d.data.frequencies ?? null, roundsAnalyzed: d.data.rounds_analyzed ?? null, isLoading: false };
              }
            } catch { /* ignore */ }
            return { ...row, isLoading: false };
          })
        );
        setConditions(executed);
      } catch { /* keep defaults */ }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Section 1: Load + sync
  // ---------------------------------------------------------------------------

  const syncAndLoad = useCallback(async () => {
    try {
      const res = await fetch('/api/lotto/results');
      const data = await res.json();
      if (data.success) setResults(data.data ?? []);
      else setSyncMessage('데이터 로드 실패: ' + (data.error ?? ''));
    } catch (err) {
      setSyncMessage('데이터 로드 오류: ' + (err instanceof Error ? err.message : String(err)));
    }

    setIsSyncing(true);
    setSyncMessage('동기화 중...');
    try {
      const syncRes = await fetch('/api/lotto/sync');
      const syncData = await syncRes.json();
      if (syncData.success) {
        const synced = syncData.data?.syncedRounds ?? 0;
        if (synced > 0) {
          setSyncMessage(`${synced}개 회차 동기화 완료`);
          const res = await fetch('/api/lotto/results');
          const data = await res.json();
          if (data.success) setResults(data.data ?? []);
        } else {
          setSyncMessage('최신 데이터입니다');
        }
      } else {
        setSyncMessage('');
      }
    } catch { setSyncMessage(''); }
    finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncAndLoad(); }, [syncAndLoad]);

  // ---------------------------------------------------------------------------
  // Section 3: Load saved predictions on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/lotto/predicted');
        const data = await res.json();
        if (data.success) {
          skipSaveRef.current = true;
          if (Array.isArray(data.data.type1) && data.data.type1.length === 6) setType1Numbers(data.data.type1);
          if (Array.isArray(data.data.type2) && data.data.type2.length > 0) setType2Numbers(data.data.type2);
          if (Array.isArray(data.data.type3) && data.data.type3.length > 0) setType3Numbers(data.data.type3);
          // 다음 렌더 사이클 이후 플래그 해제
          setTimeout(() => { skipSaveRef.current = false; }, 0);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Section 2: Conditions
  // ---------------------------------------------------------------------------

  const executeCondition = useCallback(async (rowId: string) => {
    const row = conditions.find((c) => c.id === rowId);
    if (!row) return;
    setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: true } : c)));
    try {
      const res = await fetch('/api/lotto/execute-condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.numbers)) {
        setConditions((prev) => prev.map((c) =>
          c.id === rowId ? { ...c, numbers: data.data.numbers, frequencies: data.data.frequencies ?? null, roundsAnalyzed: data.data.rounds_analyzed ?? null, isLoading: false } : c
        ));
      } else {
        setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
      }
    } catch {
      setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
    }
  }, [conditions]);

  const addConditionRow = useCallback(() => {
    setConditions((prev) => [...prev, { id: makeId(), conditionType: 1, years: 0, months: 0, maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW }]);
  }, []);

  const removeConditionRow = useCallback((rowId: string) => {
    setConditions((prev) => prev.length <= 1 ? prev : prev.filter((c) => c.id !== rowId));
  }, []);

  const updateConditionType = useCallback((rowId: string, conditionType: ConditionType) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, conditionType, ...BLANK_ROW } : c));
  }, []);

  const updateYears = useCallback((rowId: string, years: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, years, ...BLANK_ROW } : c));
  }, []);

  const updateMonths = useCallback((rowId: string, months: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, months, ...BLANK_ROW } : c));
  }, []);

  const updateMaxWinners = useCallback((rowId: string, maxWinners: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, maxWinners, ...BLANK_ROW } : c));
  }, []);

  const updateMaxPrizeAmt = useCallback((rowId: string, maxPrizeAmt: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, maxPrizeAmt, ...BLANK_ROW } : c));
  }, []);

  const resetConditionNumbers = useCallback(() => {
    setConditions((prev) => prev.map((c) => ({ ...c, numbers: null, frequencies: null, roundsAnalyzed: null })));
  }, []);

  const saveConditions = useCallback(async () => {
    const executed = conditions.filter((c) => c.numbers !== null && c.numbers.length === 6);
    if (executed.length === 0) {
      setSaveConditionsMsg('저장할 결과가 없습니다.');
      setTimeout(() => setSaveConditionsMsg(''), 3000);
      return;
    }
    setIsSavingConditions(true);
    try {
      const res = await fetch('/api/lotto/save-conditions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditions: executed.map((c) => ({
            condition_text: buildConditionText(c.conditionType, c.years, c.months, c.maxWinners, c.maxPrizeAmt),
            num1: (c.numbers as number[])[0], num2: (c.numbers as number[])[1],
            num3: (c.numbers as number[])[2], num4: (c.numbers as number[])[3],
            num5: (c.numbers as number[])[4], num6: (c.numbers as number[])[5],
          })),
        }),
      });
      const data = await res.json();
      setSaveConditionsMsg(data.success ? `${executed.length}개 조건 저장 완료` : `저장 실패: ${data.error}`);
    } catch { setSaveConditionsMsg('저장 중 오류가 발생했습니다.'); }
    finally { setIsSavingConditions(false); setTimeout(() => setSaveConditionsMsg(''), 4000); }
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Section 3: Type 1 — auto recompute from Section 2
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const executedSets = conditions.filter((c) => c.numbers !== null && c.numbers.length === 6).map((c) => c.numbers as number[]);
    if (executedSets.length === 0) { setType1Numbers([]); setType1Freqs([]); return; }
    const { numbers, frequencies } = getTopSixFromNumberSets(executedSets);
    setType1Numbers(numbers);
    setType1Freqs(frequencies);
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Section 3: AI generation (Types 2 & 3)
  // ---------------------------------------------------------------------------

  const generateAIPredictions = useCallback(async () => {
    setIsGeneratingAI(true);
    setAiError('');
    setType2Provider(''); setType2Model(''); setType2Cutoff('');
    setType3Provider(''); setType3Model(''); setType3Cutoff('');
    const section2Numbers = conditions
      .filter((c) => c.numbers !== null && c.numbers.length === 6)
      .map((c) => c.numbers as number[]);

    try {
      const [res2, res3] = await Promise.all([
        fetch('/api/lotto/ai-predict', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 2, section2Numbers }),
        }),
        fetch('/api/lotto/ai-predict', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 3 }),
        }),
      ]);
      const [d2, d3] = await Promise.all([res2.json(), res3.json()]);
      if (d2.success && Array.isArray(d2.data?.combinations)) {
        setType2Numbers(d2.data.combinations);
        if (d2.data.provider) setType2Provider(d2.data.provider);
        if (d2.data.model) setType2Model(d2.data.model);
        if (d2.data.cutoff) setType2Cutoff(d2.data.cutoff);
      } else {
        setAiError(d2.error ?? 'AI 생성 오류');
      }
      if (d3.success && Array.isArray(d3.data?.combinations)) {
        setType3Numbers(d3.data.combinations);
        if (d3.data.provider) setType3Provider(d3.data.provider);
        if (d3.data.model) setType3Model(d3.data.model);
        if (d3.data.cutoff) setType3Cutoff(d3.data.cutoff);
      }
    } catch { setAiError('AI 서버 연결 오류'); }
    finally { setIsGeneratingAI(false); }
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Section 3: Save all predictions to DB
  // ---------------------------------------------------------------------------

  const savePredictions = useCallback(async (t1: number[], t2: number[][], t3: number[][]) => {
    if (t1.length !== 6 && t2.length === 0 && t3.length === 0) return;
    setIsSavingPredicted(true);
    try {
      await fetch('/api/lotto/predicted', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type1: t1, type2: t2, type3: t3 }),
      });
    } catch { /* ignore */ }
    finally { setIsSavingPredicted(false); }
  }, []);

  // Auto-save type1 when it changes
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (type1Numbers.length === 6) savePredictions(type1Numbers, type2Numbers, type3Numbers);
  }, [type1Numbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save all when AI finishes
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (type2Numbers.length > 0 || type3Numbers.length > 0) {
      savePredictions(type1Numbers, type2Numbers, type3Numbers);
    }
  }, [type2Numbers, type3Numbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh button: regenerate type1 from current section2 + call AI
  const refreshAll = useCallback(async () => {
    const executedSets = conditions.filter((c) => c.numbers !== null && c.numbers.length === 6).map((c) => c.numbers as number[]);
    if (executedSets.length > 0) {
      const { numbers, frequencies } = getTopSixFromNumberSets(executedSets);
      setType1Numbers(numbers);
      setType1Freqs(frequencies);
    }
    await generateAIPredictions();
  }, [conditions, generateAIPredictions]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="w-full h-screen overflow-hidden bg-gray-50 font-sans">
      <div className="flex gap-0 h-full">

        {/* ===== LEFT 70% ===== */}
        <div className="flex-[7] min-w-0 flex flex-col overflow-hidden">

          {/* SECTION 1 */}
          <section className="flex-[2] min-h-0 flex flex-col bg-white border-b border-r border-gray-200 shadow-sm">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <SectionHeader step={1} title="로또 1등 당첨 번호" />
              <div className="flex items-center gap-2">
                {isSyncing
                  ? <span className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium"><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />동기화 중...</span>
                  : syncMessage ? <span className="text-xs text-gray-400">{syncMessage}</span> : null}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #a5b4fc' }}>
                    <tr className="bg-indigo-50">
                      <th rowSpan={2} className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">회차</th>
                      <th rowSpan={2} className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">추첨일</th>
                      <th colSpan={6} className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700">당첨번호</th>
                      <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700">보너스</th>
                      <th rowSpan={2} className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">당첨자</th>
                      <th rowSpan={2} className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">당첨금</th>
                    </tr>
                    <tr className="bg-indigo-50">
                      {[1,2,3,4,5,6].map((n) => (
                        <th key={`wn${n}`} className="border-b border-indigo-200 px-2 py-1 text-center text-xs font-medium text-indigo-500">#{n}</th>
                      ))}
                      <th className="border-b border-indigo-200 border-l-2 border-l-indigo-200 px-2 py-1 text-center text-xs font-medium text-indigo-500">#1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">{isSyncing ? '데이터를 불러오는 중입니다...' : '데이터가 없습니다.'}</td></tr>
                    )}
                    {results.map((row, i) => (
                      <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                        <td className="border-b border-r border-gray-200 px-3 py-1 text-center text-sm font-medium text-gray-700 whitespace-nowrap">{String(row.round).padStart(5, '0')}</td>
                        <td className="border-b border-r border-gray-200 px-3 py-1 text-center text-xs text-gray-500 whitespace-nowrap">{row.draw_date}</td>
                        {[row.num1, row.num2, row.num3, row.num4, row.num5, row.num6].map((num, idx) => (
                          <td key={idx} className="border-b border-r border-gray-200 px-2 py-1 text-center"><NumberBall num={num} size="sm" /></td>
                        ))}
                        <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-1 text-center"><NumberBall num={row.bonus1} size="sm" /></td>
                        <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-1 text-center text-xs text-gray-600 whitespace-nowrap">
                          {row.first_prize_winners != null ? <span className="font-medium">{row.first_prize_winners}명</span> : '-'}
                        </td>
                        <td className="border-b border-gray-200 px-2 py-1 text-right text-xs text-gray-700 whitespace-nowrap font-medium">{formatAmount(row.first_prize_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </section>

          {/* SECTION 2 */}
          <section className="flex-[3] min-h-0 flex flex-col bg-white border-r border-gray-200 shadow-sm overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <SectionHeader step={2} title="조건별 당첨 번호 추출" />
              <div className="flex items-center gap-2">
                {saveConditionsMsg && (
                  <span className={`text-xs font-medium ${saveConditionsMsg.includes('완료') ? 'text-emerald-600' : 'text-red-500'}`}>{saveConditionsMsg}</span>
                )}
                <button onClick={resetConditionNumbers} className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all">초기화</button>
                <button onClick={saveConditions} disabled={isSavingConditions} className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                  {isSavingConditions ? '저장 중...' : '결과 저장'}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #6ee7b7' }}>
                    <tr className="bg-emerald-50">
                      <th className="border-b border-emerald-100 px-3 py-2 text-left text-xs font-semibold text-emerald-700 bg-emerald-50">조건</th>
                      <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">실행</th>
                      <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">분석 회차</th>
                      {[1,2,3,4,5,6].map((n) => (
                        <th key={`cn${n}`} className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50">#{n}</th>
                      ))}
                      <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 bg-emerald-50">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conditions.map((row, i) => (
                      <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50 transition-colors`}>
                        {/* Condition cell — single line */}
                        <td className="border-b border-gray-100 px-3 py-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                            <select value={row.conditionType} onChange={(e) => updateConditionType(row.id, Number(e.target.value) as ConditionType)}
                              className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                              <option value={1}>기간</option>
                              <option value={2}>당첨자</option>
                              <option value={3}>당첨금</option>
                            </select>
                            {row.conditionType === 1 && (
                              <>
                                <select value={row.years} onChange={(e) => updateYears(row.id, Number(e.target.value))}
                                  className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                  <option value={0}>-</option>
                                  {Array.from({ length: 20 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <span>년</span>
                                <select value={row.months} onChange={(e) => updateMonths(row.id, Number(e.target.value))}
                                  className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                  <option value={0}>-</option>
                                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <span>개월</span>
                                <span className="text-gray-400">
                                  {row.years === 0 && row.months === 0 ? '전체' : '당첨번호 빈도 상위 6개'}
                                </span>
                              </>
                            )}
                            {row.conditionType === 2 && (
                              <>
                                <input type="number" min={1} value={row.maxWinners || ''} onChange={(e) => updateMaxWinners(row.id, Number(e.target.value))}
                                  placeholder="명" className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                                <span className="text-gray-400">명 미만 빈도 상위 6개</span>
                              </>
                            )}
                            {row.conditionType === 3 && (
                              <>
                                <input type="number" min={1} value={row.maxPrizeAmt || ''} onChange={(e) => updateMaxPrizeAmt(row.id, Number(e.target.value))}
                                  placeholder="억" className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                                <span className="text-gray-400">억 이상 빈도 상위 6개</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-gray-100 px-2 py-1.5 text-center">
                          <button onClick={() => executeCondition(row.id)} disabled={row.isLoading}
                            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap">
                            {row.isLoading ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '실행'}
                          </button>
                        </td>
                        <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                          {row.roundsAnalyzed != null
                            ? <span className="text-xs font-medium text-gray-600">{row.roundsAnalyzed.toLocaleString()}회</span>
                            : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                        {[0,1,2,3,4,5].map((idx) => (
                          <td key={idx} className="border-b border-gray-100 px-3 py-1.5 text-center">
                            {row.numbers != null
                              ? <NumberBall num={row.numbers[idx]} size="sm" freq={row.frequencies != null ? row.frequencies[idx] : undefined} />
                              : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                        ))}
                        <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                          <button onClick={addConditionRow} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-600 hover:bg-emerald-100 font-bold text-sm" title="행 추가">+</button>
                          <button onClick={() => removeConditionRow(row.id)} disabled={conditions.length <= 1}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-red-400 hover:bg-red-50 font-bold text-sm disabled:opacity-25" title="행 삭제">-</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        </div>{/* end left */}

        {/* ===== RIGHT 30%: Section 3 ===== */}
        <div className="w-[30%] flex-shrink-0 h-full">
          <section className="h-full flex flex-col bg-white border-l border-gray-200 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">3</span>
                <h2 className="text-sm font-bold text-gray-800">예상 당첨 번호</h2>
              </div>
              <button onClick={refreshAll} disabled={isGeneratingAI}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap transition-all">
                {isGeneratingAI
                  ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중</>
                  : '✨ AI 당첨 번호 생성'}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col gap-2">

              {/* Type 1 */}
              <div className="flex-none rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">1</span>
                  <span className="text-xs font-semibold text-indigo-800">최다 노출 번호</span>
                  {isSavingPredicted && <span className="text-[10px] text-gray-400 ml-1">저장 중...</span>}
                </div>
                {type1Numbers.length === 6 ? (
                  <div className="flex flex-wrap gap-[15px] ml-[22px]">
                    {type1Numbers.map((num, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-0.5">
                        <NumberBall num={num} size="sm" />
                        {type1Freqs[idx] != null && (
                          <span className="text-[9px] text-indigo-400 font-medium">{type1Freqs[idx]}회</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">섹션2 조건을 실행하면 자동 생성됩니다.</p>
                )}
              </div>

              {/* Type 2 */}
              <div className="flex-none rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold">2</span>
                  <span className="text-xs font-semibold text-violet-800">AI 생성 (섹션2 기반) × 4</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-600 border border-violet-200">
                    섹션2 고빈도 번호 풀 기반
                  </span>
                  {type2Provider && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                      {type2Provider}
                    </span>
                  )}
                  {type2Model && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-500 border border-indigo-100">
                      {type2Model}
                    </span>
                  )}
                  {type2Cutoff && (
                    <span className="text-[10px] text-gray-400">학습종료 {type2Cutoff}</span>
                  )}
                </div>
                <p className="text-[10px] text-violet-500/80 leading-relaxed mb-1.5">
                  섹션2 조건을 통과한 회차의 번호를 분석하여 고빈도 번호 풀을 구성합니다.<br/>
                  해당 풀 내에서만 번호를 선택하며, Hot/Cold 가중치를 적용합니다.<br/>
                  홀짝 균형·번호대 분산·합계 100~175 범위를 검증하여 4개 조합을 생성합니다.
                </p>
                {type2Numbers.length > 0 ? (
                  <div>
                    {type2Numbers.map((combo, i) => (
                      <div key={i} className={`flex items-center gap-1.5 py-2.5 ${i > 0 ? 'border-t border-violet-100' : ''}`}>
                        <span className="text-[10px] text-violet-400 w-4 flex-shrink-0">{i+1}</span>
                        <div className="flex gap-[15px] flex-wrap">
                          {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" />)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{aiError || '버튼을 눌러 AI 번호를 생성하세요.'}</p>
                )}
              </div>

              {/* Type 3 */}
              <div className="flex-none rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">3</span>
                  <span className="text-xs font-semibold text-emerald-800">AI 생성 (1~45 전체) × 5</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-600 border border-emerald-200">
                    1~45 전체 통계 분석 기반
                  </span>
                  {type3Provider && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                      {type3Provider}
                    </span>
                  )}
                  {type3Model && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-500 border border-indigo-100">
                      {type3Model}
                    </span>
                  )}
                  {type3Cutoff && (
                    <span className="text-[10px] text-gray-400">학습종료 {type3Cutoff}</span>
                  )}
                </div>
                <p className="text-[10px] text-emerald-500/80 leading-relaxed mb-1.5">
                  역대 전체 로또 당첨번호의 출현 빈도를 통계 분석합니다.<br/>
                  빈출(Hot)·장기 미출현(Cold) 번호를 적절히 혼합하여 선택합니다.<br/>
                  번호대 분산·홀짝 균형·합계 100~175 범위를 최적화하여 5개 조합을 생성합니다.
                </p>
                {type3Numbers.length > 0 ? (
                  <div>
                    {type3Numbers.map((combo, i) => (
                      <div key={i} className={`flex items-center gap-1.5 py-2.5 ${i > 0 ? 'border-t border-emerald-100' : ''}`}>
                        <span className="text-[10px] text-emerald-400 w-4 flex-shrink-0">{i+1}</span>
                        <div className="flex gap-[15px] flex-wrap">
                          {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" />)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{aiError || '버튼을 눌러 AI 번호를 생성하세요.'}</p>
                )}
              </div>

            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
