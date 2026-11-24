import { jsPDF } from 'jspdf';
import { COMPANY_BRANDING } from '../constants/branding';
import {
  Booking,
  Expense,
  Language,
  MaintenanceTicket,
  NotificationDelivery,
  NotificationRecipient,
  NotificationSettings,
  Owner,
  Payment,
  PlatformDataset,
} from '../types/platform';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from '../utils/egyptTime';
import {
  INITIAL_NOTIFICATION_TEMPLATES,
  dispatchNotification,
} from '../utils/notificationEngine';

export interface WeeklyPeriod {
  startDate: string; // YYYY-MM-DD (inclusive, Africa/Cairo)
  endDate: string; // YYYY-MM-DD (inclusive, Africa/Cairo)
  label: string;
}

export interface OwnerWeeklyChaletSummary {
  chaletId: string;
  chaletNumber: string;
  viewType: string;
  viewTypeAr: string;
  ownerPct: number;
  bookedNightsInPeriod: number;
  occupancyPct: number;
  bookingsCount: number;
  grossRevenue: number;
  ownerGrossShare: number;
  managementFee: number;
  expensesTotal: number;
  netOwnerEarnings: number;
  openMaintenanceCount: number;
}

export interface OwnerWeeklySummary {
  owner: Owner;
  period: WeeklyPeriod;
  chalets: OwnerWeeklyChaletSummary[];
  bookingsInPeriod: Booking[];
  expensesInPeriod: Expense[];
  payoutsInPeriod: Payment[];
  maintenanceInPeriod: MaintenanceTicket[];
  totals: {
    chaletCount: number;
    totalBookedNights: number;
    avgOccupancyPct: number;
    bookingsCount: number;
    grossRevenue: number;
    ownerGrossShare: number;
    managementFees: number;
    expensesTotal: number;
    payoutsTotal: number;
    netOwnerBalance: number;
    openMaintenanceCount: number;
  };
  isDemo: boolean;
  generatedAt: string;
}

export type WeeklyEmailTaskStatus =
  | 'scheduled'
  | 'simulated'
  | 'queued_disabled'
  | 'skipped_not_configured'
  | 'blocked_duplicate'
  | 'blocked_preference'
  | 'failed';

