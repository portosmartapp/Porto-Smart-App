import React, { useState } from 'react';
import { Download, Printer, Plus, Trash2, X } from 'lucide-react';
import { COMPANY_BRANDING } from '../constants/branding';
import { getT } from '../i18n/translations';
import {
  addEgyptDays,
  getEgyptTodayIsoDate,
  normalizeToEgyptDateString,
} from '../utils/egyptTime';
import { getPaymentMethodLabel, reconcileLedgerTotals } from '../utils/paymentLedger';
import {
  Chalet,
  Expense,
  ExpenseCategory,
  Language,
  MutationResult,
  PlatformDataset,
} from '../types/platform';
import { CompanyLogo } from './CompanyLogo';

interface FinancialsViewProps {
  dataset: PlatformDataset;
  lang: Language;
  canManage: boolean;
  onAddExpense: (expense: Expense) => Promise<MutationResult | void> | MutationResult | void;
  onDeleteExpense?: (expenseId: string) => Promise<MutationResult | void> | MutationResult | void;
  onUpdateChaletSplit: (chaletId: string, ownerPct: number) => Promise<MutationResult | void> | MutationResult | void;
  onOpenPayments?: () => void;
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const FinancialsView: React.FC<FinancialsViewProps> = ({
  dataset,
  lang,
  canManage,
  onAddExpense,
  onDeleteExpense,
  onUpdateChaletSplit,
  onOpenPayments,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState('');

  const todayEgypt = getEgyptTodayIsoDate();
  const [expChaletId, setExpChaletId] = useState(dataset.chalets[0]?.id || '');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('maintenance');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState(500);
  const [expDate, setExpDate] = useState(todayEgypt);

  const chaletMap = new Map<string, Chalet>(dataset.chalets.map((c) => [c.id, c]));

  // Filter bookings & expenses by selected report period in Egypt local calendar dates
  const daysWindow = period === 'daily' ? 1 : period === 'weekly' ? 7 : period === 'monthly' ? 31 : 365;
  const cutoffEgyptDate = addEgyptDays(todayEgypt, -daysWindow);

  const periodBookings = dataset.bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    const checkInDate = normalizeToEgyptDateString(b.checkIn);
    return period === 'yearly' || (Boolean(checkInDate) && checkInDate >= cutoffEgyptDate);
  });

  const periodExpenses = dataset.expenses.filter((e) => {
    const expDateNorm = normalizeToEgyptDateString(e.expenseDate);
    return period === 'yearly' || (Boolean(expDateNorm) && expDateNorm >= cutoffEgyptDate);
  });

  let bookingRevenue = 0;
  let totalOwnerShare = 0;
  let totalMgmtCommission = 0;

  periodBookings.forEach((b) => {
    const ch = chaletMap.get(b.chaletId);
    const ownerPct = ch ? ch.ownerPct : 75;
    bookingRevenue += b.totalValue;
    totalOwnerShare += (b.totalValue * ownerPct) / 100;
    totalMgmtCommission += (b.totalValue * (100 - ownerPct)) / 100;
  });

  const expByCat: Record<ExpenseCategory, number> = {
    electricity: 0,
    water: 0,
    housekeeping: 0,
    maintenance: 0,
    other: 0,
  };
  periodExpenses.forEach((e) => {
    expByCat[e.category] += e.amount;
  });

  const totalExpenses = Object.values(expByCat).reduce((s, v) => s + v, 0);
  const netProfit = totalMgmtCommission - totalExpenses;

  const periodConfirmedPayments = dataset.payments.filter((p) => {
    if (p.status === 'voided' || p.status === 'pending_gateway') return false;
    const paidDate = normalizeToEgyptDateString(p.paidAt);
    return period === 'yearly' || (Boolean(paidDate) && paidDate >= cutoffEgyptDate);
  });

  const periodReconciliation = reconcileLedgerTotals(
    periodBookings,
    periodConfirmedPayments,
    dataset.chalets,
    todayEgypt
  );

