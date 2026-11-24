import QRCode from 'qrcode';
import { COMPANY_BRANDING } from '../constants/branding';
import { Booking, Language } from '../types/platform';

export interface BookingQrPayload {
  type: 'FRT_CHECKIN_PASS';
  company: string;
  platform: string;
  bookingCode: string;
  bookingId: string;
  chalet: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function buildBookingQrPayload(
  booking: Booking,
  chaletNumber: string
): string {
  const payload: BookingQrPayload = {
    type: 'FRT_CHECKIN_PASS',
    company: COMPANY_BRANDING.companyName,
    platform: COMPANY_BRANDING.productNameEn,
    bookingCode: booking.bookingCode,
    bookingId: booking.id,
    chalet: chaletNumber,
    guestName: booking.guestName,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.numGuests,
  };
  return JSON.stringify(payload);
}

export function extractBookingCodeFromScan(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.includes('FRT_CHECKIN_PASS')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<BookingQrPayload>;
      if (parsed.bookingCode) return parsed.bookingCode;
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateBookingQrDataUrl(
  booking: Booking,
  chaletNumber: string
): Promise<string> {
  const payload = buildBookingQrPayload(booking, chaletNumber);
  return QRCode.toDataURL(payload, {
    width: 340,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
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

/**
 * Generates and downloads a branded Free Rent Tours Check-In QR Pass PNG
 * that guests can save on their phone or show at Porto El Sokhna reception.
 */
export async function exportBookingQrPassPng(
  booking: Booking,
  chaletNumber: string,
  lang: Language
): Promise<void> {
  const isAr = lang === 'ar';
  const qrDataUrl = await generateBookingQrDataUrl(booking, chaletNumber);
  const [qrImg, logoImg] = await Promise.all([
    loadImage(qrDataUrl),
    loadImage(COMPANY_BRANDING.logoPath),
  ]);

  const width = 640;
  const height = 840;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.direction = isAr ? 'rtl' : 'ltr';

  // Card Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header Banner
  ctx.fillStyle = '#082f49';
  ctx.fillRect(0, 0, width, 122);

  const pad = 32;
  const logoSize = 66;
  const logoX = isAr ? width - pad - logoSize : pad;
  const logoY = 28;

  if (logoImg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.drawImage(logoImg, logoX + 4, logoY + 4, logoSize - 8, logoSize - 8);
  }

  const textOffset = logoImg ? logoSize + 16 : 0;
  const textX = isAr ? width - pad - textOffset : pad + textOffset;
  const fontFamily = isAr
    ? "'Cairo', 'Plus Jakarta Sans', sans-serif"
    : "'Plus Jakarta Sans', 'Cairo', sans-serif";

  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillStyle = '#fcd34d';
  ctx.font = `700 14px ${fontFamily}`;
  ctx.fillText(COMPANY_BRANDING.companyName, textX, 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 18px ${fontFamily}`;
  ctx.fillText(
    isAr ? COMPANY_BRANDING.productNameAr : COMPANY_BRANDING.productNameEn,
    textX,
    74
  );

  ctx.fillStyle = '#bae6fd';
  ctx.font = `400 12px ${fontFamily}`;
  ctx.fillText(
    isAr ? 'تصريح تسجيل الوصول السريع عبر QR' : 'Express Reception Check-In Pass',
    textX,
    98
  );

  // Demo Notice if applicable
  let yCursor = 152;
  if (booking.isDemo) {
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#fcd34d';
    ctx.fillRect(pad, yCursor - 18, width - pad * 2, 32);
    ctx.strokeRect(pad, yCursor - 18, width - pad * 2, 32);
    ctx.fillStyle = '#92400e';
    ctx.textAlign = 'center';
    ctx.font = `700 12px ${fontFamily}`;
    ctx.fillText(
      isAr
        ? 'بيانات تجريبية (DEMO DATA) — للمعاينة والاختبار'
        : 'DEMO DATA — Sample Booking Pass for Preview',
      width / 2,
      yCursor + 2
    );
    yCursor += 44;
  }

  // QR Code Frame
  const qrBoxSize = 310;
  const qrX = (width - qrBoxSize) / 2;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(qrX, yCursor, qrBoxSize, qrBoxSize);
  ctx.strokeRect(qrX, yCursor, qrBoxSize, qrBoxSize);

  if (qrImg) {
    ctx.drawImage(qrImg, qrX + 12, yCursor + 12, qrBoxSize - 24, qrBoxSize - 24);
  }

  yCursor += qrBoxSize + 34;

  // Booking Code & Chalet Hero
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0e7490';
  ctx.font = `700 14px ${fontFamily}`;
  ctx.fillText(
    `${booking.bookingCode}   ·   ${isAr ? 'شاليه' : 'Chalet'} ${chaletNumber}`,
    width / 2,
    yCursor
  );

  yCursor += 30;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 22px ${fontFamily}`;
  ctx.fillText(booking.guestName, width / 2, yCursor);

  yCursor += 34;

  // Details Box
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillRect(pad, yCursor, width - pad * 2, 128);
  ctx.strokeRect(pad, yCursor, width - pad * 2, 128);

  const infoLines = isAr
    ? [
        `تاريخ الوصول: ${booking.checkIn}   |   المغادرة: ${booking.checkOut}`,
        `عدد الليالي: ${booking.nights}   |   عدد النزلاء: ${booking.numGuests}`,
        `يرجى إظهار هذا الرمز لموظف الاستقبال عند الوصول لتسريع إجراءات الدخول.`,
      ]
    : [
        `Check-in: ${booking.checkIn}   |   Check-out: ${booking.checkOut}`,
        `Nights: ${booking.nights}   |   Guests: ${booking.numGuests}`,
        `Present this QR code at reception upon arrival for express check-in.`,
      ];

  ctx.fillStyle = '#334155';
  ctx.font = `600 14px ${fontFamily}`;
  ctx.fillText(infoLines[0], width / 2, yCursor + 34);
  ctx.fillText(infoLines[1], width / 2, yCursor + 66);
  ctx.fillStyle = '#64748b';
  ctx.font = `400 12px ${fontFamily}`;
  ctx.fillText(infoLines[2], width / 2, yCursor + 102);

  // Branded Footer
  ctx.fillStyle = '#64748b';
  ctx.font = `500 11px ${fontFamily}`;
  ctx.fillText(
    `${COMPANY_BRANDING.companyName} · ${
      isAr ? COMPANY_BRANDING.subtitleAr : COMPANY_BRANDING.subtitleEn
    }`,
    width / 2,
    height - 24
  );

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `free-rent-tours-qr-${booking.bookingCode.toLowerCase()}.png`;
  link.click();
}