export interface WeeklyEmailTask {
  id: string;
  ownerId: string;
  ownerName: string;
  recipientEmail: string;
  periodStart: string;
  periodEnd: string;
  scheduledFor: string;
  pdfFileName: string;
  status: WeeklyEmailTaskStatus;
  delivery?: NotificationDelivery;
  reason: string;
  createdAt: string;
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function diffDaysIso(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const sMs = Date.UTC(sy, sm - 1, sd);
  const eMs = Date.UTC(ey, em - 1, ed);
  return Math.max(0, Math.round((eMs - sMs) / 86_400_000));
}

export function getWeeklySummaryPeriod(referenceDateIso?: string): WeeklyPeriod {
  const endDate =
    normalizeToEgyptDateString(referenceDateIso) || getEgyptTodayIsoDate();
  const startDate = addDaysIso(endDate, -6); // 7-day inclusive weekly window
  return {
    startDate,
    endDate,
    label: `${startDate} → ${endDate}`,
  };
}

export function buildOwnerWeeklyPdfFileName(
  ownerId: string,
  period: Pick<WeeklyPeriod, 'startDate' | 'endDate'>
): string {
  const safeOwner = ownerId.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return `free-rent-tours-weekly-${safeOwner}-${period.startDate}-to-${period.endDate}.pdf`;
}

/**
 * Computes an isolated 7-day financial and operational summary for a single chalet owner.
 */
export function buildOwnerWeeklySummary(
  dataset: PlatformDataset,
  ownerId: string,
  options?: { referenceDate?: string; startDate?: string; endDate?: string }
): OwnerWeeklySummary | null {
  const owner = dataset.owners.find((o) => o.id === ownerId);
  if (!owner) return null;

  const defaultPeriod = getWeeklySummaryPeriod(options?.referenceDate);
  const startDate =
    normalizeToEgyptDateString(options?.startDate) || defaultPeriod.startDate;
  const endDate =
    normalizeToEgyptDateString(options?.endDate) || defaultPeriod.endDate;
  const period: WeeklyPeriod = {
    startDate,
    endDate,
    label: `${startDate} → ${endDate}`,
  };
  const windowDays = Math.max(1, diffDaysIso(startDate, addDaysIso(endDate, 1)));
  const exclusiveEnd = addDaysIso(endDate, 1);

  const ownerChalets = dataset.chalets.filter((c) => c.ownerId === ownerId);
  const ownerChaletIds = new Set(ownerChalets.map((c) => c.id));

  const bookingsInPeriod = dataset.bookings.filter((b) => {
    if (!ownerChaletIds.has(b.chaletId) || b.status === 'cancelled') return false;
    const bStart = normalizeToEgyptDateString(b.checkIn);
    const bEnd = normalizeToEgyptDateString(b.checkOut);
    if (!bStart || !bEnd) return false;
    return bStart < exclusiveEnd && bEnd > startDate;
  });

  const expensesInPeriod = dataset.expenses.filter((e) => {
    if (!ownerChaletIds.has(e.chaletId)) return false;
    const eDate = normalizeToEgyptDateString(e.expenseDate);
    return Boolean(eDate && eDate >= startDate && eDate <= endDate);
  });

  const payoutsInPeriod = dataset.payments.filter((p) => {
    if (p.ownerId !== ownerId || p.paymentType !== 'owner_payout') return false;
    const pDate = normalizeToEgyptDateString(p.paidAt);
    return Boolean(pDate && pDate >= startDate && pDate <= endDate);
  });

  const maintenanceInPeriod = dataset.maintenance.filter((m) => {
    if (!ownerChaletIds.has(m.chaletId)) return false;
    const mDate = normalizeToEgyptDateString(m.createdAt);
    const isOpen = m.status !== 'completed' && m.status !== 'closed';
    return isOpen || Boolean(mDate && mDate >= startDate && mDate <= endDate);
  });

  const chaletSummaries: OwnerWeeklyChaletSummary[] = ownerChalets.map((ch) => {
    const chBookings = bookingsInPeriod.filter((b) => b.chaletId === ch.id);
    let bookedNightsInPeriod = 0;
    let grossRevenue = 0;

    chBookings.forEach((b) => {
      const bStart = normalizeToEgyptDateString(b.checkIn);
      const bEnd = normalizeToEgyptDateString(b.checkOut);
      if (!bStart || !bEnd) return;
      const overlapStart = bStart > startDate ? bStart : startDate;
      const overlapEnd = bEnd < exclusiveEnd ? bEnd : exclusiveEnd;
      const overlapNights = diffDaysIso(overlapStart, overlapEnd);
      if (overlapNights <= 0) return;

      bookedNightsInPeriod += overlapNights;
      const totalBookingNights = Math.max(1, b.nights || diffDaysIso(bStart, bEnd));
      const prorated = (b.totalValue / totalBookingNights) * overlapNights;
      grossRevenue += prorated;
    });

    const roundedGross = Math.round(grossRevenue);
    const ownerGrossShare = Math.round((roundedGross * ch.ownerPct) / 100);
    const managementFee = Math.max(0, roundedGross - ownerGrossShare);
    const expensesTotal = expensesInPeriod
      .filter((e) => e.chaletId === ch.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const openMaintenanceCount = dataset.maintenance.filter(
      (m) => m.chaletId === ch.id && m.status !== 'completed' && m.status !== 'closed'
    ).length;

    const cappedNights = Math.min(windowDays, bookedNightsInPeriod);
    return {
      chaletId: ch.id,
      chaletNumber: ch.chaletNumber,
      viewType: ch.viewType,
      viewTypeAr: ch.viewTypeAr,
      ownerPct: ch.ownerPct,
      bookedNightsInPeriod: cappedNights,
      occupancyPct: Math.min(100, Math.round((cappedNights / windowDays) * 100)),
      bookingsCount: chBookings.length,
      grossRevenue: roundedGross,
      ownerGrossShare,
      managementFee,
      expensesTotal,
      netOwnerEarnings: ownerGrossShare - expensesTotal,
      openMaintenanceCount,
    };
  });

  const totalBookedNights = chaletSummaries.reduce(
    (s, c) => s + c.bookedNightsInPeriod,
    0
  );
  const grossRevenue = chaletSummaries.reduce((s, c) => s + c.grossRevenue, 0);
  const ownerGrossShare = chaletSummaries.reduce((s, c) => s + c.ownerGrossShare, 0);
  const managementFees = chaletSummaries.reduce((s, c) => s + c.managementFee, 0);
  const expensesTotal = expensesInPeriod.reduce((s, e) => s + e.amount, 0);
  const payoutsTotal = payoutsInPeriod.reduce((s, p) => s + p.amount, 0);
  const openMaintenanceCount = chaletSummaries.reduce(
    (s, c) => s + c.openMaintenanceCount,
    0
  );
  const maxPossibleNights = ownerChalets.length * windowDays;
  const avgOccupancyPct =
    maxPossibleNights > 0
      ? Math.min(100, Math.round((totalBookedNights / maxPossibleNights) * 100))
      : 0;

  return {
    owner,
    period,
    chalets: chaletSummaries,
    bookingsInPeriod,
    expensesInPeriod,
    payoutsInPeriod,
    maintenanceInPeriod,
    totals: {
      chaletCount: ownerChalets.length,
      totalBookedNights,
      avgOccupancyPct,
      bookingsCount: bookingsInPeriod.length,
      grossRevenue,
      ownerGrossShare,
      managementFees,
      expensesTotal,
      payoutsTotal,
      netOwnerBalance: ownerGrossShare - expensesTotal - payoutsTotal,
      openMaintenanceCount,
    },
    isDemo: Boolean(
      owner.isDemo || ownerChalets.some((c) => c.isDemo)
    ),
    generatedAt: new Date().toISOString(),
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface GeneratedWeeklyPdfResult {
  fileName: string;
  blob: Blob;
  dataUri: string;
}

/**
 * Generates a branded Free Rent Tours weekly summary PDF for a chalet owner.
 * Uses native Canvas RTL/LTR text shaping in browser environments and falls back cleanly
 * to text-based jsPDF rendering in headless environments.
 */
export async function generateOwnerWeeklySummaryPdf(
  summary: OwnerWeeklySummary,
  lang: Language,
  options?: { download?: boolean }
): Promise<GeneratedWeeklyPdfResult> {
  const isAr = lang === 'ar';
  const fileName = buildOwnerWeeklyPdfFileName(summary.owner.id, summary.period);
  const shouldDownload = options?.download !== false;
  const currency = isAr ? 'ج.م' : 'EGP';

  const hasBrowserCanvas =
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined';

  if (hasBrowserCanvas) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const scale = 2;
      const width = 794; // A4 portrait
      const rowHeight = 34;
      const rowsCount = Math.max(1, summary.chalets.length);
      const dynamicHeight = 590 + rowsCount * rowHeight + 110;
      const height = Math.max(1020, dynamicHeight);

      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);
      ctx.direction = isAr ? 'rtl' : 'ltr';

      const logoImg = await loadImage(COMPANY_BRANDING.logoPath);

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Header Banner
      ctx.fillStyle = '#082f49';
      ctx.fillRect(0, 0, width, 124);

      const marginX = 44;
      const logoSize = 74;
      const logoX = isAr ? width - marginX - logoSize : marginX;
      const logoY = 25;

      if (logoImg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(logoX, logoY, logoSize, logoSize);
        ctx.drawImage(logoImg, logoX + 5, logoY + 5, logoSize - 10, logoSize - 10);
      }

      const textOffset = logoImg ? logoSize + 18 : 0;
      const startX = isAr ? width - marginX - textOffset : marginX + textOffset;
      const oppX = isAr ? marginX : width - marginX;
      const fontFamily = isAr
        ? "'Cairo', 'Plus Jakarta Sans', sans-serif"
        : "'Plus Jakarta Sans', 'Cairo', sans-serif";

      ctx.textAlign = isAr ? 'right' : 'left';
      ctx.fillStyle = '#fcd34d';
      ctx.font = `700 13px ${fontFamily}`;
      ctx.fillText(COMPANY_BRANDING.companyName, startX, 42);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 19px ${fontFamily}`;
      ctx.fillText(
        isAr
          ? 'التقرير الأسبوعي الموجز لمالك الشاليهات'
          : 'Weekly Owner Portfolio Summary Report',
        startX,
        70
      );

      ctx.fillStyle = '#bae6fd';
      ctx.font = `500 12px ${fontFamily}`;
      ctx.fillText(
        `${isAr ? COMPANY_BRANDING.productNameAr : COMPANY_BRANDING.productNameEn} · ${summary.period.label}`,
        startX,
        96
      );

      let y = 156;

      if (summary.isDemo) {
        ctx.fillStyle = '#fffbeb';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.fillRect(marginX, y - 16, width - marginX * 2, 32);
        ctx.strokeRect(marginX, y - 16, width - marginX * 2, 32);
        ctx.fillStyle = '#92400e';
        ctx.font = `700 11px ${fontFamily}`;
        ctx.textAlign = isAr ? 'right' : 'left';
        ctx.fillText(
          isAr
            ? 'بيانات تجريبية (DEMO DATA) — تقرير أسبوعي استرشادي'
            : 'DEMO DATA — Weekly report generated from sample demo records',
          isAr ? width - marginX - 12 : marginX + 12,
          y + 4
        );
        y += 42;
      }

      // Owner Meta Card
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.fillRect(marginX, y, width - marginX * 2, 74);
      ctx.strokeRect(marginX, y, width - marginX * 2, 74);

      ctx.textAlign = isAr ? 'right' : 'left';
      const innerStart = isAr ? width - marginX - 16 : marginX + 16;
      const innerOpp = isAr ? marginX + 16 : width - marginX - 16;

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 16px ${fontFamily}`;
      ctx.fillText(
        isAr ? summary.owner.fullNameAr : summary.owner.fullName,
        innerStart,
        y + 28
      );

      ctx.fillStyle = '#475569';
      ctx.font = `500 12px ${fontFamily}`;
      ctx.fillText(
        `${summary.owner.phone} · ${summary.owner.email}`,
        innerStart,
        y + 52
      );

      ctx.textAlign = isAr ? 'left' : 'right';
      ctx.fillStyle = '#0e7490';
      ctx.font = `700 13px ${fontFamily}`;
      ctx.fillText(
        `${isAr ? 'الفترة' : 'Period'}: ${summary.period.startDate} → ${summary.period.endDate}`,
        innerOpp,
        y + 30
      );
      ctx.fillStyle = '#64748b';
      ctx.font = `500 11px ${fontFamily}`;
      ctx.fillText(
        `${isAr ? 'عدد الوحدات' : 'Chalets'}: ${summary.totals.chaletCount}`,
        innerOpp,
        y + 52
      );

      y += 96;

      // 4 Summary KPI Boxes
      const gap = 12;
      const boxW = (width - marginX * 2 - gap * 3) / 4;
      const kpis = [
        {
          label: isAr ? 'متوسط الإشغال' : 'Avg Occupancy',
          val: `${summary.totals.avgOccupancyPct}%`,
          color: '#0e7490',
        },
        {
          label: isAr ? 'إجمالي الإيجار' : 'Gross Revenue',
          val: `${summary.totals.grossRevenue.toLocaleString()} ${currency}`,
          color: '#0f172a',
        },
        {
          label: isAr ? 'المصروفات + الإدارة' : 'Fees & Expenses',
          val: `${(summary.totals.managementFees + summary.totals.expensesTotal).toLocaleString()} ${currency}`,
          color: '#b45309',
        },
        {
          label: isAr ? 'صافي مستحق المالك' : 'Net Owner Share',
          val: `${summary.totals.netOwnerBalance.toLocaleString()} ${currency}`,
          color: '#047857',
        },
      ];

      kpis.forEach((kpi, i) => {
        const boxX = isAr
          ? width - marginX - (i + 1) * boxW - i * gap
          : marginX + i * (boxW + gap);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#cbd5e1';
        ctx.fillRect(boxX, y, boxW, 70);
        ctx.strokeRect(boxX, y, boxW, 70);

        const padX = isAr ? boxX + boxW - 12 : boxX + 12;
        ctx.textAlign = isAr ? 'right' : 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = `500 11px ${fontFamily}`;
        ctx.fillText(kpi.label, padX, y + 24);

        ctx.fillStyle = kpi.color;
        ctx.font = `700 15px ${fontFamily}`;
        ctx.fillText(kpi.val, padX, y + 50);
      });

      y += 96;

      // Per-Chalet Breakdown Table
      ctx.textAlign = isAr ? 'right' : 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 14px ${fontFamily}`;
      ctx.fillText(
        isAr ? 'أداء الشاليهات خلال الأسبوع' : 'Weekly Chalet Breakdown',
        isAr ? width - marginX : marginX,
        y
      );
      y += 14;

      const tableW = width - marginX * 2;
      const colWidths = [110, 85, 80, 125, 110, 105, tableW - 615];
      const headers = isAr
        ? ['الشاليه', 'الإشغال', 'الليالي', 'الإيراد', 'حصة المالك', 'المصروفات', 'الصافي']
        : ['Chalet', 'Occ %', 'Nights', 'Gross', 'Owner Share', 'Expenses', 'Net'];

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(marginX, y, tableW, 32);

      let colCursor = isAr ? width - marginX : marginX;
      headers.forEach((h, idx) => {
        const cw = colWidths[idx];
        const cellX = isAr ? colCursor - 10 : colCursor + 10;
        ctx.textAlign = isAr ? 'right' : 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 11px ${fontFamily}`;
        ctx.fillText(h, cellX, y + 20);
        colCursor += isAr ? -cw : cw;
      });
      y += 32;

      summary.chalets.forEach((ch, rowIdx) => {
        ctx.fillStyle = rowIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
        ctx.fillRect(marginX, y, tableW, rowHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(marginX, y, tableW, rowHeight);

        const vals = [
          ch.chaletNumber,
          `${ch.occupancyPct}%`,
          String(ch.bookedNightsInPeriod),
          `${ch.grossRevenue.toLocaleString()}`,
          `${ch.ownerGrossShare.toLocaleString()}`,
          `${ch.expensesTotal.toLocaleString()}`,
          `${ch.netOwnerEarnings.toLocaleString()}`,
        ];

        let rCursor = isAr ? width - marginX : marginX;
        vals.forEach((v, idx) => {
          const cw = colWidths[idx];
          const cellX = isAr ? rCursor - 10 : rCursor + 10;
          ctx.textAlign = isAr ? 'right' : 'left';
          ctx.fillStyle = idx === 6 ? '#047857' : '#1e293b';
          ctx.font = `${idx === 0 || idx === 6 ? '700' : '500'} 11px ${fontFamily}`;
          ctx.fillText(v, cellX, y + 21);
          rCursor += isAr ? -cw : cw;
        });

        y += rowHeight;
      });

      y += 28;

      // Operational & Maintenance Note
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#e2e8f0';
      ctx.fillRect(marginX, y, tableW, 64);
      ctx.strokeRect(marginX, y, tableW, 64);
      ctx.textAlign = isAr ? 'right' : 'left';
      ctx.fillStyle = '#334155';
      ctx.font = `600 12px ${fontFamily}`;
      ctx.fillText(
        isAr
          ? `ملخص العمليات: ${summary.totals.bookingsCount} حجوزات في الفترة · ${summary.totals.openMaintenanceCount} بلاغات صيانة مفتوحة · تسويات مصروفة: ${summary.totals.payoutsTotal.toLocaleString()} ${currency}`
          : `Operations Summary: ${summary.totals.bookingsCount} active bookings · ${summary.totals.openMaintenanceCount} open maintenance tickets · Payouts settled: ${summary.totals.payoutsTotal.toLocaleString()} ${currency}`,
        isAr ? width - marginX - 14 : marginX + 14,
        y + 37
      );

      // Footer
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(marginX, height - 62);
      ctx.lineTo(width - marginX, height - 62);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = `500 11px ${fontFamily}`;
      ctx.textAlign = isAr ? 'right' : 'left';
      ctx.fillText(
        isAr
          ? `${COMPANY_BRANDING.companyName} · المدير التنفيذي: ${COMPANY_BRANDING.ceoName}`
          : `${COMPANY_BRANDING.companyName} · CEO: ${COMPANY_BRANDING.ceoName}`,
        isAr ? width - marginX : marginX,
        height - 34
      );
      ctx.textAlign = isAr ? 'left' : 'right';
      ctx.fillText(
        `${isAr ? 'أُصدر بتوقيت القاهرة' : 'Issued (Cairo)'}: ${getEgyptTodayIsoDate()}`,
        oppX,
        height - 34
      );

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(pdfH, (height / width) * pdfW));

      if (shouldDownload) {
        pdf.save(fileName);
      }

      return {
        fileName,
        blob: pdf.output('blob'),
        dataUri: pdf.output('datauristring'),
      };
    }
  }

  // Headless / Node fallback PDF document (ASCII-safe structured summary)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  pdf.setFontSize(14);
  pdf.text(`${COMPANY_BRANDING.companyName} - Weekly Owner Summary`, 40, 50);
  pdf.setFontSize(11);
  pdf.text(`Owner: ${summary.owner.fullName} (${summary.owner.email})`, 40, 78);
  pdf.text(`Period: ${summary.period.startDate} to ${summary.period.endDate}`, 40, 98);
  pdf.text(`Chalets: ${summary.totals.chaletCount} | Avg Occupancy: ${summary.totals.avgOccupancyPct}%`, 40, 118);
  pdf.text(`Gross Revenue: ${summary.totals.grossRevenue} EGP`, 40, 138);
  pdf.text(`Management Fees: ${summary.totals.managementFees} EGP | Expenses: ${summary.totals.expensesTotal} EGP`, 40, 158);
  pdf.text(`Net Owner Balance: ${summary.totals.netOwnerBalance} EGP`, 40, 178);

  let yLine = 210;
  summary.chalets.forEach((ch) => {
    pdf.text(
      `${ch.chaletNumber}: Occ ${ch.occupancyPct}% (${ch.bookedNightsInPeriod}n) | Gross ${ch.grossRevenue} EGP | Net ${ch.netOwnerEarnings} EGP`,
      40,
      yLine
    );
    yLine += 20;
  });

  if (shouldDownload && typeof document !== 'undefined') {
    pdf.save(fileName);
  }

  return {
    fileName,
    blob: pdf.output('blob'),
    dataUri: pdf.output('datauristring'),
  };
}

