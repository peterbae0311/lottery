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

interface ConditionRow {
  id: string;
  years: number;   // 0 = 미선택
  months: number;  // 0 = 미선택
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

function buildConditionText(years: number, months: number): string {
  if (years === 0 && months === 0) return '전체 당첨번호에서 가장 많이 나온 숫자 6개 추출';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  return `최근 ${parts.join(' ')} 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
}

function parseConditionText(text: string): { years: number; months: number } {
  const yearMatch = text.match(/(\d+)년/);
  const monthMatch = text.match(/(\d+)개월/);
  return {
    years: yearMatch ? parseInt(yearMatch[1]) : 0,
    months: monthMatch ? parseInt(monthMatch[1]) : 0,
  };
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

const DEFAULT_CONDITIONS: ConditionRow[] = [
  { id: makeId(), years: 0, months: 1,  roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
  { id: makeId(), years: 0, months: 3,  roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
  { id: makeId(), years: 0, months: 6,  roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
  { id: makeId(), years: 1, months: 0,  roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
  { id: makeId(), years: 0, months: 0,  roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
];

// ---------------------------------------------------------------------------
// Number Ball Component — lotto-style colored circle
// ---------------------------------------------------------------------------

function NumberBall({ num, size = 'md', freq }: { num: number | null; size?: 'sm' | 'md' | 'lg'; freq?: number }) {
  if (num == null) {
    const dim = size === 'lg' ? 'w-10 h-10 text-base' : size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
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
    const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
    const numText = size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[10px]' : 'text-xs';
    const freqText = size === 'lg' ? 'text-[9px]' : size === 'sm' ? 'text-[7px]' : 'text-[8px]';
    return (
      <span className={`inline-flex flex-col items-center justify-center ${dim} rounded-full ${colorClass} font-bold shadow-sm leading-none gap-0.5`}>
        <span className={numText}>{String(num).padStart(2, '0')}</span>
        <span className={`${freqText} opacity-80`}>{freq}회</span>
      </span>
    );
  }

  const dim = size === 'lg' ? 'w-10 h-10 text-base' : size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
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
    <div className="flex items-center gap-3 mb-4">
      <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold">
        {step}
      </span>
      <h2 className="text-lg font-bold text-gray-800 tracking-tight">{title}</h2>
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
          const { years, months } = parseConditionText(row.condition_text);
          return {
            id: makeId(),
            years,
            months,
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
            if (row.years === 0 && row.months === 0 && row.numbers === null) return { ...row, isLoading: false };
            try {
              const r = await fetch('/api/lotto/execute-condition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ years: row.years, months: row.months }),
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
        body: JSON.stringify({ years: row.years, months: row.months }),
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
      { id: makeId(), years: 0, months: 0, roundsAnalyzed: null, numbers: null, frequencies: null, isLoading: false },
    ]);
  }, []);

  const removeConditionRow = useCallback((rowId: string) => {
    setConditions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== rowId);
    });
  }, []);

  const updateYears = useCallback((rowId: string, years: number) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === rowId ? { ...c, years, numbers: null, frequencies: null, roundsAnalyzed: null } : c))
    );
  }, []);

  const updateMonths = useCallback((rowId: string, months: number) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === rowId ? { ...c, months, numbers: null, frequencies: null, roundsAnalyzed: null } : c))
    );
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
            condition_text: buildConditionText(c.years, c.months),
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
    <main className="w-full min-h-screen bg-gray-50 px-4 py-6 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-4">

        {/* ===== SECTION 1: 로또 1등 당첨 번호 ===== */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header bar */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <SectionHeader
              step={1}
              title="로또 1등 당첨 번호"
            />
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  동기화 중...
                </span>
              ) : syncMessage ? (
                <span className="text-xs text-gray-400">{syncMessage}</span>
              ) : null}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-indigo-50">
                    <th rowSpan={2} className="border-b border-indigo-100 px-3 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      회차
                    </th>
                    <th rowSpan={2} className="border-b border-indigo-100 px-3 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle">
                      추첨일
                    </th>
                    <th colSpan={6} className="border-b border-indigo-100 px-3 py-2 text-center text-xs font-semibold text-indigo-700">
                      당첨번호
                    </th>
                    <th colSpan={2} className="border-b border-l-2 border-indigo-100 border-l-indigo-200 px-3 py-2 text-center text-xs font-semibold text-indigo-700">
                      보너스
                    </th>
                    <th rowSpan={2} className="border-b border-l-2 border-indigo-100 border-l-indigo-200 px-1 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle w-14">
                      당첨자
                    </th>
                    <th rowSpan={2} className="border-b border-indigo-100 px-1 py-2 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap align-middle w-28">
                      당첨금
                    </th>
                  </tr>
                  <tr className="bg-indigo-50">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <th key={`wn${n}`} className="border-b border-indigo-100 px-3 py-1.5 text-center text-xs font-medium text-indigo-500">
                        #{n}
                      </th>
                    ))}
                    {[1, 2].map((n) => (
                      <th key={`bn${n}`} className={`border-b border-indigo-100 px-3 py-1.5 text-center text-xs font-medium text-indigo-500${n === 1 ? ' border-l-2 border-l-indigo-200' : ''}`}>
                        #{n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-400">
                        {isSyncing ? '데이터를 불러오는 중입니다...' : '데이터가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {results.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}
                    >
                      <td className="border-b border-gray-100 px-3 py-2 text-center text-xs font-medium text-gray-700 whitespace-nowrap">
                        {String(row.round).padStart(5, '0')}
                      </td>
                      <td className="border-b border-gray-100 px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">
                        {row.draw_date}
                      </td>
                      {/* Winning numbers with colored balls */}
                      {[row.num1, row.num2, row.num3, row.num4, row.num5, row.num6].map((num, idx) => (
                        <td key={idx} className="border-b border-gray-100 px-2 py-1.5 text-center">
                          <NumberBall num={num} size="sm" />
                        </td>
                      ))}
                      {/* Bonus numbers — left border separates from winning numbers */}
                      <td className="border-b border-l-2 border-gray-100 border-l-indigo-100 px-3 py-1.5 text-center">
                        <NumberBall num={row.bonus1} size="sm" />
                      </td>
                      <td className="border-b border-gray-100 px-3 py-1.5 text-center text-gray-300 text-xs">-</td>
                      <td className="border-b border-l-2 border-gray-100 border-l-indigo-100 px-1 py-1.5 text-center text-xs text-gray-600 whitespace-nowrap w-14">
                        {row.first_prize_winners != null ? (
                          <span className="font-medium">{row.first_prize_winners}명</span>
                        ) : '-'}
                      </td>
                      <td className="border-b border-gray-100 px-1 py-1.5 text-right text-xs text-gray-700 whitespace-nowrap font-medium w-28">
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
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header bar */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <SectionHeader step={2} title="조건별 당첨 번호 추출" />
            <div className="flex items-center gap-3">
              {saveConditionsMsg && (
                <span className={`text-xs font-medium ${saveConditionsMsg.includes('완료') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {saveConditionsMsg}
                </span>
              )}
              <button
                onClick={resetConditionNumbers}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all shadow-sm whitespace-nowrap"
              >
                초기화
              </button>
              <button
                onClick={saveConditions}
                disabled={isSavingConditions}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
              >
                {isSavingConditions ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </>
                ) : '결과 저장'}
              </button>
            </div>
          </div>

          {/* Table — single table, sticky thead, tbody scrolls at 6 rows */}
          <div className="overflow-x-auto">
            <div className="overflow-y-auto" style={{ maxHeight: '334px' }}>
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-emerald-50">
                    <th className="border-b border-emerald-100 px-3 py-2 text-left text-xs font-semibold text-emerald-700 bg-emerald-50 w-[80ch]">
                      조건
                    </th>
                    <th className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">
                      실행
                    </th>
                    <th className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">
                      분석 회차
                    </th>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <th key={`cn${n}`} className="border-b border-emerald-100 px-5 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50">
                        #{n}
                      </th>
                    ))}
                    <th className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-semibold text-emerald-700 bg-emerald-50">
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
                      <td className="border-b border-gray-100 px-3 py-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                          <select
                            value={row.years}
                            onChange={(e) => updateYears(row.id, Number(e.target.value))}
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
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
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
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
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center">
                        <button
                          onClick={() => executeCondition(row.id)}
                          disabled={row.isLoading}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {row.isLoading ? (
                            <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : '실행'}
                        </button>
                      </td>
                      <td className="border-b border-gray-100 px-3 py-1.5 text-center whitespace-nowrap">
                        {row.roundsAnalyzed != null ? (
                          <span className="text-xs font-medium text-gray-600">{row.roundsAnalyzed.toLocaleString()}회</span>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <td key={idx} className="border-b border-gray-100 px-5 py-1.5 text-center">
                          {row.numbers != null ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <NumberBall num={row.numbers[idx]} size="sm" />
                              <span className="text-[10px] text-gray-400 leading-none">
                                {row.frequencies != null ? `${row.frequencies[idx]}회` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300 font-mono text-xs">-</span>
                          )}
                        </td>
                      ))}
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                        <button
                          onClick={addConditionRow}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-600 hover:bg-emerald-100 font-bold text-sm transition-colors"
                          title="행 추가"
                        >+</button>
                        <button
                          onClick={() => removeConditionRow(row.id)}
                          disabled={conditions.length <= 1}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-red-400 hover:bg-red-50 font-bold text-sm transition-colors disabled:opacity-25"
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

        {/* ===== SECTION 3: 예상 당첨 번호 추출 ===== */}
        <section className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl shadow-md overflow-hidden">
          <div className="px-5 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-white text-xs font-bold">
                3
              </span>
              <h2 className="text-sm font-bold text-white tracking-tight">예상 당첨 번호</h2>
              <span className="text-xs text-indigo-200">조건별 결과에서 빈도 상위 6개</span>
            </div>
            {isSavingPredicted && (
              <span className="text-xs text-indigo-200">저장 중...</span>
            )}
            {predictedNumbers.length === 6 ? (
              <div className="flex items-center gap-3 flex-wrap">
                {predictedNumbers.map((num, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="text-xs text-indigo-300">#{idx + 1}</span>
                    <NumberBall num={num} size="md" freq={predictedFrequencies[idx]} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-indigo-200 text-xs">
                조건을 실행하면 예상 번호가 표시됩니다.
              </p>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
