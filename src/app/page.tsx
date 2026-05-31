'use client';

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';

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
  distribution: number[] | null; // [01-09, 10-19, 20-29, 30-39, 40-45]
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


const BLANK_ROW = { roundsAnalyzed: null, numbers: null, frequencies: null, distribution: null, isLoading: false };
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

function getLottoColor(num: number): string {
  if (num <= 10) return 'bg-yellow-400 text-white';
  if (num <= 20) return 'bg-blue-500 text-white';
  if (num <= 30) return 'bg-red-500 text-white';
  if (num <= 40) return 'bg-slate-500 text-white';
  return 'bg-green-500 text-white';
}

function NumberBall({ num, size = 'md', freq, hoverFreq, highlighted }: { num: number | null; size?: 'sm' | 'md' | 'lg'; freq?: number; hoverFreq?: number; highlighted?: boolean }) {
  if (num == null) {
    const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
    return <span className={`inline-flex items-center justify-center ${dim} rounded-full bg-gray-100 text-gray-400 font-bold`}>-</span>;
  }

  const colorClass = highlighted ? getLottoColor(num) : 'bg-white border border-gray-300 text-gray-500';

  if (freq != null) {
    const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
    const numText = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm';
    const freqText = size === 'lg' ? 'text-[10px]' : 'text-[9px]';
    return (
      <span className={`inline-flex flex-col items-center justify-center ${dim} rounded-full ${colorClass} font-bold leading-none gap-0.5`}>
        <span className={numText}>{String(num).padStart(2, '0')}</span>
        <span className={`${freqText} opacity-80`}>{freq}회</span>
      </span>
    );
  }

  const dim = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-sm';
  const ball = (
    <span className={`inline-flex items-center justify-center ${dim} rounded-full ${colorClass} font-bold`}>
      {String(num).padStart(2, '0')}
    </span>
  );

  // 호버 시 빈도 표시 (hoverFreq)
  if (hoverFreq != null) {
    return (
      <span className="relative group inline-flex flex-col items-center">
        {ball}
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-gray-800 text-white text-[9px] font-medium px-1.5 py-0.5 rounded
          opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-10">
          {hoverFreq}회
        </span>
      </span>
    );
  }

  return ball;
}

// ---------------------------------------------------------------------------
// DistributionPopup
// ---------------------------------------------------------------------------

