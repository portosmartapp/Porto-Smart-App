import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileDown,
  History,
  Lock,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { COMPANY_BRANDING } from '../constants/branding';
import { getT } from '../i18n/translations';
import {
  Booking,
  Chalet,
  Language,
  MutationResult,
  Owner,
  Payment,
  PaymentAuditLog,
  PaymentMethod,
  PlatformDataset,
  PlatformUser,
} from '../types/platform';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from '../utils/egyptTime';
import { exportPaymentReceiptPdf } from '../utils/exportPaymentReceiptPdf';
import {
  BookingPaymentSummary,
  PAYMENT_GATEWAY_READINESS,
  SUPPORTED_PAYMENT_METHODS,
  computeBookingPaymentSummary,
  getPaymentMethodLabel,
  reconcileLedgerTotals,
} from '../utils/paymentLedger';

interface PaymentsViewProps {
  dataset: PlatformDataset;
  lang: Language;
  currentUser: PlatformUser;
  dataSource: 'demo' | 'supabase';
  canRecordPayments: boolean;
  canIssueRefunds: boolean;
  onRecordPayment: (payload: {
    booking?: Booking | null;
    chalet?: Chalet | null;
    ownerId?: string | null;
    paymentType: 'guest_payment' | 'deposit' | 'owner_payout';
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNo: string;
    notes: string;
    paymentDueDate?: string;
  }) => Promise<MutationResult> | MutationResult;
  onIssueAdjustment: (payload: {
    booking?: Booking | null;
    targetPayment: Payment;
    mode: 'refund' | 'correction';
    correctionDirection?: 'inflow' | 'outflow';
    amount: number;
    paymentMethod: PaymentMethod;
    reason: string;
  }) => Promise<MutationResult> | MutationResult;
}

