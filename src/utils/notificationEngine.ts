import { COMPANY_BRANDING } from '../constants/branding';
import {
  Language,
  NotificationChannel,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationEventKey,
  NotificationPreference,
  NotificationRecipient,
  NotificationSettings,
  NotificationTemplate,
} from '../types/platform';
import { getEgyptTodayIsoDate } from './egyptTime';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  id: 'default',
  smsEnabled: false,
  emailEnabled: false,
  inAppEnabled: true,
  providersActivated: false, // Must stay false until external provider keys are configured & enabled server-side
  simulationMode: true,
  smsProviderName: 'Disabled — Server SMS_API_KEY not configured',
  emailProviderName: 'Disabled — Server EMAIL_API_KEY not configured',
  senderName: `${COMPANY_BRANDING.companyName} — Porto El Sokhna`,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
  updatedAt: new Date().toISOString(),
};

export const INITIAL_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'tpl-01',
    eventKey: 'booking_confirmation',
    category: 'booking',
    titleEn: 'Booking Confirmation',
    titleAr: 'تأكيد الحجز',
    emailSubjectEn: '[Free Rent Tours] Booking Confirmed {{bookingCode}} — Chalet {{chaletNumber}}',
    emailSubjectAr: '[Free Rent Tours] تأكيد حجز رقم {{bookingCode}} — شاليه {{chaletNumber}}',
    emailBodyEn:
      'Dear {{guestName}}, your reservation {{bookingCode}} at Porto El Sokhna Chalet {{chaletNumber}} ({{checkIn}} to {{checkOut}}) is confirmed. Total: {{amount}} EGP.',
    emailBodyAr:
      'عزيزي {{guestName}}، تم تأكيد حجزك رقم {{bookingCode}} في شاليه {{chaletNumber}} ببورتو السخنة من {{checkIn}} إلى {{checkOut}}. الإجمالي: {{amount}} ج.م.',
    smsBodyEn: 'Free Rent Tours: Booking {{bookingCode}} confirmed for Chalet {{chaletNumber}} ({{checkIn}} - {{checkOut}}).',
    smsBodyAr: 'Free Rent Tours: تم تأكيد حجزك {{bookingCode}} في شاليه {{chaletNumber}} ({{checkIn}} - {{checkOut}}).',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-02',
    eventKey: 'booking_cancellation',
    category: 'booking',
    titleEn: 'Booking Cancellation',
    titleAr: 'إلغاء الحجز',
    emailSubjectEn: '[Free Rent Tours] Booking Cancelled {{bookingCode}}',
    emailSubjectAr: '[Free Rent Tours] إلغاء الحجز رقم {{bookingCode}}',
    emailBodyEn:
      'Reservation {{bookingCode}} for Chalet {{chaletNumber}} ({{checkIn}} to {{checkOut}}) has been cancelled for {{guestName}}.',
    emailBodyAr:
      'تم إلغاء الحجز رقم {{bookingCode}} الخاص بشاليه {{chaletNumber}} ({{checkIn}} إلى {{checkOut}}) للنزيل {{guestName}}.',
    smsBodyEn: 'Free Rent Tours: Booking {{bookingCode}} (Chalet {{chaletNumber}}) has been cancelled.',
    smsBodyAr: 'Free Rent Tours: تم إلغاء الحجز رقم {{bookingCode}} (شاليه {{chaletNumber}}).',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-03',
    eventKey: 'deposit_received',
    category: 'payment',
    titleEn: 'Deposit Received',
    titleAr: 'استلام دفعة مقدم / تأمين',
    emailSubjectEn: '[Free Rent Tours] Deposit Receipt {{bookingCode}} — {{amount}} EGP',
    emailSubjectAr: '[Free Rent Tours] إيصال استلام مقدم حجز {{bookingCode}} — {{amount}} ج.م',
    emailBodyEn:
      'We confirm receipt of {{amount}} EGP deposit for booking {{bookingCode}} (Chalet {{chaletNumber}}). Remaining balance due {{dueDate}}.',
    emailBodyAr:
      'نؤكد استلام دفعة بمبلغ {{amount}} ج.م للحجز {{bookingCode}} (شاليه {{chaletNumber}}). المتبقي مستحق بتاريخ {{dueDate}}.',
    smsBodyEn: 'Free Rent Tours: Received {{amount}} EGP deposit for {{bookingCode}}. Thank you.',
    smsBodyAr: 'Free Rent Tours: تم استلام {{amount}} ج.م مقدم للحجز {{bookingCode}}. شكراً لكم.',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-04',
    eventKey: 'payment_reminder',
    category: 'payment',
    titleEn: 'Payment Reminder',
    titleAr: 'تذكير بسداد الدفعة المستحقة',
    emailSubjectEn: '[Free Rent Tours] Payment Reminder for {{bookingCode}} — Due {{dueDate}}',
    emailSubjectAr: '[Free Rent Tours] تذكير بموعد سداد الحجز {{bookingCode}} — الاستحقاق {{dueDate}}',
    emailBodyEn:
      'Dear {{guestName}}, a balance of {{amount}} EGP remains on booking {{bookingCode}} (Chalet {{chaletNumber}}), due by {{dueDate}}.',
    emailBodyAr:
      'عزيزي {{guestName}}، يتبقى مبلغ {{amount}} ج.م على الحجز {{bookingCode}} (شاليه {{chaletNumber}}) وموعد الاستحقاق {{dueDate}}.',
    smsBodyEn: 'Reminder: {{amount}} EGP balance for booking {{bookingCode}} is due on {{dueDate}}.',
    smsBodyAr: 'تذكير: متبقي {{amount}} ج.م للحجز {{bookingCode}} ويستحق السداد في {{dueDate}}.',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-05',
    eventKey: 'upcoming_checkin_48h',
    category: 'booking',
    titleEn: 'Upcoming Check-in (48 Hours)',
    titleAr: 'تذكير بالوصول خلال 48 ساعة',
    emailSubjectEn: '[Free Rent Tours] Check-in in 48 Hours — Chalet {{chaletNumber}}',
    emailSubjectAr: '[Free Rent Tours] موعد وصولكم خلال 48 ساعة — شاليه {{chaletNumber}}',
    emailBodyEn:
      'Welcome {{guestName}}! Your stay at Porto El Sokhna Chalet {{chaletNumber}} begins in 48 hours on {{checkIn}} (Check-in 2:00 PM Cairo time).',
    emailBodyAr:
      'مرحباً {{guestName}}! تبدأ إقامتكم في شاليه {{chaletNumber}} ببورتو السخنة خلال 48 ساعة بتاريخ {{checkIn}} (الدخول 2:00 ظهراً بتوقيت القاهرة).',
    smsBodyEn: 'Porto El Sokhna: Welcome {{guestName}}! Chalet {{chaletNumber}} check-in is in 48h ({{checkIn}} at 2 PM).',
    smsBodyAr: 'بورتو السخنة: أهلاً {{guestName}}! موعد استلام شاليه {{chaletNumber}} خلال 48 ساعة ({{checkIn}} الساعة 2 م).',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-06',
    eventKey: 'checkin_confirmation',
    category: 'booking',
    titleEn: 'Check-in Confirmation',
    titleAr: 'تأكيد تسجيل الدخول',
    emailSubjectEn: '[Free Rent Tours] Checked In — Welcome to Chalet {{chaletNumber}}',
    emailSubjectAr: '[Free Rent Tours] تم تسجيل الدخول — مرحباً بكم في شاليه {{chaletNumber}}',
    emailBodyEn:
      'Hello {{guestName}}, check-in is complete for booking {{bookingCode}} at Chalet {{chaletNumber}}. Enjoy your stay with Free Rent Tours!',
    emailBodyAr:
      'أهلاً {{guestName}}، تم تسجيل دخولكم بنجاح للحجز {{bookingCode}} في شاليه {{chaletNumber}}. نتمنى لكم إقامة سعيدة مع Free Rent Tours!',
    smsBodyEn: 'Free Rent Tours: Checked in at Chalet {{chaletNumber}} ({{bookingCode}}). Enjoy Porto El Sokhna!',
    smsBodyAr: 'Free Rent Tours: تم تسجيل الدخول في شاليه {{chaletNumber}} ({{bookingCode}}). إقامة سعيدة!',
    isActive: true,
    defaultSms: false,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-07',
    eventKey: 'checkout_confirmation',
    category: 'booking',
    titleEn: 'Check-out Confirmation',
    titleAr: 'تأكيد المغادرة',
    emailSubjectEn: '[Free Rent Tours] Check-out Completed — {{bookingCode}}',
    emailSubjectAr: '[Free Rent Tours] تأكيد المغادرة — الحجز {{bookingCode}}',
    emailBodyEn:
      'Thank you {{guestName}} for staying in Chalet {{chaletNumber}} ({{bookingCode}}). Check-out inspection is complete.',
    emailBodyAr:
      'شكراً {{guestName}} لاختياركم شاليه {{chaletNumber}} ({{bookingCode}}). تم إتمام فحص المغادرة بنجاح.',
    smsBodyEn: 'Free Rent Tours: Check-out confirmed for {{bookingCode}}. Thank you for visiting Porto El Sokhna!',
    smsBodyAr: 'Free Rent Tours: تم تأكيد المغادرة للحجز {{bookingCode}}. شكراً لزيارتكم بورتو السخنة!',
    isActive: true,
    defaultSms: false,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-08',
    eventKey: 'maintenance_request',
    category: 'operations',
    titleEn: 'Maintenance Request',
    titleAr: 'بلاغ صيانة',
    emailSubjectEn: '[Maintenance] Chalet {{chaletNumber}} — {{problemType}}',
    emailSubjectAr: '[صيانة] شاليه {{chaletNumber}} — {{problemType}}',
    emailBodyEn:
      'Maintenance ticket opened for Chalet {{chaletNumber}}: {{problemType}}. Assigned status updated in operations dashboard.',
    emailBodyAr:
      'تم فتح بلاغ صيانة للشاليه {{chaletNumber}}: {{problemType}}. يرجى المتابعة من لوحة الصيانة.',
    smsBodyEn: 'Maintenance Alert: Chalet {{chaletNumber}} — {{problemType}}.',
    smsBodyAr: 'تنبيه صيانة: شاليه {{chaletNumber}} — {{problemType}}.',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-09',
    eventKey: 'housekeeping_request',
    category: 'operations',
    titleEn: 'Housekeeping Request',
    titleAr: 'طلب تدبير فندقي',
    emailSubjectEn: '[Housekeeping] Chalet {{chaletNumber}} Turnover / Service',
    emailSubjectAr: '[التدبير الفندقي] شاليه {{chaletNumber}} — مهمة تنظيف',
    emailBodyEn:
      'Housekeeping task scheduled for Chalet {{chaletNumber}}. Please inspect and mark ready before next check-in.',
    emailBodyAr:
      'تم جدولة مهمة تدبير فندقي لشاليه {{chaletNumber}}. يرجى التجهيز والفحص قبل الوصول التالي.',
    smsBodyEn: 'Housekeeping Task: Chalet {{chaletNumber}} needs preparation/inspection.',
    smsBodyAr: 'مهمة نظافة: شاليه {{chaletNumber}} مطلوب تجهيزه وفحصه.',
    isActive: true,
    defaultSms: false,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-10',
    eventKey: 'low_utility_balance',
    category: 'utility',
    titleEn: 'Low Electricity / Water Balance',
    titleAr: 'تنبيه انخفاض رصيد الكهرباء / المياه',
    emailSubjectEn: '[Utility Alert] Low {{utilityType}} Balance — Chalet {{chaletNumber}}',
    emailSubjectAr: '[تنبيه عداد] انخفاض رصيد {{utilityType}} — شاليه {{chaletNumber}}',
    emailBodyEn:
      'Alert: {{utilityType}} meter balance in Chalet {{chaletNumber}} dropped to {{balance}} EGP. Preventive recharge recommended.',
    emailBodyAr:
      'تنبيه: انخفض رصيد عداد {{utilityType}} في شاليه {{chaletNumber}} إلى {{balance}} ج.م. يُنصح بالشحن فوراً.',
    smsBodyEn: 'Utility Alert: Chalet {{chaletNumber}} {{utilityType}} balance is {{balance}} EGP.',
    smsBodyAr: 'تنبيه عداد: شاليه {{chaletNumber}} رصيد {{utilityType}} الحالي {{balance}} ج.م.',
    isActive: true,
    defaultSms: true,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-11',
    eventKey: 'owner_payment_due',
    category: 'owner',
    titleEn: 'Owner Payment Due',
    titleAr: 'استحقاق دفعة للمالك',
    emailSubjectEn: '[Free Rent Tours] Owner Settlement Due — {{ownerName}}',
    emailSubjectAr: '[Free Rent Tours] مستحقات تسوية للمالك — {{ownerName}}',
    emailBodyEn:
      'Dear {{ownerName}}, a net payout of {{amount}} EGP is ready/due for settlement on your Porto El Sokhna portfolio.',
    emailBodyAr:
      'السيد المالك {{ownerName}}، يتوفر صافي مستحقات بقيمة {{amount}} ج.م جاهزة للتسوية عن وحداتكم ببورتو السخنة.',
    smsBodyEn: 'Free Rent Tours: Owner payout of {{amount}} EGP is scheduled for {{ownerName}}.',
    smsBodyAr: 'Free Rent Tours: مستحقات مالك بقيمة {{amount}} ج.م مجدولة للسيد {{ownerName}}.',
    isActive: true,
    defaultSms: false,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
  {
    id: 'tpl-12',
    eventKey: 'owner_monthly_statement',
    category: 'owner',
    titleEn: 'Owner Monthly Statement',
    titleAr: 'كشف الحساب الشهري للمالك',
    emailSubjectEn: '[Free Rent Tours] Monthly Owner Statement ({{monthLabel}}) — {{ownerName}}',
    emailSubjectAr: '[Free Rent Tours] كشف الحساب الشهري ({{monthLabel}}) — {{ownerName}}',
    emailBodyEn:
      'Dear {{ownerName}}, your {{monthLabel}} monthly financial statement is ready (Net Owner Share: {{amount}} EGP). Log in to the Owner Portal to download the branded PDF.',
    emailBodyAr:
      'السيد المالك {{ownerName}}، تم إصدار كشف الحساب المالي لشهر {{monthLabel}} (صافي حصة المالك: {{amount}} ج.م). يمكنكم تحميل ملف PDF من بوابة المالك.',
    smsBodyEn: 'Free Rent Tours: Your {{monthLabel}} owner statement ({{amount}} EGP) is ready in the Owner Portal.',
    smsBodyAr: 'Free Rent Tours: كشف حساب شهر {{monthLabel}} ({{amount}} ج.م) جاهز الآن في بوابة المالك.',
    isActive: true,
    defaultSms: false,
    defaultEmail: true,
    defaultInApp: true,
    isDemo: true,
  },
];

