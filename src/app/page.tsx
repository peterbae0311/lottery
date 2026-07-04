'use client';

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';

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

type ConditionType = 1 | 2 | 3 | 4 | 5 | 6;

interface ConditionRow {
  id: string;
  conditionType: ConditionType;
  years: number;
  months: number;
  maxWinners: number;
  maxPrizeAmt: number;
  maxConsec: number; // 0=없음, 2=2개, 3=3개+
  oddCount: number;  // 홀수 개수 (0~6)
  sumMin: number;    // 합계 최소
  sumMax: number;    // 합계 최대
  roundsAnalyzed: number | null;
  numbers: number[] | null;
  frequencies: number[] | null;
  distribution: number[] | null; // [01-09, 10-19, 20-29, 30-39, 40-45]
  bonusNumbers: number[] | null; // 보너스 번호 빈도 상위 10개
  isLoading: boolean;
}

interface ConfirmedPurchase {
  id: number;
  target_round: number;
  combos: number[][];
  confirmed_at: string;
  generation_mode?: string | null;
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

function scoreCombo(combo: number[], bonusCandidates: number[] = [], topFreqNums: number[] = []): number {
  const s = [...combo].sort((a, b) => a - b);
  let score = 0;

  // 밴드 커버리지 (5밴드 모두 = 최고점)
  const bandCount = [s.some(n => n <= 9), s.some(n => n >= 10 && n <= 19),
    s.some(n => n >= 20 && n <= 29), s.some(n => n >= 30 && n <= 39),
    s.some(n => n >= 40)].filter(Boolean).length;
  score += bandCount * 8; // max 40

  // 홀짝 균형 (3-3 이상적)
  const odds = s.filter(n => n % 2 === 1).length;
  score += Math.max(0, 24 - Math.abs(odds - 3) * 10); // max 24

  // 합계 범위 (역사적 집중 구간 115~185)
  const sum = s.reduce((a, b) => a + b, 0);
  if (sum >= 115 && sum <= 185) score += 20;
  else if (sum >= 90 && sum <= 210) score += 10;

  // 끝자리 다양성
  const tails = new Set(s.map(n => n % 10));
  score += Math.min(tails.size * 2, 10); // max 10

  // 2등 전략: 보너스 후보 번호 포함 시 가점
  const bonusSet = new Set(bonusCandidates);
  score += combo.filter(n => bonusSet.has(n)).length * 5;

  // 3등 전략: 빈도 상위 번호(앵커 제외 확장 영역) 포함 시 가점
  const freqSet = new Set(topFreqNums);
  score += combo.filter(n => freqSet.has(n)).length * 2;

  return score;
}

const GENERATION_STRATEGIES: Record<string, { tag: string; color: string; desc: string }[]> = {
  anchor2: [
    { tag: '2개 고정',      color: 'bg-violet-100 text-violet-700',   desc: '조건 분석에서 2개 이상 조건에 출현한 번호 상위 2개를 전 게임에 고정' },
    { tag: '슬롯 변형',     color: 'bg-indigo-100 text-indigo-700',   desc: '나머지 4슬롯은 게임마다 다른 번호로 채워 커버리지 최대화 — 중복 조합 없음' },
    { tag: '광역 커버',     color: 'bg-emerald-100 text-emerald-700', desc: '고정 번호 수가 적어 조합 다양성이 높음 — 넓은 번호 범위를 커버' },
  ],
  anchor3: [
    { tag: '3개 고정',      color: 'bg-violet-100 text-violet-700',   desc: '조건 분석에서 2개 이상 조건에 출현한 번호 상위 3개를 전 게임에 고정' },
    { tag: '슬롯 변형',     color: 'bg-indigo-100 text-indigo-700',   desc: '나머지 3슬롯은 게임마다 다른 번호로 채워 커버리지 확보 — 중복 조합 없음' },
    { tag: '5등 실증',      color: 'bg-emerald-100 text-emerald-700', desc: '1230회 기준 이 방식으로 5등 당첨 확인 — 고정 3개 + 변형 3개 구조' },
  ],
  anchor: [
    { tag: '4개 고정',      color: 'bg-violet-100 text-violet-700',   desc: '조건 분석에서 2개 이상 조건에 출현한 번호 상위 4개를 전 게임에 고정 — 최고 신뢰 번호 집중' },
    { tag: '슬롯 변형',     color: 'bg-indigo-100 text-indigo-700',   desc: '나머지 2슬롯은 게임마다 다른 번호로 채워 커버리지 확보 — 중복 조합 없음' },
    { tag: '1+4 구조',      color: 'bg-rose-100 text-rose-700',       desc: '전문가 추천 5개 = 앵커 공유 → 한 게임에 당첨번호 다수 집중 가능 (1229회 시뮬레이션 검증)' },
  ],
  'no-consec': [
    { tag: '연속번호 없음', color: 'bg-emerald-100 text-emerald-700', desc: '6개 번호가 모두 연속되지 않는 조합만 생성 (n, n+1 쌍 없음)' },
    { tag: '역사적 근거',   color: 'bg-blue-100 text-blue-700',       desc: '1~1228회 중 48.3%(593회)가 연속번호 없는 패턴 — 가장 빈번한 유형' },
    { tag: '추가 필터 없음',color: 'bg-gray-100 text-gray-600',       desc: '연속번호 조건 외 홀짝·등차 등 별도 필터 미적용' },
  ],
  'two-consec': [
    { tag: '연속번호 2개',  color: 'bg-orange-100 text-orange-700',   desc: '정확히 연속된 쌍(n, n+1)이 하나 있는 조합만 생성 — 3개+ 제외' },
    { tag: '역사적 근거',   color: 'bg-blue-100 text-blue-700',       desc: '1~1228회 중 46.3%(568회)가 연속 2개 패턴 — 연속없음과 거의 동일한 빈도' },
    { tag: '추가 필터 없음',color: 'bg-gray-100 text-gray-600',       desc: '연속번호 조건 외 홀짝·등차 등 별도 필터 미적용' },
  ],
  random: [
    { tag: '순수 랜덤',     color: 'bg-gray-100 text-gray-600',     desc: '1~45에서 6개 완전 무작위 추출 — 어떠한 필터도 적용하지 않음' },
  ],
};

const MODE_LABELS: Record<string, string> = {
  anchor2: '앵커2', anchor3: '앵커3', anchor: '앵커4', 'no-consec': '연속없음', 'two-consec': '연속2개', random: '랜덤',
};

function selectExpertPicks(combos: number[][], anchorNums: number[] = [], bonusCandidates: number[] = [], topFreqNums: number[] = []): number[][] {
  if (combos.length <= 5) return combos;
  const anchorSet = new Set(anchorNums);
  return [...combos]
    .map((combo, i) => ({
      combo, i,
      score: scoreCombo(combo, bonusCandidates, topFreqNums) + combo.filter(n => anchorSet.has(n)).length * 5,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 5)
    .map(x => x.combo);
}

function buildConditionText(conditionType: ConditionType, years: number, months: number, maxWinners: number, maxPrizeAmt: number, maxConsec: number, oddCount = 3, sumMin = 115, sumMax = 185): string {
  if (conditionType === 2) return `당첨자 ${maxWinners}명 미만 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 3) return `당첨금 ${maxPrizeAmt}억 이상 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 4) {
    const label = maxConsec === 0 ? '없음' : maxConsec === 2 ? '2개' : '3개+';
    return `연속번호 ${label} 회차에서 가장 많이 나온 숫자 6개 추출`;
  }
  if (conditionType === 5) return `홀수 ${oddCount}개 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (conditionType === 6) return `합계 ${sumMin}~${sumMax} 범위 회차에서 가장 많이 나온 숫자 6개 추출`;
  if (years === 0 && months === 0) return '전체 당첨번호에서 가장 많이 나온 숫자 6개 추출';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  return `최근 ${parts.join(' ')} 당첨번호에서 가장 많이 나온 숫자 6개 추출`;
}

function parseConditionText(text: string): { conditionType: ConditionType; years: number; months: number; maxWinners: number; maxPrizeAmt: number; maxConsec: number; oddCount: number; sumMin: number; sumMax: number } {
  const base = { years: 0, months: 0, maxWinners: 0, maxPrizeAmt: 0, maxConsec: 0, oddCount: 3, sumMin: 115, sumMax: 185 };
  if (text.includes('당첨자')) {
    const m = text.match(/당첨자 (\d+)명/);
    return { ...base, conditionType: 2, maxWinners: m ? parseInt(m[1]) : 5 };
  }
  if (text.includes('당첨금')) {
    const m = text.match(/당첨금 (\d+(?:\.\d+)?)억/);
    return { ...base, conditionType: 3, maxPrizeAmt: m ? parseFloat(m[1]) : 25 };
  }
  if (text.includes('연속번호')) {
    const m = text.match(/연속번호 (없음|2개|3개\+)/);
    const label = m ? m[1] : '없음';
    return { ...base, conditionType: 4, maxConsec: label === '없음' ? 0 : label === '2개' ? 2 : 3 };
  }
  if (text.includes('홀수')) {
    const m = text.match(/홀수 (\d+)개/);
    return { ...base, conditionType: 5, oddCount: m ? parseInt(m[1]) : 3 };
  }
  if (text.includes('합계')) {
    const m = text.match(/합계 (\d+)~(\d+)/);
    return { ...base, conditionType: 6, sumMin: m ? parseInt(m[1]) : 115, sumMax: m ? parseInt(m[2]) : 185 };
  }
  const yearMatch = text.match(/(\d+)년/);
  const monthMatch = text.match(/(\d+)개월/);
  return { ...base, conditionType: 1, years: yearMatch ? parseInt(yearMatch[1]) : 0, months: monthMatch ? parseInt(monthMatch[1]) : 0 };
}


const BLANK_ROW = { roundsAnalyzed: null, numbers: null, frequencies: null, distribution: null, bonusNumbers: null, isLoading: false };
const ROW_DEFAULTS = { maxWinners: 0, maxPrizeAmt: 0, maxConsec: 0, oddCount: 3, sumMin: 115, sumMax: 185 };
const DEFAULT_CONDITIONS: ConditionRow[] = [
  { id: makeId(), conditionType: 1, years: 0, months: 1,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 3,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 6,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 1, months: 0,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 1, years: 0, months: 0,  ...ROW_DEFAULTS, ...BLANK_ROW },
  { id: makeId(), conditionType: 5, years: 0, months: 0,  ...ROW_DEFAULTS, oddCount: 3,  ...BLANK_ROW },
  { id: makeId(), conditionType: 6, years: 0, months: 0,  ...ROW_DEFAULTS, sumMin: 115, sumMax: 185, ...BLANK_ROW },
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
  const [isRegisteringLatest, setIsRegisteringLatest] = useState(false);
  const [registerLatestMsg, setRegisterLatestMsg] = useState('');
  const [conditions, setConditions] = useState<ConditionRow[]>(DEFAULT_CONDITIONS);
  const [isSavingConditions, setIsSavingConditions] = useState(false);
  const [saveConditionsMsg, setSaveConditionsMsg] = useState('');
  const [isAutoSetting, setIsAutoSetting] = useState(false);
  const [conditionSort, setConditionSort] = useState<'asc' | 'desc' | null>(null);
  const [autoSettingMsg, setAutoSettingMsg] = useState('');

  // Section 3 state
  const [gameCount, setGameCount] = useState(100);
  const [generationMode, setGenerationMode] = useState<'random' | 'no-consec' | 'two-consec' | 'anchor' | 'anchor3' | 'anchor2'>('anchor3');
  const maxGameCount = (generationMode === 'anchor' || generationMode === 'anchor3' || generationMode === 'anchor2') ? 350 : 100;
  const [type3Numbers, setType3Numbers] = useState<number[][]>([]);
  const [selectedComboIndices, setSelectedComboIndices] = useState<Set<number>>(new Set());
  const [expertPicks, setExpertPicks] = useState<number[][]>([]);
  const [isConfirmingExpert, setIsConfirmingExpert] = useState(false);
  const [generatedMode, setGeneratedMode] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [isSavingPredicted, setIsSavingPredicted] = useState(false);
  const [confirmedPurchases, setConfirmedPurchases] = useState<ConfirmedPurchase[]>([]);
  const [selectedConfirmedId, setSelectedConfirmedId] = useState<number | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [sendingTelegramRound, setSendingTelegramRound] = useState<number | null>(null);
  const [telegramMsg, setTelegramMsg] = useState<{ round: number; ok: boolean; text: string } | null>(null);
  // DB에서 불러온 직후 auto-save 방지용 플래그
  const skipSaveRef = useRef(false);

  // 앵커 모드 전환 시 게임 수 자동 조정
  useEffect(() => {
    if (generationMode === 'anchor' || generationMode === 'anchor3' || generationMode === 'anchor2') setGameCount(350);
    else setGameCount(prev => Math.min(prev, 100));
  }, [generationMode]);

  // 앵커 번호 공통 빈도 계산 (메인 +1, 보너스 상위5 +0.5 가중치 — 2등 전략 반영)
  const anchorFreq = useMemo(() => {
    const freq: Record<number, number> = {};
    conditions
      .filter(c => Array.isArray(c.numbers) && c.numbers!.length === 6)
      .forEach(c => {
        (c.numbers as number[]).forEach(n => { freq[n] = (freq[n] ?? 0) + 1; });
        // 보너스 상위 5개 번호에 0.5 가중치 (2등: 5개+보너스 전략)
        if (Array.isArray(c.bonusNumbers)) {
          (c.bonusNumbers as number[]).slice(0, 5).forEach(n => { freq[n] = (freq[n] ?? 0) + 0.5; });
        }
      });
    return freq;
  }, [conditions]);

  // 앵커2: 2개 이상 조건 공통 출현 번호 상위 2개
  const anchor2Numbers = useMemo(() =>
    Object.entries(anchorFreq)
      .filter(([, cnt]) => Number(cnt) >= 2)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 2)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b),
  [anchorFreq]);

  // 앵커3: 2개 이상 조건 공통 출현 번호 상위 3개
  const anchor3Numbers = useMemo(() =>
    Object.entries(anchorFreq)
      .filter(([, cnt]) => Number(cnt) >= 2)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b),
  [anchorFreq]);

  // 앵커4: 2개 이상 조건 공통 출현 번호 상위 4개
  const anchorNumbers = useMemo(() =>
    Object.entries(anchorFreq)
      .filter(([, cnt]) => Number(cnt) >= 2)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 4)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b),
  [anchorFreq]);

  // 2등 전략: 보너스 후보 번호 (조건 분석 보너스 빈도 가중 합산, 활성 앵커 제외, 상위 3개)
  const bonusCandidateNums = useMemo(() => {
    const activeAnchors = generationMode === 'anchor2' ? anchor2Numbers
      : generationMode === 'anchor3' ? anchor3Numbers
      : generationMode === 'anchor' ? anchorNumbers
      : [];
    const anchorSet = new Set(activeAnchors);
    const freq: Record<number, number> = {};
    conditions
      .filter(c => Array.isArray(c.bonusNumbers) && (c.bonusNumbers as number[]).length > 0)
      .forEach(c => {
        (c.bonusNumbers as number[]).slice(0, 5).forEach((n, rank) => {
          if (!anchorSet.has(n)) freq[n] = (freq[n] ?? 0) + (5 - rank);
        });
      });
    return Object.entries(freq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([num]) => Number(num))
      .sort((a, b) => a - b);
  }, [conditions, generationMode, anchor2Numbers, anchor3Numbers, anchorNumbers]);

  // 3등 전략: 앵커 제외 빈도 상위 번호 (상위 10개, 앵커 제외)
  const topFreqNums = useMemo(() => {
    const activeAnchors = generationMode === 'anchor2' ? anchor2Numbers
      : generationMode === 'anchor3' ? anchor3Numbers
      : generationMode === 'anchor' ? anchorNumbers
      : [];
    const anchorSet = new Set(activeAnchors);
    return Object.entries(anchorFreq)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([num]) => Number(num))
      .filter(n => !anchorSet.has(n))
      .slice(0, 10);
  }, [anchorFreq, generationMode, anchor2Numbers, anchor3Numbers, anchorNumbers]);

  // 확정 팝업
  const [showInfoPopup, setShowInfoPopup] = useState(false);

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
          const { conditionType, years, months, maxWinners, maxPrizeAmt, maxConsec, oddCount, sumMin, sumMax } = parseConditionText(row.condition_text);
          return {
            id: makeId(), conditionType, years, months, maxWinners, maxPrizeAmt, maxConsec, oddCount, sumMin, sumMax,
            roundsAnalyzed: null,
            numbers: [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6],
            frequencies: null, isLoading: true, distribution: null,
          };
        });
        // 새로 추가된 조건 타입이 저장된 데이터에 없으면 기본값으로 추가
        if (!initial.some(r => r.conditionType === 5)) {
          initial.push({ id: makeId(), conditionType: 5 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, oddCount: 3, ...BLANK_ROW });
        }
        if (!initial.some(r => r.conditionType === 6)) {
          initial.push({ id: makeId(), conditionType: 6 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, sumMin: 115, sumMax: 185, ...BLANK_ROW });
        }
        setConditions(initial);

        const executed = await Promise.all(
          initial.map(async (row) => {
            try {
              const r = await fetch('/api/lotto/execute-condition', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt, maxConsec: row.maxConsec, oddCount: row.oddCount, sumMin: row.sumMin, sumMax: row.sumMax }),
              });
              const d = await r.json();
              if (d.success && Array.isArray(d.data?.numbers)) {
                return { ...row, numbers: d.data.numbers, frequencies: d.data.frequencies ?? null, roundsAnalyzed: d.data.rounds_analyzed ?? null, distribution: d.data.distribution ?? null, bonusNumbers: d.data.bonusNumbers ?? null, isLoading: false };
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

  const registerLatest = useCallback(async () => {
    if (isRegisteringLatest) return;
    setIsRegisteringLatest(true);
    setRegisterLatestMsg('');
    try {
      const res = await fetch('/api/lotto/sync');
      const data = await res.json();
      if (data.success) {
        const synced = data.data?.syncedRounds ?? 0;
        if (synced > 0) {
          const rounds: number[] = data.data?.rounds ?? [];
          setRegisterLatestMsg(`${rounds[rounds.length - 1]}회차 등록 완료`);
          const r = await fetch('/api/lotto/results');
          const d = await r.json();
          if (d.success) setResults(d.data ?? []);
        } else {
          setRegisterLatestMsg('이미 최신 당첨번호입니다');
        }
      } else {
        setRegisterLatestMsg('등록 실패: ' + (data.error ?? ''));
      }
    } catch (err) {
      setRegisterLatestMsg('오류: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRegisteringLatest(false);
      setTimeout(() => setRegisterLatestMsg(''), 4000);
    }
  }, [isRegisteringLatest]);

  // ---------------------------------------------------------------------------
  // Section 3: Load saved predictions on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      let loaded = false;
      try {
        const res = await fetch('/api/lotto/predicted');
        const data = await res.json();
        if (data.success && Array.isArray(data.data.type3) && data.data.type3.length >= 100) {
          skipSaveRef.current = true;
          setType3Numbers(data.data.type3);
          setTimeout(() => { skipSaveRef.current = false; }, 0);
          loaded = true;
        }
      } catch { /* ignore */ }

      if (!loaded) {
        try {
          const res = await fetch('/api/lotto/ai-predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 100, mode: 'random' }),
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
          }
        } catch { /* ignore */ }
      }
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
        body: JSON.stringify({ conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt, maxConsec: row.maxConsec, oddCount: row.oddCount, sumMin: row.sumMin, sumMax: row.sumMax }),
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
            bonusNumbers: data.data.bonusNumbers ?? null,
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

    const condText = buildConditionText(row.conditionType, row.years, row.months, row.maxWinners, row.maxPrizeAmt, row.maxConsec, row.oddCount, row.sumMin, row.sumMax);
    const rowBody = { conditionType: row.conditionType, years: row.years, months: row.months, maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt, maxConsec: row.maxConsec, oddCount: row.oddCount, sumMin: row.sumMin, sumMax: row.sumMax };

    // 이미 분포 데이터가 있으면 즉시 팝업
    if (row.distribution) {
      setDistPopup({ distribution: row.distribution, conditionText: condText, roundsAnalyzed: row.roundsAnalyzed });
      return;
    }

    // 분포 데이터 없으면 독립적으로 fetch
    setDistLoadingIds((prev) => new Set(prev).add(rowId));
    try {
      const res = await fetch('/api/lotto/execute-condition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowBody),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.distribution)) {
        const dist: number[] = data.data.distribution;
        setConditions((prev) => prev.map((c) =>
          c.id === rowId ? { ...c, distribution: dist, roundsAnalyzed: data.data.rounds_analyzed ?? c.roundsAnalyzed } : c
        ));
        setDistPopup({ distribution: dist, conditionText: condText, roundsAnalyzed: data.data.rounds_analyzed ?? row.roundsAnalyzed });
      }
    } catch { /* ignore */ }
    finally {
      setDistLoadingIds((prev) => { const s = new Set(prev); s.delete(rowId); return s; });
    }
  }, [conditions]);

  const addConditionRow = useCallback(() => {
    setConditions((prev) => [...prev, { id: makeId(), conditionType: 1 as ConditionType, years: 0, months: 0, ...ROW_DEFAULTS, ...BLANK_ROW }]);
  }, []);

  const removeConditionRow = useCallback((rowId: string) => {
    setConditions((prev) => prev.length <= 1 ? prev : prev.filter((c) => c.id !== rowId));
  }, []);

  const updateConditionType = useCallback((rowId: string, conditionType: ConditionType) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? ({ ...c, conditionType, maxConsec: 0, ...BLANK_ROW } as ConditionRow) : c));
  }, []);

  const updateMaxConsec = useCallback((rowId: string, maxConsec: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, maxConsec, ...BLANK_ROW } : c));
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

  const updateOddCount = useCallback((rowId: string, oddCount: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, oddCount, ...BLANK_ROW } : c));
  }, []);

  const updateSumMin = useCallback((rowId: string, sumMin: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, sumMin, ...BLANK_ROW } : c));
  }, []);

  const updateSumMax = useCallback((rowId: string, sumMax: number) => {
    setConditions((prev) => prev.map((c) => c.id === rowId ? { ...c, sumMax, ...BLANK_ROW } : c));
  }, []);

  const resetConditionNumbers = useCallback(() => {
    setConditions((prev) => prev.map((c) => ({ ...c, numbers: null, frequencies: null, roundsAnalyzed: null })));
  }, []);

  // 조건 정렬 기준값: 타입 우선, 타입 내 세부 파라미터 순
  const conditionSortKey = useCallback((c: ConditionRow): number => {
    const base = c.conditionType * 100000;
    if (c.conditionType === 1) return base + c.years * 12 + c.months;
    if (c.conditionType === 2) return base + c.maxWinners;
    if (c.conditionType === 3) return base + c.maxPrizeAmt;
    if (c.conditionType === 4) return base + c.maxConsec;
    if (c.conditionType === 5) return base + c.oddCount;
    if (c.conditionType === 6) return base + c.sumMin;
    return base;
  }, []);

  const sortedConditions = useMemo(() => {
    if (!conditionSort) return conditions;
    return [...conditions].sort((a, b) =>
      conditionSort === 'asc'
        ? conditionSortKey(a) - conditionSortKey(b)
        : conditionSortKey(b) - conditionSortKey(a)
    );
  }, [conditions, conditionSort, conditionSortKey]);

  const toggleConditionSort = useCallback(() => {
    setConditionSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
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
            condition_text: buildConditionText(c.conditionType, c.years, c.months, c.maxWinners, c.maxPrizeAmt, c.maxConsec, c.oddCount, c.sumMin, c.sumMax),
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

  const autoSetConditions = useCallback(async () => {
    setIsAutoSetting(true);
    setAutoSettingMsg('Claude가 조건을 생성하는 중...');
    try {
      // 1. Claude에게 조건 생성 요청
      const genRes = await fetch('/api/lotto/auto-conditions', { method: 'POST' });
      const genData = await genRes.json();
      if (!genData.success) {
        setAutoSettingMsg(`생성 실패: ${genData.error}`);
        setTimeout(() => setAutoSettingMsg(''), 5000);
        return;
      }

      const generated = genData.data.conditions as Array<{
        conditionType: number; years: number; months: number;
        maxWinners: number; maxPrizeAmt: number; maxConsec: number;
        oddCount: number; sumMin: number; sumMax: number;
      }>;

      // 2. 조건 상태 초기화 후 새 조건 세팅
      const newConditions: ConditionRow[] = generated.map((c) => ({
        id: makeId(),
        conditionType: c.conditionType as ConditionType,
        years: c.years, months: c.months,
        maxWinners: c.maxWinners, maxPrizeAmt: c.maxPrizeAmt, maxConsec: c.maxConsec,
        oddCount: c.oddCount, sumMin: c.sumMin, sumMax: c.sumMax,
        ...BLANK_ROW,
        isLoading: true,
      }));
      setConditions(newConditions);
      setAutoSettingMsg(`${generated.length}개 조건 실행 중...`);

      // 3. 모든 조건 병렬 실행
      const executed = await Promise.all(
        newConditions.map(async (row) => {
          try {
            const r = await fetch('/api/lotto/execute-condition', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conditionType: row.conditionType, years: row.years, months: row.months,
                maxWinners: row.maxWinners, maxPrizeAmt: row.maxPrizeAmt, maxConsec: row.maxConsec,
                oddCount: row.oddCount, sumMin: row.sumMin, sumMax: row.sumMax,
              }),
            });
            const d = await r.json();
            if (d.success && Array.isArray(d.data?.numbers)) {
              return { ...row, numbers: d.data.numbers, frequencies: d.data.frequencies ?? null, roundsAnalyzed: d.data.rounds_analyzed ?? null, distribution: d.data.distribution ?? null, bonusNumbers: d.data.bonusNumbers ?? null, isLoading: false };
            }
          } catch { /* ignore */ }
          return { ...row, isLoading: false };
        })
      );
      setConditions(executed);

      // 4. DB 저장
      const toSave = executed.filter((c) => c.numbers !== null && (c.numbers as number[]).length === 6);
      if (toSave.length > 0) {
        const saveRes = await fetch('/api/lotto/save-conditions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conditions: toSave.map((c) => ({
              condition_text: buildConditionText(c.conditionType, c.years, c.months, c.maxWinners, c.maxPrizeAmt, c.maxConsec, c.oddCount, c.sumMin, c.sumMax),
              num1: (c.numbers as number[])[0], num2: (c.numbers as number[])[1],
              num3: (c.numbers as number[])[2], num4: (c.numbers as number[])[3],
              num5: (c.numbers as number[])[4], num6: (c.numbers as number[])[5],
            })),
          }),
        });
        const saveData = await saveRes.json();
        setAutoSettingMsg(saveData.success ? `자동설정 완료 — ${toSave.length}개 조건 저장됨` : `실행 완료, 저장 실패: ${saveData.error}`);
      } else {
        setAutoSettingMsg('실행 완료 (저장할 결과 없음)');
      }
    } catch (err) {
      setAutoSettingMsg(`오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setIsAutoSetting(false);
      setTimeout(() => setAutoSettingMsg(''), 5000);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Section 3: AI generation (Type 3)
  // ---------------------------------------------------------------------------

  const generateAIPredictions = useCallback(async () => {
    setIsGeneratingAI(true);
    setAiError('');
    setSelectedComboIndices(new Set());

    if (generationMode === 'anchor' && anchorNumbers.length < 2) {
      setAiError('앵커 번호 부족 — 조건 분석(섹션 2)을 먼저 실행하세요.');
      setIsGeneratingAI(false);
      return;
    }
    if (generationMode === 'anchor3' && anchor3Numbers.length < 2) {
      setAiError('앵커 번호 부족 — 조건 분석(섹션 2)을 먼저 실행하세요.');
      setIsGeneratingAI(false);
      return;
    }
    if (generationMode === 'anchor2' && anchor2Numbers.length < 2) {
      setAiError('앵커 번호 부족 — 조건 분석(섹션 2)을 먼저 실행하세요.');
      setIsGeneratingAI(false);
      return;
    }

    try {
      const apiMode = (generationMode === 'anchor' || generationMode === 'anchor3' || generationMode === 'anchor2') ? 'anchor' : generationMode;
      const reqBody: Record<string, unknown> = { count: gameCount, mode: apiMode };
      if (generationMode === 'anchor') reqBody.anchorNumbers = anchorNumbers;
      if (generationMode === 'anchor3') reqBody.anchorNumbers = anchor3Numbers;
      if (generationMode === 'anchor2') reqBody.anchorNumbers = anchor2Numbers;
      // 2등 전략: 앵커 모드에서 보너스 후보 번호 전달
      if (apiMode === 'anchor' && bonusCandidateNums.length > 0) reqBody.bonusNumbers = bonusCandidateNums;

      const res = await fetch('/api/lotto/ai-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.data?.combinations)) {
        skipSaveRef.current = true;
        setType3Numbers(d.data.combinations);
        setGeneratedMode(generationMode);
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
  }, [results, gameCount, generationMode, anchorNumbers, anchor3Numbers, anchor2Numbers, bonusCandidateNums]);

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

  // 전문가 추천 5개 자동 선정 — 앵커·보너스·빈도 종합 점수 상위 5개
  useEffect(() => {
    const activeAnchors = generationMode === 'anchor2' ? anchor2Numbers
      : generationMode === 'anchor3' ? anchor3Numbers
      : generationMode === 'anchor' ? anchorNumbers
      : [];
    setExpertPicks(selectExpertPicks(type3Numbers, activeAnchors, bonusCandidateNums, topFreqNums));
  }, [type3Numbers, generationMode, anchor2Numbers, anchor3Numbers, anchorNumbers, bonusCandidateNums, topFreqNums]);

  const toggleComboSelection = useCallback((idx: number) => {
    setSelectedComboIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllCombos = useCallback(() => {
    setSelectedComboIndices(prev =>
      prev.size === type3Numbers.length
        ? new Set()
        : new Set(type3Numbers.map((_, i) => i))
    );
  }, [type3Numbers]);

  const refreshAll = useCallback(async () => {
    await generateAIPredictions();
  }, [generateAIPredictions]);

  // ---------------------------------------------------------------------------
  // Section 3: Confirmed purchases
  // ---------------------------------------------------------------------------

  const loadConfirmed = useCallback(async () => {
    try {
      const res = await fetch('/api/lotto/confirmed');
      const d = await res.json();
      if (d.success) setConfirmedPurchases(d.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConfirmed(); }, [loadConfirmed]);

  // 삭제된 항목이 선택 중이면 초기화 (아코디언 방식 — 자동 선택 없음)
  useEffect(() => {
    if (selectedConfirmedId !== null && !confirmedPurchases.find(p => p.id === selectedConfirmedId)) {
      setSelectedConfirmedId(null);
    }
  }, [confirmedPurchases, selectedConfirmedId]);

  const confirmPurchase = useCallback(async () => {
    if (selectedComboIndices.size === 0 || results.length === 0) return;
    const target_round = results[0].round + 1;
    if (confirmedPurchases.filter(p => p.target_round === target_round).length >= 3) {
      setConfirmMsg('같은 회차에 최대 3개 유형까지 확정할 수 있습니다.');
      setTimeout(() => setConfirmMsg(''), 4000);
      return;
    }
    setIsConfirming(true);
    try {
      const selectedCombos = type3Numbers.filter((_, i) => selectedComboIndices.has(i));
      const res = await fetch('/api/lotto/confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_round, combos: selectedCombos, generation_mode: generationMode }),
      });
      const d = await res.json();
      if (d.success) {
        setSelectedComboIndices(new Set());
        await loadConfirmed();
      }
    } catch { /* ignore */ }
    finally { setIsConfirming(false); }
  }, [type3Numbers, selectedComboIndices, results, loadConfirmed, confirmedPurchases, generationMode]);

  const deleteConfirmed = useCallback(async (id: number) => {
    try {
      await fetch(`/api/lotto/confirmed?id=${id}`, { method: 'DELETE' });
      await loadConfirmed();
    } catch { /* ignore */ }
  }, [loadConfirmed]);

  const confirmExpertPicks = useCallback(async () => {
    if (expertPicks.length === 0 || results.length === 0) return;
    const target_round = results[0].round + 1;
    if (confirmedPurchases.filter(p => p.target_round === target_round).length >= 3) {
      setConfirmMsg('같은 회차에 최대 3개 유형까지 확정할 수 있습니다.');
      setTimeout(() => setConfirmMsg(''), 4000);
      return;
    }
    setIsConfirmingExpert(true);
    try {
      const res = await fetch('/api/lotto/confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_round, combos: expertPicks, generation_mode: generationMode }),
      });
      const d = await res.json();
      if (d.success) await loadConfirmed();
    } catch { /* ignore */ }
    finally { setIsConfirmingExpert(false); }
  }, [expertPicks, results, loadConfirmed, confirmedPurchases, generationMode]);

  const sendTelegram = useCallback(async (round: number) => {
    const purchases = confirmedPurchases.filter(p => p.target_round === round);
    if (purchases.length === 0) return;
    setSendingTelegramRound(round);
    try {
      const res = await fetch('/api/lotto/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_round: round,
          purchases: purchases.map((p, i) => ({
            label: ['①', '②', '③'][i],
            combos: p.combos,
            generation_mode: p.generation_mode ?? null,
          })),
        }),
      });
      const d = await res.json();
      setTelegramMsg({ round, ok: d.success, text: d.success ? '전송 완료' : d.error ?? '전송 실패' });
    } catch {
      setTelegramMsg({ round, ok: false, text: '전송 오류' });
    } finally {
      setSendingTelegramRound(null);
      setTimeout(() => setTelegramMsg(null), 4000);
    }
  }, [confirmedPurchases]);

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
                {registerLatestMsg && (
                  <span className={`text-xs font-medium ${registerLatestMsg.includes('완료') ? 'text-emerald-600' : registerLatestMsg.includes('최신') ? 'text-gray-400' : 'text-red-500'}`}>
                    {registerLatestMsg}
                  </span>
                )}
                {!registerLatestMsg && isSyncing
                  ? <span className="inline-flex items-center gap-1.5 text-xs text-indigo-500 font-medium"><span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />동기화 중...</span>
                  : !registerLatestMsg && syncMessage ? <span className="text-xs text-gray-400">{syncMessage}</span> : null}
                <button
                  onClick={registerLatest}
                  disabled={isRegisteringLatest || isSyncing}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap"
                >
                  {isRegisteringLatest ? '확인 중...' : '최신 당첨번호 등록'}
                </button>
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
                {(autoSettingMsg || saveConditionsMsg) && (
                  <span className={`text-xs font-medium ${(autoSettingMsg || saveConditionsMsg).includes('완료') ? 'text-emerald-600' : (autoSettingMsg || saveConditionsMsg).includes('중') ? 'text-blue-500' : 'text-red-500'}`}>
                    {autoSettingMsg || saveConditionsMsg}
                  </span>
                )}
                <button onClick={autoSetConditions} disabled={isAutoSetting} className="px-3 py-1.5 text-xs font-semibold bg-violet-500 text-white rounded-lg hover:bg-violet-600 active:scale-95 transition-all disabled:opacity-40">
                  {isAutoSetting ? '생성 중...' : '자동설정'}
                </button>
                <button onClick={saveConditions} disabled={isSavingConditions || isAutoSetting} className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                  {isSavingConditions ? '저장 중...' : '결과 저장'}
                </button>
                <button onClick={resetConditionNumbers} disabled={isAutoSetting} className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-40">초기화</button>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-72 md:max-h-none md:flex-1 md:min-h-0">
              <table className="w-full border-separate border-spacing-0 text-xs min-w-[600px]">
                <thead className="sticky top-0 z-10" style={{ boxShadow: '0 2px 0 #6ee7b7' }}>
                  <tr className="bg-emerald-50">
                    <th className="border-b border-emerald-100 px-3 py-2 text-left text-xs font-semibold text-emerald-700 bg-emerald-50">
                      <button onClick={toggleConditionSort} className="flex items-center gap-1 hover:text-emerald-900 transition-colors select-none">
                        조건
                        <span className="text-[10px] leading-none">
                          {conditionSort === 'asc' ? '▲' : conditionSort === 'desc' ? '▼' : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">실행</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50">분석 회차</th>
                    <th colSpan={6} className="border-b border-emerald-100 px-3 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50">추출번호</th>
                    <th className="border-b border-emerald-100 px-2 py-2 text-center text-xs font-semibold text-emerald-700 bg-emerald-50">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedConditions.map((row, i) => (
                    <tr key={row.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50 transition-colors`}>
                      <td className="border-b border-gray-100 px-3 py-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                          <select value={row.conditionType} onChange={(e) => updateConditionType(row.id, Number(e.target.value) as ConditionType)}
                            className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                            <option value={1}>기간</option>
                            <option value={2}>당첨자</option>
                            <option value={3}>당첨금</option>
                            <option value={4}>연속번호</option>
                            <option value={5}>홀짝</option>
                            <option value={6}>합계</option>
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
                          {row.conditionType === 4 && (
                            <>
                              <select value={row.maxConsec} onChange={(e) => updateMaxConsec(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                <option value={0}>없음</option>
                                <option value={2}>2개</option>
                                <option value={3}>3개+</option>
                              </select>
                              <span className="text-gray-400">연속번호 회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 5 && (
                            <>
                              <span className="text-gray-400">홀수</span>
                              <select value={row.oddCount} onChange={(e) => updateOddCount(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                                {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}개</option>)}
                              </select>
                              <span className="text-gray-400">회차 빈도 상위 6개</span>
                            </>
                          )}
                          {row.conditionType === 6 && (
                            <>
                              <span className="text-gray-400">합계</span>
                              <input type="number" min={21} max={270} value={row.sumMin}
                                onChange={(e) => updateSumMin(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                              <span className="text-gray-400">~</span>
                              <input type="number" min={21} max={270} value={row.sumMax}
                                onChange={(e) => updateSumMax(row.id, Number(e.target.value))}
                                className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white w-14 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                              <span className="text-gray-400">범위 빈도 상위 6개</span>
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
            <div className="flex-none px-4 py-3 border-b border-gray-100 md:px-5 md:py-4">
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 text-white">
                    <IconDice size="md" />
                  </span>
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">예상 당첨 번호</h2>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* 라디오 버튼 */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 flex-wrap">
                    {([
                      { value: 'anchor2',   label: '앵커2' },
                      { value: 'anchor3',   label: '앵커3' },
                      { value: 'anchor',    label: '앵커4' },
                      { value: 'no-consec', label: '연속없음' },
                      { value: 'two-consec',label: '연속2개' },
                      { value: 'random',    label: '랜덤' },
                    ] as const).map(({ value, label }) => (
                      <label
                        key={value}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all select-none ${
                          generationMode === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <input
                          type="radio" name="generationMode" value={value}
                          checked={generationMode === value}
                          onChange={() => setGenerationMode(value)}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <button onClick={refreshAll} disabled={isGeneratingAI}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap transition-all shadow-sm">
                    {isGeneratingAI
                      ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중</>
                      : '🎲 생성'}
                  </button>
                  <button
                    onClick={() => setShowInfoPopup(true)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-rose-500 text-white rounded-xl hover:bg-rose-600 whitespace-nowrap transition-all shadow-sm"
                  >
                    🎯 확정
                  </button>
                </div>
              </div>

              {/* 게임 수 조절 패널 */}
              <div className="bg-indigo-50/70 rounded-xl border border-indigo-100 px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-indigo-800 whitespace-nowrap">게임 수</span>
                  <div className="flex-1 min-w-[120px]">
                    <input
                      type="range" min={5} max={maxGameCount} step={5} value={gameCount}
                      onChange={(e) => setGameCount(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-indigo-200"
                    />
                    <div className="flex justify-between text-[10px] text-indigo-400 mt-0.5">
                      {(generationMode === 'anchor' || generationMode === 'anchor3' || generationMode === 'anchor2')
                        ? <><span>5</span><span>90</span><span>175</span><span>260</span><span>350</span></>
                        : <><span>5</span><span>25</span><span>50</span><span>75</span><span>100</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={5} max={100} step={5} value={gameCount}
                      onChange={(e) => setGameCount(Math.min(maxGameCount, Math.max(5, Number(e.target.value))))}
                      className="w-14 border border-indigo-300 rounded-lg px-2 py-1 text-sm text-center font-bold text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <span className="text-sm text-indigo-600 font-medium">게임</span>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-xl border border-indigo-100 px-2 py-2 text-center">
                    <div className="text-[10px] text-gray-400 mb-0.5">구매 비용</div>
                    <div className="text-sm font-bold text-gray-800">{(gameCount * 1000).toLocaleString()}원</div>
                  </div>
                  <div className="bg-white rounded-xl border border-indigo-100 px-2 py-2 text-center">
                    <div className="text-[10px] text-gray-400 mb-0.5">1등 확률</div>
                    <div className="text-sm font-bold text-indigo-600">1 / {Math.round(8145060 / gameCount).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-amber-100 px-2 py-2 text-center">
                    <div className="text-[10px] text-amber-500 mb-0.5">기본 대비</div>
                    <div className="text-sm font-bold text-amber-600">× {(gameCount / 5).toFixed(1)} 배</div>
                  </div>
                </div>
              </div>
              {/* 앵커 번호 표시 */}
              {(generationMode === 'anchor2' || generationMode === 'anchor3' || generationMode === 'anchor') && (() => {
                const nums = generationMode === 'anchor2' ? anchor2Numbers : generationMode === 'anchor3' ? anchor3Numbers : anchorNumbers;
                const label = generationMode === 'anchor2' ? '앵커2 번호 (전 게임 고정)' : generationMode === 'anchor3' ? '앵커3 번호 (전 게임 고정)' : '앵커4 번호 (전 게임 고정)';
                return (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-violet-800">{label}</span>
                      <span className="text-[10px] text-violet-400">조건 분석에서 2개 이상 출현</span>
                    </div>
                    {nums.length >= 2 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {nums.map(n => <NumberBall key={n} num={n} size="sm" highlighted />)}
                        <span className="text-[10px] text-violet-500 ml-1 font-medium">
                          고정 {nums.length}개 + 변형 {6 - nums.length}개
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        조건 분석(좌측 섹션 2)을 먼저 실행하세요 — 2개 이상 조건에 공통 출현한 번호가 앵커로 설정됩니다.
                      </p>
                    )}
                  {/* 2등 보너스 후보 번호 표시 */}
                  {bonusCandidateNums.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-violet-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-amber-700">2등 보너스 후보</span>
                        <span className="text-[10px] text-amber-400">조합의 30%에 포함 · 전문가 추천 우선</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {bonusCandidateNums.map(n => (
                          <span key={n} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                );
              })()}
            </div>

            {/* Body */}
            <div className="px-4 py-4 flex flex-col gap-4 md:flex-1 md:min-h-0 md:overflow-y-auto md:px-5">

              {/* Claude 추천 5개 */}
              {expertPicks.length > 0 && (
                <div className="flex-none rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-900 whitespace-nowrap">
                        🤖 Claude 추천 5개
                      </span>
                      <span className="text-[10px] text-violet-400 font-medium hidden sm:block">밴드분산 · 홀짝균형 · 보너스후보 · 빈도상위 종합 점수 상위 5개</span>
                    </div>
                    <button
                      onClick={confirmExpertPicks}
                      disabled={isConfirmingExpert || results.length === 0}
                      className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-40 transition-all"
                    >
                      {isConfirmingExpert
                        ? <><span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />확정 중</>
                        : '🎯 확정하기'}
                    </button>
                  </div>
                  <div className="flex flex-col divide-y divide-violet-100 rounded-xl border border-violet-200 bg-white overflow-hidden">
                    {expertPicks.map((combo, i) => {
                      const score = scoreCombo(combo);
                      const sum = combo.reduce((a, b) => a + b, 0);
                      const odds = combo.filter(n => n % 2 === 1).length;
                      const bandCount = [combo.some(n => n <= 9), combo.some(n => n >= 10 && n <= 19),
                        combo.some(n => n >= 20 && n <= 29), combo.some(n => n >= 30 && n <= 39),
                        combo.some(n => n >= 40)].filter(Boolean).length;
                      return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <div className="flex gap-1.5 flex-1">
                            {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted />)}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1.5 text-[10px] text-violet-500 font-medium whitespace-nowrap">
                            <span>합{sum}</span>
                            <span>홀{odds}/짝{6 - odds}</span>
                            <span>{bandCount}밴드</span>
                            <span className="text-violet-700 font-bold">{score}점</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Type 3 */}
              <div className="flex-none flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 md:px-5">
                <div className="flex-none flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-emerald-900">
                      {MODE_LABELS[generationMode]} &times; {type3Numbers.length > 0 ? type3Numbers.length : gameCount}
                    </span>
                    {type3Numbers.length > 0 && (
                      <button
                        onClick={toggleAllCombos}
                        className="text-xs text-emerald-600 font-medium hover:text-emerald-800 transition-colors"
                      >
                        {selectedComboIndices.size === type3Numbers.length ? '전체 해제' : '전체 선택'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmMsg && <span className="text-xs font-medium text-red-500">{confirmMsg}</span>}
                    {isSavingPredicted && <span className="text-xs text-gray-400">저장 중...</span>}
                    {type3Numbers.length > 0 && (
                      <button
                        onClick={confirmPurchase}
                        disabled={isConfirming || results.length === 0 || selectedComboIndices.size === 0}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-40 transition-all"
                      >
                        {isConfirming
                          ? <><span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />확정 중</>
                          : `🎯 확정하기 ${selectedComboIndices.size > 0 ? `(${selectedComboIndices.size}개)` : ''}`}
                      </button>
                    )}
                  </div>
                </div>
                {type3Numbers.length > 0 ? (
                  <>
                    {(() => {
                      const useGrid = type3Numbers.length > 5;
                      if (useGrid) {
                        const half = Math.ceil(type3Numbers.length / 2);
                        const renderCol = (combos: number[][], offset: number) => (
                          <div className="flex flex-col divide-y divide-emerald-100 rounded-xl border border-emerald-200 bg-white overflow-hidden">
                            {combos.map((combo, i) => {
                              const idx = offset + i;
                              const selected = selectedComboIndices.has(idx);
                              return (
                                <div
                                  key={i}
                                  onClick={() => toggleComboSelection(idx)}
                                  className={`flex items-center gap-1.5 py-2 px-2 cursor-pointer transition-all ${selected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-gray-50'}`}
                                >
                                  <span className={`w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                                    {selected && <span className="text-white text-[9px] font-bold">✓</span>}
                                  </span>
                                  <div className="flex justify-center gap-1 flex-1">
                                    {combo.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted={selected} />)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            {renderCol(type3Numbers.slice(0, half), 0)}
                            {renderCol(type3Numbers.slice(half), half)}
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col rounded-xl border border-emerald-200 bg-white overflow-hidden divide-y divide-emerald-100">
                          {type3Numbers.map((combo, i) => {
                            const selected = selectedComboIndices.has(i);
                            return (
                              <div
                                key={i}
                                onClick={() => toggleComboSelection(i)}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all ${selected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-gray-50'}`}
                              >
                                <span className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                                  {selected && <span className="text-white text-xs font-bold">✓</span>}
                                </span>
                                <div className="flex justify-center gap-2.5 flex-1">
                                  {combo.map((num, j) => <NumberBall key={j} num={num} size="md" highlighted={selected} />)}
                                </div>
                              </div>
                            );
                          })}
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

      {/* 확정 팝업 */}
      {showInfoPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowInfoPopup(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 헤더 */}
            <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">🎯 확정 현황</h3>
              <button onClick={() => setShowInfoPopup(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

              {/* 구매 이력 — 회차별 그룹 + 아코디언 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-rose-800">📋 구매 이력</h4>
                  {confirmedPurchases.length > 0 && (
                    <span className="text-[10px] text-gray-400">{new Set(confirmedPurchases.map(p => p.target_round)).size}회차 · {confirmedPurchases.length}종</span>
                  )}
                </div>
                {confirmedPurchases.length === 0 ? (
                  <p className="text-sm text-gray-400">확정된 구매 이력이 없습니다.</p>
                ) : (() => {
                  const tierOrder = ['1등', '2등', '3등', '4등', '5등', '낙첨'];
                  const slotLabels = ['①', '②', '③'];

                  // 회차별 그룹화, 최신 회차 먼저
                  const byRound = confirmedPurchases.reduce<Record<number, ConfirmedPurchase[]>>((acc, p) => {
                    (acc[p.target_round] ??= []).push(p);
                    return acc;
                  }, {});
                  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);

                  return (
                    <div className="flex flex-col gap-3">
                      {rounds.map(round => {
                        const purchases = byRound[round];
                        const actual = results.find(r => r.round === round);
                        const winNums = actual
                          ? [actual.num1, actual.num2, actual.num3, actual.num4, actual.num5, actual.num6].filter((n): n is number => n != null)
                          : [];
                        const winSet = new Set(winNums);
                        const displaySet = new Set<number>([...winNums, ...(actual?.bonus1 != null ? [actual.bonus1] : [])]);

                        // 전체 회차 최고 등수
                        const roundBestTier = purchases.flatMap(p =>
                          actual ? p.combos.map(combo => {
                            const matchCount = combo.filter(n => winSet.has(n)).length;
                            const bonusMatch = matchCount === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
                            return getPrizeTier(matchCount, bonusMatch);
                          }) : []
                        ).reduce((best, t) =>
                          tierOrder.indexOf(t) < tierOrder.indexOf(best) ? t : best, '낙첨');

                        return (
                          <div key={round} className="rounded-xl border border-rose-100 overflow-hidden">
                            {/* 회차 헤더 */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-100">
                              <span className="text-sm font-bold text-rose-800">{round}회</span>
                              {actual ? (
                                <span className="text-[10px] text-gray-400">{actual.draw_date}</span>
                              ) : (
                                <span className="text-[10px] text-amber-500 font-semibold">추첨 대기</span>
                              )}
                              <span className="text-[10px] text-gray-400">{purchases.length}종 확정</span>
                              <div className="ml-auto flex items-center gap-2">
                                {actual && roundBestTier !== '낙첨' && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTierStyle(roundBestTier)}`}>
                                    최고 {roundBestTier}
                                  </span>
                                )}
                                {!actual && (
                                  <button
                                    onClick={() => sendTelegram(round)}
                                    disabled={sendingTelegramRound === round}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-all"
                                  >
                                    {sendingTelegramRound === round
                                      ? <><span className="inline-block w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />전송 중</>
                                      : '✈ 전송'}
                                  </button>
                                )}
                                {telegramMsg?.round === round && (
                                  <span className={`text-[10px] font-medium ${telegramMsg.ok ? 'text-sky-600' : 'text-red-500'}`}>
                                    {telegramMsg.text}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 당첨 번호 (추첨 완료 시) */}
                            {actual && (
                              <div className="flex items-center gap-2 px-4 py-2 border-b border-rose-100 bg-white/60">
                                <span className="text-[10px] text-gray-400 flex-shrink-0 w-12">당첨번호</span>
                                <div className="flex gap-1 flex-wrap">
                                  {winNums.map((num, j) => <NumberBall key={j} num={num} size="sm" highlighted />)}
                                  {actual.bonus1 != null && (
                                    <><span className="text-[10px] text-gray-300 self-center">+</span>
                                    <NumberBall num={actual.bonus1} size="sm" highlighted /></>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 슬롯 목록 (아코디언) */}
                            <div className="divide-y divide-rose-100">
                              {purchases.map((purchase, slotIdx) => {
                                const analyses = actual
                                  ? purchase.combos.map(combo => {
                                      const matchCount = combo.filter(n => winSet.has(n)).length;
                                      const bonusMatch = matchCount === 5 && actual.bonus1 != null && combo.includes(actual.bonus1);
                                      return { matchCount, bonusMatch, tier: getPrizeTier(matchCount, bonusMatch) };
                                    })
                                  : null;
                                const bestTier = analyses?.reduce((best, a) =>
                                  tierOrder.indexOf(a.tier) < tierOrder.indexOf(best) ? a.tier : best, '낙첨');
                                const isOpen = selectedConfirmedId === purchase.id;

                                return (
                                  <div key={purchase.id} className="bg-white">
                                    {/* 슬롯 헤더 (클릭으로 토글) */}
                                    <div
                                      className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-rose-50/60 transition-colors select-none"
                                      onClick={() => setSelectedConfirmedId(isOpen ? null : purchase.id)}
                                    >
                                      <span className="text-xs font-bold text-rose-500 w-4">{slotLabels[slotIdx]}</span>
                                      <span className="text-[11px] text-gray-600">{purchase.combos.length}개 조합</span>
                                      {purchase.generation_mode && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                                          {MODE_LABELS[purchase.generation_mode] ?? purchase.generation_mode}
                                        </span>
                                      )}
                                      {actual && bestTier ? (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getTierStyle(bestTier)}`}>
                                          최고 {bestTier}
                                        </span>
                                      ) : !actual ? (
                                        <span className="text-[10px] text-gray-400">대기 중</span>
                                      ) : null}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteConfirmed(purchase.id); }}
                                        className="ml-auto text-gray-300 hover:text-red-400 text-base leading-none transition-colors px-1"
                                        title="삭제"
                                      >×</button>
                                      <span className="text-[10px] text-gray-300">{isOpen ? '▲' : '▼'}</span>
                                    </div>

                                    {/* 조합 상세 (펼쳐짐) */}
                                    {isOpen && (
                                      <div className="px-4 pb-3 bg-rose-50/20">
                                        <div className="flex flex-col divide-y divide-rose-100">
                                          {purchase.combos.map((combo, i) => (
                                            <div key={i} className="flex items-center gap-2 py-1.5">
                                              <div className="flex gap-1 flex-1">
                                                {combo.map((num, j) => (
                                                  <NumberBall key={j} num={num} size="sm" highlighted={actual ? displaySet.has(num) : false} />
                                                ))}
                                              </div>
                                              {analyses && (
                                                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getTierStyle(analyses[i].tier)}`}>
                                                  {analyses[i].tier}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        {analyses && bestTier && (
                                          <div className="mt-2 pt-2 border-t border-rose-100 text-[11px] text-gray-500 text-center">
                                            최고 <b className={getTierTextColor(bestTier)}>{bestTier}</b>
                                            {' · '}평균 일치 <b className="text-gray-700">
                                              {(analyses.reduce((s, a) => s + a.matchCount, 0) / analyses.length).toFixed(1)}개
                                            </b>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* 생성 전략 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-bold text-indigo-800">⚙️ 생성 전략</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {MODE_LABELS[generatedMode ?? generationMode] ?? generatedMode ?? generationMode}
                  </span>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-4 flex flex-col gap-2.5">
                  {(GENERATION_STRATEGIES[generatedMode ?? generationMode] ?? []).map(({ tag, color, desc }) => (
                    <div key={tag} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-[108px] px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${color}`}>{tag}</span>
                      <span className="text-xs text-gray-600 leading-snug pt-0.5">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

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
