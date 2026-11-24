import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  Clock,
  CheckCheck,
  Sparkles,
  Wrench,
  MapPin,
  Plus,
  X,
  LogIn,
  QrCode,
} from 'lucide-react';
import { RESORT_IMAGES } from '../data/demoData';
import { getT } from '../i18n/translations';
import { ChaletPortalAction, parseChaletGuestPortalUrl } from '../utils/chaletQr';
import {
  AppNotification,
  Language,
  MutationResult,
  OfferCategory,
  PartnerOffer,
  PlatformDataset,
} from '../types/platform';

interface OffersViewProps {
  offers: PartnerOffer[];
  lang: Language;
  canManage: boolean;
  onAddOffer: (offer: PartnerOffer) => Promise<MutationResult | void> | MutationResult | void;
}

export const OffersView: React.FC<OffersViewProps> = ({
  offers,
  lang,
  canManage,
  onAddOffer,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [catFilter, setCatFilter] = useState<'all' | OfferCategory>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [newOffer, setNewOffer] = useState({
    category: 'restaurant' as OfferCategory,
    businessName: '',
    businessNameAr: '',
    title: '',
    titleAr: '',
    discount: '15% OFF',
    description: '',
    descriptionAr: '',
    phone: '',
    availability: 'Daily 9:00 AM – 11:00 PM',
  });

  const filtered = offers.filter((o) => catFilter === 'all' || o.category === catFilter);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['all', 'restaurant', 'cafe', 'supermarket', 'resort_service'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                catFilter === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.offerCategories[cat]}
            </button>
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.actions.addOffer}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((offer) => (
          <div
            key={offer.id}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col sm:flex-row"
          >
            <div className="sm:w-44 h-44 sm:h-auto shrink-0 bg-slate-100 relative">
              <img
                src={offer.imageUrl || RESORT_IMAGES.seafood}
                alt={isAr ? offer.businessNameAr : offer.businessName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{t.offerCategories[offer.category]}</span>
                  <span className="font-mono-num font-bold text-amber-700">{offer.discount}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {isAr ? offer.businessNameAr : offer.businessName}
                </h3>
                <p className="text-xs font-semibold text-cyan-800 mt-0.5">
                  {isAr ? offer.titleAr : offer.title}
                </p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  {isAr ? offer.descriptionAr : offer.description}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 font-mono-num">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {offer.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {offer.availability}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (savingOffer) return;
              setOfferError('');
              setSavingOffer(true);
              try {
                const res = await onAddOffer({
                  id: `off-${Date.now()}`,
                  ...newOffer,
                  businessNameAr: newOffer.businessNameAr || newOffer.businessName,
                  titleAr: newOffer.titleAr || newOffer.title,
                  descriptionAr: newOffer.descriptionAr || newOffer.description,
                  imageUrl:
                    newOffer.category === 'cafe' ? RESORT_IMAGES.cafe : RESORT_IMAGES.seafood,
                  isActive: true,
                  isDemo: false,
                });
                if (res && !res.ok) {
                  setOfferError(res.error || (isAr ? 'تعذر حفظ العرض.' : 'Failed to save offer.'));
                  return;
                }
                setShowAdd(false);
              } finally {
                setSavingOffer(false);
              }
            }}
            className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addOffer}</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'التصنيف' : 'Category'}
                </label>
                <select
                  value={newOffer.category}
                  onChange={(e) =>
                    setNewOffer({ ...newOffer, category: e.target.value as OfferCategory })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(['restaurant', 'cafe', 'supermarket', 'resort_service'] as const).map((c) => (
                    <option key={c} value={c}>
                      {t.offerCategories[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الخصم' : 'Discount'}
                </label>
                <input
                  required
                  value={newOffer.discount}
                  onChange={(e) => setNewOffer({ ...newOffer, discount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'اسم الشريك (عربي)' : 'Business Name (AR)'}
                </label>
                <input
                  required
                  value={newOffer.businessNameAr}
                  onChange={(e) => setNewOffer({ ...newOffer, businessNameAr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'اسم الشريك (إنجليزي)' : 'Business Name (EN)'}
                </label>
                <input
                  required
                  value={newOffer.businessName}
                  onChange={(e) => setNewOffer({ ...newOffer, businessName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'عنوان العرض' : 'Offer Title'}
                </label>
                <input
                  required
                  value={isAr ? newOffer.titleAr : newOffer.title}
                  onChange={(e) =>
                    setNewOffer(
                      isAr
                        ? { ...newOffer, titleAr: e.target.value }
                        : { ...newOffer, title: e.target.value }
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الهاتف' : 'Phone'}
                </label>
                <input
                  required
                  value={newOffer.phone}
                  onChange={(e) => setNewOffer({ ...newOffer, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'مواعيد العمل' : 'Availability'}
                </label>
                <input
                  required
                  value={newOffer.availability}
                  onChange={(e) => setNewOffer({ ...newOffer, availability: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            {offerError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {offerError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingOffer}
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingOffer}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {savingOffer ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface NotificationsViewProps {
  notifications: AppNotification[];
  lang: Language;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  lang,
  onMarkRead,
  onMarkAllRead,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">
          {isAr
            ? `التنبيهات (${notifications.filter((n) => !n.isRead).length} غير مقروء)`
            : `Notifications (${notifications.filter((n) => !n.isRead).length} unread)`}
        </span>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>{t.actions.markAllRead}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onMarkRead(n.id)}
            className={`p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
              n.isRead ? 'bg-white' : 'bg-cyan-50/40'
            }`}
          >
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">
                {isAr ? n.titleAr : n.title}
              </div>
              <div className="text-xs text-slate-600">{isAr ? n.messageAr : n.message}</div>
            </div>
            <div className="text-[11px] font-mono-num text-slate-400 whitespace-nowrap">
              {n.createdAt.slice(0, 10)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface GuestPortalViewProps {
  dataset: PlatformDataset;
  lang: Language;
  selectedChaletId?: string;
  initialAction?: ChaletPortalAction;
  lockChaletSelection?: boolean;
  onChaletChange?: (chaletId: string) => void;
  onExpressCheckIn?: (
    bookingId: string,
    payload: { idPassport: string; depositAmount: number; numGuests: number; notes: string }
  ) => Promise<MutationResult | void> | MutationResult | void;
  onRequestHousekeeping: (chaletId: string, notes: string) => Promise<MutationResult | void> | MutationResult | void;
  onReportMaintenance: (chaletId: string, problemType: string, description: string) => Promise<MutationResult | void> | MutationResult | void;
}

export const GuestPortalView: React.FC<GuestPortalViewProps> = ({
  dataset,
  lang,
  selectedChaletId,
  initialAction,
  lockChaletSelection = false,
  onChaletChange,
  onExpressCheckIn,
  onRequestHousekeeping,
  onReportMaintenance,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';

  const resolveUrlAction = (): ChaletPortalAction => {
    if (typeof window === 'undefined') return 'stay';
    return parseChaletGuestPortalUrl(window.location.search).action;
  };

  const [activeAction, setActiveAction] = useState<ChaletPortalAction>(
    () => initialAction ?? resolveUrlAction()
  );

  useEffect(() => {
    if (initialAction) {
      setActiveAction(initialAction);
    }
  }, [initialAction]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setActiveAction(resolveUrlAction());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const checkInSectionRef = useRef<HTMLDivElement | null>(null);
  const housekeepingSectionRef = useRef<HTMLFormElement | null>(null);
  const maintenanceSectionRef = useRef<HTMLFormElement | null>(null);
  const offersSectionRef = useRef<HTMLDivElement | null>(null);

  const idPassportInputRef = useRef<HTMLInputElement | null>(null);
  const hkNoteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mntDescInputRef = useRef<HTMLTextAreaElement | null>(null);

  const defaultBooking =
    dataset.bookings.find((b) => b.status === 'checked_in') || dataset.bookings[0];
  const chalet =
    (selectedChaletId
      ? dataset.chalets.find((c) => c.id === selectedChaletId)
      : undefined) ||
    dataset.chalets.find((c) => c.id === defaultBooking?.chaletId) ||
    dataset.chalets[0];

  const chaletBookings = chalet
    ? dataset.bookings.filter((b) => b.chaletId === chalet.id && b.status !== 'cancelled')
    : [];
  const activeBooking =
    chaletBookings.find((b) => b.status === 'checked_in') ||
    chaletBookings.find((b) => b.status === 'upcoming') ||
    chaletBookings[0];

  const [hkNote, setHkNote] = useState('');
  const [mntProblem, setMntProblem] = useState('A/C or Plumbing');
  const [mntDesc, setMntDesc] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Express self check-in fields for upcoming reservations
  const [idPassport, setIdPassport] = useState(activeBooking?.idPassport || '');
  const [guestCount, setGuestCount] = useState(activeBooking?.numGuests || 2);
  const [arrivalNotes, setArrivalNotes] = useState('');

  useEffect(() => {
    if (activeBooking) {
      setIdPassport(activeBooking.idPassport || '');
      setGuestCount(activeBooking.numGuests);
      setArrivalNotes('');
    }
  }, [activeBooking?.id]);

  // Smooth-scroll & focus target section whenever deep-linked action changes
  useEffect(() => {
    if (!chalet || activeAction === 'stay') return;

    const timer = window.setTimeout(() => {
      if (activeAction === 'checkin') {
        checkInSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        idPassportInputRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'housekeeping') {
        housekeepingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hkNoteInputRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'maintenance') {
        maintenanceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mntDescInputRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'offers') {
        offersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeAction, chalet?.id]);

  if (!chalet) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        {isAr ? 'لا توجد بيانات شاليه حالياً.' : 'No chalet details available.'}
      </div>
    );
  }

  const actionMeta: Record<
    ChaletPortalAction,
    { labelAr: string; labelEn: string; descAr: string; descEn: string }
  > = {
    stay: {
      labelAr: 'تفاصيل الإقامة',
      labelEn: 'Stay Overview',
      descAr: 'جميع خدمات الشاليه وإرشادات الإقامة في مكان واحد.',
      descEn: 'All chalet guest services and stay details in one place.',
    },
    checkin: {
      labelAr: 'تسجيل الوصول السريع',
      labelEn: 'Express Check-In',
      descAr: 'تم توجيهك مباشرة لتأكيد بيانات الوصول واستلام الشاليه.',
      descEn: 'Deep-linked to verify your arrival details and complete check-in.',
    },
    housekeeping: {
      labelAr: 'التدبير الفندقي',
      labelEn: 'Housekeeping',
      descAr: 'تم توجيهك مباشرة لإرسال طلب تنظيف أو مناشف إضافية.',
      descEn: 'Deep-linked to request room refresh, cleaning, or fresh linens.',
    },
    maintenance: {
      labelAr: 'بلاغ صيانة',
      labelEn: 'Report Maintenance',
      descAr: 'تم توجيهك مباشرة لتسجيل بلاغ صيانة فوري لفريق المنتجع.',
      descEn: 'Deep-linked to report an in-chalet issue directly to resort technicians.',
    },
    offers: {
      labelAr: 'عروض المنتجع',
      labelEn: 'Resort Offers',
      descAr: 'تم توجيهك مباشرة لاستعراض خصومات المطاعم والسوبرماركت.',
      descEn: 'Deep-linked to exclusive resort dining and partner discounts.',
    },
  };

  return (
    <div className="space-y-6">
      {/* Chalet Portal Context Bar (when previewing multiple chalets as staff/admin) */}
      {!lockChaletSelection && dataset.chalets.length > 1 && onChaletChange && (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <QrCode className="w-4 h-4 text-cyan-800" />
            <span className="font-semibold text-slate-800">
              {isAr ? 'معاينة بوابة النزيل للشاليه:' : 'Previewing Guest Portal for Chalet:'}
            </span>
          </div>
          <select
            value={chalet.id}
            onChange={(e) => onChaletChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white font-mono-num"
          >
            {dataset.chalets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.chaletNumber} — {isAr ? c.viewTypeAr : c.viewType}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Guest Welcome Hero */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-5 h-56 lg:h-auto relative">
          <img
            src={chalet.photos[0] || RESORT_IMAGES.hero}
            alt={chalet.chaletNumber}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="lg:col-span-7 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-cyan-800 font-semibold">
                {isAr ? 'أهلاً بك في بورتو السخنة' : 'Welcome to Porto El Sokhna'}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                {activeBooking ? `${activeBooking.guestName} · ` : ''}
                {isAr ? 'شاليه' : 'Chalet'} {chalet.chaletNumber}
              </h2>
            </div>
            <span className="text-xs font-mono-num text-slate-600">
              {activeBooking ? activeBooking.bookingCode : `${isAr ? 'الدور' : 'Floor'} ${chalet.floor}`}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {isAr ? chalet.descriptionAr : chalet.description}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div>
              <div className="text-slate-500">{isAr ? 'تسجيل الدخول' : 'Check-in'}</div>
              <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                {activeBooking ? `${activeBooking.checkIn} (2:00 PM)` : '2:00 PM'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{isAr ? 'المغادرة' : 'Check-out'}</div>
              <div className="font-mono-num font-semibold text-slate-900 mt-0.5">
                {activeBooking ? `${activeBooking.checkOut} (12:00 PM)` : '12:00 PM'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{isAr ? 'الإطلالة' : 'View'}</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {isAr ? chalet.viewTypeAr : chalet.viewType}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{isAr ? 'إدارة المنتجع' : 'Concierge Desk'}</div>
              <div className="font-mono-num font-semibold text-cyan-800 mt-0.5">+20 100 220 1100</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Deep-Link Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'stay', icon: QrCode },
              { id: 'checkin', icon: LogIn },
              { id: 'housekeeping', icon: Sparkles },
              { id: 'maintenance', icon: Wrench },
              { id: 'offers', icon: MapPin },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const selected = activeAction === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveAction(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  selected
                    ? 'bg-cyan-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isAr ? actionMeta[item.id].labelAr : actionMeta[item.id].labelEn}</span>
              </button>
            );
          })}
        </div>

        {activeAction !== 'stay' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-950">
            <span className="font-medium">
              {isAr ? actionMeta[activeAction].descAr : actionMeta[activeAction].descEn}
            </span>
            <button
              type="button"
              onClick={() => setActiveAction('stay')}
              className="text-[11px] font-semibold text-cyan-800 hover:underline shrink-0 cursor-pointer"
            >
              {isAr ? 'عرض الكل' : 'Show All'}
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-medium ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Express QR Self Check-In Section */}
      {activeBooking && activeBooking.status === 'upcoming' && onExpressCheckIn ? (
        <div ref={checkInSectionRef}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await onExpressCheckIn(activeBooking.id, {
                idPassport,
                depositAmount: activeBooking.depositAmount || 1500,
                numGuests: guestCount,
                notes: arrivalNotes || 'Express QR Guest Portal Check-In',
              });
              if (res && !res.ok) {
                setFeedback({
                  ok: false,
                  text: res.error || (isAr ? 'تعذر تأكيد تسجيل الدخول.' : 'Check-in confirmation failed.'),
                });
                return;
              }
              setFeedback({
                ok: true,
                text: isAr
                  ? `تم تأكيد تسجيل الدخول السريع للحجز ${activeBooking.bookingCode}. نتمنى لك إقامة سعيدة!`
                  : `Express check-in confirmed for ${activeBooking.bookingCode}. Enjoy your stay!`,
              });
            }}
            className={`bg-white rounded-xl border p-5 space-y-4 transition-all ${
              activeAction === 'checkin'
                ? 'border-cyan-700 ring-2 ring-cyan-100'
                : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-emerald-700" />
                <span>
                  {isAr
                    ? `تسجيل الدخول السريع للحجز (${activeBooking.bookingCode})`
                    : `Express Check-In for Reservation (${activeBooking.bookingCode})`}
                </span>
              </h3>
              <span className="text-xs font-mono-num text-cyan-800 font-semibold">
                {activeBooking.checkIn} → {activeBooking.checkOut}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {isAr ? 'رقم البطاقة / جواز السفر' : 'National ID / Passport'}
                </label>
                <input
                  ref={idPassportInputRef}
                  required
                  value={idPassport}
                  onChange={(e) => setIdPassport(e.target.value)}
                  placeholder={isAr ? 'مثال: 29001122334455' : 'ID or Passport Number'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {isAr ? 'عدد النزلاء' : 'Number of Guests'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={chalet.maxGuests}
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {isAr ? 'وقت الوصول / ملاحظات' : 'Arrival Time / Notes'}
                </label>
                <input
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  placeholder={isAr ? 'مثال: الوصول 3 عصراً' : 'e.g., Arriving at 3:00 PM'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isAr ? 'تأكيد تسجيل الوصول الآن' : 'Complete Express Check-In'}</span>
            </button>
          </form>
        </div>
      ) : activeAction === 'checkin' ? (
        <div
          ref={checkInSectionRef}
          className="bg-white rounded-xl border border-cyan-700 ring-2 ring-cyan-100 p-5 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-emerald-700" />
              <span>
                {activeBooking?.status === 'checked_in'
                  ? isAr
                    ? `تم تسجيل الدخول مسبقاً للحجز ${activeBooking.bookingCode}`
                    : `Check-In Already Completed (${activeBooking.bookingCode})`
                  : isAr
                    ? `حالة تسجيل الوصول للشاليه ${chalet.chaletNumber}`
                    : `Check-In Status for Chalet ${chalet.chaletNumber}`}
              </span>
            </h3>
            <p className="text-slate-600">
              {activeBooking?.status === 'checked_in'
                ? isAr
                  ? `إقامتك مسجلة حالياً من ${activeBooking.checkIn} حتى ${activeBooking.checkOut}.`
                  : `Your stay is active from ${activeBooking.checkIn} through ${activeBooking.checkOut}.`
                : isAr
                  ? 'لا يوجد حجز قادم بانتظار تسجيل الوصول لهذا الشاليه. تواصل مع الاستقبال على +20 100 220 1100.'
                  : 'No upcoming reservation awaiting check-in for this chalet. Contact Front Desk at +20 100 220 1100.'}
            </p>
          </div>
          <span className="font-mono-num font-semibold text-cyan-800">+20 100 220 1100</span>
        </div>
      ) : null}

      {/* Guest Quick Service Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          ref={housekeepingSectionRef}
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await onRequestHousekeeping(
              chalet.id,
              hkNote || (isAr ? 'طلب تنظيف وتبديل مناشف من النزيل' : 'Guest requested room refresh & fresh towels')
            );
            if (res && !res.ok) {
              setFeedback({
                ok: false,
                text: res.error || (isAr ? 'تعذر إرسال طلب التدبير الفندقي.' : 'Failed to send request.'),
              });
              return;
            }
            setHkNote('');
            setFeedback({
              ok: true,
              text: isAr
                ? 'تم إرسال طلب التدبير الفندقي لفريق النظافة بنجاح.'
                : 'Housekeeping request sent to resort staff.',
            });
          }}
          className={`bg-white rounded-xl border p-5 space-y-3 transition-all ${
            activeAction === 'housekeeping'
              ? 'border-cyan-700 ring-2 ring-cyan-100'
              : 'border-slate-200'
          }`}
        >
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-800" />
            <span>{isAr ? 'طلب خدمة التدبير الفندقي' : 'Request Housekeeping'}</span>
          </h3>
          <textarea
            ref={hkNoteInputRef}
            rows={2}
            value={hkNote}
            onChange={(e) => setHkNote(e.target.value)}
            placeholder={
              isAr
                ? 'مثال: تغيير المناشف أو تنظيف إضافي الساعة 4 عصراً...'
                : 'e.g., Fresh towels or room refresh at 4:00 PM...'
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
          >
            {isAr ? 'إرسال طلب التنظيف' : 'Send Housekeeping Request'}
          </button>
        </form>

        <form
          ref={maintenanceSectionRef}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!mntDesc.trim()) return;
            const res = await onReportMaintenance(chalet.id, mntProblem, mntDesc);
            if (res && !res.ok) {
              setFeedback({
                ok: false,
                text: res.error || (isAr ? 'تعذر تسجيل بلاغ الصيانة.' : 'Failed to submit ticket.'),
              });
              return;
            }
            setMntDesc('');
            setFeedback({
              ok: true,
              text: isAr
                ? 'تم تسجيل بلاغ الصيانة وسيصل الفني المختص قريباً.'
                : 'Maintenance issue reported. Our technician has been notified.',
            });
          }}
          className={`bg-white rounded-xl border p-5 space-y-3 transition-all ${
            activeAction === 'maintenance'
              ? 'border-amber-500 ring-2 ring-amber-100'
              : 'border-slate-200'
          }`}
        >
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" />
            <span>{isAr ? 'الإبلاغ عن مشكلة صيانة' : 'Report Maintenance Problem'}</span>
          </h3>
          <input
            value={mntProblem}
            onChange={(e) => setMntProblem(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <textarea
            ref={mntDescInputRef}
            rows={2}
            required
            value={mntDesc}
            onChange={(e) => setMntDesc(e.target.value)}
            placeholder={
              isAr ? 'اشرح المشكلة بإيجاز (تكييف، سباكة، كهرباء)...' : 'Briefly describe the issue...'
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
          >
            {isAr ? 'إرسال بلاغ الصيانة' : 'Report Maintenance Issue'}
          </button>
        </form>
      </div>

      {/* Resort Info & Partner Offers */}
      <div
        ref={offersSectionRef}
        className={`bg-white rounded-xl border p-5 space-y-4 transition-all ${
          activeAction === 'offers'
            ? 'border-cyan-700 ring-2 ring-cyan-100'
            : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-800" />
            <span>{isAr ? 'عروض المطاعم والسوبرماركت داخل المنتجع' : 'Resort Restaurant & Supermarket Offers'}</span>
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dataset.offers.map((o) => (
            <div key={o.id} className="p-4 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {isAr ? o.businessNameAr : o.businessName}
                </div>
                <div className="text-xs text-cyan-800 mt-0.5">{isAr ? o.titleAr : o.title}</div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono-num">
                  {o.phone} · {o.availability}
                </div>
              </div>
              <span className="text-xs font-mono-num font-bold text-amber-700 shrink-0">
                {o.discount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