export function renderTemplateText(
  raw: string,
  variables: Record<string, string | number | undefined>
): string {
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

export function buildNotificationDedupKey(params: {
  eventKey: NotificationEventKey;
  relatedEntityId: string;
  channel: NotificationChannel;
  recipientAddress: string;
  egyptDate?: string;
}): string {
  const datePart = params.egyptDate || getEgyptTodayIsoDate();
  return [
    params.eventKey,
    params.relatedEntityId || 'GENERAL',
    params.channel,
    params.recipientAddress.trim().toLowerCase() || 'INAPP',
    datePart,
  ].join(':');
}

export interface DispatchNotificationInput {
  template: NotificationTemplate;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  variables: Record<string, string | number | undefined>;
  relatedEntityId: string;
  settings: NotificationSettings;
  preferences?: NotificationPreference[];
  existingDeliveries: NotificationDelivery[];
  forceAllowDuplicate?: boolean;
}

export interface DispatchNotificationResult {
  ok: boolean;
  blockedByDuplicate?: boolean;
  blockedByPreference?: boolean;
  delivery?: NotificationDelivery;
  reason?: string;
}

/**
 * Evaluates channel settings, user preferences, duplicate prevention (dedupKey),
 * and enforces the external-provider-disabled safety lock.
 * Actual external SMS & Email network calls are NEVER made when providersActivated === false.
 */
export function dispatchNotification(
  input: DispatchNotificationInput
): DispatchNotificationResult {
  const { template, channel, recipient, settings } = input;
  const lang: Language = recipient.preferredLang || 'ar';
  const isAr = lang === 'ar';

  if (!template.isActive || !recipient.isActive) {
    return {
      ok: false,
      reason: isAr ? 'القالب أو المستلم غير نشط.' : 'Template or recipient is inactive.',
    };
  }

  // Check recipient opt-in & user preferences
  const pref = input.preferences?.find((p) => p.eventKey === template.eventKey);
  if (channel === 'sms' && (!recipient.smsOptIn || (pref && !pref.smsEnabled))) {
    return {
      ok: false,
      blockedByPreference: true,
      reason: isAr ? 'قناة SMS معطلة في تفضيلات المستلم.' : 'SMS opted out by recipient/user preference.',
    };
  }
  if (channel === 'email' && (!recipient.emailOptIn || (pref && !pref.emailEnabled))) {
    return {
      ok: false,
      blockedByPreference: true,
      reason: isAr ? 'البريد الإلكتروني معطل في تفضيلات المستلم.' : 'Email opted out by recipient/user preference.',
    };
  }

  const recipientAddress =
    channel === 'sms'
      ? recipient.phone || 'NO_PHONE'
      : channel === 'email'
      ? recipient.email || 'NO_EMAIL'
      : recipient.id;

  const dedupKey = buildNotificationDedupKey({
    eventKey: template.eventKey,
    relatedEntityId: input.relatedEntityId,
    channel,
    recipientAddress,
  });

  if (!input.forceAllowDuplicate) {
    const duplicate = input.existingDeliveries.find((d) => d.dedupKey === dedupKey);
    if (duplicate) {
      return {
        ok: false,
        blockedByDuplicate: true,
        reason: isAr
          ? `تم منع الإرسال المكرر (مفتاح منع التكرار: ${dedupKey})`
          : `Duplicate notification prevented (dedup key: ${dedupKey})`,
      };
    }
  }

  const subject = renderTemplateText(
    isAr ? template.emailSubjectAr : template.emailSubjectEn,
    input.variables
  );
  const body = renderTemplateText(
    channel === 'sms'
      ? isAr
        ? template.smsBodyAr
        : template.smsBodyEn
      : isAr
      ? template.emailBodyAr
      : template.emailBodyEn,
    input.variables
  );

  const nowIso = new Date().toISOString();
  let status: NotificationDeliveryStatus = 'queued_disabled';
  let errorReason = '';

  if (channel === 'in_app') {
    status = settings.inAppEnabled ? 'sent' : 'queued_disabled';
    errorReason = settings.inAppEnabled ? '' : 'In-app channel disabled in settings.';
  } else if (
    (channel === 'sms' && !recipient.phone.trim()) ||
    (channel === 'email' && !recipient.email.trim())
  ) {
    status = 'failed';
    errorReason =
      channel === 'sms'
        ? 'Missing recipient phone number.'
        : 'Missing recipient email address.';
  } else if (!settings.providersActivated) {
    // External SMS/Email sending MUST remain disabled until providers are configured & explicitly activated
    status = settings.simulationMode ? 'simulated' : 'queued_disabled';
    errorReason = settings.simulationMode
      ? 'External sending disabled (providers unconfigured) — logged in safe in-app preview mode only.'
      : 'External sending disabled: configure server-side SMS/Email provider keys and enable activation.';
  }

  const delivery: NotificationDelivery = {
    id: `ndlv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    eventKey: template.eventKey,
    channel,
    recipientId: recipient.id,
    recipientName: isAr ? recipient.fullNameAr : recipient.fullName,
    recipientAddress,
    lang,
    subject: channel === 'sms' ? (isAr ? template.titleAr : template.titleEn) : subject,
    body,
    status,
    attemptCount: 1,
    errorReason,
    dedupKey: input.forceAllowDuplicate ? `${dedupKey}:manual:${Date.now()}` : dedupKey,
    relatedEntityId: input.relatedEntityId,
    ownerId: recipient.ownerId || null,
    chaletId: recipient.chaletId || null,
    isDemo: false,
    createdAt: nowIso,
    lastAttemptAt: nowIso,
  };

  return {
    ok: true,
    delivery,
    reason: errorReason || undefined,
  };
}

export function retryNotificationDelivery(
  delivery: NotificationDelivery,
  settings: NotificationSettings
): NotificationDelivery {
  const nowIso = new Date().toISOString();
  const hasAddress =
    delivery.channel === 'in_app' ||
    (delivery.recipientAddress &&
      delivery.recipientAddress !== 'NO_PHONE' &&
      delivery.recipientAddress !== 'NO_EMAIL');

  let nextStatus: NotificationDeliveryStatus = delivery.status;
  let nextReason = delivery.errorReason;

  if (!hasAddress) {
    nextStatus = 'failed';
    nextReason = `Retry failed: missing valid ${delivery.channel} address.`;
  } else if (delivery.channel === 'in_app') {
    nextStatus = 'sent';
    nextReason = '';
  } else if (!settings.providersActivated) {
    nextStatus = settings.simulationMode ? 'simulated' : 'queued_disabled';
    nextReason =
      'Retry logged safely — external SMS/Email sending remains disabled until server provider is configured & activated.';
  }

  return {
    ...delivery,
    attemptCount: delivery.attemptCount + 1,
    status: nextStatus,
    errorReason: nextReason,
    lastAttemptAt: nowIso,
  };
}

export interface RoadmapMilestone {
  phase: 'Phase 1 (Live)' | 'Phase 2 (Prepared)';
  moduleEn: string;
  moduleAr: string;
  status: 'completed' | 'prepared_disabled' | 'optional_cloud';
  detailsEn: string;
  detailsAr: string;
}

export const IMPLEMENTATION_ROADMAP: RoadmapMilestone[] = [
  {
    phase: 'Phase 1 (Live)',
    moduleEn: 'Chalet Operations, QR Check-in & Egypt (Africa/Cairo) Occupancy Map',
    moduleAr: 'إدارة الشاليهات، تسجيل الدخول بـ QR وخريطة الإشغال بتوقيت القاهرة',
    status: 'completed',
    detailsEn: '22-chalet dynamic occupancy map, double-booking guard, Maintenance & Housekeeping dashboards, and Free Rent Tours branding.',
    detailsAr: 'خريطة إشغال ديناميكية لـ 22 شاليه، منع الحجز المزدوج، لوحة الصيانة والتدبير الفندقي، والهوية الرسمية لشركة Free Rent Tours.',
  },
  {
    phase: 'Phase 1 (Live)',
    moduleEn: 'Payment Collection, Refunds Audit & Branded PDF Receipts',
    moduleAr: 'تحصيل المدفوعات، سجل تدقيق الاسترداد والتعديلات، وإيصالات PDF الرسمية',
    status: 'completed',
    detailsEn: 'Cash, Bank Transfer, InstaPay, Mobile Wallet, Manual Card, multi-payment tracking, ledger reconciliation without duplicates, and RTL/LTR PDF receipts.',
    detailsAr: 'دعم النقدي والتحويل البنكي وإنستاباي والمحافظ والبطاقات اليدوية، تتبع الدفعات المتعددة، مزامنة مالية بدون تكرار، وإيصالات PDF بشعار الشركة.',
  },
  {
    phase: 'Phase 1 (Live)',
    moduleEn: 'Notification Management Architecture & 12 Bilingual Templates',
    moduleAr: 'هيكل إدارة التنبيهات والـ 12 قالباً ثنائي اللغة (SMS + Email)',
    status: 'completed',
    detailsEn: '12 AR/EN templates, recipient directory, delivery history, retry logs, duplicate prevention (dedupKey), and user channel preferences.',
    detailsAr: '12 قالباً بالعربية والإنجليزية، إدارة المستلمين، سجل الإرسال وإعادة المحاولة، منع التكرار، وتفضيلات المستخدمين.',
  },
  {
    phase: 'Phase 2 (Prepared)',
    moduleEn: 'Live SMS Provider Activation (Twilio / VictoryLink / Infobip)',
    moduleAr: 'تفعيل مزود رسائل SMS الفعلي عبر الخادم',
    status: 'prepared_disabled',
    detailsEn: 'External SMS sending is intentionally disabled until server-side SMS_PROVIDER and SMS_API_KEY are configured.',
    detailsAr: 'الإرسال الخارجي معطل عمداً لحين إعداد مفاتيح مزود الرسائل SMS_API_KEY على الخادم.',
  },
  {
    phase: 'Phase 2 (Prepared)',
    moduleEn: 'Live Email Provider Activation (Resend / SendGrid / Postmark)',
    moduleAr: 'تفعيل مزود البريد الإلكتروني الفعلي عبر الخادم',
    status: 'prepared_disabled',
    detailsEn: 'External Email delivery is intentionally disabled until server-side EMAIL_PROVIDER and EMAIL_API_KEY are configured.',
    detailsAr: 'إرسال البريد الإلكتروني معطل عمداً لحين إعداد مفاتيح مزود البريد EMAIL_API_KEY على الخادم.',
  },
  {
    phase: 'Phase 2 (Prepared)',
    moduleEn: 'Online Payment Gateway (Paymob / Fawry / Stripe)',
    moduleAr: 'بوابة الدفع الإلكتروني الأونلاين (Paymob / Fawry / Stripe)',
    status: 'prepared_disabled',
    detailsEn: 'Schema and gateway interface fields prepared on public.payments; checkout webhooks stay dormant until explicitly enabled.',
    detailsAr: 'حقول الربط مجهزة في قاعدة البيانات؛ تظل بوابات الدفع الأونلاين غير مفعلة لحين المرحلة الثانية.',
  },
];
