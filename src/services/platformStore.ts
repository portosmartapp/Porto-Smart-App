import {
  classifySupabaseError,
  isSupabaseConfigured,
  supabase,
  SupabaseErrorKind,
} from '../lib/supabase';
import {
  createEmptyDataset,
  INITIAL_DEMO_DATASET,
  RESORT_IMAGES,
} from '../data/demoData';
import { computeEgyptNights, normalizeToEgyptDateString } from '../utils/egyptTime';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  INITIAL_NOTIFICATION_TEMPLATES,
} from '../utils/notificationEngine';
import {
  AppNotification,
  Booking,
  Chalet,
  ChaletStatus,
  Expense,
  Guest,
  HousekeepingTask,
  Language,
  MaintenanceTicket,
  NotificationDelivery,
  NotificationPreference,
  NotificationRecipient,
  NotificationSettings,
  NotificationTemplate,
  Owner,
  PartnerOffer,
  Payment,
  PaymentAuditLog,
  PlatformDataset,
  PlatformUser,
  UserRole,
  UtilityAccount,
  UtilityTransaction,
} from '../types/platform';

export function computeNights(checkIn: string, checkOut: string): number {
  return computeEgyptNights(checkIn, checkOut);
}

export function findOverlappingBooking(
  bookings: Booking[],
  chaletId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Booking | undefined {
  const targetStart = normalizeToEgyptDateString(checkIn);
  const targetEnd = normalizeToEgyptDateString(checkOut);
  if (!targetStart || !targetEnd) return undefined;

  return bookings.find((b) => {
    if (b.id === excludeBookingId) return false;
    if (b.chaletId !== chaletId) return false;
    if (b.status === 'cancelled') return false;
    const bStart = normalizeToEgyptDateString(b.checkIn);
    const bEnd = normalizeToEgyptDateString(b.checkOut);
    if (!bStart || !bEnd) return false;
    return bStart < targetEnd && bEnd > targetStart;
  });
}

/**
 * Enforces strict Owner Data Isolation at the application boundary
 * (complementing Supabase PostgreSQL Row Level Security policies).
 */
export function scopeDatasetForUser(
  dataset: PlatformDataset,
  user: PlatformUser
): PlatformDataset {
  if (user.role !== 'owner') {
    return dataset;
  }

  const ownerId = user.ownerId;
  if (!ownerId) {
    return {
      owners: [],
      chalets: [],
      guests: [],
      bookings: [],
      payments: [],
      paymentAuditLogs: [],
      expenses: [],
      utilities: [],
      utilityTransactions: [],
      housekeeping: [],
      maintenance: [],
      offers: dataset.offers,
      notifications: [],
      notificationSettings: dataset.notificationSettings,
      notificationTemplates: dataset.notificationTemplates,
      notificationRecipients: [],
      notificationDeliveries: [],
      notificationPreferences: dataset.notificationPreferences,
    };
  }

  const ownChalets = dataset.chalets.filter((c) => c.ownerId === ownerId);
  const ownChaletIds = new Set(ownChalets.map((c) => c.id));
  const ownBookings = dataset.bookings.filter((b) => ownChaletIds.has(b.chaletId));
  const ownBookingIds = new Set(ownBookings.map((b) => b.id));
  const ownPayments = dataset.payments.filter(
    (p) => p.ownerId === ownerId || (p.bookingId && ownBookingIds.has(p.bookingId))
  );
  const ownPaymentIds = new Set(ownPayments.map((p) => p.id));

  return {
    owners: dataset.owners.filter((o) => o.id === ownerId),
    chalets: ownChalets,
    guests: [], // Guests directory is staff-only per RLS
    bookings: ownBookings,
    payments: ownPayments,
    paymentAuditLogs: dataset.paymentAuditLogs.filter(
      (a) =>
        ownPaymentIds.has(a.paymentId) ||
        (a.bookingId && ownBookingIds.has(a.bookingId))
    ),
    expenses: dataset.expenses.filter((e) => ownChaletIds.has(e.chaletId)),
    utilities: dataset.utilities.filter((u) => ownChaletIds.has(u.chaletId)),
    utilityTransactions: dataset.utilityTransactions.filter((t) => ownChaletIds.has(t.chaletId)),
    housekeeping: dataset.housekeeping.filter((h) => ownChaletIds.has(h.chaletId)),
    maintenance: dataset.maintenance.filter((m) => ownChaletIds.has(m.chaletId)),
    offers: dataset.offers,
    notifications: dataset.notifications.filter(
      (n) =>
        n.targetOwnerId === ownerId ||
        (n.chaletId && ownChaletIds.has(n.chaletId))
    ),
    notificationSettings: dataset.notificationSettings,
    notificationTemplates: dataset.notificationTemplates,
    notificationRecipients: dataset.notificationRecipients.filter(
      (r) => r.ownerId === ownerId || (r.chaletId && ownChaletIds.has(r.chaletId))
    ),
    notificationDeliveries: dataset.notificationDeliveries.filter(
      (d) =>
        d.ownerId === ownerId ||
        (d.chaletId && ownChaletIds.has(d.chaletId)) ||
        (d.relatedEntityId && ownBookingIds.has(d.relatedEntityId))
    ),
    notificationPreferences: dataset.notificationPreferences,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureUuid(candidate?: string | null): string {
  if (candidate && UUID_REGEX.test(candidate)) return candidate;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-000000000000';
}

function mapOwnerRow(r: Record<string, any>): Owner {
  return {
    id: r.id,
    fullName: r.full_name,
    fullNameAr: r.full_name_ar,
    phone: r.phone,
    email: r.email,
    nationalId: r.national_id ?? '',
    bankAccount: r.bank_account ?? '',
    notes: r.notes ?? '',
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
  };
}

function mapChaletRow(r: Record<string, any>, i = 0): Chalet {
  return {
    id: r.id,
    chaletNumber: r.chalet_number,
    ownerId: r.owner_id,
    bedrooms: Number(r.bedrooms),
    bathrooms: Number(r.bathrooms),
    maxGuests: Number(r.max_guests),
    floor: r.floor,
    viewType: r.view_type,
    viewTypeAr: r.view_type_ar,
    status: r.status,
    photos:
      Array.isArray(r.photos) && r.photos.length > 0
        ? r.photos
        : [i % 2 === 0 ? RESORT_IMAGES.hero : RESORT_IMAGES.interior],
    description: r.description ?? '',
    descriptionAr: r.description_ar ?? '',
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    nightlyPrice: Number(r.nightly_price),
    ownerPct: Number(r.owner_pct),
    managementPct: Number(r.management_pct),
    isActive: Boolean(r.is_active),
    isDemo: Boolean(r.is_demo),
  };
}

function mapGuestRow(r: Record<string, any>): Guest {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    nationality: r.nationality ?? 'Egyptian',
    idPassport: r.id_passport ?? '',
    email: r.email ?? '',
    notes: r.notes ?? '',
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
  };
}

function mapBookingRow(r: Record<string, any>): Booking {
  return {
    id: r.id,
    bookingCode: r.booking_code,
    chaletId: r.chalet_id,
    guestId: r.guest_id ?? null,
    guestName: r.guest_name,
    phone: r.phone,
    nationality: r.nationality,
    checkIn: r.check_in,
    checkOut: r.check_out,
    numGuests: Number(r.num_guests),
    nights: Number(r.nights),
    nightlyPrice: Number(r.nightly_price),
    totalValue: Number(r.total_value),
    paymentStatus: r.payment_status,
    bookingSource: r.booking_source,
    status: r.status,
    notes: r.notes ?? '',
    idPassport: r.id_passport ?? '',
    checkInTime: r.check_in_time ?? undefined,
    checkOutTime: r.check_out_time ?? undefined,
    depositAmount: r.deposit_amount ? Number(r.deposit_amount) : 0,
    inspectionNotes: r.inspection_notes ?? '',
    damageReport: r.damage_report ?? '',
    outstandingAmount: r.outstanding_amount ? Number(r.outstanding_amount) : 0,
    paymentDueDate: r.payment_due_date ?? undefined,
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
  };
}

function mapPaymentRow(r: Record<string, any>): Payment {
  return {
    id: r.id,
    bookingId: r.booking_id,
    ownerId: r.owner_id,
    paymentType: r.payment_type,
    entryDirection: r.entry_direction ?? undefined,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    status: r.status ?? 'confirmed',
    receiptNumber: r.receipt_number ?? undefined,
    referenceNo: r.reference_no ?? '',
    idempotencyKey: r.idempotency_key ?? undefined,
    parentPaymentId: r.parent_payment_id ?? null,
    correctionReason: r.correction_reason ?? '',
    recordedByName: r.recorded_by_name ?? '',
    gatewayProvider: r.gateway_provider ?? null,
    gatewayStatus: r.gateway_status ?? 'not_activated',
    paidAt: r.paid_at,
    notes: r.notes ?? '',
    isDemo: Boolean(r.is_demo),
  };
}

function mapAuditRow(r: Record<string, any>): PaymentAuditLog {
  return {
    id: r.id,
    paymentId: r.payment_id,
    bookingId: r.booking_id ?? null,
    action: r.action,
    previousAmount: Number(r.previous_amount ?? 0),
    newAmount: Number(r.new_amount ?? 0),
    reason: r.reason ?? '',
    actorName: r.actor_name ?? '',
    actorRole: r.actor_role ?? 'manager',
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
  };
}

function mapExpenseRow(r: Record<string, any>): Expense {
  return {
    id: r.id,
    chaletId: r.chalet_id,
    category: r.category,
    description: r.description,
    descriptionAr: r.description_ar,
    amount: Number(r.amount),
    expenseDate: r.expense_date,
    isDemo: Boolean(r.is_demo),
  };
}

function mapUtilityRow(r: Record<string, any>): UtilityAccount {
  return {
    id: r.id,
    chaletId: r.chalet_id,
    electricityBalance: Number(r.electricity_balance),
    waterBalance: Number(r.water_balance),
    electricityThreshold: Number(r.electricity_threshold),
    waterThreshold: Number(r.water_threshold),
    lastElectricityRecharge: Number(r.last_electricity_recharge ?? 0),
    lastElectricityDate: r.last_electricity_date ?? new Date().toISOString(),
    lastWaterRecharge: Number(r.last_water_recharge ?? 0),
    lastWaterDate: r.last_water_date ?? new Date().toISOString(),
    isDemo: Boolean(r.is_demo),
  };
}

function mapUtilityTxRow(r: Record<string, any>): UtilityTransaction {
  return {
    id: r.id,
    chaletId: r.chalet_id,
    utilityType: r.utility_type,
    transactionType: r.transaction_type,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    transactionDate: r.transaction_date,
    notes: r.notes ?? '',
    isDemo: Boolean(r.is_demo),
  };
}

function mapHousekeepingRow(r: Record<string, any>): HousekeepingTask {
  return {
    id: r.id,
    chaletId: r.chalet_id,
    taskType: r.task_type,
    status: r.status,
    assignedName: r.assigned_name ?? '',
    notes: r.notes ?? '',
    scheduledDate: r.scheduled_date,
    completedAt: r.completed_at,
    isDemo: Boolean(r.is_demo),
  };
}

function mapMaintenanceRow(r: Record<string, any>): MaintenanceTicket {
  return {
    id: r.id,
    chaletId: r.chalet_id,
    problemType: r.problem_type,
    description: r.description,
    photos: Array.isArray(r.photos) ? r.photos : [],
    priority: r.priority,
    status: r.status,
    technicianName: r.technician_name ?? '',
    cost: Number(r.cost ?? 0),
    notes: r.notes ?? '',
    createdAt: r.created_at,
    completedAt: r.completed_at,
    isDemo: Boolean(r.is_demo),
  };
}

function mapOfferRow(r: Record<string, any>): PartnerOffer {
  return {
    id: r.id,
    category: r.category,
    businessName: r.business_name,
    businessNameAr: r.business_name_ar,
    title: r.title,
    titleAr: r.title_ar,
    discount: r.discount,
    description: r.description,
    descriptionAr: r.description_ar,
    phone: r.phone,
    availability: r.availability,
    imageUrl: r.image_url || RESORT_IMAGES.seafood,
    isActive: Boolean(r.is_active),
    isDemo: Boolean(r.is_demo),
  };
}

function mapNotificationRow(r: Record<string, any>): AppNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    titleAr: r.title_ar,
    message: r.message,
    messageAr: r.message_ar,
    targetRole: r.target_role,
    targetOwnerId: r.target_owner_id,
    chaletId: r.chalet_id,
    isRead: Boolean(r.is_read),
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
  };
}

