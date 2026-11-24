import QRCode from 'qrcode';
import { COMPANY_BRANDING } from '../constants/branding';
import { Chalet, Language } from '../types/platform';

export type ChaletPortalAction =
  | 'stay'
  | 'checkin'
  | 'housekeeping'
  | 'maintenance'
  | 'offers';

export interface ParsedChaletPortalParams {
  isGuestPortal: boolean;
  chaletRef: string | null;
  action: ChaletPortalAction;
}

const DEFAULT_FALLBACK_ORIGIN = 'https://porto-sokhna.app';

export function normalizeChaletPortalAction(
  rawAction: string | null | undefined
): ChaletPortalAction {
  const normalized = rawAction?.trim().toLowerCase();
  if (!normalized) return 'stay';
  if (normalized === 'checkin' || normalized === 'check-in' || normalized === 'check_in') {
    return 'checkin';
  }
  if (normalized === 'housekeeping' || normalized === 'cleaning' || normalized === 'linen') {
    return 'housekeeping';
  }
  if (normalized === 'maintenance' || normalized === 'repair' || normalized === 'issue') {
    return 'maintenance';
  }
  if (normalized === 'offers' || normalized === 'dining' || normalized === 'deals') {
    return 'offers';
  }
  return 'stay';
}

export function buildChaletGuestPortalUrl(
  chalet: Pick<Chalet, 'id' | 'chaletNumber'>,
  options?: { origin?: string; action?: ChaletPortalAction }
): string {
  const runtimeOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : DEFAULT_FALLBACK_ORIGIN;
  const baseOrigin = (options?.origin || runtimeOrigin).replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('portal', 'guest');
  params.set('chalet', chalet.chaletNumber || chalet.id);
  if (options?.action && options.action !== 'stay') {
    params.set('action', options.action);
  }
  return `${baseOrigin}/?${params.toString()}`;
}

export function parseChaletGuestPortalUrl(urlOrSearch: string): ParsedChaletPortalParams {
  const raw = urlOrSearch.trim();
  if (!raw) {
    return { isGuestPortal: false, chaletRef: null, action: 'stay' };
  }

  let searchStr = '';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      searchStr = new URL(raw).search;
    } else if (raw.startsWith('?')) {
      searchStr = raw;
    } else if (raw.includes('?')) {
      searchStr = raw.slice(raw.indexOf('?'));
    } else if (raw.includes('=')) {
      searchStr = `?${raw}`;
    }
  } catch {
    return { isGuestPortal: false, chaletRef: null, action: 'stay' };
  }

  const params = new URLSearchParams(searchStr);
  const portal = params.get('portal')?.toLowerCase();
  const chalet = params.get('chalet')?.trim() || null;
  const rawAction = params.get('action');
  const action = normalizeChaletPortalAction(rawAction);
  const hasExplicitAction = Boolean(rawAction && action !== 'stay');

  return {
    isGuestPortal: portal === 'guest' && (Boolean(chalet) || hasExplicitAction),
    chaletRef: chalet,
    action,
  };
}

export function findChaletByPortalRef(
  chalets: Chalet[],
  chaletRef: string | null | undefined
): Chalet | undefined {
  if (!chaletRef) return undefined;
  const normalized = chaletRef.trim().toLowerCase();
  if (!normalized) return undefined;
  return (
    chalets.find((c) => c.chaletNumber.toLowerCase() === normalized) ||
    chalets.find((c) => c.id.toLowerCase() === normalized)
  );
}

