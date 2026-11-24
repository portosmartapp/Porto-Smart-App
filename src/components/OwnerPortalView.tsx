import React, { useState } from 'react';
import { ShieldCheck, Plus, X, Building2, Wallet, FileDown, Mail } from 'lucide-react';
import { getT } from '../i18n/translations';
import {
  buildOwnerWeeklySummary,
  generateOwnerWeeklySummaryPdf,
  WeeklyEmailTask,
} from '../services/reportEngine';
import { Language, MutationResult, Owner, PlatformDataset, PlatformUser } from '../types/platform';

interface OwnerPortalViewProps {
  dataset: PlatformDataset; // Already scoped when logged in as Owner
  currentUser: PlatformUser;
  lang: Language;
  mode: 'portal' | 'directory';
  onAddOwner?: (owner: Owner) => Promise<MutationResult | void> | MutationResult | void;
  onScheduleWeeklyEmail?: (ownerId: string) => WeeklyEmailTask;
  onNavigate?: (tab: string) => void;
}

export const OwnerPortalView: React.FC<OwnerPortalViewProps> = ({
  dataset,
  currentUser,
  lang,
  mode,
  onAddOwner,
  onScheduleWeeklyEmail,
  onNavigate,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    currentUser.ownerId || dataset.owners[0]?.id || ''
  );
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState('');
  const [exportingWeeklyPdf, setExportingWeeklyPdf] = useState(false);
  const [weeklyStatusMsg, setWeeklyStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newOwner, setNewOwner] = useState({
    fullName: '',
    fullNameAr: '',
    phone: '',
    email: '',
    nationalId: '',
    bankAccount: '',
    notes: '',
  });

  // Strict enforcement: if role === 'owner', NEVER allow switching to another owner
  const activeOwnerId =
    currentUser.role === 'owner' ? currentUser.ownerId || '' : selectedOwnerId;

  const owner = dataset.owners.find((o) => o.id === activeOwnerId);
  const ownerChalets = dataset.chalets.filter((c) => c.ownerId === activeOwnerId);
  const ownerChaletIds = new Set(ownerChalets.map((c) => c.id));
  const chaletMap = new Map(ownerChalets.map((c) => [c.id, c]));

  const ownerBookings = dataset.bookings.filter(
    (b) => ownerChaletIds.has(b.chaletId) && b.status !== 'cancelled'
  );
  const upcomingBookings = ownerBookings.filter(
    (b) => b.status === 'upcoming' || b.status === 'checked_in'
  );
  const previousBookings = ownerBookings.filter((b) => b.status === 'checked_out');

  const ownerExpenses = dataset.expenses.filter((e) => ownerChaletIds.has(e.chaletId));
  const ownerPayments = dataset.payments.filter(
    (p) => p.ownerId === activeOwnerId && p.paymentType === 'owner_payout'
  );
  const ownerMaintenance = dataset.maintenance.filter((m) => ownerChaletIds.has(m.chaletId));
  const ownerHousekeeping = dataset.housekeeping.filter((h) => ownerChaletIds.has(h.chaletId));

  let grossRentalIncome = 0;
  let ownerGrossShare = 0;
  let managementFees = 0;

  ownerBookings.forEach((b) => {
    const ch = chaletMap.get(b.chaletId);
    const pct = ch ? ch.ownerPct : 75;
    grossRentalIncome += b.totalValue;
    ownerGrossShare += (b.totalValue * pct) / 100;
    managementFees += (b.totalValue * (100 - pct)) / 100;
  });

  const totalExpenses = ownerExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPaidOut = ownerPayments.reduce((s, p) => s + p.amount, 0);
  const netDueToOwner = Math.max(0, Math.round(ownerGrossShare - totalExpenses - totalPaidOut));
  const occupiedUnits = ownerChalets.filter((c) => c.status === 'occupied').length;
  const occupancyRate =
    ownerChalets.length > 0 ? Math.round((occupiedUnits / ownerChalets.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Owner Selector (only for Admins/Managers; Owners are locked to their own profile) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-cyan-800 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {isAr
                ? 'بوابة المالك الخاصة — بيانات مالية معزولة ومحمية'
                : 'Private Owner Portal — Strictly Isolated Financial Access'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {owner ? (isAr ? owner.fullNameAr : owner.fullName) : isAr ? 'المالك' : 'Owner'}
          </h2>
          {owner && (
            <p className="text-xs text-slate-500 font-mono-num">
              {owner.phone} · {owner.email} · {owner.bankAccount}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role !== 'owner' && (
            <select
              value={activeOwnerId}
              onChange={(e) => {
                setSelectedOwnerId(e.target.value);
                setWeeklyStatusMsg(null);
              }}
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white"
            >
              {dataset.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {isAr ? o.fullNameAr : o.fullName}
                </option>
              ))}
            </select>
          )}

          {owner && (
            <button
              type="button"
              disabled={exportingWeeklyPdf}
              onClick={async () => {
                const summary = buildOwnerWeeklySummary(dataset, owner.id);
                if (!summary) return;
                setExportingWeeklyPdf(true);
                try {
                  await generateOwnerWeeklySummaryPdf(summary, lang, { download: true });
                  setWeeklyStatusMsg({
                    ok: true,
                    text: isAr
                      ? `تم إصدار وتحميل التقرير الأسبوعي (${summary.period.label}) بنجاح.`
                      : `Weekly summary PDF (${summary.period.label}) generated and downloaded.`,
                  });
                } finally {
                  setExportingWeeklyPdf(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan-800" />
              <span>{isAr ? 'تقرير أسبوعي PDF' : 'Weekly Summary PDF'}</span>
            </button>
          )}

          {owner && onScheduleWeeklyEmail && (
            <button
              type="button"
              onClick={() => {
                const task = onScheduleWeeklyEmail(owner.id);
                const isOk =
                  task.status === 'scheduled' ||
                  task.status === 'simulated' ||
                  task.status === 'queued_disabled';
                setWeeklyStatusMsg({ ok: isOk, text: task.reason });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-cyan-800 text-cyan-800 hover:bg-cyan-50 text-xs font-semibold rounded-lg cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{isAr ? 'جدولة الإرسال الأسبوعي' : 'Schedule Weekly Email'}</span>
            </button>
          )}

          {mode === 'directory' && onAddOwner && (
            <button
              type="button"
              onClick={() => {
                setOwnerError('');
                setShowAddOwner(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.actions.addOwner}</span>
            </button>
          )}
        </div>
      </div>

      {weeklyStatusMsg && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium ${
            weeklyStatusMsg.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          {weeklyStatusMsg.text}
        </div>
      )}

      {/* Owner Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'نسبة الإشغال الحالية' : 'Current Occupancy'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-slate-900">
            {occupancyRate}% ({occupiedUnits}/{ownerChalets.length})
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إجمالي دخل الإيجار' : 'Gross Rental Income'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-slate-900">
            {Math.round(grossRentalIncome).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'رسوم شركة الإدارة' : 'Management Fees'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-amber-700">
            -{Math.round(managementFees).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">{isAr ? 'المصروفات التشغيلية' : 'Chalet Expenses'}</div>
          <div className="mt-2 text-xl font-bold font-mono-num text-red-700">
            -{Math.round(totalExpenses).toLocaleString()} {t.currency}
          </div>
        </div>
        <div className="bg-cyan-900 text-white rounded-xl p-4">
          <div className="text-xs text-cyan-200 flex items-center justify-between">
            <span>{isAr ? 'صافي المستحق للمالك' : 'Net Amount Due'}</span>
            <Wallet className="w-4 h-4 text-amber-300" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono-num">
            {netDueToOwner.toLocaleString()} {t.currency}
          </div>
        </div>
      </div>

      {/* Owner Chalets Performance */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-800" />
          <span>{isAr ? 'أداء شاليهاتي' : 'My Chalets Performance'}</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 text-start">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-2.5 px-3 text-start">{isAr ? 'حصة المالك' : 'Split'}</th>
                <th className="py-2.5 px-3 text-start">{isAr ? 'الحجوزات' : 'Bookings'}</th>
                <th className="py-2.5 px-3 text-start">{isAr ? 'إيراد الوحدة' : 'Revenue'}</th>
                <th className="py-2.5 px-3 text-start">{isAr ? 'التدبير الفندقي' : 'Housekeeping'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ownerChalets.map((c) => {
                const unitBookings = ownerBookings.filter((b) => b.chaletId === c.id);
                const unitRev = unitBookings.reduce((s, b) => s + b.totalValue, 0);
                const hk = ownerHousekeeping.find((h) => h.chaletId === c.id);
                return (
                  <tr key={c.id}>
                    <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">
                      {c.chaletNumber}
                    </td>
                    <td className="py-2.5 px-3">{t.status[c.status]}</td>
                    <td className="py-2.5 px-3 font-mono-num">{c.ownerPct}%</td>
                    <td className="py-2.5 px-3 font-mono-num">{unitBookings.length}</td>
                    <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">
                      {unitRev.toLocaleString()} {t.currency}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {hk ? t.status[hk.status] : isAr ? 'جاهز' : 'Ready'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming & Previous Bookings + Payments & Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'الحجوزات الحالية والقادمة' : 'Upcoming & Current Bookings'}
          </h3>
          {upcomingBookings.length === 0 ? (
            <p className="text-xs text-slate-500">{isAr ? 'لا توجد حجوزات قادمة.' : 'No upcoming bookings.'}</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {upcomingBookings.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-mono-num font-semibold text-cyan-800">
                      {chaletMap.get(b.chaletId)?.chaletNumber}
                    </span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span className="text-slate-700 font-mono-num">
                      {b.checkIn} → {b.checkOut}
                    </span>
                  </div>
                  <div className="font-mono-num font-semibold text-slate-900">
                    {b.totalValue.toLocaleString()} {t.currency}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h4 className="text-xs font-bold text-slate-700 pt-3 border-t border-slate-100">
            {isAr ? 'الحجوزات السابقة' : 'Previous Completed Bookings'}
          </h4>
          <div className="divide-y divide-slate-100 text-xs">
            {previousBookings.map((b) => (
              <div key={b.id} className="py-2 flex items-center justify-between text-slate-600">
                <span className="font-mono-num">
                  {chaletMap.get(b.chaletId)?.chaletNumber} · {b.checkIn}
                </span>
                <span className="font-mono-num font-medium">
                  {b.totalValue.toLocaleString()} {t.currency}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'سجل التحويلات المالية للمالك' : 'Owner Payment History'}
            </h3>
            {ownerPayments.length === 0 ? (
              <p className="text-xs text-slate-500">{isAr ? 'لم تسجل تحويلات بعد.' : 'No payouts recorded yet.'}</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {ownerPayments.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{p.paymentMethod}</div>
                      <div className="text-slate-500 font-mono-num">
                        {p.referenceNo} · {p.paidAt.slice(0, 10)}
                      </div>
                    </div>
                    <span className="font-mono-num font-bold text-emerald-700">
                      {p.amount.toLocaleString()} {t.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'طلبات الصيانة لوحداتي' : 'Maintenance Requests on My Units'}
              </h3>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('maintenance')}
                  className="text-xs font-medium text-cyan-800 hover:underline cursor-pointer whitespace-nowrap"
                >
                  {isAr ? 'لوحة الصيانة' : 'View Dashboard'}
                </button>
              )}
            </div>
            {ownerMaintenance.length === 0 ? (
              <p className="text-xs text-slate-500">{isAr ? 'لا توجد بلاغات صيانة.' : 'No maintenance tickets.'}</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {ownerMaintenance.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-mono-num font-semibold text-slate-900">
                        {chaletMap.get(m.chaletId)?.chaletNumber}
                      </span>{' '}
                      <span className="text-slate-600">· {m.problemType}</span>
                    </div>
                    <span className="font-medium text-slate-700">{t.status[m.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Owner Modal */}
      {showAddOwner && onAddOwner && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (savingOwner) return;
              setOwnerError('');
              setSavingOwner(true);
              try {
                const res = await onAddOwner({
                  id: `own-${Date.now()}`,
                  fullName: newOwner.fullName,
                  fullNameAr: newOwner.fullNameAr || newOwner.fullName,
                  phone: newOwner.phone,
                  email: newOwner.email,
                  nationalId: newOwner.nationalId,
                  bankAccount: newOwner.bankAccount,
                  notes: newOwner.notes,
                  isDemo: false,
                  createdAt: new Date().toISOString(),
                });
                if (res && !res.ok) {
                  setOwnerError(res.error || (isAr ? 'تعذر حفظ بيانات المالك.' : 'Failed to save owner.'));
                  return;
                }
                setNewOwner({
                  fullName: '',
                  fullNameAr: '',
                  phone: '',
                  email: '',
                  nationalId: '',
                  bankAccount: '',
                  notes: '',
                });
                setShowAddOwner(false);
              } finally {
                setSavingOwner(false);
              }
            }}
            className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addOwner}</h3>
              <button
                type="button"
                onClick={() => setShowAddOwner(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}
                </label>
                <input
                  required
                  value={newOwner.fullNameAr}
                  onChange={(e) => setNewOwner({ ...newOwner, fullNameAr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
                </label>
                <input
                  required
                  value={newOwner.fullName}
                  onChange={(e) => setNewOwner({ ...newOwner, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الهاتف' : 'Phone'}
                </label>
                <input
                  required
                  value={newOwner.phone}
                  onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  required
                  value={newOwner.email}
                  onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الحساب البنكي (IBAN)' : 'Bank Account (IBAN)'}
                </label>
                <input
                  value={newOwner.bankAccount}
                  onChange={(e) => setNewOwner({ ...newOwner, bankAccount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
            </div>
            {ownerError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {ownerError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingOwner}
                onClick={() => setShowAddOwner(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingOwner}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {savingOwner ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