export interface ProductionLoadResult {
  dataset: PlatformDataset;
  source: 'production';
  error?: string;
  errorKind?: SupabaseErrorKind;
}

/**
 * Loads live Production data from the existing Supabase project.
 * NEVER falls back to Demo Mode or localStorage when tables are missing, empty, or an error occurs.
 */
export async function loadProductionDataset(
  lang: Language = 'ar'
): Promise<ProductionLoadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      dataset: createEmptyDataset(),
      source: 'production',
      errorKind: 'network',
      error:
        lang === 'ar'
          ? 'متغيرات اتصال Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) غير مضبوطة.'
          : 'Supabase environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are not configured.',
    };
  }

  try {
    const [
      ownersRes,
      chaletsRes,
      guestsRes,
      bookingsRes,
      paymentsRes,
      expensesRes,
      utilitiesRes,
      utxRes,
      hkRes,
      mntRes,
      offersRes,
      notifRes,
      auditRes,
      nSettingsRes,
      nTemplatesRes,
      nRecipientsRes,
      nDeliveriesRes,
      nPrefsRes,
    ] = await Promise.all([
      supabase.from('owners').select('*').order('created_at', { ascending: true }),
      supabase.from('chalets').select('*').order('chalet_number', { ascending: true }),
      supabase.from('guests').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*').order('check_in', { ascending: false }),
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('utilities').select('*'),
      supabase.from('utility_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('housekeeping').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('maintenance').select('*').order('created_at', { ascending: false }),
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      supabase.from('payment_audit_logs').select('*').order('created_at', { ascending: false }),
      supabase.from('notification_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('notification_templates').select('*'),
      supabase.from('notification_recipients').select('*').order('created_at', { ascending: false }),
      supabase.from('notification_deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('notification_preferences').select('*'),
    ]);

    const firstCriticalError =
      ownersRes.error ||
      chaletsRes.error ||
      bookingsRes.error ||
      paymentsRes.error ||
      expensesRes.error ||
      utilitiesRes.error ||
      hkRes.error ||
      mntRes.error ||
      offersRes.error;

    if (firstCriticalError) {
      const classified = classifySupabaseError(firstCriticalError, lang);
      return {
        dataset: createEmptyDataset(),
        source: 'production',
        error: classified.message,
        errorKind: classified.kind,
      };
    }

    const owners: Owner[] = (ownersRes.data ?? []).map(mapOwnerRow);
    const chalets: Chalet[] = (chaletsRes.data ?? []).map((r, i) => mapChaletRow(r, i));
    const guests: Guest[] = (!guestsRes.error ? (guestsRes.data ?? []) : []).map(mapGuestRow);
    const bookings: Booking[] = (bookingsRes.data ?? []).map(mapBookingRow);
    const payments: Payment[] = (paymentsRes.data ?? []).map(mapPaymentRow);
    const paymentAuditLogs: PaymentAuditLog[] = (!auditRes.error ? (auditRes.data ?? []) : []).map(
      mapAuditRow
    );
    const expenses: Expense[] = (expensesRes.data ?? []).map(mapExpenseRow);
    const utilities: UtilityAccount[] = (utilitiesRes.data ?? []).map(mapUtilityRow);
    const utilityTransactions: UtilityTransaction[] = (
      !utxRes.error ? (utxRes.data ?? []) : []
    ).map(mapUtilityTxRow);
    const housekeeping: HousekeepingTask[] = (hkRes.data ?? []).map(mapHousekeepingRow);
    const maintenance: MaintenanceTicket[] = (mntRes.data ?? []).map(mapMaintenanceRow);
    const offers: PartnerOffer[] = (offersRes.data ?? []).map(mapOfferRow);
    const notifications: AppNotification[] = (
      !notifRes.error ? (notifRes.data ?? []) : []
    ).map(mapNotificationRow);

    const notificationSettings: NotificationSettings =
      !nSettingsRes.error && nSettingsRes.data
        ? {
            id: nSettingsRes.data.id,
            smsEnabled: Boolean(nSettingsRes.data.sms_enabled),
            emailEnabled: Boolean(nSettingsRes.data.email_enabled),
            inAppEnabled: Boolean(nSettingsRes.data.in_app_enabled),
            providersActivated: false,
            simulationMode: Boolean(nSettingsRes.data.simulation_mode ?? true),
            smsProviderName:
              nSettingsRes.data.sms_provider_name ?? DEFAULT_NOTIFICATION_SETTINGS.smsProviderName,
            emailProviderName:
              nSettingsRes.data.email_provider_name ??
              DEFAULT_NOTIFICATION_SETTINGS.emailProviderName,
            senderName: nSettingsRes.data.sender_name ?? DEFAULT_NOTIFICATION_SETTINGS.senderName,
            quietHoursStart: nSettingsRes.data.quiet_hours_start ?? '23:00',
            quietHoursEnd: nSettingsRes.data.quiet_hours_end ?? '08:00',
            updatedAt: nSettingsRes.data.updated_at ?? new Date().toISOString(),
          }
        : structuredClone(DEFAULT_NOTIFICATION_SETTINGS);

    const notificationTemplates: NotificationTemplate[] =
      !nTemplatesRes.error && (nTemplatesRes.data?.length ?? 0) > 0
        ? (nTemplatesRes.data ?? []).map((r: Record<string, any>) => ({
            id: r.id,
            eventKey: r.event_key,
            category: r.category,
            titleEn: r.title_en,
            titleAr: r.title_ar,
            emailSubjectEn: r.email_subject_en,
            emailSubjectAr: r.email_subject_ar,
            emailBodyEn: r.email_body_en,
            emailBodyAr: r.email_body_ar,
            smsBodyEn: r.sms_body_en,
            smsBodyAr: r.sms_body_ar,
            isActive: Boolean(r.is_active),
            defaultSms: Boolean(r.default_sms),
            defaultEmail: Boolean(r.default_email),
            defaultInApp: Boolean(r.default_in_app),
            isDemo: Boolean(r.is_demo),
          }))
        : structuredClone(INITIAL_NOTIFICATION_TEMPLATES);

    const notificationRecipients: NotificationRecipient[] = (
      !nRecipientsRes.error ? (nRecipientsRes.data ?? []) : []
    ).map((r: Record<string, any>) => ({
      id: r.id,
      fullName: r.full_name,
      fullNameAr: r.full_name_ar,
      role: r.role,
      phone: r.phone ?? '',
      email: r.email ?? '',
      preferredLang: r.preferred_lang ?? 'ar',
      smsOptIn: Boolean(r.sms_opt_in),
      emailOptIn: Boolean(r.email_opt_in),
      inAppOptIn: Boolean(r.in_app_opt_in),
      ownerId: r.owner_id ?? null,
      chaletId: r.chalet_id ?? null,
      isActive: Boolean(r.is_active),
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
    }));

    const notificationDeliveries: NotificationDelivery[] = (
      !nDeliveriesRes.error ? (nDeliveriesRes.data ?? []) : []
    ).map((r: Record<string, any>) => ({
      id: r.id,
      eventKey: r.event_key,
      channel: r.channel,
      recipientId: r.recipient_id ?? null,
      recipientName: r.recipient_name,
      recipientAddress: r.recipient_address,
      lang: r.lang ?? 'ar',
      subject: r.subject,
      body: r.body,
      status: r.status,
      attemptCount: Number(r.attempt_count ?? 1),
      errorReason: r.error_reason ?? '',
      dedupKey: r.dedup_key,
      relatedEntityId: r.related_entity_id ?? null,
      ownerId: r.owner_id ?? null,
      chaletId: r.chalet_id ?? null,
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at,
    }));

    const notificationPreferences: NotificationPreference[] = (
      !nPrefsRes.error ? (nPrefsRes.data ?? []) : []
    ).map((r: Record<string, any>) => ({
      id: r.id,
      userId: r.user_id,
      eventKey: r.event_key,
      inAppEnabled: Boolean(r.in_app_enabled),
      emailEnabled: Boolean(r.email_enabled),
      smsEnabled: Boolean(r.sms_enabled),
      preferredLang: r.preferred_lang ?? 'ar',
    }));

    return {
      dataset: {
        owners,
        chalets,
        guests,
        bookings,
        payments,
        paymentAuditLogs,
        expenses,
        utilities,
        utilityTransactions,
        housekeeping,
        maintenance,
        offers,
        notifications,
        notificationSettings,
        notificationTemplates,
        notificationRecipients,
        notificationDeliveries,
        notificationPreferences,
      },
      source: 'production',
    };
  } catch (err) {
    const classified = classifySupabaseError(err, lang);
    return {
      dataset: createEmptyDataset(),
      source: 'production',
      error: classified.message,
      errorKind: classified.kind,
    };
  }
}

export async function loadInitialDataset(): Promise<{
  dataset: PlatformDataset;
  source: 'supabase' | 'demo';
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { dataset: structuredClone(INITIAL_DEMO_DATASET), source: 'demo' };
  }
  const prod = await loadProductionDataset('ar');
  if (prod.error) {
    return { dataset: createEmptyDataset(), source: 'supabase', error: prod.error };
  }
  return { dataset: prod.dataset, source: 'supabase' };
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }
  return supabase;
}

