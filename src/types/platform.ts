export type UserRole =
  | 'super_admin'
  | 'manager'
  | 'owner'
  | 'housekeeping'
  | 'maintenance'
  | 'reception'
  | 'guest';

export type Language = 'ar' | 'en';

export type AppMode = 'production' | 'demo';

export interface MutationResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type ChaletStatus = 'available' | 'occupied' | 'maintenance' | 'cleaning' | 'inactive';

export type BookingSource =
  | 'direct'
  | 'facebook'
  | 'instagram'
  | 'website'
  | 'booking_com'
  | 'airbnb'
  | 'travel_agency'
  | 'other';

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';

export type BookingStatus = 'upcoming' | 'checked_in' | 'checked_out' | 'cancelled';

export type ExpenseCategory = 'electricity' | 'water' | 'housekeeping' | 'maintenance' | 'other';

export type HousekeepingTaskType =
  | 'checkout_cleaning'
  | 'deep_cleaning'
  | 'linen_replacement'
  | 'inspection';

export type HousekeepingStatus = 'pending' | 'in_progress' | 'completed' | 'needs_inspection';

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'emergency';

export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'closed';

export type OfferCategory = 'restaurant' | 'cafe' | 'supermarket' | 'resort_service';

export interface PlatformUser {
  id: string;
  fullName: string;
  fullNameAr: string;
  email: string;
  phone: string;
  role: UserRole;
  ownerId?: string | null;
  isActive: boolean;
  isDemo: boolean;
}

