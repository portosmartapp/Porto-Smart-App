import { jsPDF } from 'jspdf';
import { COMPANY_BRANDING } from '../constants/branding';
import { Booking, Chalet, Language, Owner, Payment } from '../types/platform';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from './egyptTime';
import { BookingPaymentSummary, getPaymentMethodLabel } from './paymentLedger';

export interface ReceiptExportInput {
  payment: Payment;
  booking?: Booking | null;
  chalet?: Chalet | null;
  owner?: Owner | null;
  summary?: BookingPaymentSummary | null;
  lang: Language;
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

function getPaymentTypeLabel(type: Payment['paymentType'], isAr: boolean): string {
  switch (type) {
    case 'deposit':
      return isAr ? 'دفعة مقدم / تأمين' : 'Security Deposit';
    case 'guest_payment':
      return isAr ? 'دفعة حجز نزيل' : 'Guest Booking Payment';
    case 'owner_payout':
      return isAr ? 'تسوية مستحقات مالك' : 'Owner Settlement Payout';
    case 'refund':
      return isAr ? 'استرداد مبلغ' : 'Payment Refund';
    case 'correction':
      return isAr ? 'تعديل / تسوية محاسبية' : 'Accounting Correction';
    default:
      return type;
  }
}

/**
 * Generates an official Free Rent Tours branded bilingual PDF payment receipt
 * with native RTL Arabic / LTR English canvas text shaping and DEMO DATA badge if applicable.
 */
export async function exportPaymentReceiptPdf({
  payment,
  booking,
  chalet,
  owner,
  summary,
  lang,
}: ReceiptExportInput): Promise<void> {
  const isAr = lang === 'ar';
  const scale = 2;
  const width = 794; // A4 portrait @ ~96dpi
  const height = 1040;

  const logoImg = await loadImage(COMPANY_BRANDING.logoPath);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.direction = isAr ? 'rtl' : 'ltr';

  // Paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header band
  ctx.fillStyle = '#082f49';
  ctx.fillRect(0, 0, width, 126);

  const marginX = 48;
  const logoSize = 76;
  const logoX = isAr ? width - marginX - logoSize : marginX;
  const logoY = 25;

  if (logoImg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.drawImage(logoImg, logoX + 5, logoY + 5, logoSize - 10, logoSize - 10);
  }

  const textOffset = logoImg ? logoSize + 20 : 0;
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
  ctx.font = `700 20px ${fontFamily}`;
  ctx.fillText(
    isAr ? COMPANY_BRANDING.productNameAr : COMPANY_BRANDING.productNameEn,
    startX,
    70
  );

  ctx.fillStyle = '#bae6fd';
  ctx.font = `400 12px ${fontFamily}`;
  ctx.fillText(
    isAr ? COMPANY_BRANDING.subtitleAr : COMPANY_BRANDING.subtitleEn,
    startX,
    94
  );

  let y = 160;
  const isDemoReceipt = payment.isDemo || Boolean(booking?.isDemo);

  if (isDemoReceipt) {
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.fillRect(marginX, y - 16, width - marginX * 2, 34);
    ctx.strokeRect(marginX, y - 16, width - marginX * 2, 34);
    ctx.fillStyle = '#92400e';
    ctx.font = `700 12px ${fontFamily}`;
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillText(
      isAr
        ? 'بيانات تجريبية (DEMO DATA) — هذا الإيصال صادر لبيانات عرض افتراضية'
        : 'DEMO DATA — This receipt was generated from sample demo records',
      isAr ? width - marginX - 14 : marginX + 14,
      y + 5
    );
    y += 48;
  }

  // Receipt Title + Receipt Number Box
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 22px ${fontFamily}`;
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    isAr ? 'إيصال استلام / تسوية مالية' : 'OFFICIAL PAYMENT RECEIPT',
    isAr ? width - marginX : marginX,
    y
  );

  const receiptNo = payment.receiptNumber || `FRT-${payment.id.toUpperCase()}`;
  ctx.textAlign = isAr ? 'left' : 'right';
  ctx.fillStyle = '#0e7490';
  ctx.font = `700 15px ${fontFamily}`;
  ctx.fillText(receiptNo, oppX, y);

  y += 28;
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(width - marginX, y);
  ctx.stroke();

  y += 32;

  // Amount Highlight Card
  const isOutflow = payment.paymentType === 'refund' || payment.entryDirection === 'outflow';
  ctx.fillStyle = isOutflow ? '#fef2f2' : '#ecfdf5';
  ctx.strokeStyle = isOutflow ? '#fecaca' : '#a7f3d0';
  ctx.fillRect(marginX, y, width - marginX * 2, 92);
  ctx.strokeRect(marginX, y, width - marginX * 2, 92);

  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillStyle = isOutflow ? '#991b1b' : '#065f46';
  ctx.font = `600 13px ${fontFamily}`;
  ctx.fillText(getPaymentTypeLabel(payment.paymentType, isAr), isAr ? width - marginX - 20 : marginX + 20, y + 30);

  ctx.font = `700 30px ${fontFamily}`;
  const currency = isAr ? 'ج.م' : 'EGP';
  ctx.fillText(
    `${isOutflow ? '-' : ''}${payment.amount.toLocaleString()} ${currency}`,
    isAr ? width - marginX - 20 : marginX + 20,
    y + 68
  );

  ctx.textAlign = isAr ? 'left' : 'right';
  ctx.fillStyle = '#475569';
  ctx.font = `500 12px ${fontFamily}`;
  ctx.fillText(
    `${isAr ? 'تاريخ العملية' : 'Transaction Date'}: ${normalizeToEgyptDateString(payment.paidAt) || getEgyptTodayIsoDate()}`,
    isAr ? marginX + 20 : width - marginX - 20,
    y + 34
  );
  ctx.fillText(
    `${isAr ? 'المرجع' : 'Ref'}: ${payment.referenceNo || '-'}`,
    isAr ? marginX + 20 : width - marginX - 20,
    y + 60
  );

  y += 120;

  // Key-Value Details Grid
  const rows: Array<[string, string]> = [
    [isAr ? 'طريقة الدفع' : 'Payment Method', getPaymentMethodLabel(payment.paymentMethod, lang)],
    [isAr ? 'حالة المعاملة' : 'Status', payment.status || 'confirmed'],
    [
      isAr ? 'الشاليه' : 'Chalet Unit',
      chalet ? `${chalet.chaletNumber} (${isAr ? chalet.viewTypeAr : chalet.viewType})` : '-',
    ],
    [
      isAr ? 'كود الحجز' : 'Booking Code',
      booking ? `${booking.bookingCode} (${booking.checkIn} → ${booking.checkOut})` : '-',
    ],
    [isAr ? 'اسم النزيل' : 'Guest Name', booking?.guestName || '-'],
    [isAr ? 'اسم المالك' : 'Chalet Owner', owner ? (isAr ? owner.fullNameAr : owner.fullName) : '-'],
    [isAr ? 'سُجل بواسطة' : 'Recorded By', payment.recordedByName || COMPANY_BRANDING.companyName],
    [isAr ? 'ملاحظات / سبب التدقيق' : 'Notes / Audit Reason', payment.correctionReason || payment.notes || '-'],
  ];

  const rowH = 38;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(marginX, y, width - marginX * 2, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(marginX, y, width - marginX * 2, rowH);

    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillStyle = '#475569';
    ctx.font = `600 13px ${fontFamily}`;
    ctx.fillText(label, isAr ? width - marginX - 16 : marginX + 16, y + 24);

    ctx.textAlign = isAr ? 'left' : 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 13px ${fontFamily}`;
    ctx.fillText(val.slice(0, 62), isAr ? marginX + 16 : width - marginX - 16, y + 24);

    y += rowH;
  });

  // Booking Financial Reconciliation Summary if linked to a booking
  if (booking && summary) {
    y += 28;
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 15px ${fontFamily}`;
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.fillText(
      isAr ? 'ملخص الموقف المالي للحجز' : 'Booking Financial Balance Summary',
      isAr ? width - marginX : marginX,
      y
    );
    y += 14;

    const boxW = (width - marginX * 2 - 24) / 3;
    const summaryCards = [
      {
        label: isAr ? 'إجمالي قيمة الحجز' : 'Total Booking Value',
        value: `${summary.totalValue.toLocaleString()} ${currency}`,
        color: '#0f172a',
      },
      {
        label: isAr ? 'صافي المدفوع حتى الآن' : 'Net Paid to Date',
        value: `${summary.netPaid.toLocaleString()} ${currency}`,
        color: '#047857',
      },
      {
        label: isAr ? 'الرصيد المتبقي' : 'Remaining Balance',
        value: `${summary.remainingBalance.toLocaleString()} ${currency}`,
        color: summary.remainingBalance > 0 ? '#b45309' : '#047857',
      },
    ];

    summaryCards.forEach((card, i) => {
      const cardX = isAr
        ? width - marginX - (i + 1) * boxW - i * 12
        : marginX + i * (boxW + 12);
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.fillRect(cardX, y, boxW, 68);
      ctx.strokeRect(cardX, y, boxW, 68);

      ctx.textAlign = isAr ? 'right' : 'left';
      const innerX = isAr ? cardX + boxW - 14 : cardX + 14;
      ctx.fillStyle = '#64748b';
      ctx.font = `500 12px ${fontFamily}`;
      ctx.fillText(card.label, innerX, y + 24);

      ctx.fillStyle = card.color;
      ctx.font = `700 16px ${fontFamily}`;
      ctx.fillText(card.value, innerX, y + 50);
    });

    y += 96;
  }

  // Footer
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(marginX, height - 68);
  ctx.lineTo(width - marginX, height - 68);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `500 11px ${fontFamily}`;
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    isAr
      ? `${COMPANY_BRANDING.companyName} · ${COMPANY_BRANDING.productNameAr} · المدير التنفيذي: ${COMPANY_BRANDING.ceoName}`
      : `${COMPANY_BRANDING.companyName} · ${COMPANY_BRANDING.productNameEn} · CEO: ${COMPANY_BRANDING.ceoName}`,
    isAr ? width - marginX : marginX,
    height - 38
  );

  ctx.textAlign = isAr ? 'left' : 'right';
  ctx.fillText(
    isAr
      ? `تاريخ الطباعة: ${getEgyptTodayIsoDate()}`
      : `Issued (Cairo): ${getEgyptTodayIsoDate()}`,
    isAr ? marginX : width - marginX,
    height - 38
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
  pdf.save(`free-rent-tours-receipt-${receiptNo}.pdf`);
}