  const handleExportCsv = () => {
    const rows = [
      ['Company', 'Type', 'Chalet', 'Date', 'Category / Source', 'Amount (EGP)', 'Owner Share', 'Mgmt Share'],
      ...periodBookings.map((b) => {
        const ch = chaletMap.get(b.chaletId);
        const op = ch?.ownerPct ?? 75;
        return [
          COMPANY_BRANDING.companyName,
          'Booking',
          ch?.chaletNumber || '',
          b.checkIn,
          b.bookingSource,
          String(b.totalValue),
          String(Math.round((b.totalValue * op) / 100)),
          String(Math.round((b.totalValue * (100 - op)) / 100)),
        ];
      }),
      ...periodExpenses.map((e) => [
        COMPANY_BRANDING.companyName,
        'Expense',
        chaletMap.get(e.chaletId)?.chaletNumber || '',
        e.expenseDate,
        e.category,
        String(-e.amount),
        '0',
        String(-e.amount),
      ]),
    ];

    const csv = '\uFEFF' + rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `free-rent-tours-porto-sokhna-financial-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingExpense) return;
    setExpenseError('');
    setSavingExpense(true);
    try {
      const res = await onAddExpense({
        id: `exp-${Date.now()}`,
        chaletId: expChaletId || dataset.chalets[0]?.id || '',
        category: expCategory,
        description: expDesc,
        descriptionAr: expDesc,
        amount: expAmount,
        expenseDate: expDate,
        isDemo: false,
      });
      if (res && !res.ok) {
        setExpenseError(res.error || (isAr ? 'تعذر حفظ المصروف.' : 'Failed to save expense.'));
        return;
      }
      setExpDesc('');
      setShowExpenseModal(false);
    } finally {
      setSavingExpense(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Official Branded Print / PDF Letterhead */}
      <div className="hidden print:flex items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div className="flex items-center gap-3">
          <CompanyLogo size="print" />
          <div>
            <div className="text-sm font-bold text-slate-900">
              {COMPANY_BRANDING.companyName}
            </div>
            <div className="text-base font-bold text-cyan-900">{t.brandFull}</div>
            <div className="text-xs text-slate-600">{t.brandSubtitle}</div>
          </div>
        </div>
        <div className="text-end text-xs text-slate-600">
          <div className="font-semibold text-slate-900">
            {isAr ? 'التقرير المالي' : 'Financial Statement'} ({period.toUpperCase()})
          </div>
          <div className="font-mono-num">{todayEgypt}</div>
          <div>
            {t.ceoLabel}: {COMPANY_BRANDING.ceoName}
          </div>
        </div>
      </div>

      {/* Period & Export Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(
            [
              { id: 'daily', ar: 'يومي', en: 'Daily' },
              { id: 'weekly', ar: 'أسبوعي', en: 'Weekly' },
              { id: 'monthly', ar: 'شهري', en: 'Monthly' },
              { id: 'yearly', ar: 'سنوي', en: 'Yearly' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                period === p.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? p.ar : p.en}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.actions.exportCsv}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 cursor-pointer no-print"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.actions.printPdf}</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setExpenseError('');
                if (!expChaletId && dataset.chalets[0]?.id) {
                  setExpChaletId(dataset.chalets[0].id);
                }
                setShowExpenseModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer no-print"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.actions.addExpense}</span>
            </button>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 print:grid-cols-5 print-avoid-break">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إيرادات الحجوزات' : 'Booking Revenue'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-slate-900">
            {Math.round(bookingRevenue).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'حصة الملاك' : 'Owner Share'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-cyan-800">
            {Math.round(totalOwnerShare).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'عمولة شركة الإدارة' : 'Mgmt Commission'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-amber-700">
            {Math.round(totalMgmtCommission).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إجمالي المصروفات' : 'Total Expenses'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-red-700">
            {Math.round(totalExpenses).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-4">
          <div className="text-xs text-slate-300">{isAr ? 'صافي الربح التشغيلي' : 'Net Operating Profit'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num">
            {Math.round(netProfit).toLocaleString()} {t.currency}
          </div>
        </div>
      </div>

      {/* Synchronized Payment Collections Reconciliation (Zero Double-Counting) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isAr
                ? 'مزامنة سجل التحصيل النقدي والبنكي (بدون تكرار للإيراد)'
                : 'Synchronized Payment Ledger Reconciliation (No Double-Counting)'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'مقارنة قيمة الحجوزات التعاقدية مع صافي المدفوعات المؤكدة والدفعات المتبقية خلال الفترة المحددة.'
                : 'Reconciles contracted booking value against confirmed payment collections, refunds, and remaining balances.'}
            </p>
          </div>
          {onOpenPayments && (
            <button
              type="button"
              onClick={onOpenPayments}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-cyan-800 text-cyan-800 hover:bg-cyan-50 cursor-pointer self-start no-print"
            >
              {isAr ? 'إدارة المدفوعات والإيصالات' : 'Manage Payments & Receipts'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">{isAr ? 'صافي المحصل من النزلاء' : 'Net Collected (Guests)'}</div>
            <div className="mt-1 font-mono-num font-bold text-emerald-700 text-sm">
              {periodReconciliation.netBookingCashCollected.toLocaleString()} {t.currency}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">{isAr ? 'التأمينات المستلمة' : 'Deposits Recorded'}</div>
            <div className="mt-1 font-mono-num font-bold text-cyan-800 text-sm">
              {periodReconciliation.depositsCollected.toLocaleString()} {t.currency}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">{isAr ? 'المتبقي قيد التحصيل' : 'Remaining Receivable'}</div>
            <div className="mt-1 font-mono-num font-bold text-amber-700 text-sm">
              {periodReconciliation.totalOutstandingReceivables.toLocaleString()} {t.currency}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500">{isAr ? 'الاستردادات / صرف الملاك' : 'Refunds / Payouts'}</div>
            <div className="mt-1 font-mono-num font-bold text-slate-900 text-sm">
              -{periodReconciliation.refundsIssued.toLocaleString()} / {periodReconciliation.ownerPayoutsDisbursed.toLocaleString()} {t.currency}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto print-expand">
          {periodConfirmedPayments.slice(0, 10).map((p) => (
            <div key={p.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <span className="font-mono-num font-semibold text-slate-900">
                  {p.receiptNumber || p.referenceNo}
                </span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-slate-700">{getPaymentMethodLabel(p.paymentMethod, lang)}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-slate-500">{normalizeToEgyptDateString(p.paidAt)}</span>
              </div>
              <span
                className={`font-mono-num font-bold ${
                  p.paymentType === 'refund' || p.paymentType === 'owner_payout'
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {p.paymentType === 'refund' || p.paymentType === 'owner_payout' ? '-' : '+'}
                {p.amount.toLocaleString()} {t.currency}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Expense Breakdown & Per-Chalet Commission Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'سجل المصروفات التشغيلية' : 'Expenses Ledger'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pb-3 border-b border-slate-100">
            {(Object.keys(expByCat) as ExpenseCategory[]).map((cat) => (
              <div key={cat} className="p-2.5 rounded-lg bg-slate-50">
                <div className="text-slate-500">{t.expenseCategories[cat]}</div>
                <div className="font-mono-num font-bold text-slate-900 mt-0.5">
                  {expByCat[cat].toLocaleString()} {t.currency}
                </div>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-72 overflow-y-auto print-expand">
            {periodExpenses.map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {chaletMap.get(e.chaletId)?.chaletNumber} · {isAr ? e.descriptionAr : e.description}
                  </div>
                  <div className="text-slate-500">
                    {t.expenseCategories[e.category]} · {e.expenseDate}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-num font-bold text-red-700 whitespace-nowrap">
                    -{e.amount.toLocaleString()} {t.currency}
                  </span>
                  {canManage && onDeleteExpense && (
                    <button
                      type="button"
                      title={t.actions.delete}
                      onClick={() => void onDeleteExpense(e.id)}
                      className="p-1 rounded border border-slate-200 hover:bg-red-50 text-red-700 cursor-pointer no-print"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'نسب توزيع الإيرادات لكل شاليه' : 'Per-Chalet Revenue Split'}
            </h3>
            <span className="text-xs text-slate-500">
              {isAr ? 'المالك / الإدارة' : 'Owner / Mgmt'}
            </span>
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto print-expand">
            {dataset.chalets.map((ch) => (
              <div key={ch.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono-num font-semibold text-slate-900">
                    {ch.chaletNumber}
                  </span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="text-slate-600">{isAr ? ch.viewTypeAr : ch.viewType}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={ch.ownerPct}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          onUpdateChaletSplit(ch.id, val);
                        }}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-mono-num print:hidden"
                      />
                      <span className="hidden print:inline font-mono-num font-semibold">
                        {ch.ownerPct}%
                      </span>
                    </>
                  ) : (
                    <span className="font-mono-num font-semibold">{ch.ownerPct}%</span>
                  )}
                  <span className="text-slate-500 font-mono-num">
                    / {100 - ch.ownerPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Print Footer */}
      <div className="hidden print:flex items-center justify-between pt-3 border-t border-slate-300 text-[11px] text-slate-500">
        <span>
          {COMPANY_BRANDING.companyName} — {t.brandFull}
        </span>
        <span className="font-mono-num">{todayEgypt}</span>
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={handleSubmitExpense}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addExpense}</h3>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الشاليه' : 'Chalet'}
                </label>
                <select
                  value={expChaletId}
                  onChange={(e) => setExpChaletId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {dataset.chalets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chaletNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الفئة' : 'Category'}
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(Object.keys(t.expenseCategories) as ExpenseCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {t.expenseCategories[cat]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الوصف' : 'Description'}
                </label>
                <input
                  required
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'المبلغ' : 'Amount'} ({t.currency})
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'التاريخ' : 'Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>
            </div>
            {expenseError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {expenseError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingExpense}
                onClick={() => setShowExpenseModal(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingExpense}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {savingExpense ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