export function areNotificationsConfiguredForEmail(
  settings: NotificationSettings
): { configured: boolean; reason: string } {
  if (!settings.emailEnabled) {
    return {
      configured: false,
      reason: 'Email notifications are disabled in Notification Settings.',
    };
  }

  if (!settings.providersActivated && !settings.simulationMode) {
    return {
      configured: false,
      reason: 'External email provider is not activated and simulation mode is off.',
    };
  }

  return {
    configured: true,
    reason: settings.providersActivated
      ? 'Email notifications configured with active provider.'
      : 'Email notifications configured in safe simulation mode.',
  };
}

export interface ScheduleWeeklyEmailInput {
  dataset: PlatformDataset;
  ownerId: string;
  lang?: Language;
  referenceDate?: string;
  scheduledFor?: string;
  forceAllowDuplicate?: boolean;
  existingTasks?: WeeklyEmailTask[];
}

/**
 * Schedules a weekly owner summary email task automatically if email notifications
 * are configured, leveraging notificationEngine's duplicate-prevention and provider safety lock.
 */
export function scheduleWeeklyOwnerSummaryEmail(
  input: ScheduleWeeklyEmailInput
): WeeklyEmailTask {
  const { dataset, ownerId } = input;
  const nowIso = new Date().toISOString();
  const summary = buildOwnerWeeklySummary(dataset, ownerId, {
    referenceDate: input.referenceDate,
  });

  if (!summary) {
    return {
      id: `wk-task-${Date.now()}-${ownerId}`,
      ownerId,
      ownerName: ownerId,
      recipientEmail: '',
      periodStart: '',
      periodEnd: '',
      scheduledFor: input.scheduledFor || nowIso,
      pdfFileName: '',
      status: 'failed',
      reason: `Owner ${ownerId} not found.`,
      createdAt: nowIso,
    };
  }

  const lang: Language = input.lang || 'ar';
  const isAr = lang === 'ar';
  const pdfFileName = buildOwnerWeeklyPdfFileName(ownerId, summary.period);
  const scheduledFor = input.scheduledFor || nowIso;

  const existingRecipient = dataset.notificationRecipients.find(
    (r) => r.ownerId === ownerId
  );
  const recipient: NotificationRecipient = existingRecipient || {
    id: `rcp-owner-${ownerId}`,
    fullName: summary.owner.fullName,
    fullNameAr: summary.owner.fullNameAr,
    role: 'owner',
    phone: summary.owner.phone,
    email: summary.owner.email,
    preferredLang: lang,
    smsOptIn: false,
    emailOptIn: Boolean(summary.owner.email),
    inAppOptIn: true,
    ownerId: summary.owner.id,
    chaletId: null,
    isActive: true,
    isDemo: summary.isDemo,
    createdAt: nowIso,
  };

  const configCheck = areNotificationsConfiguredForEmail(dataset.notificationSettings);
  if (!configCheck.configured) {
    return {
      id: `wk-task-${Date.now()}-${ownerId}`,
      ownerId: summary.owner.id,
      ownerName: isAr ? summary.owner.fullNameAr : summary.owner.fullName,
      recipientEmail: recipient.email,
      periodStart: summary.period.startDate,
      periodEnd: summary.period.endDate,
      scheduledFor,
      pdfFileName,
      status: 'skipped_not_configured',
      reason: isAr
        ? 'إشعارات البريد الإلكتروني غير مفعلة في إعدادات التنبيهات؛ لم يتم جدولة الإرسال التلقائي.'
        : configCheck.reason,
      createdAt: nowIso,
    };
  }

  if (!input.forceAllowDuplicate && input.existingTasks) {
    const existingTask = input.existingTasks.find(
      (t) =>
        t.ownerId === ownerId &&
        t.periodStart === summary.period.startDate &&
        t.periodEnd === summary.period.endDate &&
        t.status !== 'skipped_not_configured' &&
        t.status !== 'failed'
    );
    if (existingTask) {
      return {
        id: `wk-task-${Date.now()}-${ownerId}`,
        ownerId: summary.owner.id,
        ownerName: isAr ? summary.owner.fullNameAr : summary.owner.fullName,
        recipientEmail: recipient.email,
        periodStart: summary.period.startDate,
        periodEnd: summary.period.endDate,
        scheduledFor,
        pdfFileName,
        status: 'blocked_duplicate',
        reason: isAr
          ? `تمت جدولة التقرير الأسبوعي لهذا المالك مسبقاً للفترة (${summary.period.label}).`
          : `Weekly email task already scheduled for this owner and period (${summary.period.label}).`,
        createdAt: nowIso,
      };
    }
  }

  const baseTemplate =
    dataset.notificationTemplates.find((t) => t.eventKey === 'owner_monthly_statement') ||
    INITIAL_NOTIFICATION_TEMPLATES.find((t) => t.eventKey === 'owner_monthly_statement')!;

  const weeklyTemplate = {
    ...baseTemplate,
    emailSubjectEn:
      '[Free Rent Tours] Weekly Owner Summary ({{monthLabel}}) — {{ownerName}}',
    emailSubjectAr:
      '[Free Rent Tours] الملخص الأسبوعي للمالك ({{monthLabel}}) — {{ownerName}}',
    emailBodyEn:
      'Dear {{ownerName}}, your weekly portfolio PDF ({{pdfFileName}}) for {{monthLabel}} is ready. Avg occupancy: {{occupancyPct}}%, Gross: {{grossRevenue}} EGP, Net balance: {{amount}} EGP.',
    emailBodyAr:
      'السيد المالك {{ownerName}}، التقرير الأسبوعي بصيغة PDF ({{pdfFileName}}) للفترة {{monthLabel}} جاهز. متوسط الإشغال: {{occupancyPct}}%، الإيراد الإجمالي: {{grossRevenue}} ج.م، الصافي المستحق: {{amount}} ج.م.',
  };

  const dispatchRes = dispatchNotification({
    template: weeklyTemplate,
    channel: 'email',
    recipient,
    relatedEntityId: `weekly-${ownerId}-${summary.period.startDate}`,
    settings: dataset.notificationSettings,
    preferences: dataset.notificationPreferences,
    existingDeliveries: dataset.notificationDeliveries,
    forceAllowDuplicate: input.forceAllowDuplicate,
    variables: {
      ownerName: isAr ? summary.owner.fullNameAr : summary.owner.fullName,
      monthLabel: summary.period.label,
      amount: summary.totals.netOwnerBalance.toLocaleString(),
      grossRevenue: summary.totals.grossRevenue.toLocaleString(),
      occupancyPct: summary.totals.avgOccupancyPct,
      pdfFileName,
    },
  });

  if (!dispatchRes.ok) {
    const blockedStatus: WeeklyEmailTaskStatus = dispatchRes.blockedByDuplicate
      ? 'blocked_duplicate'
      : dispatchRes.blockedByPreference
      ? 'blocked_preference'
      : 'failed';
    return {
      id: `wk-task-${Date.now()}-${ownerId}`,
      ownerId: summary.owner.id,
      ownerName: isAr ? summary.owner.fullNameAr : summary.owner.fullName,
      recipientEmail: recipient.email,
      periodStart: summary.period.startDate,
      periodEnd: summary.period.endDate,
      scheduledFor,
      pdfFileName,
      status: blockedStatus,
      reason: dispatchRes.reason || 'Dispatch blocked.',
      createdAt: nowIso,
    };
  }

  const delivery = dispatchRes.delivery!;
  const taskStatus: WeeklyEmailTaskStatus =
    delivery.status === 'sent'
      ? 'scheduled'
      : delivery.status === 'simulated'
      ? 'simulated'
      : delivery.status === 'failed'
      ? 'failed'
      : 'queued_disabled';

  return {
    id: `wk-task-${Date.now()}-${ownerId}`,
    ownerId: summary.owner.id,
    ownerName: isAr ? summary.owner.fullNameAr : summary.owner.fullName,
    recipientEmail: recipient.email,
    periodStart: summary.period.startDate,
    periodEnd: summary.period.endDate,
    scheduledFor,
    pdfFileName,
    status: taskStatus,
    delivery,
    reason:
      dispatchRes.reason ||
      (isAr
        ? 'تمت جدولة مهمة البريد الإلكتروني للملخص الأسبوعي بنجاح.'
        : 'Weekly owner summary email task scheduled successfully.'),
    createdAt: nowIso,
  };
}