export const supabaseSync = {
  async fetchUserProfile(
    authUserId: string,
    email: string,
    lang: Language = 'ar'
  ): Promise<PlatformUser> {
    const client = requireClient();
    const isAr = lang === 'ar';
    const { data: profile, error } = await client
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error, lang);
      throw new Error(classified.message);
    }

    if (!profile) {
      throw new Error(
        isAr
          ? 'هذا الحساب مسجل في المصادقة لكن لا يوجد له ملف صلاحيات في جدول public.users. تواصل مع المدير العام.'
          : 'Authenticated user has no active role profile in public.users. Contact your administrator.'
      );
    }

    if (profile.is_active === false) {
      throw new Error(
        isAr
          ? 'تم إيقاف هذا الحساب. تواصل مع إدارة المنصة لإعادة التفعيل.'
          : 'This user account is inactive. Contact platform administration.'
      );
    }

    return {
      id: authUserId,
      fullName: profile.full_name || email || 'User',
      fullNameAr: profile.full_name_ar || email || 'مستخدم',
      email: profile.email || email || '',
      phone: profile.phone || '',
      role: profile.role as UserRole,
      ownerId: profile.owner_id ?? null,
      isActive: Boolean(profile.is_active),
      isDemo: Boolean(profile.is_demo),
    };
  },

  async fetchAllUsers(lang: Language = 'ar'): Promise<PlatformUser[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return (data || []).map((u: Record<string, any>) => ({
      id: u.id,
      fullName: u.full_name,
      fullNameAr: u.full_name_ar,
      email: u.email,
      phone: u.phone ?? '',
      role: u.role as UserRole,
      ownerId: u.owner_id ?? null,
      isActive: Boolean(u.is_active),
      isDemo: Boolean(u.is_demo),
    }));
  },

  async upsertUserProfile(user: PlatformUser, lang: Language = 'ar'): Promise<PlatformUser> {
    if (!UUID_REGEX.test(user.id.trim())) {
      throw new Error(
        lang === 'ar'
          ? 'معرّف المستخدم (User UID) غير صالح. يرجى نسخ المعرّف الكامل من نظام المصادقة.'
          : 'Invalid User UID format. Copy the exact UUID from Authentication -> Users.'
      );
    }
    const client = requireClient();
    const { data, error } = await client
      .from('users')
      .upsert(
        {
          id: user.id.trim(),
          full_name: user.fullName.trim(),
          full_name_ar: (user.fullNameAr || user.fullName).trim(),
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || null,
          role: user.role,
          owner_id:
            user.role === 'owner' && user.ownerId && UUID_REGEX.test(user.ownerId)
              ? user.ownerId
              : null,
          is_active: user.isActive,
          is_demo: false,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return {
      id: data.id,
      fullName: data.full_name,
      fullNameAr: data.full_name_ar,
      email: data.email,
      phone: data.phone ?? '',
      role: data.role as UserRole,
      ownerId: data.owner_id ?? null,
      isActive: Boolean(data.is_active),
      isDemo: Boolean(data.is_demo),
    };
  },

  async deleteUserProfile(userId: string, lang: Language = 'ar'): Promise<void> {
    if (!UUID_REGEX.test(userId)) return;
    const client = requireClient();
    const { error } = await client.from('users').delete().eq('id', userId);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async insertOwner(owner: Owner, lang: Language = 'ar'): Promise<Owner> {
    const client = requireClient();
    const { data, error } = await client
      .from('owners')
      .insert({
        full_name: owner.fullName,
        full_name_ar: owner.fullNameAr,
        phone: owner.phone,
        email: owner.email,
        national_id: owner.nationalId || null,
        bank_account: owner.bankAccount || null,
        notes: owner.notes || null,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapOwnerRow(data);
  },

  async updateOwner(owner: Owner, lang: Language = 'ar'): Promise<Owner> {
    const client = requireClient();
    const { data, error } = await client
      .from('owners')
      .update({
        full_name: owner.fullName,
        full_name_ar: owner.fullNameAr,
        phone: owner.phone,
        email: owner.email,
        national_id: owner.nationalId || null,
        bank_account: owner.bankAccount || null,
        notes: owner.notes || null,
      })
      .eq('id', owner.id)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapOwnerRow(data);
  },

  async deleteOwner(id: string, lang: Language = 'ar'): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('owners').delete().eq('id', id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async upsertChalet(
    chalet: Chalet,
    isNew: boolean,
    lang: Language = 'ar'
  ): Promise<{ chalet: Chalet; utility?: UtilityAccount }> {
    const client = requireClient();
    const payload = {
      chalet_number: chalet.chaletNumber,
      owner_id: chalet.ownerId,
      bedrooms: chalet.bedrooms,
      bathrooms: chalet.bathrooms,
      max_guests: chalet.maxGuests,
      floor: chalet.floor,
      view_type: chalet.viewType,
      view_type_ar: chalet.viewTypeAr,
      status: chalet.status,
      photos: chalet.photos,
      description: chalet.description,
      description_ar: chalet.descriptionAr,
      amenities: chalet.amenities,
      nightly_price: chalet.nightlyPrice,
      owner_pct: chalet.ownerPct,
      management_pct: chalet.managementPct,
      is_active: chalet.isActive,
      is_demo: false,
    };

    if (isNew) {
      const { data: chaletData, error: chaletErr } = await client
        .from('chalets')
        .insert(payload)
        .select()
        .single();
      if (chaletErr) throw new Error(classifySupabaseError(chaletErr, lang).message);

      const confirmedChalet = mapChaletRow(chaletData);
      const { data: utilData, error: utilErr } = await client
        .from('utilities')
        .insert({
          chalet_id: confirmedChalet.id,
          electricity_balance: 500,
          water_balance: 300,
          electricity_threshold: 300,
          water_threshold: 150,
          last_electricity_recharge: 500,
          last_electricity_date: new Date().toISOString(),
          last_water_recharge: 300,
          last_water_date: new Date().toISOString(),
          is_demo: false,
        })
        .select()
        .single();

      return {
        chalet: confirmedChalet,
        utility: !utilErr && utilData ? mapUtilityRow(utilData) : undefined,
      };
    }

    const { data, error } = await client
      .from('chalets')
      .update(payload)
      .eq('id', chalet.id)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return { chalet: mapChaletRow(data) };
  },

  async updateChaletStatus(
    chaletId: string,
    status: ChaletStatus,
    lang: Language = 'ar'
  ): Promise<Chalet> {
    const client = requireClient();
    const { data, error } = await client
      .from('chalets')
      .update({ status })
      .eq('id', chaletId)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapChaletRow(data);
  },

  async updateChaletSplit(
    chaletId: string,
    ownerPct: number,
    lang: Language = 'ar'
  ): Promise<Chalet> {
    const client = requireClient();
    const { data, error } = await client
      .from('chalets')
      .update({
        owner_pct: ownerPct,
        management_pct: 100 - ownerPct,
      })
      .eq('id', chaletId)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapChaletRow(data);
  },

  async deleteChalet(id: string, lang: Language = 'ar'): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('chalets').delete().eq('id', id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async upsertGuest(
    guest: Guest,
    isNew: boolean,
    lang: Language = 'ar'
  ): Promise<Guest> {
    const client = requireClient();
    const payload = {
      full_name: guest.fullName,
      phone: guest.phone,
      nationality: guest.nationality || 'Egyptian',
      id_passport: guest.idPassport || null,
      email: guest.email || null,
      notes: guest.notes || null,
      is_demo: false,
    };
    const query = isNew
      ? client.from('guests').insert(payload).select().single()
      : client.from('guests').update(payload).eq('id', guest.id).select().single();
    const { data, error } = await query;
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapGuestRow(data);
  },

  async deleteGuest(id: string, lang: Language = 'ar'): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('guests').delete().eq('id', id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async insertBooking(booking: Booking, lang: Language = 'ar'): Promise<Booking> {
    const client = requireClient();
    const { data, error } = await client
      .from('bookings')
      .insert({
        booking_code: booking.bookingCode,
        chalet_id: booking.chaletId,
        guest_id: booking.guestId && UUID_REGEX.test(booking.guestId) ? booking.guestId : null,
        guest_name: booking.guestName,
        phone: booking.phone,
        nationality: booking.nationality,
        check_in: booking.checkIn,
        check_out: booking.checkOut,
        num_guests: booking.numGuests,
        nightly_price: booking.nightlyPrice,
        payment_status: booking.paymentStatus,
        outstanding_amount: booking.outstandingAmount ?? 0,
        payment_due_date: booking.paymentDueDate ?? null,
        booking_source: booking.bookingSource,
        status: booking.status,
        notes: booking.notes,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapBookingRow(data);
  },

  async updateBooking(booking: Booking, lang: Language = 'ar'): Promise<Booking> {
    const client = requireClient();
    const { data, error } = await client
      .from('bookings')
      .update({
        status: booking.status,
        payment_status: booking.paymentStatus,
        id_passport: booking.idPassport ?? '',
        check_in_time: booking.checkInTime ?? null,
        check_out_time: booking.checkOutTime ?? null,
        deposit_amount: booking.depositAmount ?? 0,
        inspection_notes: booking.inspectionNotes ?? '',
        damage_report: booking.damageReport ?? '',
        outstanding_amount: booking.outstandingAmount ?? 0,
        payment_due_date: booking.paymentDueDate ?? null,
        notes: booking.notes ?? '',
      })
      .eq('id', booking.id)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapBookingRow(data);
  },

  async insertPayment(
    payment: Payment,
    auditLog?: PaymentAuditLog,
    lang: Language = 'ar'
  ): Promise<{ payment: Payment; auditLog?: PaymentAuditLog }> {
    const client = requireClient();
    const paymentId = ensureUuid(payment.id);

    const { data: pData, error: pErr } = await client
      .from('payments')
      .insert({
        id: paymentId,
        booking_id: payment.bookingId && UUID_REGEX.test(payment.bookingId) ? payment.bookingId : null,
        owner_id: payment.ownerId && UUID_REGEX.test(payment.ownerId) ? payment.ownerId : null,
        payment_type: payment.paymentType,
        entry_direction: payment.entryDirection ?? 'inflow',
        amount: payment.amount,
        payment_method: payment.paymentMethod,
        status: payment.status ?? 'confirmed',
        receipt_number: payment.receiptNumber ?? null,
        reference_no: payment.referenceNo,
        idempotency_key: payment.idempotencyKey ?? null,
        parent_payment_id:
          payment.parentPaymentId && UUID_REGEX.test(payment.parentPaymentId)
            ? payment.parentPaymentId
            : null,
        correction_reason: payment.correctionReason ?? '',
        recorded_by_name: payment.recordedByName ?? '',
        gateway_provider: payment.gatewayProvider ?? null,
        gateway_status: payment.gatewayStatus ?? 'not_activated',
        paid_at: payment.paidAt,
        notes: payment.notes,
        is_demo: false,
      })
      .select()
      .single();

    if (pErr) throw new Error(classifySupabaseError(pErr, lang).message);
    const confirmedPayment = mapPaymentRow(pData);

    let confirmedAudit: PaymentAuditLog | undefined;
    if (auditLog) {
      const { data: aData, error: aErr } = await client
        .from('payment_audit_logs')
        .insert({
          payment_id: confirmedPayment.id,
          booking_id:
            auditLog.bookingId && UUID_REGEX.test(auditLog.bookingId) ? auditLog.bookingId : null,
          action: auditLog.action,
          previous_amount: auditLog.previousAmount,
          new_amount: auditLog.newAmount,
          reason: auditLog.reason,
          actor_name: auditLog.actorName,
          actor_role: auditLog.actorRole,
          is_demo: false,
        })
        .select()
        .single();
      if (aErr) throw new Error(classifySupabaseError(aErr, lang).message);
      confirmedAudit = mapAuditRow(aData);
    }

    return { payment: confirmedPayment, auditLog: confirmedAudit };
  },

  async insertExpense(
    expense: Expense,
    recordedByUserId?: string,
    lang: Language = 'ar'
  ): Promise<Expense> {
    const client = requireClient();
    const { data, error } = await client
      .from('expenses')
      .insert({
        chalet_id: expense.chaletId,
        category: expense.category,
        description: expense.description,
        description_ar: expense.descriptionAr,
        amount: expense.amount,
        expense_date: expense.expenseDate,
        recorded_by: recordedByUserId && UUID_REGEX.test(recordedByUserId) ? recordedByUserId : null,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapExpenseRow(data);
  },

  async deleteExpense(id: string, lang: Language = 'ar'): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('expenses').delete().eq('id', id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async rechargeUtility(
    params: {
      chaletId: string;
      chaletNumber: string;
      type: 'electricity' | 'water';
      amount: number;
      notes: string;
      currentAccount?: UtilityAccount;
      recordedByUserId?: string;
    },
    lang: Language = 'ar'
  ): Promise<{
    utility: UtilityAccount;
    transaction: UtilityTransaction;
    expense: Expense;
  }> {
    const client = requireClient();
    const nowIso = new Date().toISOString();
    const prevElec = params.currentAccount?.electricityBalance ?? 0;
    const prevWater = params.currentAccount?.waterBalance ?? 0;
    const newBalance =
      params.type === 'electricity' ? prevElec + params.amount : prevWater + params.amount;

    const utilityPayload: Record<string, any> = {
      chalet_id: params.chaletId,
      electricity_balance: params.type === 'electricity' ? newBalance : prevElec,
      water_balance: params.type === 'water' ? newBalance : prevWater,
      electricity_threshold: params.currentAccount?.electricityThreshold ?? 300,
      water_threshold: params.currentAccount?.waterThreshold ?? 150,
      last_electricity_recharge:
        params.type === 'electricity'
          ? params.amount
          : (params.currentAccount?.lastElectricityRecharge ?? 0),
      last_electricity_date:
        params.type === 'electricity'
          ? nowIso
          : (params.currentAccount?.lastElectricityDate ?? null),
      last_water_recharge:
        params.type === 'water'
          ? params.amount
          : (params.currentAccount?.lastWaterRecharge ?? 0),
      last_water_date:
        params.type === 'water'
          ? nowIso
          : (params.currentAccount?.lastWaterDate ?? null),
      is_demo: false,
      updated_at: nowIso,
    };

    const { data: uData, error: uErr } = await client
      .from('utilities')
      .upsert(utilityPayload, { onConflict: 'chalet_id' })
      .select()
      .single();
    if (uErr) throw new Error(classifySupabaseError(uErr, lang).message);

    const { data: txData, error: txErr } = await client
      .from('utility_transactions')
      .insert({
        chalet_id: params.chaletId,
        utility_type: params.type,
        transaction_type: 'recharge',
        amount: params.amount,
        balance_after: newBalance,
        transaction_date: nowIso,
        notes: params.notes || 'Manual recharge',
        is_demo: false,
      })
      .select()
      .single();
    if (txErr) throw new Error(classifySupabaseError(txErr, lang).message);

    const { data: expData, error: expErr } = await client
      .from('expenses')
      .insert({
        chalet_id: params.chaletId,
        category: params.type,
        description: `${params.type === 'electricity' ? 'Electricity' : 'Water'} meter recharge (${params.chaletNumber})`,
        description_ar: `شحن عداد ${params.type === 'electricity' ? 'الكهرباء' : 'المياه'} (${params.chaletNumber})`,
        amount: params.amount,
        expense_date: getEgyptDateFromIso(nowIso),
        recorded_by:
          params.recordedByUserId && UUID_REGEX.test(params.recordedByUserId)
            ? params.recordedByUserId
            : null,
        is_demo: false,
      })
      .select()
      .single();
    if (expErr) throw new Error(classifySupabaseError(expErr, lang).message);

    return {
      utility: mapUtilityRow(uData),
      transaction: mapUtilityTxRow(txData),
      expense: mapExpenseRow(expData),
    };
  },

  async insertHousekeeping(
    task: HousekeepingTask,
    lang: Language = 'ar'
  ): Promise<HousekeepingTask> {
    const client = requireClient();
    const { data, error } = await client
      .from('housekeeping')
      .insert({
        chalet_id: task.chaletId,
        task_type: task.taskType,
        status: task.status,
        assigned_name: task.assignedName,
        notes: task.notes,
        scheduled_date: task.scheduledDate,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapHousekeepingRow(data);
  },

  async updateHousekeeping(
    task: HousekeepingTask,
    lang: Language = 'ar'
  ): Promise<HousekeepingTask> {
    const client = requireClient();
    const { data, error } = await client
      .from('housekeeping')
      .update({
        status: task.status,
        assigned_name: task.assignedName,
        notes: task.notes,
        completed_at: task.completedAt ?? null,
      })
      .eq('id', task.id)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapHousekeepingRow(data);
  },

  async insertMaintenance(
    ticket: MaintenanceTicket,
    lang: Language = 'ar'
  ): Promise<MaintenanceTicket> {
    const client = requireClient();
    const { data, error } = await client
      .from('maintenance')
      .insert({
        ...(UUID_REGEX.test(ticket.id) ? { id: ticket.id } : {}),
        chalet_id: ticket.chaletId,
        problem_type: ticket.problemType,
        description: ticket.description,
        photos: ticket.photos,
        priority: ticket.priority,
        status: ticket.status,
        technician_name: ticket.technicianName,
        cost: ticket.cost,
        notes: ticket.notes,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapMaintenanceRow(data);
  },

  async updateMaintenance(
    ticket: MaintenanceTicket,
    lang: Language = 'ar'
  ): Promise<MaintenanceTicket> {
    const client = requireClient();
    const { data, error } = await client
      .from('maintenance')
      .update({
        problem_type: ticket.problemType,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        technician_name: ticket.technicianName,
        cost: ticket.cost,
        notes: ticket.notes,
        completed_at: ticket.completedAt ?? null,
      })
      .eq('id', ticket.id)
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapMaintenanceRow(data);
  },

  async insertOffer(offer: PartnerOffer, lang: Language = 'ar'): Promise<PartnerOffer> {
    const client = requireClient();
    const { data, error } = await client
      .from('offers')
      .insert({
        category: offer.category,
        business_name: offer.businessName,
        business_name_ar: offer.businessNameAr,
        title: offer.title,
        title_ar: offer.titleAr,
        discount: offer.discount,
        description: offer.description,
        description_ar: offer.descriptionAr,
        phone: offer.phone,
        availability: offer.availability,
        image_url: offer.imageUrl,
        is_active: offer.isActive,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapOfferRow(data);
  },

  async insertNotification(
    notif: Omit<AppNotification, 'id' | 'isRead' | 'isDemo' | 'createdAt'>,
    lang: Language = 'ar'
  ): Promise<AppNotification> {
    const client = requireClient();
    const { data, error } = await client
      .from('notifications')
      .insert({
        type: notif.type,
        title: notif.title,
        title_ar: notif.titleAr,
        message: notif.message,
        message_ar: notif.messageAr,
        target_role: notif.targetRole ?? null,
        target_owner_id:
          notif.targetOwnerId && UUID_REGEX.test(notif.targetOwnerId) ? notif.targetOwnerId : null,
        chalet_id: notif.chaletId && UUID_REGEX.test(notif.chaletId) ? notif.chaletId : null,
        is_read: false,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return mapNotificationRow(data);
  },

  async markNotificationRead(id: string, lang: Language = 'ar'): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async markAllNotificationsRead(ids: string[], lang: Language = 'ar'): Promise<void> {
    if (ids.length === 0) return;
    const client = requireClient();
    const { error } = await client.from('notifications').update({ is_read: true }).in('id', ids);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async upsertNotificationSettings(
    settings: NotificationSettings,
    lang: Language = 'ar'
  ): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('notification_settings').upsert({
      id: settings.id,
      sms_enabled: settings.smsEnabled,
      email_enabled: settings.emailEnabled,
      in_app_enabled: settings.inAppEnabled,
      providers_activated: false, // Locked server-side
      simulation_mode: settings.simulationMode,
      sender_name: settings.senderName,
      quiet_hours_start: settings.quietHoursStart,
      quiet_hours_end: settings.quietHoursEnd,
      updated_at: settings.updatedAt,
    });
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async updateNotificationTemplate(
    templateId: string,
    patch: Partial<NotificationTemplate>,
    lang: Language = 'ar'
  ): Promise<void> {
    if (!UUID_REGEX.test(templateId)) return;
    const client = requireClient();
    const updatePayload: Record<string, any> = {};
    if (patch.isActive !== undefined) updatePayload.is_active = patch.isActive;
    if (patch.defaultSms !== undefined) updatePayload.default_sms = patch.defaultSms;
    if (patch.defaultEmail !== undefined) updatePayload.default_email = patch.defaultEmail;
    if (patch.defaultInApp !== undefined) updatePayload.default_in_app = patch.defaultInApp;
    const { error } = await client
      .from('notification_templates')
      .update(updatePayload)
      .eq('id', templateId);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async insertNotificationRecipient(
    recipient: NotificationRecipient,
    lang: Language = 'ar'
  ): Promise<NotificationRecipient> {
    const client = requireClient();
    const { data, error } = await client
      .from('notification_recipients')
      .insert({
        full_name: recipient.fullName,
        full_name_ar: recipient.fullNameAr,
        role: recipient.role,
        phone: recipient.phone,
        email: recipient.email,
        preferred_lang: recipient.preferredLang,
        sms_opt_in: recipient.smsOptIn,
        email_opt_in: recipient.emailOptIn,
        in_app_opt_in: recipient.inAppOptIn,
        owner_id:
          recipient.ownerId && UUID_REGEX.test(recipient.ownerId) ? recipient.ownerId : null,
        chalet_id:
          recipient.chaletId && UUID_REGEX.test(recipient.chaletId) ? recipient.chaletId : null,
        is_active: recipient.isActive,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return {
      ...recipient,
      id: data.id,
      createdAt: data.created_at,
    };
  },

  async toggleNotificationRecipientActive(
    recipientId: string,
    isActive: boolean,
    lang: Language = 'ar'
  ): Promise<void> {
    if (!UUID_REGEX.test(recipientId)) return;
    const client = requireClient();
    const { error } = await client
      .from('notification_recipients')
      .update({ is_active: isActive })
      .eq('id', recipientId);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async insertNotificationDelivery(
    delivery: NotificationDelivery,
    lang: Language = 'ar'
  ): Promise<NotificationDelivery | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data, error } = await supabase
      .from('notification_deliveries')
      .insert({
        event_key: delivery.eventKey,
        channel: delivery.channel,
        recipient_id:
          delivery.recipientId && UUID_REGEX.test(delivery.recipientId)
            ? delivery.recipientId
            : null,
        recipient_name: delivery.recipientName,
        recipient_address: delivery.recipientAddress,
        lang: delivery.lang,
        subject: delivery.subject,
        body: delivery.body,
        status: delivery.status,
        attempt_count: delivery.attemptCount,
        error_reason: delivery.errorReason,
        dedup_key: delivery.dedupKey,
        related_entity_id: delivery.relatedEntityId ?? null,
        owner_id: delivery.ownerId && UUID_REGEX.test(delivery.ownerId) ? delivery.ownerId : null,
        chalet_id:
          delivery.chaletId && UUID_REGEX.test(delivery.chaletId) ? delivery.chaletId : null,
        is_demo: false,
      })
      .select()
      .single();
    if (error) throw new Error(classifySupabaseError(error, lang).message);
    return { ...delivery, id: data.id, createdAt: data.created_at };
  },

  async updateNotificationDelivery(
    delivery: NotificationDelivery,
    lang: Language = 'ar'
  ): Promise<void> {
    if (!UUID_REGEX.test(delivery.id)) return;
    const client = requireClient();
    const { error } = await client
      .from('notification_deliveries')
      .update({
        attempt_count: delivery.attemptCount,
        status: delivery.status,
        error_reason: delivery.errorReason,
        last_attempt_at: delivery.lastAttemptAt,
      })
      .eq('id', delivery.id);
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },

  async upsertNotificationPreference(
    pref: NotificationPreference,
    lang: Language = 'ar'
  ): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('notification_preferences').upsert(
      {
        user_id: pref.userId,
        event_key: pref.eventKey,
        in_app_enabled: pref.inAppEnabled,
        email_enabled: pref.emailEnabled,
        sms_enabled: pref.smsEnabled,
        preferred_lang: pref.preferredLang,
      },
      { onConflict: 'user_id,event_key' }
    );
    if (error) throw new Error(classifySupabaseError(error, lang).message);
  },
};

function getEgyptDateFromIso(iso: string): string {
  return normalizeToEgyptDateString(iso) || new Date().toISOString().slice(0, 10);
}