export interface Owner {
  id: string;
  fullName: string;
  fullNameAr: string;
  phone: string;
  email: string;
  nationalId: string;
  bankAccount: string;
  notes: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Chalet {
  id: string;
  chaletNumber: string;
  ownerId: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  floor: string;
  viewType: string;
  viewTypeAr: string;
  status: ChaletStatus;
  photos: string[];
  description: string;
  descriptionAr: string;
  amenities: string[];
  nightlyPrice: number;
  ownerPct: number;
  managementPct: number;
  isActive: boolean;
  isDemo: boolean;
}

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'instapay'
  | 'mobile_wallet'
  | 'card_manual'
  | 'other';

export type PaymentEntryType =
  | 'guest_payment'
  | 'owner_payout'
  | 'deposit'
  | 'refund'
  | 'correction';

export type PaymentTransactionStatus =
  | 'confirmed'
  | 'pending_gateway'
  | 'refunded'
  | 'voided';

export type PaymentAuditAction =
  | 'payment_recorded'
  | 'deposit_recorded'
  | 'refund_issued'
  | 'correction_applied'
  | 'ledger_synced'
  | 'receipt_generated';

export type PaymentGatewayProvider = 'paymob' | 'fawry' | 'stripe' | null;

export interface Guest {
  id: string;
  fullName: string;
  phone: string;
  nationality: string;
  idPassport: string;
  email: string;
  notes: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Booking {
  id: string;
  bookingCode: string;
  chaletId: string;
  guestId?: string | null;
  guestName: string;
  phone: string;
  nationality: string;
  checkIn: string;
  checkOut: string;
  numGuests: number;
  nights: number;
  nightlyPrice: number;
  totalValue: number;
  paymentStatus: PaymentStatus;
  bookingSource: BookingSource;
  status: BookingStatus;
  notes: string;
  idPassport?: string;
  checkInTime?: string;
  checkOutTime?: string;
  depositAmount?: number;
  inspectionNotes?: string;
  damageReport?: string;
  outstandingAmount?: number;
  paymentDueDate?: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId?: string | null;
  ownerId?: string | null;
  paymentType: PaymentEntryType;
  entryDirection?: 'inflow' | 'outflow' | 'adjustment';
  amount: number;
  paymentMethod: PaymentMethod | string;
  status?: PaymentTransactionStatus;
  receiptNumber?: string;
  referenceNo: string;
  idempotencyKey?: string;
  parentPaymentId?: string | null;
  correctionReason?: string;
  recordedByName?: string;
  gatewayProvider?: PaymentGatewayProvider;
  gatewayStatus?: 'not_activated' | 'prepared_dormant';
  paidAt: string;
  notes: string;
  isDemo: boolean;
}

export interface PaymentAuditLog {
  id: string;
  paymentId: string;
  bookingId?: string | null;
  action: PaymentAuditAction;
  previousAmount: number;
  newAmount: number;
  reason: string;
  actorName: string;
  actorRole: UserRole;
  isDemo: boolean;
  createdAt: string;
}

export interface PaymentGatewayReadiness {
  activated: false; // Explicitly disabled for Phase 1
  plannedPhase: 'Phase 2';
  preparedProviders: Array<{
    id: 'paymob' | 'fawry' | 'stripe';
    name: string;
    supportsEgyptCards: boolean;
    supportsWalletOrKiosk: boolean;
    status: 'prepared_not_activated';
  }>;
}

export interface Expense {
  id: string;
  chaletId: string;
  category: ExpenseCategory;
  description: string;
  descriptionAr: string;
  amount: number;
  expenseDate: string;
  isDemo: boolean;
}

export interface UtilityAccount {
  id: string;
  chaletId: string;
  electricityBalance: number;
  waterBalance: number;
  electricityThreshold: number;
  waterThreshold: number;
  lastElectricityRecharge: number;
  lastElectricityDate: string;
  lastWaterRecharge: number;
  lastWaterDate: string;
  isDemo: boolean;
}

export interface UtilityTransaction {
  id: string;
  chaletId: string;
  utilityType: 'electricity' | 'water';
  transactionType: 'recharge' | 'consumption';
  amount: number;
  balanceAfter: number;
  transactionDate: string;
  notes: string;
  isDemo: boolean;
}

export interface HousekeepingTask {
  id: string;
  chaletId: string;
  taskType: HousekeepingTaskType;
  status: HousekeepingStatus;
  assignedName: string;
  notes: string;
  scheduledDate: string;
  completedAt?: string | null;
  isDemo: boolean;
}

export interface MaintenanceTicket {
  id: string;
  chaletId: string;
  problemType: string;
  description: string;
  photos: string[];
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  technicianName: string;
  cost: number;
  notes: string;
  createdAt: string;
  completedAt?: string | null;
  isDemo: boolean;
}

export interface PartnerOffer {
  id: string;
  category: OfferCategory;
  businessName: string;
  businessNameAr: string;
  title: string;
  titleAr: string;
  discount: string;
  description: string;
  descriptionAr: string;
  phone: string;
  availability: string;
  imageUrl: string;
  isActive: boolean;
  isDemo: boolean;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  targetRole?: UserRole | null;
  targetOwnerId?: string | null;
  chaletId?: string | null;
  isRead: boolean;
  isDemo: boolean;
  createdAt: string;
}

export type NotificationChannel = 'sms' | 'email' | 'in_app';

export type NotificationEventKey =
  | 'booking_confirmation'
  | 'booking_cancellation'
  | 'deposit_received'
  | 'payment_reminder'
  | 'upcoming_checkin_48h'
  | 'checkin_confirmation'
  | 'checkout_confirmation'
  | 'maintenance_request'
  | 'housekeeping_request'
  | 'low_utility_balance'
  | 'owner_payment_due'
  | 'owner_monthly_statement';

export type NotificationDeliveryStatus =
  | 'queued_disabled'
  | 'simulated'
  | 'sent'
  | 'failed';

export interface NotificationSettings {
  id: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  providersActivated: boolean; // Always false until server-side providers are configured & explicitly activated
  simulationMode: boolean;
  smsProviderName: string;
  emailProviderName: string;
  senderName: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  eventKey: NotificationEventKey;
  category: 'booking' | 'payment' | 'operations' | 'utility' | 'owner';
  titleEn: string;
  titleAr: string;
  emailSubjectEn: string;
  emailSubjectAr: string;
  emailBodyEn: string;
  emailBodyAr: string;
  smsBodyEn: string;
  smsBodyAr: string;
  isActive: boolean;
  defaultSms: boolean;
  defaultEmail: boolean;
  defaultInApp: boolean;
  isDemo: boolean;
}

export interface NotificationRecipient {
  id: string;
  fullName: string;
  fullNameAr: string;
  role: UserRole | 'guest' | 'staff';
  phone: string;
  email: string;
  preferredLang: Language;
  smsOptIn: boolean;
  emailOptIn: boolean;
  inAppOptIn: boolean;
  ownerId?: string | null;
  chaletId?: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
}

export interface NotificationDelivery {
  id: string;
  eventKey: NotificationEventKey;
  channel: NotificationChannel;
  recipientId?: string | null;
  recipientName: string;
  recipientAddress: string;
  lang: Language;
  subject: string;
  body: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  errorReason: string;
  dedupKey: string;
  relatedEntityId?: string | null;
  ownerId?: string | null;
  chaletId?: string | null;
  isDemo: boolean;
  createdAt: string;
  lastAttemptAt: string;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  eventKey: NotificationEventKey;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  preferredLang: Language;
}

export interface PlatformDataset {
  owners: Owner[];
  chalets: Chalet[];
  guests: Guest[];
  bookings: Booking[];
  payments: Payment[];
  paymentAuditLogs: PaymentAuditLog[];
  expenses: Expense[];
  utilities: UtilityAccount[];
  utilityTransactions: UtilityTransaction[];
  housekeeping: HousekeepingTask[];
  maintenance: MaintenanceTicket[];
  offers: PartnerOffer[];
  notifications: AppNotification[];
  notificationSettings: NotificationSettings;
  notificationTemplates: NotificationTemplate[];
  notificationRecipients: NotificationRecipient[];
  notificationDeliveries: NotificationDelivery[];
  notificationPreferences: NotificationPreference[];
}