type PaymentSubTab = 'bookings' | 'transactions' | 'audit' | 'gateway';

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  dataset,
  lang,
  currentUser,
  dataSource,
  canRecordPayments,
  canIssueRefunds,
  onRecordPayment,
  onIssueAdjustment,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const todayEgypt = getEgyptTodayIsoDate();

  const [subTab, setSubTab] = useState<PaymentSubTab>('bookings');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partial' | 'paid' | 'overdue' | 'refunded'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'demo' | 'live'>('all');

  // Record Payment Modal State
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [payTargetType, setPayTargetType] = useState<'guest_payment' | 'deposit' | 'owner_payout'>('guest_payment');
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number>(1000);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDueDate, setPayDueDate] = useState('');
  const [modalError, setModalError] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string>('');

  // Refund / Correction Modal State
  const [adjustTarget, setAdjustTarget] = useState<Payment | null>(null);
  const [adjustMode, setAdjustMode] = useState<'refund' | 'correction'>('refund');
  const [correctionDir, setCorrectionDir] = useState<'inflow' | 'outflow'>('outflow');
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustMethod, setAdjustMethod] = useState<PaymentMethod>('cash');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const chaletMap = useMemo(
    () => new Map<string, Chalet>(dataset.chalets.map((c) => [c.id, c])),
    [dataset.chalets]
  );
  const bookingMap = useMemo(
    () => new Map<string, Booking>(dataset.bookings.map((b) => [b.id, b])),
    [dataset.bookings]
  );
  const ownerMap = useMemo(
    () => new Map<string, Owner>(dataset.owners.map((o) => [o.id, o])),
    [dataset.owners]
  );

  const ledgerTotals = useMemo(
    () => reconcileLedgerTotals(dataset.bookings, dataset.payments, dataset.chalets, todayEgypt),
    [dataset.bookings, dataset.payments, dataset.chalets, todayEgypt]
  );

  const bookingSummaries = useMemo(() => {
    const map = new Map<string, BookingPaymentSummary>();
    for (const b of dataset.bookings) {
      map.set(b.id, computeBookingPaymentSummary(b, dataset.payments, todayEgypt));
    }
    return map;
  }, [dataset.bookings, dataset.payments, todayEgypt]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dataset.bookings
      .filter((b) => b.status !== 'cancelled' || (bookingSummaries.get(b.id)?.refundsTotal ?? 0) > 0)
      .filter((b) => {
        if (sourceFilter === 'demo' && !b.isDemo) return false;
        if (sourceFilter === 'live' && b.isDemo) return false;
        const summary = bookingSummaries.get(b.id);
        if (!summary) return false;
        if (statusFilter === 'overdue' && !summary.isOverdue) return false;
        if (
          statusFilter !== 'all' &&
          statusFilter !== 'overdue' &&
          summary.derivedStatus !== statusFilter
        ) {
          return false;
        }
        if (!q) return true;
        const ch = chaletMap.get(b.chaletId);
        return (
          b.bookingCode.toLowerCase().includes(q) ||
          b.guestName.toLowerCase().includes(q) ||
          (ch?.chaletNumber.toLowerCase().includes(q) ?? false)
        );
      });
  }, [dataset.bookings, bookingSummaries, search, statusFilter, sourceFilter, chaletMap]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...dataset.payments]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .filter((p) => {
        if (sourceFilter === 'demo' && !p.isDemo) return false;
        if (sourceFilter === 'live' && p.isDemo) return false;
        if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) return false;
        if (!q) return true;
        const bk = p.bookingId ? bookingMap.get(p.bookingId) : undefined;
        const ch = bk ? chaletMap.get(bk.chaletId) : undefined;
        const own = p.ownerId ? ownerMap.get(p.ownerId) : undefined;
        return (
          (p.receiptNumber?.toLowerCase().includes(q) ?? false) ||
          p.referenceNo.toLowerCase().includes(q) ||
          (bk?.bookingCode.toLowerCase().includes(q) ?? false) ||
          (bk?.guestName.toLowerCase().includes(q) ?? false) ||
          (ch?.chaletNumber.toLowerCase().includes(q) ?? false) ||
          (own?.fullName.toLowerCase().includes(q) ?? false) ||
          (own?.fullNameAr.toLowerCase().includes(q) ?? false)
        );
      });
  }, [dataset.payments, sourceFilter, methodFilter, search, bookingMap, chaletMap, ownerMap]);

  const filteredAuditLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...dataset.paymentAuditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((a) => {
        if (sourceFilter === 'demo' && !a.isDemo) return false;
        if (sourceFilter === 'live' && a.isDemo) return false;
        if (!q) return true;
        const bk = a.bookingId ? bookingMap.get(a.bookingId) : undefined;
        return (
          a.actorName.toLowerCase().includes(q) ||
          a.reason.toLowerCase().includes(q) ||
          (bk?.bookingCode.toLowerCase().includes(q) ?? false)
        );
      });
  }, [dataset.paymentAuditLogs, sourceFilter, search, bookingMap]);

  const overdueCount = useMemo(
    () => Array.from(bookingSummaries.values()).filter((s) => s.isOverdue).length,
    [bookingSummaries]
  );

  const openRecordModalForBooking = (booking?: Booking) => {
    setModalError('');
    if (booking) {
      const summary = bookingSummaries.get(booking.id);
      setPayTargetType('guest_payment');
      setSelectedBookingId(booking.id);
      setPayAmount(Math.max(100, summary?.remainingBalance || booking.totalValue));
      setPayDueDate(summary?.paymentDueDate || booking.checkIn);
    } else {
      const firstActive = dataset.bookings.find((b) => b.status !== 'cancelled');
      setPayTargetType('guest_payment');
      setSelectedBookingId(firstActive?.id || '');
      setSelectedOwnerId(dataset.owners[0]?.id || '');
      setPayAmount(1000);
      setPayDueDate(firstActive?.paymentDueDate || todayEgypt);
    }
    setPayMethod('cash');
    setPayReference('');
    setPayNotes('');
    setShowRecordModal(true);
  };

  const handleSubmitRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPayment) return;
    setModalError('');

    const bk = payTargetType === 'owner_payout' ? null : bookingMap.get(selectedBookingId) || null;
    const ch = bk ? chaletMap.get(bk.chaletId) || null : null;
    const ownerId = payTargetType === 'owner_payout' ? selectedOwnerId : ch?.ownerId || null;

    if (payTargetType !== 'owner_payout' && !bk) {
      setModalError(isAr ? 'يرجى اختيار الحجز أولاً.' : 'Please select a booking.');
      return;
    }

    setSavingPayment(true);
    try {
      const res = await onRecordPayment({
        booking: bk,
        chalet: ch,
        ownerId,
        paymentType: payTargetType,
        amount: payAmount,
        paymentMethod: payMethod,
        referenceNo: payReference,
        notes: payNotes,
        paymentDueDate: payDueDate || undefined,
      });

      if (!res.ok) {
        setModalError(res.error || (isAr ? 'تعذر تسجيل الدفعة.' : 'Unable to record payment.'));
        return;
      }

      setShowRecordModal(false);
      setFeedbackBanner(
        isAr
          ? 'تم تسجيل المعاملة المالية وتحديث رصيد الحجز ومزامنة السجل المالي بنجاح.'
          : 'Payment recorded, booking balance updated, and financial ledger synced cleanly.'
      );
    } finally {
      setSavingPayment(false);
    }
  };

  const openAdjustModal = (payment: Payment, mode: 'refund' | 'correction') => {
    setAdjustTarget(payment);
    setAdjustMode(mode);
    setCorrectionDir('outflow');
    setAdjustAmount(payment.amount);
    setAdjustMethod((payment.paymentMethod as PaymentMethod) || 'cash');
    setAdjustReason('');
    setAdjustError('');
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget || savingAdjust) return;
    setAdjustError('');
    setSavingAdjust(true);
    try {
      const bk = adjustTarget.bookingId ? bookingMap.get(adjustTarget.bookingId) || null : null;
      const res = await onIssueAdjustment({
        booking: bk,
        targetPayment: adjustTarget,
        mode: adjustMode,
        correctionDirection: correctionDir,
        amount: adjustAmount,
        paymentMethod: adjustMethod,
        reason: adjustReason,
      });
      if (!res.ok) {
        setAdjustError(res.error || (isAr ? 'تعذر حفظ التسوية.' : 'Unable to save adjustment.'));
        return;
      }
      setAdjustTarget(null);
      setFeedbackBanner(
        isAr
          ? 'تم تسجيل عملية الاسترداد/التصحيح في سجل التدقيق وإعادة احتساب رصيد الحجز.'
          : 'Refund/correction logged in audit trail and booking balance recalculated.'
      );
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleDownloadReceipt = async (payment: Payment) => {
    const bk = payment.bookingId ? bookingMap.get(payment.bookingId) || null : null;
    const ch = bk ? chaletMap.get(bk.chaletId) || null : null;
    const owner =
      (payment.ownerId ? ownerMap.get(payment.ownerId) : undefined) ||
      (ch ? ownerMap.get(ch.ownerId) : undefined) ||
      null;
    const summary = bk ? bookingSummaries.get(bk.id) || null : null;
    await exportPaymentReceiptPdf({
      payment,
      booking: bk,
      chalet: ch,
      owner,
      summary,
      lang,
    });
  };

  const hasDemoPayments = dataset.payments.some((p) => p.isDemo);
  const hasLivePayments = dataset.payments.some((p) => !p.isDemo);

  return (
    <div className="space-y-6">
      {/* Header & Data Source Clarity */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {isAr
                ? 'تحصيل المدفوعات وإيصالات الدفع والتسويات'
                : 'Payment Collection, Receipts & Ledger Sync'}
            </h2>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
                dataSource === 'supabase' && !hasDemoPayments
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {dataSource === 'supabase' && hasLivePayments
                ? isAr
                  ? 'بيانات فعلية + تجريبية'
                  : 'LIVE + DEMO RECORDS'
                : isAr
                ? 'وضع العرض التجريبي (DEMO DATA)'
                : 'DEMO DATA MODE'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {isAr
              ? `${COMPANY_BRANDING.companyName} — تسجيل المدفوعات المتعددة، تتبع المتبقي، الاسترداد مع سجل التدقيق، وإصدار إيصالات PDF الرسمية (توقيت القاهرة).`
              : `${COMPANY_BRANDING.companyName} — Multi-payment tracking, balances, audited refunds/corrections, and branded PDF receipts (Africa/Cairo).`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('gateway')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {isAr ? 'بوابة الدفع الأونلاين: المرحلة 2 (غير مفعلة)' : 'Online Gateway: Phase 2 (Dormant)'}
            </span>
          </button>
          {canRecordPayments && (
            <button
              type="button"
              onClick={() => openRecordModalForBooking()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل دفعة جديدة' : 'Record Payment'}</span>
            </button>
          )}
        </div>
      </div>

      {feedbackBanner && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner('')}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'إجمالي قيمة الحجوزات النشطة' : 'Contracted Booking Value'}
          </div>
          <div className="mt-2 text-xl font-bold font-mono-num text-slate-900">
            {ledgerTotals.contractedBookingRevenue.toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'صافي المحصل الفعلي' : 'Net Collected (Bookings)'}
          </div>
          <div className="mt-2 text-xl font-bold font-mono-num text-emerald-700">
            {ledgerTotals.netBookingCashCollected.toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'التأمينات والدفعات المقدمة' : 'Deposits Held'}
          </div>
          <div className="mt-2 text-xl font-bold font-mono-num text-cyan-800">
            {ledgerTotals.depositsCollected.toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>{isAr ? 'الأرصدة المتبقية للتحصيل' : 'Remaining Receivables'}</span>
            {overdueCount > 0 && (
              <span className="font-mono-num text-[11px] font-bold text-red-700">
                {overdueCount} {isAr ? 'متأخر' : 'overdue'}
              </span>
            )}
          </div>
          <div className="mt-2 text-xl font-bold font-mono-num text-amber-700">
            {ledgerTotals.totalOutstandingReceivables.toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'الاستردادات والتسويات / صرف الملاك' : 'Refunds / Owner Payouts'}
          </div>
          <div className="mt-2 text-base font-bold font-mono-num text-slate-900">
            <span className="text-red-700">-{ledgerTotals.refundsIssued.toLocaleString()}</span>
            <span className="text-slate-300 mx-1.5">/</span>
            <span className="text-cyan-800">{ledgerTotals.ownerPayoutsDisbursed.toLocaleString()}</span>{' '}
            <span className="text-xs font-normal text-slate-500">{t.currency}</span>
          </div>
        </div>
      </div>

      {/* Sub-navigation & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'bookings', ar: 'أرصدة الحجوزات', en: 'Booking Balances', icon: Wallet },
                { id: 'transactions', ar: 'سجل المعاملات والإيصالات', en: 'Transactions & Receipts', icon: CreditCard },
                { id: 'audit', ar: 'سجل التدقيق والاسترداد', en: 'Audit Trail', icon: History },
                { id: 'gateway', ar: 'جاهزية الدفع الأونلاين', en: 'Phase 2 Gateway', icon: ShieldCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    subTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isAr ? tab.ar : tab.en}</span>
                </button>
              );
            })}
          </div>

          {subTab !== 'gateway' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isAr ? 'بحث بالكود، النزيل، الشاليه، الإيصال...' : 'Search code, guest, chalet, receipt...'}
                  className="ps-8 pe-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56"
                />
              </div>

              {subTab === 'bookings' && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">{isAr ? 'كل الحالات' : 'All Payment States'}</option>
                  <option value="pending">{t.status.pending}</option>
                  <option value="partial">{t.status.partial}</option>
                  <option value="paid">{t.status.paid}</option>
                  <option value="overdue">{isAr ? 'متأخر السداد' : 'Overdue'}</option>
                  <option value="refunded">{t.status.refunded}</option>
                </select>
              )}

              {subTab === 'transactions' && (
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">{isAr ? 'كل طرق الدفع' : 'All Methods'}</option>
                  {SUPPORTED_PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isAr ? m.labelAr : m.labelEn}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">{isAr ? 'الكل (فعلي + تجريبي)' : 'All (Live + Demo)'}</option>
                <option value="live">{isAr ? 'سجلات فعلية فقط' : 'Live Only'}</option>
                <option value="demo">{isAr ? 'سجلات تجريبية فقط' : 'Demo Only'}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: BOOKING BALANCES */}
      {subTab === 'bookings' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحجز والشاليه' : 'Booking / Chalet'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'النزيل' : 'Guest'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'استحقاق السداد' : 'Due Date'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'القيمة الإجمالية' : 'Total Value'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التأمين' : 'Deposit'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'المدفوع الصافي' : 'Net Paid'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'المتبقي' : 'Remaining'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map((b) => {
                  const ch = chaletMap.get(b.chaletId);
                  const summary = bookingSummaries.get(b.id)!;
                  const statusTone =
                    summary.derivedStatus === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : summary.derivedStatus === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : summary.derivedStatus === 'refunded'
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-red-50 text-red-800 border-red-200';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono-num font-bold text-slate-900">
                          {b.bookingCode} · {ch?.chaletNumber || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {b.checkIn} → {b.checkOut} ·{' '}
                          <span className={b.isDemo ? 'text-amber-700' : 'text-emerald-700'}>
                            {b.isDemo ? 'DEMO' : 'LIVE'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{b.guestName}</td>
                      <td className="py-3 px-4 font-mono-num">
                        <span className={summary.isOverdue ? 'text-red-700 font-bold' : 'text-slate-700'}>
                          {summary.paymentDueDate}
                        </span>
                        {summary.isOverdue && (
                          <div className="text-[10px] font-semibold text-red-600">
                            {isAr ? 'متأخر السداد' : 'Overdue'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                        {summary.totalValue.toLocaleString()} {t.currency}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-cyan-800">
                        {summary.depositPaid.toLocaleString()} {t.currency}
                      </td>
                      <td className="py-3 px-4 font-mono-num font-semibold text-emerald-700">
                        {summary.netPaid.toLocaleString()} {t.currency}
                        {summary.transactionCount > 0 && (
                          <span className="block text-[10px] font-normal text-slate-500">
                            {summary.transactionCount} {isAr ? 'معاملة' : 'tx(s)'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-num font-bold text-amber-700">
                        {summary.remainingBalance.toLocaleString()} {t.currency}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded border ${statusTone}`}>
                          {t.status[summary.derivedStatus]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          {canRecordPayments && (
                            <button
                              type="button"
                              onClick={() => openRecordModalForBooking(b)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
                            >
                              {isAr ? 'تحصيل' : 'Collect'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSearch(b.bookingCode);
                              setSubTab('transactions');
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                          >
                            {isAr ? 'المعاملات' : 'Txs'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredBookings.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      {isAr ? 'لا توجد حجوزات مطابقة للفلاتر المحددة.' : 'No bookings match the selected filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTIONS & RECEIPTS */}
      {subTab === 'transactions' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'رقم الإيصال / المرجع' : 'Receipt / Ref'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحجز / المالك' : 'Booking / Owner'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الطريقة' : 'Method'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'الإيصال والتدقيق' : 'Receipt & Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((p) => {
                  const bk = p.bookingId ? bookingMap.get(p.bookingId) : undefined;
                  const ch = bk ? chaletMap.get(bk.chaletId) : undefined;
                  const own = p.ownerId ? ownerMap.get(p.ownerId) : undefined;
                  const isOutflow = p.paymentType === 'refund' || p.paymentType === 'owner_payout' || p.entryDirection === 'outflow';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono-num font-bold text-slate-900">
                          {p.receiptNumber || p.id.toUpperCase()}
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500">
                          {p.referenceNo || '-'} ·{' '}
                          <span className={p.isDemo ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                            {p.isDemo ? 'DEMO DATA' : 'LIVE DATA'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {bk ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {bk.bookingCode} ({ch?.chaletNumber || ''})
                            </div>
                            <div className="text-[11px] text-slate-500">{bk.guestName}</div>
                          </div>
                        ) : own ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {isAr ? own.fullNameAr : own.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500">{isAr ? 'تسوية مالك' : 'Owner Settlement'}</div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{p.paymentType}</span>
                        {p.correctionReason && (
                          <div className="text-[11px] text-slate-500 max-w-xs truncate">
                            {p.correctionReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {getPaymentMethodLabel(p.paymentMethod, lang)}
                      </td>
                      <td className={`py-3 px-4 font-mono-num font-bold ${isOutflow ? 'text-red-700' : 'text-emerald-700'}`}>
                        {isOutflow ? '-' : '+'}
                        {p.amount.toLocaleString()} {t.currency}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-600">
                        {normalizeToEgyptDateString(p.paidAt) || p.paidAt.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDownloadReceipt(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5 text-cyan-800" />
                            <span>{isAr ? 'إيصال PDF' : 'PDF Receipt'}</span>
                          </button>
                          {canIssueRefunds &&
                            (p.paymentType === 'guest_payment' || p.paymentType === 'deposit') && (
                              <button
                                type="button"
                                onClick={() => openAdjustModal(p, 'refund')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{isAr ? 'استرداد / تعديل' : 'Refund / Adjust'}</span>
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {subTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filteredAuditLogs.map((log: PaymentAuditLog) => {
            const bk = log.bookingId ? bookingMap.get(log.bookingId) : undefined;
            return (
              <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{log.action}</span>
                    {bk && (
                      <span className="font-mono-num text-cyan-800 font-semibold">
                        {bk.bookingCode}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold ${log.isDemo ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {log.isDemo ? 'DEMO' : 'LIVE'}
                    </span>
                  </div>
                  <div className="text-slate-600">{log.reason}</div>
                  <div className="text-[11px] text-slate-500">
                    {isAr ? 'بواسطة:' : 'Actor:'} {log.actorName} ({t.roles[log.actorRole]})
                  </div>
                </div>
                <div className="text-end font-mono-num">
                  <div className="font-bold text-slate-900">
                    {log.previousAmount.toLocaleString()} → {log.newAmount.toLocaleString()} {t.currency}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {normalizeToEgyptDateString(log.createdAt) || log.createdAt.slice(0, 10)}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredAuditLogs.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              {isAr ? 'لا توجد سجلات تدقيق مطابقة.' : 'No matching audit history entries.'}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PHASE 2 ONLINE PAYMENT GATEWAY READINESS (DORMANT) */}
      {subTab === 'gateway' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">
                {isAr
                  ? 'بوابة الدفع الإلكتروني الأونلاين غير مفعلة حالياً (المرحلة الثانية)'
                  : 'Online Payment Gateway Integration — Prepared for Phase 2 (NOT ACTIVATED)'}
              </div>
              <p>
                {isAr
                  ? 'بناءً على القرار المعتمد، تم تفعيل التحصيل والتسجيل اليدوي وإيصالات PDF الآن، بينما تظل بوابات الدفع الأونلاين غير مفعلة حتى يتم اعتماد التعاقد التجاري وإضافة المفاتيح السرية على الخادم.'
                  : 'Per approved architecture decisions, manual payment collection and PDF receipts are live now while online gateway checkout remains disabled until merchant onboarding and server-side webhook keys are configured.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PAYMENT_GATEWAY_READINESS.preparedProviders.map((prov) => (
              <div key={prov.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{prov.name}</span>
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-xs text-slate-600">
                  {isAr
                    ? `بطاقات مصرية / ميزة: ${prov.supportsEgyptCards ? 'مدعوم' : 'لا'} · محافظ/فوري: ${prov.supportsWalletOrKiosk ? 'مدعوم' : 'لا'}`
                    : `Egypt Cards/Meeza: ${prov.supportsEgyptCards ? 'Yes' : 'No'} · Wallet/Kiosk: ${prov.supportsWalletOrKiosk ? 'Yes' : 'No'}`}
                </div>
                <div className="text-[11px] font-semibold text-amber-800">
                  {isAr ? 'الحالة: جاهز هيكلياً — معطل (المرحلة 2)' : 'Status: Prepared — Disabled (Phase 2)'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRecordPayment}
            className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'تسجيل معاملة دفع جديدة' : 'Record New Payment Transaction'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRecordModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 font-medium">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'نوع المعاملة' : 'Transaction Type'}
                </label>
                <select
                  value={payTargetType}
                  onChange={(e) => setPayTargetType(e.target.value as typeof payTargetType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="guest_payment">{isAr ? 'دفعة حجز نزيل' : 'Guest Booking Payment'}</option>
                  <option value="deposit">{isAr ? 'دفعة مقدم / تأمين' : 'Security Deposit'}</option>
                  {(currentUser.role === 'super_admin' || currentUser.role === 'manager') && (
                    <option value="owner_payout">{isAr ? 'صرف مستحقات مالك' : 'Owner Settlement Payout'}</option>
                  )}
                </select>
              </div>

              {payTargetType === 'owner_payout' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'المالك المستفيد' : 'Owner'}
                  </label>
                  <select
                    value={selectedOwnerId}
                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {dataset.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {isAr ? o.fullNameAr : o.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الحجز المرتبط' : 'Linked Booking'}
                  </label>
                  <select
                    value={selectedBookingId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedBookingId(id);
                      const sum = bookingSummaries.get(id);
                      if (sum) {
                        setPayAmount(Math.max(100, sum.remainingBalance || sum.totalValue));
                        setPayDueDate(sum.paymentDueDate);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {dataset.bookings
                      .filter((b) => b.status !== 'cancelled')
                      .map((b) => {
                        const ch = chaletMap.get(b.chaletId);
                        const sum = bookingSummaries.get(b.id);
                        return (
                          <option key={b.id} value={b.id}>
                            {b.bookingCode} · {ch?.chaletNumber || ''} · {b.guestName} ({isAr ? 'متبقي' : 'Bal'}: {sum?.remainingBalance.toLocaleString()} {t.currency})
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'طريقة الدفع' : 'Payment Method'}
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {SUPPORTED_PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {isAr ? m.labelAr : m.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? `المبلغ (${t.currency})` : `Amount (${t.currency})`}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'رقم المرجع / التحويل' : 'Reference No.'}
                  </label>
                  <input
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder={isAr ? 'مثال: IP-449012' : 'e.g. IP-449012'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                {payTargetType !== 'owner_payout' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'تاريخ استحقاق المتبقي' : 'Payment Due Date'}
                    </label>
                    <input
                      type="date"
                      value={payDueDate}
                      onChange={(e) => setPayDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => setShowRecordModal(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingPayment}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer disabled:opacity-60"
              >
                {savingPayment
                  ? isAr
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'حفظ ومزامنة الدفعة'
                  : 'Save & Sync Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* REFUND / CORRECTION MODAL */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitAdjustment}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'استرداد مبلغ أو تعديل محاسبي' : 'Issue Refund or Correction'}
              </h3>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              {adjustError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 font-medium">
                  {adjustError}
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">{isAr ? 'المعاملة الأصلية:' : 'Original Transaction:'}</div>
                <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                  {adjustTarget.receiptNumber || adjustTarget.referenceNo} · {adjustTarget.amount.toLocaleString()} {t.currency}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الإجراء' : 'Action Type'}
                  </label>
                  <select
                    value={adjustMode}
                    onChange={(e) => setAdjustMode(e.target.value as 'refund' | 'correction')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="refund">{isAr ? 'استرداد للنزيل' : 'Refund'}</option>
                    <option value="correction">{isAr ? 'تصحيح محاسبي' : 'Accounting Correction'}</option>
                  </select>
                </div>

                {adjustMode === 'correction' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'اتجاه التصحيح' : 'Direction'}
                    </label>
                    <select
                      value={correctionDir}
                      onChange={(e) => setCorrectionDir(e.target.value as 'inflow' | 'outflow')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="outflow">{isAr ? 'خصم / تخفيض' : 'Decrease Collected'}</option>
                      <option value="inflow">{isAr ? 'إضافة / زيادة' : 'Increase Collected'}</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? `المبلغ (${t.currency})` : `Amount (${t.currency})`}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'طريقة التسوية' : 'Method'}
                  </label>
                  <select
                    value={adjustMethod}
                    onChange={(e) => setAdjustMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {SUPPORTED_PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {isAr ? m.labelAr : m.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'سبب الاسترداد / التصحيح (إلزامي للتدقيق)' : 'Audit Reason (Required)'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingAdjust}
                onClick={() => setAdjustTarget(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingAdjust}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white cursor-pointer disabled:opacity-60"
              >
                {savingAdjust
                  ? isAr
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'تأكيد التسوية والتدقيق'
                  : 'Confirm & Log Audit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
