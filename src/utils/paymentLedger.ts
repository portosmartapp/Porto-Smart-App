import {
  Booking,
  Chalet,
  Language,
  Payment,
  PaymentAuditLog,
  PaymentEntryType,
  PaymentGatewayReadiness,
  PaymentMethod,
  PaymentStatus,
  PlatformUser,
} from '../types/platform';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from './egyptTime';

export const SUPPORTED_PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  labelEn: string;
  labelAr: string;
}> = [
  { id: 'cash', labelEn: 'Cash', labelAr: 'نقدي (كاش)' },
  { id: 'bank_transfer', labelEn: 'Bank Transfer', labelAr: 'تحويل بنكي' },
  { id: 'instapay', labelEn: 'InstaPay', labelAr: 'إنستاباي (InstaPay)' },
  { id: 'mobile_wallet', labelEn: 'Mobile Wallet', labelAr: 'محفظة إلكترونية' },
  {
    id: 'card_manual',
    labelEn: 'Credit/Debit Card (Manual)',
    labelAr: 'بطاقة بنكية (تسجيل يدوي فقط)',
  },
  { id: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

export const PAYMENT_GATEWAY_READINESS: PaymentGatewayReadiness = {
  activated: false,
  plannedPhase: 'Phase 2',
  preparedProviders: [
    {
      id: 'paymob',
      name: 'Paymob Egypt (Cards & Meeza)',
      supportsEgyptCards: true,
      supportsWalletOrKiosk: true,
      status: 'prepared_not_activated',
    },
    {
      id: 'fawry',
      name: 'Fawry Pay (Reference & Kiosk)',
      supportsEgyptCards: true,
      supportsWalletOrKiosk: true,
      status: 'prepared_not_activated',
    },
    {
      id: 'stripe',
      name: 'Stripe International Cards',
      supportsEgyptCards: true,
      supportsWalletOrKiosk: false,
      status: 'prepared_not_activated',
    },
  ],
};

export function normalizePaymentMethod(rawMethod: string): PaymentMethod {
  const lower = rawMethod.toLowerCase();
  if (lower === 'cash') return 'cash';
  if (lower.includes('instapay')) return 'instapay';
  if (lower.includes('wallet')) return 'mobile_wallet';
  if (lower.includes('card')) return 'card_manual';
  if (lower.includes('bank') || lower.includes('wire') || lower.includes('transfer')) {
    return 'bank_transfer';
  }
  if (lower === 'other') return 'other';
  return 'other';
}

export function getPaymentMethodLabel(method: string, lang: Language): string {
  const normalized = normalizePaymentMethod(method);
  const found = SUPPORTED_PAYMENT_METHODS.find((m) => m.id === normalized);
  if (!found) return method;
  return lang === 'ar' ? found.labelAr : found.labelEn;
}

export interface BookingPaymentSummary {
  bookingId: string;
  bookingCode: string;
  totalValue: number;
  depositPaid: number;
  grossCollected: number;
  refundsTotal: number;
  correctionsNet: number;
  netPaid: number;
  remainingBalance: number;
  derivedStatus: PaymentStatus;
  paymentDueDate: string;
  isOverdue: boolean;
  transactionCount: number;
  transactions: Payment[];
}

export function computeBookingPaymentSummary(
  booking: Booking,
  allPayments: Payment[],
  todayEgypt: string = getEgyptTodayIsoDate()
): BookingPaymentSummary {
  const txs = allPayments
    .filter((p) => p.bookingId === booking.id && p.status !== 'voided' && p.status !== 'pending_gateway')
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  let depositPaid = 0;
  let grossCollected = 0;
  let refundsTotal = 0;
  let correctionsNet = 0;

  for (const tx of txs) {
    if (tx.paymentType === 'deposit') {
      depositPaid += tx.amount;
      grossCollected += tx.amount;
    } else if (tx.paymentType === 'guest_payment') {
      grossCollected += tx.amount;
    } else if (tx.paymentType === 'refund') {
      refundsTotal += tx.amount;
    } else if (tx.paymentType === 'correction') {
      if (tx.entryDirection === 'outflow') {
        correctionsNet -= tx.amount;
      } else {
        correctionsNet += tx.amount;
      }
    }
  }

  // Legacy booking fallback if no explicit payment rows exist yet for a historical demo booking
  const hasTransactions = txs.length > 0;
  if (!hasTransactions) {
    if (booking.paymentStatus === 'paid') {
      grossCollected = booking.totalValue;
    } else if (booking.paymentStatus === 'partial') {
      const outstanding = Math.max(0, booking.outstandingAmount ?? 0);
      grossCollected = Math.max(0, booking.totalValue - outstanding);
    }
    if ((booking.depositAmount ?? 0) > 0) {
      depositPaid = booking.depositAmount ?? 0;
    }
  }

  const netPaid = Math.max(0, grossCollected - refundsTotal + correctionsNet);
  const remainingBalance = Math.max(0, booking.totalValue - netPaid);

  let derivedStatus: PaymentStatus = booking.paymentStatus;
  if (booking.status === 'cancelled' && refundsTotal > 0 && netPaid === 0) {
    derivedStatus = 'refunded';
  } else if (hasTransactions) {
    if (refundsTotal > 0 && netPaid === 0) {
      derivedStatus = 'refunded';
    } else if (remainingBalance <= 0 && booking.totalValue > 0) {
      derivedStatus = 'paid';
    } else if (netPaid > 0) {
      derivedStatus = 'partial';
    } else {
      derivedStatus = 'pending';
    }
  }

  const paymentDueDate =
    booking.paymentDueDate || normalizeToEgyptDateString(booking.checkIn) || todayEgypt;
  const isOverdue =
    booking.status !== 'cancelled' &&
    remainingBalance > 0 &&
    Boolean(paymentDueDate) &&
    paymentDueDate < todayEgypt;

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    totalValue: booking.totalValue,
    depositPaid,
    grossCollected,
    refundsTotal,
    correctionsNet,
    netPaid,
    remainingBalance,
    derivedStatus,
    paymentDueDate,
    isOverdue,
    transactionCount: txs.length,
    transactions: txs,
  };
}

export function generateReceiptNumber(sequenceHint: number | string = Date.now()): string {
  const clean = String(sequenceHint).replace(/\D/g, '').slice(-6).padStart(6, '0');
  return `FRT-RCPT-${clean}`;
}

export function generatePaymentIdempotencyKey(params: {
  bookingId?: string | null;
  ownerId?: string | null;
  paymentType: PaymentEntryType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  paidDate: string;
}): string {
  const ref = params.referenceNo.trim().toUpperCase() || 'NOREF';
  return [
    params.bookingId || params.ownerId || 'GLOBAL',
    params.paymentType,
    Math.round(params.amount * 100),
    params.paymentMethod,
    ref,
    params.paidDate.slice(0, 10),
  ].join(':');
}

export interface RecordPaymentInput {
  booking?: Booking | null;
  chalet?: Chalet | null;
  ownerId?: string | null;
  paymentType: 'guest_payment' | 'deposit' | 'owner_payout';
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  notes: string;
  paidAt?: string;
  idempotencyKey?: string;
  actor: PlatformUser;
  existingPayments: Payment[];
}

export interface RecordPaymentResult {
  ok: boolean;
  error?: string;
  isDuplicate?: boolean;
  payment?: Payment;
  auditLog?: PaymentAuditLog;
  updatedBooking?: Booking;
}

export function recordManualPayment(input: RecordPaymentInput): RecordPaymentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero.' };
  }

  const paidAt = input.paidAt || new Date().toISOString();
  const idempotencyKey =
    input.idempotencyKey ||
    generatePaymentIdempotencyKey({
      bookingId: input.booking?.id,
      ownerId: input.ownerId || input.chalet?.ownerId,
      paymentType: input.paymentType,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      referenceNo: input.referenceNo,
      paidDate: paidAt,
    });

  // Duplicate transaction / double-ledger-sync protection
  const duplicate = input.existingPayments.find(
    (p) =>
      p.status !== 'voided' &&
      ((p.idempotencyKey && p.idempotencyKey === idempotencyKey) ||
        (input.referenceNo.trim() &&
          p.bookingId === (input.booking?.id || null) &&
          p.referenceNo.trim().toUpperCase() === input.referenceNo.trim().toUpperCase() &&
          p.amount === input.amount &&
          p.paymentType === input.paymentType))
  );

  if (duplicate) {
    return {
      ok: false,
      isDuplicate: true,
      error: 'Duplicate payment detected for the same booking/reference and amount.',
    };
  }

  const nowIso = new Date().toISOString();
  const idSuffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const payment: Payment = {
    id: `pay-${idSuffix}`,
    bookingId: input.booking?.id || null,
    ownerId: input.ownerId || input.chalet?.ownerId || null,
    paymentType: input.paymentType,
    entryDirection: input.paymentType === 'owner_payout' ? 'outflow' : 'inflow',
    amount: Math.round(input.amount * 100) / 100,
    paymentMethod: input.paymentMethod,
    status: 'confirmed',
    receiptNumber: generateReceiptNumber(Date.now()),
    referenceNo: input.referenceNo.trim() || `REF-${Date.now().toString().slice(-5)}`,
    idempotencyKey,
    parentPaymentId: null,
    correctionReason: '',
    recordedByName: input.actor.fullName,
    gatewayProvider: null,
    gatewayStatus: 'not_activated',
    paidAt,
    notes: input.notes.trim(),
    isDemo: false,
  };

  const auditLog: PaymentAuditLog = {
    id: `paud-${idSuffix}`,
    paymentId: payment.id,
    bookingId: payment.bookingId,
    action: input.paymentType === 'deposit' ? 'deposit_recorded' : 'payment_recorded',
    previousAmount: 0,
    newAmount: payment.amount,
    reason: input.notes.trim() || `${input.paymentType} via ${input.paymentMethod}`,
    actorName: input.actor.fullName,
    actorRole: input.actor.role,
    isDemo: false,
    createdAt: nowIso,
  };

  let updatedBooking: Booking | undefined;
  if (input.booking) {
    const summary = computeBookingPaymentSummary(input.booking, [
      payment,
      ...input.existingPayments,
    ]);
    updatedBooking = {
      ...input.booking,
      paymentStatus: summary.derivedStatus,
      depositAmount: summary.depositPaid,
      outstandingAmount: summary.remainingBalance,
    };
  }

  return {
    ok: true,
    payment,
    auditLog,
    updatedBooking,
  };
}

