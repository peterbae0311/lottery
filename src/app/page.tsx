'use client';

import { useEffect, useState, useCallback } from 'react';

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
  // Type 1: 기간
  years: number;
  months: number;
  // Type 2: 당첨자 수 미만
  maxWinners: number;
  // Type 3: 당첨금 미만 (억 단위)
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

function padNumber(num: number | null): string {
  if (num == null) return '-';
  return String(num).padStart(2, '0');
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
  return {
    numbers: top6.map((x) => x.num),
    frequencies: top6.map((x) => x.count),
  };
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
// Number Ball Component — lotto-style colored circle
// ---------------------------------------------------------------------------

function NumberBall({ num, size = 'md', freq }: { num: number | null; size?: 'sm' | 'md' | 'lg'; freq?: number }) {
  if (num == null) {
    const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
    return (
      <span className={`inline-flex items-center justify-center ${dim} rounded-full bg-gray-100 text-gray-400 font-bold`}>
        -
      </span>
    );
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
    const freqText = size === 'lg' ? 'text-[10px]' : size === 'sm' ? 'text-[9px]' : 'text-[9px]';
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
// Section Header Component
// ---------------------------------------------------------------------------

function SectionHeader({ step, title, badge }: { step: number; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-0">
      <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold">
        {step}
      </span>
      <h2 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h2>
      {badge}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function Home() {
  const [results, setResults] = useState<LottoResult[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>(DEFAULT_CONDITIONS);
  const [predictedNumbers, setPredictedNumbers] = useState<number[]>([]);
  const [predictedFrequencies, setPredictedFrequencies] = useState<number[]>([]);
  const [isSavingPredicted, setIsSavingPredicted] = useState(false);
  const [isSavingConditions, setIsSavingConditions] = useState(false);
  const [saveConditionsMsg, setSaveConditionsMsg] = useState('');

  // ---------------------------------------------------------------------------
  // Section 2: Load saved conditions from DB on mount
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
            id: makeId(),
            conditionType,
            years,
            months,
            maxWinners,
            maxPrizeAmt,
            roundsAnalyzed: null,
            numbers: [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6],
            frequencies: null,
            isLoading: true,
          };
        });
        setConditions(initial);

        // 빈도수를 가져오기 위해 전체 조건 병렬 실행
        const executed = await Promise.all(
          initial.map(async (row) => {
            try {
              const r = await fetch('/api/lotto/execute-condition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt }),
              });
              const d = await r.json();
              if (d.success && Array.isArray(d.data?.numbers)) {
                return {
                  ...row,
                  numbers: d.data.numbers,
                  frequencies: d.data.frequencies ?? null,
                  roundsAnalyzed: d.data.rounds_analyzed ?? null,
                  isLoading: false,
                };
              }
            } catch { /* ignore */ }
            return { ...row, isLoading: false };
          })
        );
        setConditions(executed);
      } catch {
        // DB 조회 실패 시 기본값 유지
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Section 1: Sync + Load results
  // ---------------------------------------------------------------------------

  const syncAndLoad = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage('동기화 중...');
    try {
      const syncRes = await fetch('/api/lotto/sync');
      const syncData = await syncRes.json();
      if (syncData.success) {
        const synced = syncData.data?.syncedRounds ?? 0;
        setSyncMessage(synced > 0 ? `${synced}개 회차 동기화 완료` : '최신 데이터입니다');
      } else {
        setSyncMessage('동기화 실패: ' + (syncData.error ?? ''));
      }
    } catch {
      setSyncMessage('동기화 중 오류 발생');
    } finally {
      setIsSyncing(false);
    }

    // Load results regardless of sync outcome
    try {
      const res = await fetch('/api/lotto/results');
      const data = await res.json();
      if (data.success) {
        setResults(data.data ?? []);
      }
    } catch {
      // silently fail — table might be empty
    }
  }, []);

  useEffect(() => {
    syncAndLoad();
  }, [syncAndLoad]);

  // ---------------------------------------------------------------------------
  // Section 2: Condition-based extraction
  // ---------------------------------------------------------------------------

  const executeCondition = useCallback(async (rowId: string) => {
    const row = conditions.find((c) => c.id === rowId);
    if (!row) return;

    setConditions((prev) =>
      prev.map((c) => (c.id === rowId ? { ...c, isLoading: true } : c))
    );

    try {
      const res = await fetch('/api/lotto/execute-condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.numbers)) {
        setConditions((prev) =>
          prev.map((c) =>
            c.id === rowId ? { ...c, numbers: data.data.numbers, frequencies: data.data.frequencies ?? null, roundsAnalyzed: data.data.rounds_analyzed ?? null, isLoading: false } : c
          )
        );
      } else {
        setConditions((prev) =>
          prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c))
        );
      }
    } catch {
      setConditions((prev) =>
        prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c))
      );
    }
  }, [conditions]);

  const addConditionRow = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      { id: makeId(), conditionType: 1, years: 0, months: 0, maxWinners: 0, maxPrizeAmt: 0, ...BLANK_ROW },
    ]);
  }, []);

  const removeConditionRow = useCallback((rowId: string) => {
    setConditions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== rowId);
    });
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
    setConditions((prev) =>
      prev.map((c) => ({ ...c, numbers: null, frequencies: null, roundsAnalyzed: null }))
    );
  }, []);

  const saveConditions = useCallback(async () => {
    const executed = conditions.filter((c) => c.numbers !== null && c.numbers.length === 6);
    if (executed.length === 0) {
      setSaveConditionsMsg('저장할 결과가 없습니다. 먼저 조건을 실행해주세요.');
      setTimeout(() => setSaveConditionsMsg(''), 3000);
      return;
    }
    setIsSavingConditions(true);
    setSaveConditionsMsg('');
    try {
      const res = await fetch('/api/lotto/save-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditions: executed.map((c) => ({
            condition_text: buildConditionText(c.conditionType, c.years, c.months, c.maxWinners, c.maxPrizeAmt),
            num1: (c.numbers as number[])[0],
            num2: (c.numbers as number[])[1],
            num3: (c.numbers as number[])[2],
            num4: (c.numbers as number[])[3],
            num5: (c.numbers as number[])[4],
            num6: (c.numbers as number[])[5],
          })),
        }),
      });
      const data = await res.json();
      setSaveConditionsMsg(data.success ? `${executed.length}개 조건 저장 완료` : `저장 실패: ${data.error}`);
    } catch {
      setSaveConditionsMsg('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingConditions(false);
      setTimeout(() => setSaveConditionsMsg(''), 4000);
    }
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Section 3: Predicted numbers — recompute when Section 2 results change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const executedSets = conditions
      .filter((c) => c.numbers !== null && c.numbers.length === 6)
      .map((c) => c.numbers as number[]);

    if (executedSets.length === 0) {
      setPredictedNumbers([]);
      setPredictedFrequencies([]);
      return;
    }

    const { numbers: top6, frequencies } = getTopSixFromNumberSets(executedSets);
    setPredictedNumbers(top6);
    setPredictedFrequencies(frequencies);

    // Save to DB (fire and forget)
    if (top6.length === 6) {
      setIsSavingPredicted(true);
      fetch('/api/lotto/predicted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: executedSets }),
      })
        .then(() => setIsSavingPredicted(false))
        .catch(() => setIsSavingPredicted(false));
    }
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="w-full h-screen overflow-hidden bg-gray-50 px-6 py-4 font-sans">
      <div className="max-w-screen-2xl mx-auto flex gap-6 h-full">

        {/* ===== LEFT 80%: Sections 1 & 2 ===== */}
        <div className="flex-[4] min-w-0 flex flex-col gap-4 overflow-hidden">

        {/* ===== SECTION 1: 로또 1등 당첨 번호 ===== */}
        <section className="flex-[2] min-h-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header bar */}
          <div className="flex-none px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <SectionHeader
              step={1}
              title="로또 1등 당첨 번호"
            />
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  동기화 중...
                </span>
              ) : syncMessage ? (
                <span className="text-sm text-gray-400">{syncMessage}</span>
              ) : null}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #a5b4fc' }}>
                  <tr className="bg-indigo-50">
                    <th rowSpan={2} className="border-b border-indigo-200 px-3 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      회차
                    </th>
                    <th rowSpan={2} className="border-b border-indigo-200 px-3 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      추첨일
                    </th>
                    <th colSpan={6} className="border-b border-indigo-200 px-2 py-2 text-center text-xs font-semibold text-indigo-700">
                      당첨번호
                    </th>
                    <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-2 text-center text-xs font-semibold text-indigo-700">
                      보너스
                    </th>
                    <th rowSpan={2} className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      당첨자
                    </th>
                    <th rowSpan={2} className="border-b border-indigo-200 px-2 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      당첨금
                    </th>
                  </tr>
                  <tr className="bg-indigo-50">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <th key={`wn${n}`} className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs font-medium text-indigo-500">
                        #{n}
                      </th>
                    ))}
                    <th className="border-b border-indigo-200 border-l-2 border-l-indigo-200 px-2 py-1.5 text-center text-xs font-medium text-indigo-500">
                      #1
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                        {isSyncing ? '데이터를 불러오는 중입니다...' : '데이터가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {results.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}
                    >
                      <td className="border-b border-r border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 whitespace-nowrap">
                        {String(row.round).padStart(5, '0')}
                      </td>
                      <td className="border-b border-r border-gray-200 px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">
                        {row.draw_date}
                      </td>
                      {[row.num1, row.num2, row.num3, row.num4, row.num5, row.num6].map((num, idx) => (
                        <td key={idx} className="border-b border-r border-gray-200 px-2 py-1.5 text-center">
                          <NumberBall num={num} size="sm" />
                        </td>
                      ))}
                      <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-1.5 text-center">
                        <NumberBall num={row.bonus1} size="sm" />
                      </td>
                      <td className="border-b border-r border-l-2 border-gray-200 border-l-indigo-200 px-2 py-2 text-center text-xs text-gray-600 whitespace-nowrap">
                        {row.first_prize_winners != null ? (
                          <span className="font-medium">{row.first_prize_winners}명</span>
                        ) : '-'}
                      </td>
                      <td className="border-b border-gray-200 px-2 py-2 text-right text-xs text-gray-700 whitespace-nowrap font-medium">
                        {formatAmount(row.first_prize_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ===== SECTION 2: 조건별 당첨 번호 추출 ===== */}
        <section className="flex-[3] min-h-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header bar */}
          <div className="flex-none px-6 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <SectionHeader step={2} title="조건별 당첨 번호 추출" />
            <div className="flex items-center gap-3">
              {saveConditionsMsg && (
                <span className={`text-sm font-medium ${saveConditionsMsg.includes('완료') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {saveConditionsMsg}
                </span>
              )}
              <button
                onClick={resetConditionNumbers}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all shadow-sm whitespace-nowrap"
              >
                초기화
              </button>
              <button
                onClick={saveConditions}
                disabled={isSavingConditions}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
              >
                {isSavingConditions ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </>
                ) : '결과 저장'}
              </button>
            </div>
          </div>

          {/* Table — single table, sticky thead, tbody scrolls */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #6ee7b7' }}>
                  <tr className="bg-emerald-50">
                    <th className="border-b border-emerald-100 px-4 py-3 text-left text-sm font-semibold text-emerald-700 bg-emerald-50">
                      조건
                    </th>
                    <th className="border-b border-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">
                      실행
                    </th>
                    <th className="border-b border-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">
                      분석 회차
                    </th>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <th key={`cn${n}`} className="border-b border-emerald-100 px-3 py-3 text-center text-sm font-medium text-emerald-600 bg-emerald-50">
                        #{n}
                      </th>
                    ))}
                    <th className="border-b border-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-700 bg-emerald-50">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50 transition-colors`}
                    >
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                          <select
                            value={row.conditionType}
                            onChange={(e) => updateConditionType(row.id, Number(e.target.value) as ConditionType)}
                            className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          >
                            <option value={1}>기간</option>
                            <option value={2}>당첨자</option>
                            <option value={3}>당첨금</option>
                          </select>

                          {row.conditionType === 1 && (
                            <>
                              <select
                                value={row.years}
                                onChange={(e) => updateYears(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              >
                                <option value={0}>-</option>
                                {Array.from({ length: 20 }, (_, i) => i + 1).map((y) => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                              <span>년</span>
                              <select
                                value={row.months}
                                onChange={(e) => updateMonths(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              >
                                <option value={0}>-</option>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                              <span>개월</span>
                              {row.years === 0 && row.months === 0 ? (
                                <span className="font-semibold text-emerald-600">전체</span>
                              ) : (
                                <span>당첨번호에서 가장 많이 나온 숫자 6개 추출</span>
                              )}
                            </>
                          )}

                          {row.conditionType === 2 && (
                            <>
                              <input
                                type="number"
                                min={1}
                                value={row.maxWinners || ''}
                                onChange={(e) => updateMaxWinners(row.id, Number(e.target.value))}
                                placeholder="명"
                                className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 bg-white w-20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                              <span>명 미만 당첨번호에서 가장 많이 나온 숫자 6개 추출</span>
                            </>
                          )}

                          {row.conditionType === 3 && (
                            <>
                              <input
                                type="number"
                                min={1}
                                value={row.maxPrizeAmt || ''}
                                onChange={(e) => updateMaxPrizeAmt(row.id, Number(e.target.value))}
                                placeholder="억"
                                className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700 bg-white w-20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                              <span>억 이상 당첨번호에서 가장 많이 나온 숫자 6개 추출</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-3 py-3 text-center">
                        <button
                          onClick={() => executeCondition(row.id)}
                          disabled={row.isLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {row.isLoading ? (
                            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : '실행'}
                        </button>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-center whitespace-nowrap">
                        {row.roundsAnalyzed != null ? (
                          <span className="text-sm font-medium text-gray-600">{row.roundsAnalyzed.toLocaleString()}회</span>
                        ) : (
                          <span className="text-gray-300 text-sm">-</span>
                        )}
                      </td>
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <td key={idx} className="border-b border-gray-100 px-3 py-3 text-center">
                          {row.numbers != null ? (
                            <NumberBall num={row.numbers[idx]} size="md" freq={row.frequencies != null ? row.frequencies[idx] : undefined} />
                          ) : (
                            <span className="text-gray-300 font-mono text-sm">-</span>
                          )}
                        </td>
                      ))}
                      <td className="border-b border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={addConditionRow}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-emerald-600 hover:bg-emerald-100 font-bold text-base transition-colors"
                          title="행 추가"
                        >+</button>
                        <button
                          onClick={() => removeConditionRow(row.id)}
                          disabled={conditions.length <= 1}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-red-400 hover:bg-red-50 font-bold text-base transition-colors disabled:opacity-25"
                          title="행 삭제"
                        >-</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        </div>{/* end left 80% */}

        {/* ===== RIGHT 20%: Section 3 ===== */}
        <div className="w-1/5 flex-shrink-0 h-full">
          <section className="h-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-auto">
            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold">3</span>
                <h2 className="text-base font-bold text-gray-800 tracking-tight">예상 당첨 번호</h2>
              </div>
              <p className="text-sm text-gray-400 mb-6">조건별 결과에서 빈도 상위 6개</p>

              {predictedNumbers.length === 6 ? (
                <div className="space-y-4">
                  {predictedNumbers.map((num, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <span className="text-sm text-gray-400 w-6 text-right font-medium">#{idx + 1}</span>
                      <NumberBall num={num} size="lg" freq={predictedFrequencies[idx]} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm leading-relaxed">
                  조건을 실행하면<br />예상 번호가<br />표시됩니다.
                </p>
              )}

              {isSavingPredicted && (
                <p className="text-sm text-gray-400 mt-4">저장 중...</p>
              )}
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