export async function generateChaletPortalQrDataUrl(portalUrl: string): Promise<string> {
  return QRCode.toDataURL(portalUrl, {
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
 * Generates and downloads a branded Free Rent Tours In-Chalet QR Poster PNG
 * for a chalet's unique guest portal URL (check-in & maintenance reporting).
 */
export async function exportChaletPortalQrPosterPng(
  chalet: Chalet,
  portalUrl: string,
  lang: Language,
  action: ChaletPortalAction = 'stay'
): Promise<void> {
  const isAr = lang === 'ar';
  const qrDataUrl = await generateChaletPortalQrDataUrl(portalUrl);
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

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header Banner
  ctx.fillStyle = '#082f49';
  ctx.fillRect(0, 0, width, 126);

  const pad = 32;
  const logoSize = 68;
  const logoX = isAr ? width - pad - logoSize : pad;
  const logoY = 29;

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
    isAr ? 'بوابة النزيل الذكية للشاليه' : 'Smart Chalet Guest Portal',
    textX,
    100
  );

  let yCursor = 160;

  // Chalet Hero Badge
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0e7490';
  ctx.font = `700 28px ${fontFamily}`;
  ctx.fillText(`${isAr ? 'شاليه' : 'Chalet'} ${chalet.chaletNumber}`, width / 2, yCursor);

  yCursor += 26;
  ctx.fillStyle = '#475569';
  ctx.font = `500 14px ${fontFamily}`;
  ctx.fillText(isAr ? chalet.viewTypeAr : chalet.viewType, width / 2, yCursor);

  yCursor += 30;

  // QR Frame
  const qrBoxSize = 320;
  const qrX = (width - qrBoxSize) / 2;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(qrX, yCursor, qrBoxSize, qrBoxSize);
  ctx.strokeRect(qrX, yCursor, qrBoxSize, qrBoxSize);

  if (qrImg) {
    ctx.drawImage(qrImg, qrX + 14, yCursor + 14, qrBoxSize - 28, qrBoxSize - 28);
  }

  yCursor += qrBoxSize + 36;

  // Instructions Box
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillRect(pad, yCursor, width - pad * 2, 152);
  ctx.strokeRect(pad, yCursor, width - pad * 2, 152);

  const subtitleMap: Record<ChaletPortalAction, { ar: string; en: string }> = {
    checkin: {
      ar: 'تسجيل الوصول السريع وتأكيد بيانات الإقامة',
      en: 'Express Self Check-In & Stay Verification',
    },
    housekeeping: {
      ar: 'طلب خدمة التدبير الفندقي والمناشف الإضافية',
      en: 'Instant Housekeeping & Room Refresh Request',
    },
    maintenance: {
      ar: 'الإبلاغ الفوري عن أعطال الصيانة داخل الشاليه',
      en: 'Instant In-Chalet Maintenance Issue Reporting',
    },
    offers: {
      ar: 'عروض المطاعم والخدمات الحصرية لنزلاء المنتجع',
      en: 'Exclusive Resort Dining & Supermarket Offers',
    },
    stay: {
      ar: 'امسح رمز QR بكاميرا الهاتف للوصول المباشر إلى:',
      en: 'Scan this QR code with your phone camera for instant access to:',
    },
  };
  const subtitle = isAr ? subtitleMap[action].ar : subtitleMap[action].en;

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 15px ${fontFamily}`;
  ctx.fillText(subtitle, width / 2, yCursor + 34);

  ctx.fillStyle = '#334155';
  ctx.font = `500 13px ${fontFamily}`;
  ctx.fillText(
    isAr
      ? '• تسجيل الوصول السريع وعرض تفاصيل الحجز'
      : '• Express Check-In & Reservation Details',
    width / 2,
    yCursor + 66
  );
  ctx.fillText(
    isAr
      ? '• الإبلاغ عن الصيانة وطلبات التدبير الفندقي'
      : '• Instant Maintenance Reporting & Housekeeping Requests',
    width / 2,
    yCursor + 94
  );

  ctx.fillStyle = '#0e7490';
  ctx.font = `500 11px 'JetBrains Mono', monospace`;
  const truncatedUrl = portalUrl.length > 68 ? `${portalUrl.slice(0, 65)}...` : portalUrl;
  ctx.fillText(truncatedUrl, width / 2, yCursor + 128);

  // Footer
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
  const safeCode = chalet.chaletNumber.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const actionSuffix = action !== 'stay' ? `-${action}` : '';
  link.download = `free-rent-tours-chalet-${safeCode}${actionSuffix}-qr.png`;
  link.click();
}
