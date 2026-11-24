import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Power,
  BedDouble,
  Bath,
  Users,
  X,
  QrCode,
  Copy,
  Check,
  Download,
  ExternalLink,
} from 'lucide-react';
import { COMPANY_BRANDING } from '../constants/branding';
import { RESORT_IMAGES } from '../data/demoData';
import { getT } from '../i18n/translations';
import {
  ChaletPortalAction,
  buildChaletGuestPortalUrl,
  exportChaletPortalQrPosterPng,
  generateChaletPortalQrDataUrl,
} from '../utils/chaletQr';
import { Chalet, ChaletStatus, Language, MutationResult, Owner } from '../types/platform';
import { CompanyLogo } from './CompanyLogo';

interface ChaletsViewProps {
  chalets: Chalet[];
  owners: Owner[];
  lang: Language;
  canEdit: boolean;
  initialSearch?: string;
  onSaveChalet: (chalet: Chalet, isNew: boolean) => Promise<MutationResult | void> | MutationResult | void;
  onDeleteChalet: (id: string) => Promise<MutationResult | void> | MutationResult | void;
  onToggleActive: (chalet: Chalet) => Promise<MutationResult | void> | MutationResult | void;
  onOpenGuestPortal?: (chalet: Chalet, action?: ChaletPortalAction) => void;
}

const STATUS_TEXT_COLOR: Record<ChaletStatus, string> = {
  available: 'text-emerald-700',
  occupied: 'text-cyan-800',
  cleaning: 'text-amber-700',
  maintenance: 'text-red-700',
  inactive: 'text-slate-400',
};

