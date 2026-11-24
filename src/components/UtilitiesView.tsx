import React, { useState } from 'react';
import { Zap, Droplets, AlertTriangle, X } from 'lucide-react';
import { getT } from '../i18n/translations';
import { Chalet, Language, MutationResult, UtilityAccount, UtilityTransaction } from '../types/platform';

interface UtilitiesViewProps {
  chalets: Chalet[];
  utilities: UtilityAccount[];
  transactions: UtilityTransaction[];
  lang: Language;
  canRecharge: boolean;
  onRecharge: (
    chaletId: string,
    type: 'electricity' | 'water',
    amount: number,
    notes: string
  ) => Promise<MutationResult | void> | MutationResult | void;
}

export const UtilitiesView: React.FC<UtilitiesViewProps> = ({
  chalets,
  utilities,
  transactions,
  lang,
  canRecharge,
  onRecharge,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [modalState, setModalState] = useState<{
    chaletId: string;
    type: 'electricity' | 'water';
  } | null>(null);
  const [amount, setAmount] = useState(500);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const chaletMap = new Map(chalets.map((c) => [c.id, c]));

  const handleOpenRecharge = (chaletId: string, type: 'electricity' | 'water') => {
    setModalError('');
    setModalState({ chaletId, type });
    setAmount(type === 'electricity' ? 1000 : 500);
    setNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Quick Action Top Bar */}
      {canRecharge && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {isAr
              ? 'إدارة أرصدة عدادات الكهرباء والمياه مسبقة الدفع لجميع الشاليهات'
              : 'Manage prepaid smart electricity & water meter balances across all chalets'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleOpenRecharge(chalets[0]?.id || '', 'electricity')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{t.actions.rechargeElectricity}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenRecharge(chalets[0]?.id || '', 'water')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold cursor-pointer"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>{t.actions.rechargeWater}</span>
            </button>
          </div>
        </div>
      )}

      {/* Chalet Utility Balances Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'رصيد الكهرباء' : 'Electricity Balance'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'آخر شحنة كهرباء' : 'Last Elec. Recharge'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'رصيد المياه' : 'Water Balance'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'آخر شحنة مياه' : 'Last Water Recharge'}</th>
                {canRecharge && (
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'شحن سريع' : 'Quick Top-Up'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {utilities.map((u) => {
                const ch = chaletMap.get(u.chaletId);
                const lowElec = u.electricityBalance < u.electricityThreshold;
                const lowWater = u.waterBalance < u.waterThreshold;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                      {ch?.chaletNumber || u.chaletId}
                    </td>
                    <td className="py-3 px-4 font-mono-num">
                      <span className={`font-bold ${lowElec ? 'text-red-700' : 'text-slate-900'}`}>
                        {u.electricityBalance.toLocaleString()} {t.currency}
                      </span>
                      {lowElec && (
                        <span className="inline-flex items-center gap-1 ms-2 text-[11px] text-red-700 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {isAr ? 'رصيد منخفض' : 'Low'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500">
                      {u.lastElectricityRecharge} {t.currency} · {u.lastElectricityDate.slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 font-mono-num">
                      <span className={`font-bold ${lowWater ? 'text-amber-700' : 'text-slate-900'}`}>
                        {u.waterBalance.toLocaleString()} {t.currency}
                      </span>
                      {lowWater && (
                        <span className="inline-flex items-center gap-1 ms-2 text-[11px] text-amber-700 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {isAr ? 'رصيد منخفض' : 'Low'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500">
                      {u.lastWaterRecharge} {t.currency} · {u.lastWaterDate.slice(0, 10)}
                    </td>
                    {canRecharge && (
                      <td className="py-3 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenRecharge(u.chaletId, 'electricity')}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-amber-50 text-amber-800 text-[11px] font-medium cursor-pointer"
                          >
                            +{isAr ? 'كهرباء' : 'Elec'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRecharge(u.chaletId, 'water')}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-cyan-50 text-cyan-800 text-[11px] font-medium cursor-pointer"
                          >
                            +{isAr ? 'مياه' : 'Water'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions History */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">
          {isAr ? 'سجل معاملات الشحن والاستهلاك' : 'Utility Recharge & Consumption History'}
        </h3>
        <div className="divide-y divide-slate-100 text-xs">
          {transactions.map((tx) => (
            <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-mono-num font-semibold text-slate-900">
                  {chaletMap.get(tx.chaletId)?.chaletNumber}
                </span>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="text-slate-700">
                  {tx.utilityType === 'electricity'
                    ? isAr
                      ? 'كهرباء'
                      : 'Electricity'
                    : isAr
                    ? 'مياه'
                    : 'Water'}{' '}
                  ({tx.transactionType === 'recharge' ? (isAr ? 'شحن' : 'Recharge') : isAr ? 'استهلاك' : 'Usage'})
                </span>
                {tx.notes && <span className="text-slate-500 ms-2">— {tx.notes}</span>}
              </div>
              <div className="font-mono-num text-end shrink-0">
                <span
                  className={`font-bold ${
                    tx.transactionType === 'recharge' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {tx.transactionType === 'recharge' ? '+' : '-'}
                  {tx.amount.toLocaleString()} {t.currency}
                </span>
                <span className="text-slate-400 ms-2">({tx.transactionDate.slice(0, 10)})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recharge Modal */}
      {modalState && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              setModalError('');
              setSaving(true);
              try {
                const res = await onRecharge(modalState.chaletId, modalState.type, amount, notes);
                if (res && !res.ok) {
                  setModalError(res.error || (isAr ? 'تعذر تنفيذ الشحن.' : 'Recharge failed.'));
                  return;
                }
                setModalState(null);
              } finally {
                setSaving(false);
              }
            }}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {modalState.type === 'electricity'
                  ? t.actions.rechargeElectricity
                  : t.actions.rechargeWater}
              </h3>
              <button
                type="button"
                onClick={() => setModalState(null)}
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
                  value={modalState.chaletId}
                  onChange={(e) => setModalState({ ...modalState, chaletId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {chalets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chaletNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'مبلغ الشحن' : 'Recharge Amount'} ({t.currency})
                </label>
                <input
                  type="number"
                  min={50}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات' : 'Notes'}
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? 'رقم الإيصال أو تفاصيل الشحن' : 'Receipt ref or notes'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            {modalError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {modalError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalState(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {saving ? (isAr ? 'جاري الشحن...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
