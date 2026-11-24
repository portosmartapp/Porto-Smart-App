import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Booking, Chalet, Language } from '../types/platform';
import { getEgyptDateTimeParts, normalizeToEgyptDateString } from '../utils/egyptTime';
import {
  exportHistoricalCsv,
  exportHistoricalPdf,
} from '../utils/exportHistoricalReport';

interface HistoricalBookingTrendsChartProps {
  bookings: Booking[];
  chalets: Chalet[];
  lang: Language;
  dataSource?: 'demo' | 'supabase';
}

type MonthRange = 3 | 6 | 12;
type PointSourceType = 'actual' | 'demo_booking' | 'estimated_baseline';

interface MonthTrendPoint {
  key: string;
  monthLabel: string;
  occupancyPct: number;
  momGrowth: number;
  bookingsCount: number;
  bookedNights: number;
  sourceType: PointSourceType;
  prevYearOccupancyPct: number | null;
  prevYearBookingsCount: number;
}

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Clearly marked simulated Red Sea seasonal baseline — ONLY used in Demo Mode when no actual/demo booking records exist for a month
const SOKHNA_ESTIMATED_BASELINE: Record<number, { occ: number; bookings: number }> = {
  0: { occ: 46, bookings: 24 },
  1: { occ: 44, bookings: 22 },
  2: { occ: 52, bookings: 28 },
  3: { occ: 68, bookings: 37 },
  4: { occ: 64, bookings: 34 },
  5: { occ: 76, bookings: 42 },
  6: { occ: 88, bookings: 51 },
  7: { occ: 94, bookings: 56 },
  8: { occ: 79, bookings: 44 },
  9: { occ: 62, bookings: 33 },
  10: { occ: 58, bookings: 30 },
  11: { occ: 54, bookings: 27 },
};

function countOverlapNightsInMonth(
  checkInStr: string,
  checkOutStr: string,
  year: number,
  monthIdx: number
): number {
  const monthStart = Date.UTC(year, monthIdx, 1);
  const monthEnd = Date.UTC(year, monthIdx + 1, 1);

  const normIn = normalizeToEgyptDateString(checkInStr);
  const normOut = normalizeToEgyptDateString(checkOutStr);
  if (!normIn || !normOut) return 0;

  const [ciY, ciM, ciD] = normIn.split('-').map(Number);
  const [coY, coM, coD] = normOut.split('-').map(Number);
  if (!ciY || !coY) return 0;

  const ciMs = Date.UTC(ciY, ciM - 1, ciD);
  const coMs = Date.UTC(coY, coM - 1, coD);

  const overlapStart = Math.max(monthStart, ciMs);
  const overlapEnd = Math.min(monthEnd, coMs);
  if (overlapEnd <= overlapStart) return 0;
  return Math.round((overlapEnd - overlapStart) / 86400000);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MonthTrendPoint }>;
  isAr: boolean;
  metricMode: 'occupancy' | 'volume';
  showYoY: boolean;
}

const CustomTrendsTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  isAr,
  metricMode,
  showYoY,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  const sourceLabel =
    pt.sourceType === 'actual'
      ? isAr
        ? 'بيانات حجوزات فعلية'
        : 'Actual Live Bookings'
      : pt.sourceType === 'demo_booking'
      ? isAr
        ? 'سجلات حجز تجريبية (Demo)'
        : 'Demo Booking Records'
      : isAr
      ? 'تقدير موسمي افتراضي (غير فعلي)'
      : 'Estimated Seasonal Baseline (Simulated)';

  const sourceColor =
    pt.sourceType === 'actual'
      ? 'text-emerald-700'
      : pt.sourceType === 'demo_booking'
      ? 'text-cyan-800'
      : 'text-amber-700';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs space-y-1.5 min-w-[210px]"
    >
      <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
        {pt.monthLabel}
      </div>
      <div className={`font-medium text-[11px] ${sourceColor}`}>{sourceLabel}</div>

      {metricMode === 'occupancy' ? (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600">
              {isAr ? 'نسبة الإشغال:' : 'Occupancy Rate:'}
            </span>
            <span className="font-mono-num font-bold text-slate-900">{pt.occupancyPct}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600">
              {isAr ? 'التغير عن الشهر السابق:' : 'MoM Growth:'}
            </span>
            <span
              className={`font-mono-num font-semibold ${
                pt.momGrowth >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {pt.momGrowth > 0 ? '+' : ''}
              {pt.momGrowth}%
            </span>
          </div>
          {showYoY && pt.prevYearOccupancyPct !== null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">
                {isAr ? 'نفس الشهر العام الماضي:' : 'Previous Year:'}
              </span>
              <span className="font-mono-num font-semibold text-slate-700">
                {pt.prevYearOccupancyPct}%
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600">
              {isAr ? 'عدد الحجوزات:' : 'Bookings:'}
            </span>
            <span className="font-mono-num font-bold text-slate-900">{pt.bookingsCount}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600">
              {isAr ? 'الليالي المحجوزة:' : 'Booked Nights:'}
            </span>
            <span className="font-mono-num font-bold text-amber-700">{pt.bookedNights}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const HistoricalBookingTrendsChart: React.FC<HistoricalBookingTrendsChartProps> = ({
  bookings,
  chalets,
  lang,
  dataSource = 'demo',
}) => {
  const isAr = lang === 'ar';
  const [rangeMonths, setRangeMonths] = useState<MonthRange>(12);
  const [metricMode, setMetricMode] = useState<'occupancy' | 'volume'>('occupancy');
  const [showYoY, setShowYoY] = useState<boolean>(false);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const activeChalets = chalets.filter((c) => c.isActive);
  const chaletCount = Math.max(activeChalets.length, 1);

  const {
    visibleSeries,
    hasLiveBookings,
    usesSimulatedData,
    hasSufficientPrevYearData,
  } = useMemo(() => {
    const egyptNow = getEgyptDateTimeParts();
    const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
    const liveBookings = activeBookings.filter((b) => !b.isDemo);
    const liveMode = liveBookings.length > 0;
    const sourceBookings = liveMode ? liveBookings : activeBookings;

    const allTwelveMonths: MonthTrendPoint[] = [];
    let prevYearMonthsWithData = 0;

    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(Date.UTC(egyptNow.year, egyptNow.monthIndex - offset, 1));
      const year = d.getUTCFullYear();
      const monthIdx = d.getUTCMonth();
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
      const capacityNights = chaletCount * daysInMonth;

      // Actual overlapping nights & bookings for this month
      let monthNights = 0;
      let monthBookingsCount = 0;
      sourceBookings.forEach((b) => {
        const overlap = countOverlapNightsInMonth(b.checkIn, b.checkOut, year, monthIdx);
        if (overlap > 0) {
          monthNights += overlap;
          monthBookingsCount += 1;
        }
      });

      // Previous year same calendar month (strictly from real/demo booking records, never fabricated)
      const prevYear = year - 1;
      const prevDaysInMonth = new Date(prevYear, monthIdx + 1, 0).getDate();
      let prevNights = 0;
      let prevCount = 0;
      sourceBookings.forEach((b) => {
        const overlap = countOverlapNightsInMonth(b.checkIn, b.checkOut, prevYear, monthIdx);
        if (overlap > 0) {
          prevNights += overlap;
          prevCount += 1;
        }
      });
      if (prevCount > 0) prevYearMonthsWithData += 1;

      const prevYearOccupancyPct =
        prevCount > 0
          ? Math.min(100, Math.round((prevNights / (chaletCount * prevDaysInMonth)) * 100))
          : null;

      let occupancyPct: number;
      let bookingsCount: number;
      let bookedNights: number;
      let sourceType: PointSourceType;

      if (liveMode) {
        // STRICT RULE: When live data is available, calculate occupancy ONLY from actual booking records
        occupancyPct = Math.min(100, Math.round((monthNights / capacityNights) * 100));
        bookingsCount = monthBookingsCount;
        bookedNights = monthNights;
        sourceType = 'actual';
      } else if (monthBookingsCount > 0) {
        // Demo records exist for this month
        occupancyPct = Math.min(100, Math.round((monthNights / capacityNights) * 100));
        bookingsCount = monthBookingsCount;
        bookedNights = monthNights;
        sourceType = 'demo_booking';
      } else {
        // No booking records for this historical month in Demo Mode -> clearly marked estimated seasonal baseline
        const baseline = SOKHNA_ESTIMATED_BASELINE[monthIdx] ?? { occ: 55, bookings: 25 };
        occupancyPct = baseline.occ;
        bookingsCount = baseline.bookings;
        bookedNights = Math.round((baseline.occ / 100) * capacityNights);
        sourceType = 'estimated_baseline';
      }

      const shortYear = String(year).slice(2);
      const monthLabel = isAr
        ? `${AR_MONTHS[monthIdx]} '${shortYear}`
        : `${EN_MONTHS[monthIdx]} '${shortYear}`;

      allTwelveMonths.push({
        key: monthKey,
        monthLabel,
        occupancyPct,
        momGrowth: 0,
        bookingsCount,
        bookedNights,
        sourceType,
        prevYearOccupancyPct,
        prevYearBookingsCount: prevCount,
      });
    }

    // Compute MoM occupancy growth (percentage points change vs previous month)
    for (let i = 0; i < allTwelveMonths.length; i++) {
      if (i === 0) {
        allTwelveMonths[i].momGrowth = 0;
      } else {
        allTwelveMonths[i].momGrowth = Number(
          (allTwelveMonths[i].occupancyPct - allTwelveMonths[i - 1].occupancyPct).toFixed(1)
        );
      }
    }

    const sliced = allTwelveMonths.slice(12 - rangeMonths);
    const anySimulated = sliced.some((pt) => pt.sourceType !== 'actual');

    return {
      visibleSeries: sliced,
      hasLiveBookings: liveMode,
      usesSimulatedData: anySimulated,
      hasSufficientPrevYearData: prevYearMonthsWithData >= 2,
    };
  }, [bookings, chaletCount, dataSource, isAr, rangeMonths]);

  const latest = visibleSeries[visibleSeries.length - 1];
  const avgOccupancy = Math.round(
    visibleSeries.reduce((s, d) => s + d.occupancyPct, 0) / Math.max(visibleSeries.length, 1)
  );
  const totalPeriodBookings = visibleSeries.reduce((s, d) => s + d.bookingsCount, 0);
  const peakMonth = visibleSeries.reduce(
    (best, cur) => (cur.occupancyPct > best.occupancyPct ? cur : best),
    visibleSeries[0]
  );

  const isPositiveLatest = (latest?.momGrowth ?? 0) >= 0;

  const handleExportCsv = () => {
    exportHistoricalCsv(visibleSeries, rangeMonths, lang);
    setExportMenuOpen(false);
  };

  const handleExportPdf = async () => {
    setExportMenuOpen(false);
    await exportHistoricalPdf(
      visibleSeries,
      {
        avgOccupancy,
        latestMomGrowth: latest?.momGrowth ?? 0,
        peakLabel: peakMonth?.monthLabel ?? '',
        peakOccupancy: peakMonth?.occupancyPct ?? 0,
        totalBookings: totalPeriodBookings,
      },
      rangeMonths,
      lang,
      usesSimulatedData
    );
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {/* Visible DEMO DATA / Estimated Notice whenever simulated data is shown */}
      {usesSimulatedData && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
          <div className="flex items-start sm:items-center gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="font-bold">DEMO DATA:</strong>{' '}
              {isAr
                ? 'تعرض هذه اللوحة سجلات حجز تجريبية مع تقديرات موسمية افتراضية للأشهر السابقة غير المسجلة (وليست أداءً فعلياً). بمجرد إضافة حجوزات حقيقية، يتم حساب الإشغال من السجلات الفعلية فقط.'
                : 'This view combines Demo booking records with Estimated Seasonal Baselines for unrecorded prior months (not actual historical performance). Once live bookings are created, occupancy is calculated strictly from actual records.'}
            </span>
          </div>
          <span className="font-mono-num text-[11px] font-bold text-amber-800 whitespace-nowrap shrink-0">
            {isAr ? 'بيانات تجريبية ومقدرة' : 'SIMULATED / DEMO'}
          </span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              {isAr
                ? `اتجاهات الحجز ونمو الإشغال الشهري (آخر ${rangeMonths} شهراً)`
                : `Historical Booking Trends & MoM Occupancy Growth (Last ${rangeMonths} Months)`}
            </h3>
            <span className="text-xs font-semibold text-cyan-800">
              ·{' '}
              {hasLiveBookings
                ? isAr
                  ? 'بيانات حقيقية فقط'
                  : 'Live Records Only'
                : 'DEMO DATA'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              {isAr ? 'متوسط الإشغال:' : 'Avg Occupancy:'}{' '}
              <strong className="font-mono-num text-slate-900">{avgOccupancy}%</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              {isAr ? 'النمو الشهري الأخير:' : 'Latest MoM Change:'}{' '}
              <strong
                className={`font-mono-num inline-flex items-center gap-0.5 ${
                  isPositiveLatest ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {isPositiveLatest ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {isPositiveLatest ? '+' : ''}
                {latest?.momGrowth ?? 0}%
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr ? 'أعلى شهر:' : 'Peak Month:'}{' '}
              <strong className="text-slate-900">
                {peakMonth?.monthLabel} ({peakMonth?.occupancyPct}%)
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr ? 'حجوزات الفترة:' : 'Period Bookings:'}{' '}
              <strong className="font-mono-num text-slate-900">{totalPeriodBookings}</strong>
            </span>
          </div>
        </div>

        {/* Interactive Toolbar: 3M/6M/12M Filter, Metric Mode, YoY Compare, CSV Export */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Last 3, 6, and 12 Months Dropdown Filter */}
          <select
            aria-label={isAr ? 'تصفية الفترة الزمنية' : 'Time range filter'}
            value={rangeMonths}
            onChange={(e) => setRangeMonths(Number(e.target.value) as MonthRange)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-700 cursor-pointer"
          >
            <option value={3}>{isAr ? 'آخر 3 أشهر' : 'Last 3 months'}</option>
            <option value={6}>{isAr ? 'آخر 6 أشهر' : 'Last 6 months'}</option>
            <option value={12}>{isAr ? 'آخر 12 شهراً' : 'Last 12 months'}</option>
          </select>

          {/* Metric Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMetricMode('occupancy')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                metricMode === 'occupancy'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'الإشغال والنمو' : 'Occupancy'}
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('volume')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                metricMode === 'volume'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'الحجوزات والليالي' : 'Bookings'}
            </button>
          </div>

          {/* Year-over-Year Toggle (active only when sufficient previous-year data exists) */}
          <button
            type="button"
            disabled={!hasSufficientPrevYearData || metricMode !== 'occupancy'}
            onClick={() => setShowYoY((v) => !v)}
            title={
              !hasSufficientPrevYearData
                ? isAr
                  ? 'تتطلب المقارنة السنوية وجود بيانات حجوزات مسجلة من العام الماضي'
                  : 'Requires recorded bookings from the previous year'
                : undefined
            }
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${
              showYoY && hasSufficientPrevYearData && metricMode === 'occupancy'
                ? 'bg-slate-900 text-white border-slate-900 cursor-pointer'
                : hasSufficientPrevYearData && metricMode === 'occupancy'
                ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer'
                : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
            }`}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            <span>{isAr ? 'مقارنة بالعام السابق' : 'vs. Prior Year'}</span>
          </button>

          {/* Export to PDF/CSV Dropdown Button */}
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير PDF / CSV' : 'Export to PDF/CSV'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {exportMenuOpen && (
              <div className="absolute end-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="w-full px-3.5 py-2 text-start text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-red-700 shrink-0" />
                  <span>{isAr ? 'تصدير ملف PDF (RTL)' : 'Export PDF (jsPDF)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full px-3.5 py-2 text-start text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{isAr ? 'تصدير ملف CSV (Excel)' : 'Export CSV (PapaParse)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend & Data Classification Key */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          {metricMode === 'occupancy' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-cyan-700 inline-block" />
                {isAr ? 'نسبة الإشغال (%)' : 'Occupancy Rate (%)'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber-600 inline-block" />
                {isAr ? 'النمو الشهري (MoM % pts)' : 'MoM Growth (% pts)'}
              </span>
              {showYoY && hasSufficientPrevYearData && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-500 inline-block" />
                  {isAr ? 'العام السابق (%)' : 'Previous Year (%)'}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-cyan-800 inline-block" />
                {isAr ? 'عدد الحجوزات' : 'Bookings Count'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber-600 inline-block" />
                {isAr ? 'الليالي المحجوزة' : 'Booked Nights'}
              </span>
            </>
          )}
        </div>

        {!hasSufficientPrevYearData && (
          <span className="text-[11px] text-slate-500">
            {isAr
              ? 'مقارنة العام السابق غير متاحة لعدم توفر حجوزات مسجلة في العام الماضي'
              : 'Prior-year comparison unavailable (insufficient prior-year booking records)'}
          </span>
        )}
      </div>

      {/* Recharts Chart Container */}
      <div dir="ltr" className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          {metricMode === 'occupancy' ? (
            <ComposedChart data={visibleSeries} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="rechartsOccArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0e7490" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0e7490" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                reversed={isAr}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                orientation={isAr ? 'right' : 'left'}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation={isAr ? 'left' : 'right'}
                domain={[-40, 40]}
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
                tick={{ fill: '#b45309', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine yAxisId="right" y={0} stroke="#cbd5e1" strokeDasharray="2 2" />
              <Tooltip
                content={
                  <CustomTrendsTooltip
                    isAr={isAr}
                    metricMode={metricMode}
                    showYoY={showYoY && hasSufficientPrevYearData}
                  />
                }
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="occupancyPct"
                stroke="#0e7490"
                strokeWidth={2.5}
                fill="url(#rechartsOccArea)"
                activeDot={{ r: 5 }}
              />
              {showYoY && hasSufficientPrevYearData && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="prevYearOccupancyPct"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: '#64748b' }}
                  connectNulls={false}
                />
              )}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="momGrowth"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 3, fill: '#d97706' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={visibleSeries} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                reversed={isAr}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                orientation={isAr ? 'right' : 'left'}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation={isAr ? 'left' : 'right'}
                tick={{ fill: '#b45309', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={
                  <CustomTrendsTooltip
                    isAr={isAr}
                    metricMode={metricMode}
                    showYoY={false}
                  />
                }
              />
              <Bar
                yAxisId="left"
                dataKey="bookingsCount"
                fill="#155e75"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bookedNights"
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#d97706' }}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
};