function DistributionPopup({
  distribution, conditionText, roundsAnalyzed, onClose,
}: {
  distribution: number[];
  conditionText: string;
  roundsAnalyzed: number | null;
  onClose: () => void;
}) {
  const LABELS  = ['01 ~ 09', '10 ~ 19', '20 ~ 29', '30 ~ 39', '40 ~ 45'];
  const COLORS  = ['bg-yellow-400', 'bg-blue-500', 'bg-red-500', 'bg-orange-500', 'bg-green-500'];
  const TEXTCOL = ['text-yellow-600', 'text-blue-600', 'text-red-600', 'text-orange-600', 'text-green-600'];
  const total   = distribution.reduce((a, b) => a + b, 0);
  const maxVal  = Math.max(...distribution, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl px-7 py-6 w-[480px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800">📊 번호 분포도</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
        </div>
        <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
          {conditionText}
          {roundsAnalyzed != null ? <span className="ml-1 text-indigo-400 font-medium">· 분석 {roundsAnalyzed.toLocaleString()}회차</span> : ''}
        </p>

        {/* Bars */}
        <div className="space-y-3.5">
          {distribution.map((count, i) => {
            const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
            const barPct = (count / maxVal) * 100;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-[11px] font-semibold w-[60px] flex-shrink-0 ${TEXTCOL[i]}`}>{LABELS[i]}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${COLORS[i]} rounded-full`}
                    style={{ width: `${barPct}%`, transition: 'width 0.5s ease' }}
                  />
                </div>
                <div className="flex items-baseline gap-1 w-[90px] flex-shrink-0 justify-end">
                  <span className="text-xs font-semibold text-gray-700">{count.toLocaleString()}회</span>
                  <span className="text-[10px] text-gray-400">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">전체 <b>{total.toLocaleString()}</b>개 번호 분석</span>
          <div className="flex gap-2.5">
            {LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${COLORS[i]}`} />
                <span className="text-[9px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconList = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3" cy="6" r="0.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="12" r="0.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="18" r="0.5" fill="currentColor" stroke="none"/>
  </svg>
);

const IconBarChart = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

const IconDice = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
  <svg className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title, small }: { icon: ReactNode; title: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-shrink-0 inline-flex items-center justify-center ${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-indigo-600 text-white`}>{icon}</span>
      <h2 className={`${small ? 'text-sm' : 'text-xl'} font-bold text-gray-800 tracking-tight`}>{title}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prize tier helpers
// ---------------------------------------------------------------------------

function getPrizeTier(matchCount: number, bonusMatch: boolean): string {
  if (matchCount === 6) return '1등';
  if (matchCount === 5 && bonusMatch) return '2등';
  if (matchCount === 5) return '3등';
  if (matchCount === 4) return '4등';
  if (matchCount === 3) return '5등';
  return '낙첨';
}

function getTierStyle(tier: string): string {
  if (tier === '1등') return 'text-yellow-700 bg-yellow-100 border-yellow-200';
  if (tier === '2등') return 'text-orange-700 bg-orange-100 border-orange-200';
  if (tier === '3등') return 'text-red-700 bg-red-100 border-red-200';
  if (tier === '4등') return 'text-blue-700 bg-blue-100 border-blue-200';
  if (tier === '5등') return 'text-emerald-700 bg-emerald-100 border-emerald-200';
  return 'text-gray-400 bg-gray-100 border-gray-200';
}

function getTierTextColor(tier: string): string {
  if (tier === '1등') return 'text-yellow-700';
  if (tier === '2등') return 'text-orange-700';
  if (tier === '3등') return 'text-red-700';
  if (tier === '4등') return 'text-blue-700';
  if (tier === '5등') return 'text-emerald-700';
  return 'text-gray-400';
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
  const [type3Numbers, setType3Numbers] = useState<number[][]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [isSavingPredicted, setIsSavingPredicted] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  // DB에서 불러온 직후 auto-save 방지용 플래그
  const skipSaveRef = useRef(false);

  // 분포도 팝업
  const [distPopup, setDistPopup] = useState<{
    distribution: number[];
    conditionText: string;
    roundsAnalyzed: number | null;
  } | null>(null);
  const [distLoadingIds, setDistLoadingIds] = useState<Set<string>>(new Set());

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
          if (Array.isArray(data.data.type3) && data.data.type3.length > 0) setType3Numbers(data.data.type3);
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
          c.id === rowId ? {
            ...c,
            numbers: data.data.numbers,
            frequencies: data.data.frequencies ?? null,
            roundsAnalyzed: data.data.rounds_analyzed ?? null,
            distribution: data.data.distribution ?? null,
            isLoading: false,
          } : c
        ));
      } else {
        setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
      }
    } catch {
      setConditions((prev) => prev.map((c) => (c.id === rowId ? { ...c, isLoading: false } : c)));
    }
  }, [conditions]);

  // 분포도 버튼: 이미 데이터 있으면 바로 팝업, 없으면 독립 API 호출 후 팝업
  const openDistribution = useCallback(async (rowId: string) => {
    const row = conditions.find((c) => c.id === rowId);
    if (!row) return;

    // 이미 분포 데이터가 있으면 즉시 팝업
    if (row.distribution) {
      setDistPopup({
        distribution: row.distribution,
        conditionText: buildConditionText(row.conditionType, row.years, row.months, row.maxWinners, row.maxPrizeAmt),
        roundsAnalyzed: row.roundsAnalyzed,
      });
      return;
    }

    // 분포 데이터 없으면 독립적으로 fetch
    setDistLoadingIds((prev) => new Set(prev).add(rowId));
    try {
      const res = await fetch('/api/lotto/execute-condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.distribution)) {
        const dist: number[] = data.data.distribution;
        // 분포 데이터만 조용히 저장 (numbers는 덮어쓰지 않음)
        setConditions((prev) => prev.map((c) =>
          c.id === rowId ? { ...c, distribution: dist, roundsAnalyzed: data.data.rounds_analyzed ?? c.roundsAnalyzed } : c
        ));
        setDistPopup({
          distribution: dist,
          conditionText: buildConditionText(row.conditionType, row.years, row.months, row.maxWinners, row.maxPrizeAmt),
          roundsAnalyzed: data.data.rounds_analyzed ?? row.roundsAnalyzed,
        });
      }
    } catch { /* ignore */ }
    finally {
      setDistLoadingIds((prev) => { const s = new Set(prev); s.delete(rowId); return s; });
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
  // Section 3: AI generation (Type 3)
  // ---------------------------------------------------------------------------

  const generateAIPredictions = useCallback(async (targetRound?: number) => {
    setIsGeneratingAI(true);
    setAiError('');
    // Find the round prior to targetRound for the 직전 회차 제외 rule
    const targetIdx = targetRound != null
      ? results.findIndex(r => r.round === targetRound)
      : 0;
    const prevResult = targetIdx >= 0 && targetIdx + 1 < results.length ? results[targetIdx + 1] : null;
    const lastDrawNumbers = prevResult
      ? [prevResult.num1, prevResult.num2, prevResult.num3, prevResult.num4, prevResult.num5, prevResult.num6]
          .filter((n): n is number => n !== null)
      : [];
    try {
      const res = await fetch('/api/lotto/ai-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastDrawNumbers }),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.data?.combinations)) {
        skipSaveRef.current = true;
        setType3Numbers(d.data.combinations);
        await fetch('/api/lotto/predicted', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type3: d.data.combinations }),
        });
        setTimeout(() => { skipSaveRef.current = false; }, 0);
      } else {
        setAiError(d.error ?? '조합 생성 오류');
      }
    } catch { setAiError('서버 연결 오류'); }
    finally { setIsGeneratingAI(false); }
  }, [results]);

  // ---------------------------------------------------------------------------
  // Section 3: Save all predictions to DB
  // ---------------------------------------------------------------------------

  const savePredictions = useCallback(async (t3: number[][]) => {
    if (t3.length === 0) return;
    setIsSavingPredicted(true);
    try {
      await fetch('/api/lotto/predicted', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type3: t3 }),
      });
    } catch { /* ignore */ }
    finally { setIsSavingPredicted(false); }
  }, []);

  // Auto-save type3 when it changes
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (type3Numbers.length > 0) savePredictions(type3Numbers);
  }, [type3Numbers]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = useCallback(async () => {
    await generateAIPredictions(selectedRound ?? undefined);
  }, [generateAIPredictions, selectedRound]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="w-full bg-gray-50 md:h-screen md:overflow-hidden">
      <div className="flex flex-col md:flex-row md:h-full">

        {/* ===== LEFT: Sections 1 & 2 ===== */}
        <div className="flex flex-col md:flex-[6] md:min-w-0 md:overflow-hidden">

          {/* SECTION 1 */}
          <section className="flex flex-col bg-white border-b border-gray-200 shadow-sm md:flex-[2] md:min-h-0 md:border-r">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <SectionHeader icon={<IconList />} title="참고) 로또 당첨 번호" small />
              <div className="flex items-center gap-2">
                {isSyncing
                  ? <span className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium"><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />동기화 중...</span>
                  : syncMessage ? <span className="text-xs text-gray-400">{syncMessage}</span> : null}
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-56 md:max-h-none md:flex-1">
              <table className="w-full border-separate border-spacing-0 text-sm min-w-[560px]">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #a5b4fc' }}>
                  <tr className="bg-indigo-50">
                    <th className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap">회차</th>
                    <th className="border-b border-indigo-200 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap">추첨일</th>
                    <th colSpan={6} className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700">당첨번호</th>
                    <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700">보너스</th>
                    <th className="border-b border-l-2 border-indigo-200 border-l-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap">당첨자</th>
                    <th className="border-b border-indigo-200 px-2 py-1.5 text-center text-xs font-semibold text-indigo-700 whitespace-nowrap">당첨금</th>
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
          <section className="flex flex-col bg-white border-b border-gray-200 shadow-sm md:flex-[3] md:min-h-0 md:border-r md:overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <SectionHeader icon={<IconBarChart />} title="참고) 당첨 빈도 분석" small />
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
            <div className="overflow-x-auto overflow-y-auto max-h-72 md:max-h-none md:flex-1 md:min-h-0">
              <table className="w-full border-separate border-spacing-0 text-xs min-w-[600px]">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #6ee7b7' }}>
                  <tr className="bg-emerald-50">
                    <th className="border-b border-emerald-100 px-3 py-2 text-left text-xs font-semibold text-emerald-700 bg-emerald-50">조건</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">실행</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">분석 회차</th>
                    <th colSpan={6} className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50">추출번호</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 bg-emerald-50">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((row, i) => (
                    <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50 transition-colors`}>
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
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => executeCondition(row.id)} disabled={row.isLoading}
                            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap">
                            {row.isLoading ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '실행'}
                          </button>
                          <button
                            onClick={() => openDistribution(row.id)}
                            disabled={distLoadingIds.has(row.id)}
                            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
                            title="번호 분포도 보기"
                          >
                            {distLoadingIds.has(row.id)
                              ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : '분포도'}
                          </button>
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-2 py-1.5 text-center whitespace-nowrap">
                        {row.roundsAnalyzed != null
                          ? <span className="text-xs font-medium text-gray-600">{row.roundsAnalyzed.toLocaleString()}회</span>
                          : <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      {[0,1,2,3,4,5].map((idx) => (
                        <td key={idx} className="border-b border-gray-100 px-3 py-1.5 text-center">
                          {row.numbers != null
                            ? <NumberBall num={row.numbers[idx]} size="sm" hoverFreq={row.frequencies != null ? row.frequencies[idx] : undefined} />
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
          </section>

        </div>{/* end left */}

        {/* ===== RIGHT: Section 3 ===== */}
        <div className="md:w-[40%] md:flex-shrink-0 md:h-full">
          <section className="flex flex-col bg-white border-t border-gray-200 shadow-sm md:h-full md:border-t-0 md:border-l md:overflow-hidden">

            {/* Header */}
            <div className="flex-none px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-y-2 md:px-5 md:py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 text-white">
                  <IconDice size="md" />
                </span>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">예상 당첨 번호</h2>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedRound ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setSelectedRound(null);
                      generateAIPredictions(undefined);
                    } else {
                      const round = Number(val);
                      setSelectedRound(round);
                      generateAIPredictions(round);
                    }
                  }}
                  disabled={isGeneratingAI || results.length === 0}
                  className="flex-1 sm:flex-none min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                >
                  <option value="">회차 선택</option>
                  {results.map(r => (
                    <option key={r.round} value={r.round}>{r.round}회 ({r.draw_date})</option>
                  ))}
                </select>
                <button onClick={refreshAll} disabled={isGeneratingAI}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap transition-all shadow-sm">
                  {isGeneratingAI
                    ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중</>
                    : '🎲 비인기 조합 생성'}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 py-4 flex flex-col gap-4 md:flex-1 md:min-h-0 md:overflow-hidden md:px-5">

              {/* Logic description card */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white px-4 py-3 md:flex-1 md:min-h-0 md:overflow-y-auto">
                <h3 className="text-base font-bold text-indigo-900 mb-3">생성 전략</h3>
                <div className="flex flex-col gap-2">
                  {[
                    { tag: '생일 편향 회피', color: 'bg-indigo-100 text-indigo-700', desc: '32~45번에 3배 가중치 — 1~31은 생일 선택 편향으로 당첨 시 수령액 감소' },
                    { tag: '저번호 제한',    color: 'bg-blue-100 text-blue-700',    desc: '1~31 범위에서 최대 3개까지만 포함' },
                    { tag: '합계 범위',      color: 'bg-emerald-100 text-emerald-700', desc: '6개 번호의 합: 100 ~ 175' },
                    { tag: '홀짝 균형',      color: 'bg-amber-100 text-amber-700',  desc: '홀수 2~4개, 짝수 2~4개 유지' },
                    { tag: '연속번호 제한',  color: 'bg-orange-100 text-orange-700', desc: '연속된 번호 최대 2개 (3,4 허용 / 3,4,5 불가)' },
                    { tag: '등차수열 제외',  color: 'bg-red-100 text-red-700',      desc: '간격 ≤5의 3항 패턴 제외 (예: 5, 10, 15)' },
                    { tag: '조합 다양성',    color: 'bg-violet-100 text-violet-700', desc: '5개 조합끼리 공통 번호 최대 3개 — 유사 조합 방지' },
                    { tag: '끝자리 분산',    color: 'bg-pink-100 text-pink-700',    desc: '같은 끝자리(예: 5·15·25) 최대 2개 — 날짜 선택 패턴 회피' },
                    { tag: '직전 회차 제외', color: 'bg-gray-100 text-gray-700',    desc: '직전 당첨번호와 4개 이상 겹치는 조합 제외' },
                  ].map(({ tag, color, desc }) => (
                    <div key={tag} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-[108px] px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${color}`}>{tag}</span>
                      <span className="text-xs text-gray-600 leading-snug pt-0.5">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Type 3 */}
              <div className="flex-none flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 md:px-5">
                <div className="flex-none flex items-center justify-between mb-3">
                  <span className="text-base font-bold text-emerald-900">비인기 조합 생성 &times; 5</span>
                  {isSavingPredicted && <span className="text-xs text-gray-400">저장 중...</span>}
                </div>
                {type3Numbers.length > 0 ? (
                  <>
                    <div className="flex flex-col">
                      {(() => {
                        const ref = selectedRound != null ? results.find(r => r.round === selectedRound) : null;
                        const matchSet = ref != null
                          ? new Set<number>(
                              [ref.num1, ref.num2, ref.num3, ref.num4, ref.num5, ref.num6, ref.bonus1]
                                .filter((n): n is number => typeof n === 'number')
                            )
                          : new Set<number>();
                        return type3Numbers.map((combo, i) => (
                          <div key={i} className={`flex justify-center gap-3 py-3 ${i > 0 ? 'border-t border-emerald-200/70' : ''}`}>
                            {combo.map((num, j) => <NumberBall key={j} num={num} size="md" highlighted={matchSet.has(num)} />)}
                          </div>
                        ));
                      })()}
                    </div>
                    {selectedRound != null && (() => {
                      const ref = results.find(r => r.round === selectedRound);
                      if (!ref) return null;
                      const winSet = new Set<number>(
                        [ref.num1, ref.num2, ref.num3, ref.num4, ref.num5, ref.num6]
                          .filter((n): n is number => n !== null)
                      );
                      const analyses = type3Numbers.map(combo => {
                        const matchCount = combo.filter(n => winSet.has(n)).length;
                        const bonusMatch = ref.bonus1 != null && combo.includes(ref.bonus1);
                        return { matchCount, bonusMatch, tier: getPrizeTier(matchCount, bonusMatch) };
                      });
                      const avgMatch = analyses.reduce((s, a) => s + a.matchCount, 0) / analyses.length;
                      const tierOrder = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
                      const bestTier = analyses.reduce((best, a) =>
                        tierOrder.indexOf(a.tier) < tierOrder.indexOf(best) ? a.tier : best, '낙첨'
                      );
                      return (
                        <div className="flex-none mt-3 pt-3 border-t border-emerald-200/70">
                          <div className="text-[11px] font-bold text-emerald-800 mb-2">
                            📊 당첨 분석 · 제{selectedRound}회 기준
                          </div>
                          <div className="grid grid-cols-5 gap-1.5 mb-2.5">
                            {analyses.map((a, i) => (
                              <div key={i} className="flex flex-col items-center gap-1 py-2 rounded-xl bg-white border border-emerald-100">
                                <span className="text-[10px] text-gray-400">조합{i + 1}</span>
                                <span className="text-sm font-bold text-gray-700">{a.matchCount}개</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getTierStyle(a.tier)}`}>
                                  {a.tier}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[11px] text-gray-500 text-center">
                            평균 일치 <b className="text-gray-700">{avgMatch.toFixed(1)}개</b>
                            {' · '}
                            최고 등수 <b className={getTierTextColor(bestTier)}>{bestTier}</b>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">{aiError || '버튼을 눌러 번호를 생성하세요.'}</p>
                )}
              </div>

            </div>
          </section>
        </div>

      </div>

      {/* 분포도 팝업 */}
      {distPopup && (
        <DistributionPopup
          distribution={distPopup.distribution}
          conditionText={distPopup.conditionText}
          roundsAnalyzed={distPopup.roundsAnalyzed}
          onClose={() => setDistPopup(null)}
        />
      )}
    </main>
  );
}
