import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import { COMPANY_BRANDING } from '../constants/branding';
import { Language } from '../types/platform';
import { getEgyptTodayIsoDate } from './egyptTime';

export interface ExportTrendRow {
  key: string;
  monthLabel: string;
  occupancyPct: number;
  momGrowth: number;
  bookingsCount: number;
  bookedNights: number;
  sourceType: 'actual' | 'demo_booking' | 'estimated_baseline';
  prevYearOccupancyPct: number | null;
}

export interface ExportTrendSummary {
  avgOccupancy: number;
  latestMomGrowth: number;
  peakLabel: string;
  peakOccupancy: number;
  totalBookings: number;
}

function getSourceLabel(
  sourceType: ExportTrendRow['sourceType'],
  isAr: boolean
): string {
  if (sourceType === 'actual') {
    return isAr ? 'حجوزات فعلية' : 'Actual Live Bookings';
  }
  if (sourceType === 'demo_booking') {
    return isAr ? 'سجلات تجريبية (Demo)' : 'Demo Booking Records';
  }
  return isAr ? 'تقدير موسمي افتراضي' : 'Estimated Baseline (Simulated)';
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function exportHistoricalCsv(
  series: ExportTrendRow[],
  rangeMonths: number,
  lang: Language
): void {
  const isAr = lang === 'ar';

  const rows = series.map((pt) =>
    isAr
      ? {
          'الشركة': COMPANY_BRANDING.companyName,
          'المنصة': COMPANY_BRANDING.productNameAr,
          'الشهر': pt.monthLabel,
          'التاريخ': pt.key,
          'تصنيف البيانات': getSourceLabel(pt.sourceType, true),
          'نسبة الإشغال (%)': `${pt.occupancyPct}%`,
          'النمو الشهري (% نقطة)': `${pt.momGrowth > 0 ? '+' : ''}${pt.momGrowth}%`,
          'عدد الحجوزات': pt.bookingsCount,
          'الليالي المحجوزة': pt.bookedNights,
          'إشغال العام السابق (%)':
            pt.prevYearOccupancyPct !== null ? `${pt.prevYearOccupancyPct}%` : 'غير متاح',
        }
      : {
          Company: COMPANY_BRANDING.companyName,
          Platform: COMPANY_BRANDING.productNameEn,
          Month: pt.monthLabel,
          'Month Key': pt.key,
          'Data Source': getSourceLabel(pt.sourceType, false),
          'Occupancy (%)': `${pt.occupancyPct}%`,
          'MoM Growth (% pts)': `${pt.momGrowth > 0 ? '+' : ''}${pt.momGrowth}%`,
          'Bookings Count': pt.bookingsCount,
          'Booked Nights': pt.bookedNights,
          'Prior Year Occupancy (%)':
            pt.prevYearOccupancyPct !== null ? `${pt.prevYearOccupancyPct}%` : 'N/A',
        }
  );

  const csvString = Papa.unparse(rows);
  const blob = new Blob(['\uFEFF' + csvString], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `free-rent-tours-porto-sokhna-booking-trends-${rangeMonths}m-${lang}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders an RTL/LTR-aware report page onto a HiDPI Canvas (using the browser's
 * native Arabic text shaping engine so ligatures and RTL direction render crisply)
 * with official Free Rent Tours branding and embeds it into a jsPDF A4 landscape document.
 */
export async function exportHistoricalPdf(
  series: ExportTrendRow[],
  summary: ExportTrendSummary,
  rangeMonths: number,
  lang: Language,
  usesSimulatedData: boolean
): Promise<void> {
  const isAr = lang === 'ar';
  const scale = 2;
  const width = 1122; // A4 landscape @ ~96dpi
  const rowHeight = 32;
  const baseHeaderHeight = usesSimulatedData ? 245 : 205;
  const height = Math.max(794, baseHeaderHeight + (series.length + 2) * rowHeight + 80);

  const logoImg = await loadImage(COMPANY_BRANDING.logoPath);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.direction = isAr ? 'rtl' : 'ltr';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Top Header Strip
  ctx.fillStyle = '#082f49';
  ctx.fillRect(0, 0, width, 102);

  const marginX = 48;
  const logoSize = 68;
  const logoX = isAr ? width - marginX - logoSize : marginX;
  const logoY = 17;

  if (logoImg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.drawImage(logoImg, logoX + 4, logoY + 4, logoSize - 8, logoSize - 8);
  }

  const textOffset = logoImg ? logoSize + 18 : 0;
  const startX = isAr ? width - marginX - textOffset : marginX + textOffset;
  const endX = isAr ? marginX : width - marginX;
  const fontFamily = isAr
    ? "'Cairo', 'Plus Jakarta Sans', sans-serif"
    : "'Plus Jakarta Sans', 'Cairo', sans-serif";

  ctx.fillStyle = '#fcd34d';
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.font = `700 12px ${fontFamily}`;
  ctx.fillText(
    `${COMPANY_BRANDING.companyName}  ·  ${
      isAr ? COMPANY_BRANDING.subtitleAr : COMPANY_BRANDING.subtitleEn
    }`,
    startX,
    29
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 19px ${fontFamily}`;
  ctx.fillText(
    isAr
      ? `${COMPANY_BRANDING.productNameAr} — تقرير اتجاهات الحجز التاريخية`
      : `${COMPANY_BRANDING.productNameEn} — Historical Booking Trends Report`,
    startX,
    56
  );

  ctx.fillStyle = '#bae6fd';
  ctx.font = `400 12px ${fontFamily}`;
  const generatedDate = getEgyptTodayIsoDate();
  ctx.fillText(
    isAr
      ? `النطاق الزمني: آخر ${rangeMonths} شهراً  ·  تاريخ الإصدار: ${generatedDate}`
      : `Timeframe: Last ${rangeMonths} months  ·  Generated: ${generatedDate}`,
    startX,
    81
  );

  let cursorY = 128;

  // Visible DEMO DATA Banner inside PDF when simulated data is present
  if (usesSimulatedData) {
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 1;
    ctx.fillRect(marginX, cursorY - 18, width - marginX * 2, 34);
    ctx.strokeRect(marginX, cursorY - 18, width - marginX * 2, 34);

    ctx.fillStyle = '#92400e';
    ctx.font = `600 12px ${fontFamily}`;
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillText(
      isAr
        ? 'بيانات تجريبية (DEMO DATA): يتضمن التقرير سجلات حجز تجريبية وتقديرات موسمية افتراضية للأشهر غير المسجلة.'
        : 'DEMO DATA: Report includes demo booking records and estimated seasonal baselines for unrecorded months.',
      isAr ? width - marginX - 12 : marginX + 12,
      cursorY + 3
    );
    cursorY += 44;
  }

  // Summary Strip
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillRect(marginX, cursorY - 16, width - marginX * 2, 46);
  ctx.strokeRect(marginX, cursorY - 16, width - marginX * 2, 46);

  ctx.fillStyle = '#0f172a';
  ctx.font = `600 13px ${fontFamily}`;
  ctx.textAlign = isAr ? 'right' : 'left';
  const summaryLine = isAr
    ? `متوسط الإشغال: ${summary.avgOccupancy}%   ·   النمو الشهري الأخير: ${
        summary.latestMomGrowth > 0 ? '+' : ''
      }${summary.latestMomGrowth}%   ·   أعلى شهر: ${summary.peakLabel} (${
        summary.peakOccupancy
      }%)   ·   إجمالي الحجوزات: ${summary.totalBookings}`
    : `Avg Occupancy: ${summary.avgOccupancy}%   ·   Latest MoM: ${
        summary.latestMomGrowth > 0 ? '+' : ''
      }${summary.latestMomGrowth}%   ·   Peak Month: ${summary.peakLabel} (${
        summary.peakOccupancy
      }%)   ·   Period Bookings: ${summary.totalBookings}`;

  ctx.fillText(
    summaryLine,
    isAr ? width - marginX - 14 : marginX + 14,
    cursorY + 12
  );
  cursorY += 54;

  // Table Columns (ordered RTL when Arabic, LTR when English)
  const columns = isAr
    ? [
        { title: 'الشهر', width: 130 },
        { title: 'تصنيف البيانات', width: 220 },
        { title: 'نسبة الإشغال', width: 130 },
        { title: 'النمو الشهري', width: 135 },
        { title: 'عدد الحجوزات', width: 130 },
        { title: 'الليالي المحجوزة', width: 140 },
        { title: 'العام السابق', width: 141 },
      ]
    : [
        { title: 'Month', width: 130 },
        { title: 'Data Source', width: 230 },
        { title: 'Occupancy %', width: 130 },
        { title: 'MoM Growth', width: 135 },
        { title: 'Bookings', width: 130 },
        { title: 'Booked Nights', width: 135 },
        { title: 'Prior Year %', width: 136 },
      ];

  // Draw Table Header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(marginX, cursorY, width - marginX * 2, rowHeight);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(marginX, cursorY, width - marginX * 2, rowHeight);

  ctx.fillStyle = '#334155';
  ctx.font = `700 12px ${fontFamily}`;

  let colX = isAr ? width - marginX : marginX;
  columns.forEach((col) => {
    ctx.textAlign = isAr ? 'right' : 'left';
    const textX = isAr ? colX - 10 : colX + 10;
    ctx.fillText(col.title, textX, cursorY + 20);
    colX += isAr ? -col.width : col.width;
  });
  cursorY += rowHeight;

  // Draw Table Rows
  series.forEach((pt, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(marginX, cursorY, width - marginX * 2, rowHeight);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(marginX, cursorY + rowHeight);
    ctx.lineTo(endX, cursorY + rowHeight);
    ctx.stroke();

    const values = [
      pt.monthLabel,
      getSourceLabel(pt.sourceType, isAr),
      `${pt.occupancyPct}%`,
      `${pt.momGrowth > 0 ? '+' : ''}${pt.momGrowth}%`,
      String(pt.bookingsCount),
      String(pt.bookedNights),
      pt.prevYearOccupancyPct !== null
        ? `${pt.prevYearOccupancyPct}%`
        : isAr
        ? 'غير متاح'
        : 'N/A',
    ];

    let cellX = isAr ? width - marginX : marginX;
    columns.forEach((col, cIdx) => {
      ctx.fillStyle =
        cIdx === 3
          ? pt.momGrowth >= 0
            ? '#047857'
            : '#b91c1c'
          : '#0f172a';
      ctx.font =
        cIdx === 0 || cIdx === 2
          ? `600 12px ${fontFamily}`
          : `400 12px ${fontFamily}`;
      ctx.textAlign = isAr ? 'right' : 'left';
      const textX = isAr ? cellX - 10 : cellX + 10;
      ctx.fillText(values[cIdx], textX, cursorY + 20);
      cellX += isAr ? -col.width : col.width;
    });

    cursorY += rowHeight;
  });

  // Outer Table Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(
    marginX,
    cursorY - (series.length + 1) * rowHeight,
    width - marginX * 2,
    (series.length + 1) * rowHeight
  );

  // Branded Footer Attribution
  ctx.fillStyle = '#64748b';
  ctx.font = `500 11px ${fontFamily}`;
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    isAr
      ? `${COMPANY_BRANDING.companyName} · ${COMPANY_BRANDING.productNameAr} · المدير التنفيذي: ${COMPANY_BRANDING.ceoName}`
      : `${COMPANY_BRANDING.companyName} · ${COMPANY_BRANDING.productNameEn} · CEO: ${COMPANY_BRANDING.ceoName}`,
    isAr ? width - marginX : marginX,
    height - 22
  );

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderHeight = Math.min(pageHeight, (height / width) * pageWidth);
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, renderHeight);
  pdf.save(`free-rent-tours-porto-sokhna-booking-trends-${rangeMonths}m-${lang}.pdf`);
}