export const ChaletsView: React.FC<ChaletsViewProps> = ({
  chalets,
  owners,
  lang,
  canEdit,
  initialSearch = '',
  onSaveChalet,
  onDeleteChalet,
  onToggleActive,
  onOpenGuestPortal,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Chalet | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Chalet Guest Portal QR Modal state
  const [qrChalet, setQrChalet] = useState<Chalet | null>(null);
  const [qrAction, setQrAction] = useState<ChaletPortalAction>('stay');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExporting, setQrExporting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
      setStatusFilter('all');
    }
  }, [initialSearch]);

  const activePortalUrl = qrChalet
    ? buildChaletGuestPortalUrl(qrChalet, { action: qrAction })
    : '';

  useEffect(() => {
    if (!qrChalet || !activePortalUrl) {
      setQrDataUrl('');
      return;
    }
    let active = true;
    setQrLoading(true);
    generateChaletPortalQrDataUrl(activePortalUrl)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .finally(() => {
        if (active) setQrLoading(false);
      });
    return () => {
      active = false;
    };
  }, [qrChalet, activePortalUrl]);

  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const filtered = chalets.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const owner = ownerMap.get(c.ownerId);
      const ownerStr = `${owner?.fullName || ''} ${owner?.fullNameAr || ''}`.toLowerCase();
      return (
        c.chaletNumber.toLowerCase().includes(q) ||
        c.viewType.toLowerCase().includes(q) ||
        c.viewTypeAr.toLowerCase().includes(q) ||
        ownerStr.includes(q)
      );
    }
    return true;
  });

  const openNewModal = () => {
    setFormError('');
    setIsNew(true);
    setEditing({
      id: `ch-${Date.now()}`,
      chaletNumber: `PS-${400 + chalets.length + 1}`,
      ownerId: owners[0]?.id || '',
      bedrooms: 2,
      bathrooms: 2,
      maxGuests: 5,
      floor: '1',
      viewType: 'Sea & Pool View',
      viewTypeAr: 'إطلالة على البحر وحمام السباحة',
      status: 'available',
      photos: [RESORT_IMAGES.hero],
      description: 'Modern fully furnished Porto El Sokhna chalet.',
      descriptionAr: 'شاليه حديث مفروش بالكامل في بورتو السخنة.',
      amenities: ['Wi-Fi', 'Smart TV', 'Central A/C', 'Equipped Kitchen'],
      nightlyPrice: 3500,
      ownerPct: 75,
      managementPct: 25,
      isActive: true,
      isDemo: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    setFormError('');
    setSaving(true);
    try {
      const res = await onSaveChalet(editing, isNew);
      if (res && !res.ok) {
        setFormError(res.error || (isAr ? 'تعذر حفظ بيانات الشاليه.' : 'Failed to save chalet.'));
        return;
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.actions.searchPlaceholder}
              className="w-full ps-9 pe-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-700"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['all', 'available', 'occupied', 'cleaning', 'maintenance'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? (isAr ? 'الكل' : 'All') : t.status[st]}
              </button>
            ))}
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openNewModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.actions.addChalet}</span>
          </button>
        )}
      </div>

      {/* Chalets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((ch) => {
          const owner = ownerMap.get(ch.ownerId);
          return (
            <div
              key={ch.id}
              className={`bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col ${
                !ch.isActive ? 'opacity-65' : ''
              }`}
            >
              <div className="relative h-44 bg-slate-100 overflow-hidden">
                <img
                  src={ch.photos[0] || RESORT_IMAGES.hero}
                  alt={ch.chaletNumber}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                <div className="absolute bottom-3 inset-x-4 flex items-end justify-between text-white">
                  <div>
                    <div className="text-lg font-bold font-mono-num">{ch.chaletNumber}</div>
                    <div className="text-xs text-slate-200">
                      {isAr ? ch.viewTypeAr : ch.viewType}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-base font-bold font-mono-num">
                      {ch.nightlyPrice.toLocaleString()} {t.currency}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {isAr ? 'لليلة' : '/ night'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {isAr ? 'المالك:' : 'Owner:'}{' '}
                      <strong className="text-slate-800">
                        {owner ? (isAr ? owner.fullNameAr : owner.fullName) : '-'}
                      </strong>
                    </span>
                    <span className={`font-semibold ${STATUS_TEXT_COLOR[ch.status]}`}>
                      {ch.isActive ? t.status[ch.status] : t.status.inactive}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600 pt-1">
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                      {ch.bedrooms}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <Bath className="w-3.5 h-3.5 text-slate-400" />
                      {ch.bathrooms}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {ch.maxGuests}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span>
                      {isAr ? 'الدور' : 'Floor'} {ch.floor}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2">
                    {isAr ? ch.descriptionAr : ch.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono-num text-slate-600">
                    {isAr ? 'المالك' : 'Owner'} {ch.ownerPct}% / {isAr ? 'الإدارة' : 'Mgmt'}{' '}
                    {ch.managementPct}%
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title={isAr ? 'رمز QR لبوابة النزيل' : 'Guest Portal QR'}
                      onClick={() => {
                        setQrAction('stay');
                        setCopiedUrl(false);
                        setQrChalet(ch);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-cyan-50 text-cyan-800 text-[11px] font-semibold cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>QR</span>
                    </button>

                    {canEdit && (
                      <>
                        <button
                          type="button"
                          title={t.actions.edit}
                          onClick={() => {
                            setFormError('');
                            setIsNew(false);
                            setEditing({ ...ch });
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'تفعيل/إيقاف' : 'Toggle Active'}
                          onClick={() => void onToggleActive(ch)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t.actions.delete}
                          onClick={() => void onDeleteChalet(ch.id)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Chalet Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-slate-900">
                {isNew ? t.actions.addChalet : `${t.actions.edit}: ${editing.chaletNumber}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'رقم الشاليه' : 'Chalet Number'}
                </label>
                <input
                  required
                  value={editing.chaletNumber}
                  onChange={(e) => setEditing({ ...editing, chaletNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'المالك' : 'Owner'}
                </label>
                <select
                  value={editing.ownerId}
                  onChange={(e) => setEditing({ ...editing, ownerId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {isAr ? o.fullNameAr : o.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'سعر الليلة' : 'Nightly Price'} ({t.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={editing.nightlyPrice}
                  onChange={(e) => setEditing({ ...editing, nightlyPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الحالة' : 'Status'}
                </label>
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as ChaletStatus })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(['available', 'occupied', 'cleaning', 'maintenance', 'inactive'] as const).map(
                    (st) => (
                      <option key={st} value={st}>
                        {t.status[st]}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'نسبة المالك (%)' : 'Owner Share (%)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.ownerPct}
                  onChange={(e) => {
                    const op = Math.min(100, Math.max(0, Number(e.target.value)));
                    setEditing({ ...editing, ownerPct: op, managementPct: 100 - op });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'نسبة شركة الإدارة (%)' : 'Management Fee (%)'}
                </label>
                <input
                  type="number"
                  readOnly
                  value={editing.managementPct}
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg font-mono-num text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'غرف النوم' : 'Bedrooms'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={editing.bedrooms}
                  onChange={(e) => setEditing({ ...editing, bedrooms: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الحمامات' : 'Bathrooms'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={editing.bathrooms}
                  onChange={(e) => setEditing({ ...editing, bathrooms: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الحد الأقصى للنزلاء' : 'Max Guests'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={editing.maxGuests}
                  onChange={(e) => setEditing({ ...editing, maxGuests: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الدور' : 'Floor'}
                </label>
                <input
                  value={editing.floor}
                  onChange={(e) => setEditing({ ...editing, floor: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الإطلالة (عربي)' : 'View (Arabic)'}
                </label>
                <input
                  value={editing.viewTypeAr}
                  onChange={(e) => setEditing({ ...editing, viewTypeAr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الإطلالة (إنجليزي)' : 'View (English)'}
                </label>
                <input
                  value={editing.viewType}
                  onChange={(e) => setEditing({ ...editing, viewType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'المميزات (مفصولة بفاصلة)' : 'Amenities (comma-separated)'}
                </label>
                <input
                  value={editing.amenities.join(', ')}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      amenities: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الوصف' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={isAr ? editing.descriptionAr : editing.description}
                  onChange={(e) =>
                    setEditing(
                      isAr
                        ? { ...editing, descriptionAr: e.target.value }
                        : { ...editing, description: e.target.value }
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {formError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {formError}
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Chalet Guest Portal QR Code Modal */}
      {qrChalet && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <CompanyLogo size="sm" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-cyan-800 truncate">
                    {COMPANY_BRANDING.companyName}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {isAr
                      ? `رمز QR لبوابة النزيل · ${qrChalet.chaletNumber}`
                      : `Guest Portal QR · ${qrChalet.chaletNumber}`}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrChalet(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label={t.actions.cancel}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Target Action Focus Selector */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'stay', ar: 'البوابة الكاملة', en: 'Full Portal' },
                    { id: 'checkin', ar: 'تسجيل الوصول', en: 'Check-In' },
                    { id: 'housekeeping', ar: 'التدبير الفندقي', en: 'Housekeeping' },
                    { id: 'maintenance', ar: 'بلاغ صيانة', en: 'Maintenance' },
                    { id: 'offers', ar: 'العروض', en: 'Offers' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setQrAction(mode.id);
                      setCopiedUrl(false);
                    }}
                    className={`flex-1 min-w-[92px] py-1.5 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                      qrAction === mode.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? mode.ar : mode.en}
                  </button>
                ))}
              </div>

              <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 bg-slate-50">
                {qrLoading || !qrDataUrl ? (
                  <div className="w-52 h-52 flex items-center justify-center text-slate-400">
                    {isAr ? 'جاري إنشاء الرمز...' : 'Generating QR...'}
                  </div>
                ) : (
                  <img
                    src={qrDataUrl}
                    alt={`Guest Portal QR for ${qrChalet.chaletNumber}`}
                    className="w-52 h-52 rounded-lg bg-white p-2 border border-slate-200"
                  />
                )}
                <div className="mt-3 text-center">
                  <div className="font-mono-num text-sm font-bold text-cyan-900">
                    {isAr ? 'شاليه' : 'Chalet'} {qrChalet.chaletNumber}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    {isAr ? qrChalet.viewTypeAr : qrChalet.viewType}
                  </div>
                </div>
              </div>

              {/* Unique Guest Portal URL + Copy */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  {isAr ? 'رابط بوابة النزيل الفريد للشاليه' : 'Unique Chalet Guest Portal URL'}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activePortalUrl}
                    dir="ltr"
                    className="flex-1 px-2.5 py-1.5 text-[11px] font-mono-num bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(activePortalUrl);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      } catch {
                        // Clipboard blocked in restricted context
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{isAr ? 'تم النسخ' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isAr ? 'نسخ' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                {isAr
                  ? 'يمكن وضع هذا الرمز داخل الشاليه أو إرساله للنزيل لتسهيل تسجيل الوصول الذاتي والإبلاغ الفوري عن الصيانة.'
                  : 'Place this QR poster inside the chalet or send to guests for instant check-in and maintenance reporting.'}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              {onOpenGuestPortal ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = qrChalet;
                    const action = qrAction;
                    setQrChalet(null);
                    onOpenGuestPortal(target, action);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-cyan-800 text-cyan-800 hover:bg-cyan-50 rounded-lg cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isAr ? 'معاينة البوابة' : 'Open Portal'}</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQrChalet(null)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="button"
                  disabled={qrExporting}
                  onClick={async () => {
                    setQrExporting(true);
                    try {
                      await exportChaletPortalQrPosterPng(
                        qrChalet,
                        activePortalUrl,
                        lang,
                        qrAction
                      );
                    } finally {
                      setQrExporting(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تحميل ملصق QR' : 'Download QR Poster'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