export interface RefundOrCorrectionInput {
  booking?: Booking | null;
  targetPayment: Payment;
  mode: 'refund' | 'correction';
  correctionDirection?: 'inflow' | 'outflow';
  amount: number;
  paymentMethod: PaymentMethod;
  reason: string;
  actor: PlatformUser;
  existingPayments: Payment[];
}

export function issuePaymentRefundOrCorrection(
  input: RefundOrCorrectionInput
): RecordPaymentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Adjustment amount must be greater than zero.' };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Audit reason is required for refunds and corrections.' };
  }

  if (input.mode === 'refund' && input.booking) {
    const currentSummary = computeBookingPaymentSummary(input.booking, input.existingPayments);
    if (input.amount > currentSummary.netPaid) {
      return {
        ok: false,
        error: `Refund (${input.amount}) cannot exceed net collected (${currentSummary.netPaid}).`,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const idSuffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const entryDirection: 'inflow' | 'outflow' | 'adjustment' =
    input.mode === 'refund'
      ? 'outflow'
      : input.correctionDirection === 'inflow'
      ? 'inflow'
      : 'outflow';

  const adjustment: Payment = {
    id: `pay-${idSuffix}`,
    bookingId: input.targetPayment.bookingId || input.booking?.id || null,
    ownerId: input.targetPayment.ownerId || null,
    paymentType: input.mode,
    entryDirection,
    amount: Math.round(input.amount * 100) / 100,
    paymentMethod: input.paymentMethod,
    status: 'confirmed',
    receiptNumber: generateReceiptNumber(Date.now()),
    referenceNo: `${input.mode === 'refund' ? 'RFD' : 'COR'}-${input.targetPayment.referenceNo || idSuffix.slice(-4)}`,
    idempotencyKey: `${input.mode}:${input.targetPayment.id}:${nowIso}`,
    parentPaymentId: input.targetPayment.id,
    correctionReason: input.reason.trim(),
    recordedByName: input.actor.fullName,
    gatewayProvider: null,
    gatewayStatus: 'not_activated',
    paidAt: nowIso,
    notes: input.reason.trim(),
    isDemo: false,
  };

  const auditLog: PaymentAuditLog = {
    id: `paud-${idSuffix}`,
    paymentId: adjustment.id,
    bookingId: adjustment.bookingId,
    action: input.mode === 'refund' ? 'refund_issued' : 'correction_applied',
    previousAmount: input.targetPayment.amount,
    newAmount: adjustment.amount,
    reason: input.reason.trim(),
    actorName: input.actor.fullName,
    actorRole: input.actor.role,
    isDemo: false,
    createdAt: nowIso,
  };

  let updatedBooking: Booking | undefined;
  if (input.booking) {
    const summary = computeBookingPaymentSummary(input.booking, [
      adjustment,
      ...input.existingPayments,
    ]);
    updatedBooking = {
      ...input.booking,
      paymentStatus: summary.derivedStatus,
      depositAmount: summary.depositPaid,
      outstandingAmount: summary.remainingBalance,
    };
  }

  return {
    ok: true,
    payment: adjustment,
    auditLog,
    updatedBooking,
  };
}

export interface LedgerReconciliation {
  contractedBookingRevenue: number;
  confirmedGuestCollected: number;
  depositsCollected: number;
  refundsIssued: number;
  netBookingCashCollected: number;
  totalOutstandingReceivables: number;
  ownerPayoutsDisbursed: number;
  ownerShareEarned: number;
  managementCommissionEarned: number;
  unlinkedOrLegacyCollectedGap: number;
}

/**
 * Reconciles contracted booking revenue and confirmed payment transactions
 * WITHOUT double-counting bookings + payments into revenue.
 */
export function reconcileLedgerTotals(
  bookings: Booking[],
  payments: Payment[],
  chalets: Chalet[],
  todayEgypt: string = getEgyptTodayIsoDate()
): LedgerReconciliation {
  const chaletMap = new Map(chalets.map((c) => [c.id, c]));
  const activeBookings = bookings.filter((b) => b.status !== 'cancelled');

  let contractedBookingRevenue = 0;
  let ownerShareEarned = 0;
  let managementCommissionEarned = 0;
  let totalOutstandingReceivables = 0;
  let netBookingCashCollected = 0;

  for (const booking of activeBookings) {
    contractedBookingRevenue += booking.totalValue;
    const ch = chaletMap.get(booking.chaletId);
    const ownerPct = ch ? ch.ownerPct : 75;
    ownerShareEarned += (booking.totalValue * ownerPct) / 100;
    managementCommissionEarned += (booking.totalValue * (100 - ownerPct)) / 100;

    const summary = computeBookingPaymentSummary(booking, payments, todayEgypt);
    netBookingCashCollected += summary.netPaid;
    totalOutstandingReceivables += summary.remainingBalance;
  }

  const confirmedPayments = payments.filter((p) => p.status !== 'voided' && p.status !== 'pending_gateway');
  let confirmedGuestCollected = 0;
  let depositsCollected = 0;
  let refundsIssued = 0;
  let ownerPayoutsDisbursed = 0;

  for (const p of confirmedPayments) {
    if (p.paymentType === 'guest_payment') confirmedGuestCollected += p.amount;
    else if (p.paymentType === 'deposit') {
      depositsCollected += p.amount;
      confirmedGuestCollected += p.amount;
    } else if (p.paymentType === 'refund') refundsIssued += p.amount;
    else if (p.paymentType === 'owner_payout') ownerPayoutsDisbursed += p.amount;
    else if (p.paymentType === 'correction') {
      if (p.entryDirection === 'outflow') refundsIssued += p.amount;
      else confirmedGuestCollected += p.amount;
    }
  }

  return {
    contractedBookingRevenue: Math.round(contractedBookingRevenue),
    confirmedGuestCollected: Math.round(confirmedGuestCollected),
    depositsCollected: Math.round(depositsCollected),
    refundsIssued: Math.round(refundsIssued),
    netBookingCashCollected: Math.round(netBookingCashCollected),
    totalOutstandingReceivables: Math.round(totalOutstandingReceivables),
    ownerPayoutsDisbursed: Math.round(ownerPayoutsDisbursed),
    ownerShareEarned: Math.round(ownerShareEarned),
    managementCommissionEarned: Math.round(managementCommissionEarned),
    unlinkedOrLegacyCollectedGap: Math.round(
      Math.max(0, netBookingCashCollected - (confirmedGuestCollected - refundsIssued))
    ),
  };
}