export interface BatchWeeklyReportResult {
  summaries: OwnerWeeklySummary[];
  tasks: WeeklyEmailTask[];
  deliveries: NotificationDelivery[];
}

/**
 * Generates weekly owner summaries and evaluates/schedules weekly email tasks
 * across all owners in the dataset.
 */
export function scheduleWeeklyOwnerReportsBatch(input: {
  dataset: PlatformDataset;
  lang?: Language;
  referenceDate?: string;
  scheduledFor?: string;
  existingTasks?: WeeklyEmailTask[];
  forceAllowDuplicate?: boolean;
}): BatchWeeklyReportResult {
  const summaries: OwnerWeeklySummary[] = [];
  const tasks: WeeklyEmailTask[] = [];
  const deliveries: NotificationDelivery[] = [];
  let rollingDeliveries = [...input.dataset.notificationDeliveries];

  for (const owner of input.dataset.owners) {
    const summary = buildOwnerWeeklySummary(input.dataset, owner.id, {
      referenceDate: input.referenceDate,
    });
    if (!summary) continue;
    summaries.push(summary);

    const task = scheduleWeeklyOwnerSummaryEmail({
      dataset: {
        ...input.dataset,
        notificationDeliveries: rollingDeliveries,
      },
      ownerId: owner.id,
      lang: input.lang,
      referenceDate: input.referenceDate,
      scheduledFor: input.scheduledFor,
      existingTasks: input.existingTasks,
      forceAllowDuplicate: input.forceAllowDuplicate,
    });

    tasks.push(task);
    if (task.delivery) {
      deliveries.push(task.delivery);
      rollingDeliveries = [task.delivery, ...rollingDeliveries];
    }
  }

  return { summaries, tasks, deliveries };
}

/**
 * Starts a periodic background scheduler that automatically runs weekly owner report
 * email scheduling when notifications are configured. Returns an unsubscribe/stop callback.
 */
export function startWeeklyReportScheduler(options: {
  getDataset: () => PlatformDataset;
  getLang?: () => Language;
  onTasksScheduled?: (result: BatchWeeklyReportResult) => void;
  intervalMs?: number;
  runImmediately?: boolean;
}): () => void {
  const intervalMs = options.intervalMs ?? 60 * 60 * 1000; // Default hourly check (dedup-safe per week)
  const scheduledHistory: WeeklyEmailTask[] = [];

  const tick = () => {
    const dataset = options.getDataset();
    const check = areNotificationsConfiguredForEmail(dataset.notificationSettings);
    if (!check.configured) return;

    const result = scheduleWeeklyOwnerReportsBatch({
      dataset,
      lang: options.getLang?.() ?? 'ar',
      existingTasks: scheduledHistory,
    });

    scheduledHistory.push(...result.tasks);
    if (result.tasks.length > 0) {
      options.onTasksScheduled?.(result);
    }
  };

  if (options.runImmediately) {
    tick();
  }

  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
