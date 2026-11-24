import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  PowerOff,
  Search,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { getT } from '../i18n/translations';
import { COMPANY_BRANDING } from '../constants/branding';
import { CompanyLogo } from './CompanyLogo';
import {
  Booking,
  Chalet,
  Language,
  MaintenanceTicket,
  Owner,
  UserRole,
} from '../types/platform';
import {
  ChaletOccupancySnapshot,
  computeChaletOccupancy,
  DynamicOccupancyStatus,
  getTodayIsoDate,
  OccupancyFilterKey,
} from '../utils/chaletOccupancy';

interface ChaletOccupancyMapProps {
  chalets: Chalet[];
  bookings: Booking[];
  owners: Owner[];
  maintenance: MaintenanceTicket[];
  lang: Language;
  dataSource?: 'demo' | 'supabase';
  userRole?: UserRole;
  canViewBookingValue?: boolean;
  canAccessChalets?: boolean;
  canAccessBookings?: boolean;
  canAccessMaintenance?: boolean;
  canAccessOwnerPortal?: boolean;
  onNavigate?: (tab: string) => void;
  onOpenChaletDetails?: (chaletNumber: string) => void;
  titleOverride?: string;
}

interface StatusVisualConfig {
  cardClass: string;
  labelClass: string;
  swatchClass: string;
  icon: React.ComponentType<{ className?: string }>;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

const STATUS_VISUALS: Record<DynamicOccupancyStatus, StatusVisualConfig> = {
  available: {
    cardClass: 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-500',
    labelClass: 'text-emerald-800',
    swatchClass: 'bg-emerald-500 border-emerald-600',
    icon: CheckCircle2,
    labelAr: 'متاح',
    labelEn: 'Available',
    descAr: 'جاهز للحجز ولا توجد إقامة نشطة اليوم',
    descEn: 'Ready to book with no active stay today',
  },
  occupied: {
    cardClass: 'border-cyan-300 bg-cyan-50/45 hover:border-cyan-600',
    labelClass: 'text-cyan-900',
    swatchClass: 'bg-cyan-700 border-cyan-800',
    icon: UserCheck,
    labelAr: 'مشغول',
    labelEn: 'Occupied',
    descAr: 'نزيل مقيم حالياً ضمن نطاق تواريخ الحجز',
    descEn: 'Guest currently in-house for today',
  },
  upcoming: {
    cardClass: 'border-indigo-300 bg-indigo-50/40 hover:border-indigo-500',
    labelClass: 'text-indigo-800',
    swatchClass: 'bg-indigo-600 border-indigo-700',
    icon: CalendarClock,
    labelAr: 'حجز قادم',
    labelEn: 'Upcoming Reservation',
    descAr: 'يوجد حجز مؤكد قادم خلال الأيام المقبلة',
    descEn: 'Confirmed future reservation scheduled',
  },
  checkin_today: {
    cardClass: 'border-sky-300 bg-sky-50/55 hover:border-sky-600',
    labelClass: 'text-sky-900',
    swatchClass: 'bg-sky-600 border-sky-700',
    icon: LogIn,
    labelAr: 'وصول اليوم',
    labelEn: 'Check-in Today',
    descAr: 'موعد تسجيل دخول النزيل اليوم',
    descEn: 'Guest scheduled to arrive today',
  },
  checkout_today: {
    cardClass: 'border-amber-300 bg-amber-50/55 hover:border-amber-600',
    labelClass: 'text-amber-900',
    swatchClass: 'bg-amber-500 border-amber-600',
    icon: LogOut,
    labelAr: 'مغادرة اليوم',
    labelEn: 'Check-out Today',
    descAr: 'موعد تسجيل مغادرة النزيل المقيم اليوم',
    descEn: 'In-house guest departing today',
  },
  maintenance: {
    cardClass: 'border-red-300 bg-red-50/45 hover:border-red-500',
    labelClass: 'text-red-800',
    swatchClass: 'bg-red-600 border-red-700',
    icon: Wrench,
    labelAr: 'تحت الصيانة',
    labelEn: 'Under Maintenance',
    descAr: 'خارج الخدمة مؤقتاً لأعمال الصيانة',
    descEn: 'Out of service for technical maintenance',
  },
  inactive: {
    cardClass: 'border-slate-200 bg-slate-100/80 hover:border-slate-400 opacity-80',
    labelClass: 'text-slate-600',
    swatchClass: 'bg-slate-400 border-slate-500',
    icon: PowerOff,
    labelAr: 'غير نشط',
    labelEn: 'Inactive',
    descAr: 'شاليه موقوف إدارياً عن العرض والتأجير',
    descEn: 'Unit deactivated by management',
  },
};

const ALL_LEGEND_STATUSES: DynamicOccupancyStatus[] = [
  'available',
  'occupied',
  'upcoming',
  'checkin_today',
  'checkout_today',
  'maintenance',
  'inactive',
];

export const ChaletOccupancyMap: React.FC<ChaletOccupancyMapProps> = ({
  chalets,
  bookings,
  owners,
  maintenance,
  lang,
  dataSource = 'demo',
  userRole = 'super_admin',
  canViewBookingValue = true,
  canAccessChalets = true,
  canAccessBookings = true,
  canAccessMaintenance = true,
  canAccessOwnerPortal = false,
  onNavigate,
  onOpenChaletDetails,
  titleOverride,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const today = getTodayIsoDate();
  const showFinancials =
    canViewBookingValue &&
    (userRole === 'super_admin' ||
      userRole === 'manager' ||
      userRole === 'owner' ||
      userRole === 'reception');

  const [bucketFilter, setBucketFilter] = useState<OccupancyFilterKey>('all');
  const [exactStatusFilter, setExactStatusFilter] = useState<DynamicOccupancyStatus | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<ChaletOccupancySnapshot | null>(null);

  const ownerMap = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  // Dynamically calculate status for every chalet from live/demo booking date ranges & chalet state
  const snapshots = useMemo(() => {
    const sorted = [...chalets].sort((a, b) =>
      a.chaletNumber.localeCompare(b.chaletNumber, undefined, { numeric: true })
    );
    return sorted.map((ch) =>
      computeChaletOccupancy(ch, bookings, maintenance, ownerMap, today)
    );
  }, [chalets, bookings, maintenance, ownerMap, today]);

  // Summary counts computed from snapshots
  const summary = useMemo(() => {
    const total = snapshots.length;
    const available = snapshots.filter((s) => s.filterBucket === 'available').length;
    const occupied = snapshots.filter((s) => s.filterBucket === 'occupied').length;
    const upcoming = snapshots.filter((s) => s.filterBucket === 'upcoming').length;
    const maintenanceCount = snapshots.filter((s) => s.filterBucket === 'maintenance').length;
    const inactive = snapshots.filter((s) => s.filterBucket === 'inactive').length;

    const checkinToday = snapshots.filter((s) => s.dynamicStatus === 'checkin_today').length;
    const checkoutToday = snapshots.filter((s) => s.dynamicStatus === 'checkout_today').length;

    const demoChalets = snapshots.filter((s) => s.chalet.isDemo).length;
    const liveChalets = total - demoChalets;
    const demoActiveBookings = snapshots.filter((s) => s.displayBooking?.isDemo).length;
    const liveActiveBookings = snapshots.filter(
      (s) => s.displayBooking && !s.displayBooking.isDemo
    ).length;

    return {
      total,
      available,
      occupied,
      upcoming,
      maintenance: maintenanceCount,
      inactive,
      checkinToday,
      checkoutToday,
      demoChalets,
      liveChalets,
      demoActiveBookings,
      liveActiveBookings,
    };
  }, [snapshots]);

  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((snap) => {
      if (exactStatusFilter && snap.dynamicStatus !== exactStatusFilter) {
        return false;
      }
      if (!exactStatusFilter && bucketFilter !== 'all' && snap.filterBucket !== bucketFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const ownerName = `${snap.owner?.fullName || ''} ${snap.owner?.fullNameAr || ''}`.toLowerCase();
        const guestName = snap.displayBooking?.guestName.toLowerCase() || '';
        const bookingCode = snap.displayBooking?.bookingCode.toLowerCase() || '';
        return (
          snap.chalet.chaletNumber.toLowerCase().includes(q) ||
          ownerName.includes(q) ||
          guestName.includes(q) ||
          bookingCode.includes(q)
        );
      }
      return true;
    });
  }, [snapshots, bucketFilter, exactStatusFilter, search]);

  const handleSelectBucket = (key: OccupancyFilterKey) => {
    setExactStatusFilter(null);
    setBucketFilter(key);
  };

  const handleToggleLegendStatus = (status: DynamicOccupancyStatus) => {
    if (exactStatusFilter === status) {
      setExactStatusFilter(null);
    } else {
      setBucketFilter('all');
      setExactStatusFilter(status);
    }
  };

  const hasDemoItems = summary.demoChalets > 0 || summary.demoActiveBookings > 0;

  const filterButtons: Array<{ key: OccupancyFilterKey; label: string; count: number }> = [
    { key: 'all', label: isAr ? 'الكل' : 'All', count: summary.total },
    { key: 'available', label: isAr ? 'متاح' : 'Available', count: summary.available },
    { key: 'occupied', label: isAr ? 'مشغول' : 'Occupied', count: summary.occupied },
    { key: 'upcoming', label: isAr ? 'حجز قادم' : 'Upcoming', count: summary.upcoming },
    { key: 'maintenance', label: isAr ? 'صيانة' : 'Maintenance', count: summary.maintenance },
    { key: 'inactive', label: isAr ? 'غير نشط' : 'Inactive', count: summary.inactive },
  ];

  const summaryCards: Array<{
    key: OccupancyFilterKey;
    label: string;
    value: number;
    sub: string;
    textColor: string;
  }> = [
    {
      key: 'all',
      label: isAr ? 'إجمالي الشاليهات' : 'Total Chalets',
      value: summary.total,
      sub: isAr ? `حالة اليوم · ${today}` : `Live for ${today}`,
      textColor: 'text-slate-900',
    },
    {
      key: 'available',
      label: isAr ? 'متاح' : 'Available',
      value: summary.available,
      sub: isAr ? 'جاهز للتسكين' : 'Ready for booking',
      textColor: 'text-emerald-700',
    },
    {
      key: 'occupied',
      label: isAr ? 'مشغول' : 'Occupied',
      value: summary.occupied,
      sub:
        summary.checkoutToday > 0
          ? isAr
            ? `يشمل ${summary.checkoutToday} مغادرة اليوم`
            : `Includes ${summary.checkoutToday} check-out today`
          : isAr
          ? 'نزلاء مقيمون حالياً'
          : 'Currently in-house',
      textColor: 'text-cyan-800',
    },
    {
      key: 'upcoming',
      label: isAr ? 'حجوزات قادمة' : 'Upcoming',
      value: summary.upcoming,
      sub:
        summary.checkinToday > 0
          ? isAr
            ? `يشمل ${summary.checkinToday} وصول اليوم`
            : `Includes ${summary.checkinToday} check-in today`
          : isAr
          ? 'حجوزات مستقبلية مؤكدة'
          : 'Confirmed reservations',
      textColor: 'text-indigo-700',
    },
    {
      key: 'maintenance',
      label: isAr ? 'تحت الصيانة' : 'Maintenance',
      value: summary.maintenance,
      sub: isAr ? 'وحدات موقوفة للصيانة' : 'Out for repair',
      textColor: 'text-red-700',
    },
    {
      key: 'inactive',
      label: isAr ? 'غير نشط' : 'Inactive',
      value: summary.inactive,
      sub: isAr ? 'موقوف إدارياً' : 'Deactivated units',
      textColor: 'text-slate-500',
    },
  ];

  return (
    <section className="space-y-5">
      {/* Section Header & Demo/Live Distinction Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <CompanyLogo size="sm" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-cyan-800 truncate">
                {COMPANY_BRANDING.companyName} · {t.brandName}
              </div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-800 shrink-0" />
                <span>
                  {titleOverride ||
                    (isAr
                      ? 'خريطة حالة وإشغال الشاليهات المباشرة'
                      : 'Chalet Occupancy Status Map')}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'تُحسب حالة كل شاليه تلقائياً من نطاقات تواريخ الحجوزات الفعلية وحالة الوحدة اليومية.'
                  : 'Each chalet status is dynamically calculated from actual booking date ranges and unit state.'}
                {userRole === 'owner' && (
                  <>
                    {' · '}
                    <span className="font-medium text-cyan-800">
                      {isAr
                        ? 'عرض مقتصر على شاليهات المالك فقط'
                        : 'Scoped to your assigned owner portfolio'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isAr
                  ? 'بحث برقم الشاليه، المالك، أو النزيل...'
                  : 'Search chalet, owner, or guest...'
              }
              className="w-full ps-8 pe-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-700"
            />
          </div>
        </div>

        {/* Explicit DEMO DATA vs LIVE DATA Banner */}
        {hasDemoItems || dataSource === 'demo' ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
            <div className="flex items-start sm:items-center gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong className="font-bold">DEMO DATA:</strong>{' '}
                {isAr
                  ? `عرض ${summary.demoChalets} شاليهات تجريبية و ${summary.liveChalets} شاليهات فعلية · (${summary.demoActiveBookings} حجوزات تجريبية / ${summary.liveActiveBookings} حجوزات فعلية).`
                  : `Showing ${summary.demoChalets} demo chalet(s) and ${summary.liveChalets} live chalet(s) · (${summary.demoActiveBookings} demo / ${summary.liveActiveBookings} live active bookings).`}
              </span>
            </div>
            <span className="font-mono-num text-[11px] font-bold text-amber-800 whitespace-nowrap">
              {summary.liveChalets} {isAr ? 'فعلي' : 'LIVE'} · {summary.demoChalets}{' '}
              {isAr ? 'تجريبي' : 'DEMO'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong className="font-bold">LIVE DATA:</strong>{' '}
                {isAr
                  ? `جميع الشاليهات (${summary.liveChalets}) والحجوزات المعروضة بيانات حية من قاعدة البيانات.`
                  : `All ${summary.liveChalets} chalets and active reservations are live database records.`}
              </span>
            </div>
            <span className="font-mono-num text-[11px] font-bold text-emerald-800 whitespace-nowrap">
              {summary.liveChalets} {isAr ? 'فعلي' : 'LIVE'}
            </span>
          </div>
        )}

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {summaryCards.map((card) => {
            const active = !exactStatusFilter && bucketFilter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => handleSelectBucket(card.key)}
                className={`text-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-cyan-700 bg-cyan-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-[11px] font-medium text-slate-500">{card.label}</div>
                <div className={`mt-1 text-xl font-bold font-mono-num ${card.textColor}`}>
                  {card.value}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 truncate">{card.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {filterButtons.map((btn) => {
              const active = !exactStatusFilter && bucketFilter === btn.key;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => handleSelectBucket(btn.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {btn.label}{' '}
                  <span className="font-mono-num text-[11px] text-slate-400">
                    ({btn.count})
                  </span>
                </button>
              );
            })}
          </div>

          {(exactStatusFilter || bucketFilter !== 'all' || search.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setBucketFilter('all');
                setExactStatusFilter(null);
                setSearch('');
              }}
              className="text-xs font-medium text-cyan-800 hover:underline self-start md:self-auto whitespace-nowrap cursor-pointer"
            >
              {isAr ? 'إعادة ضبط الفلتر' : 'Reset Filter'}
            </button>
          )}
        </div>

        {/* Interactive Chalet Map Grid */}
        {filteredSnapshots.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
            {isAr
              ? 'لا توجد شاليهات مطابقة لمعايير التصفية الحالية.'
              : 'No chalets match the current filter criteria.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {filteredSnapshots.map((snap) => {
              const visual = STATUS_VISUALS[snap.dynamicStatus];
              const StatusIcon = visual.icon;
              const ch = snap.chalet;
              const booking = snap.displayBooking;
              const hasOpenTicket = snap.activeMaintenanceTickets.length > 0;

              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedSnapshot(snap)}
                  className={`text-start rounded-xl border p-3.5 transition-colors cursor-pointer flex flex-col justify-between min-h-[126px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${visual.cardClass}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-bold font-mono-num text-slate-900 tracking-tight">
                        {ch.chaletNumber}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                        {snap.isDemoData
                          ? isAr
                            ? 'تجريبي'
                            : 'Demo'
                          : isAr
                          ? 'فعلي'
                          : 'Live'}
                      </span>
                    </div>

                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${visual.labelClass}`}>
                      <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {isAr ? visual.labelAr : visual.labelEn}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2 border-t border-slate-900/10 space-y-1 text-[11px]">
                    {booking ? (
                      <>
                        <div className="font-semibold text-slate-900 truncate">
                          {booking.guestName}
                        </div>
                        <div className="font-mono-num text-slate-600 truncate">
                          {booking.checkIn.slice(5)} → {booking.checkOut.slice(5)}
                        </div>
                      </>
                    ) : snap.dynamicStatus === 'maintenance' ? (
                      <div className="text-red-800 truncate">
                        {snap.activeMaintenanceTickets[0]?.problemType ||
                          (isAr ? 'قيد الصيانة الفنية' : 'Technical maintenance')}
                      </div>
                    ) : snap.dynamicStatus === 'inactive' ? (
                      <div className="text-slate-500 truncate">
                        {isAr ? 'وحدة غير مفعلة' : 'Deactivated'}
                      </div>
                    ) : (
                      <>
                        {showFinancials ? (
                          <div className="font-mono-num font-semibold text-slate-800">
                            {ch.nightlyPrice.toLocaleString()} {t.currency}
                            <span className="font-normal text-slate-500">
                              {' '}
                              / {isAr ? 'ليلة' : 'nt'}
                            </span>
                          </div>
                        ) : (
                          <div className="font-semibold text-emerald-800 truncate">
                            {isAr ? 'جاهز للتسكين' : 'Ready for guest'}
                          </div>
                        )}
                        <div className="text-slate-500 truncate">
                          {ch.status === 'cleaning'
                            ? isAr
                              ? 'جاري التنظيف والتجهيز'
                              : 'Cleaning / Prep'
                            : isAr
                            ? ch.viewTypeAr
                            : ch.viewType}
                        </div>
                      </>
                    )}

                    {hasOpenTicket && snap.dynamicStatus !== 'maintenance' && (
                      <div className="flex items-center gap-1 text-[10px] font-medium text-amber-800 truncate">
                        <Wrench className="w-3 h-3 shrink-0" />
                        <span>
                          {snap.activeMaintenanceTickets.length}{' '}
                          {isAr ? 'بلاغ صيانة' : 'maint. ticket'}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Clear Legend Explaining Every Status */}
        <div className="pt-3 border-t border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">
              {isAr ? 'دليل حالات الشاليهات (اضغط للتصفية الدقيقة)' : 'Status Legend (click any status to filter)'}
            </span>
            {exactStatusFilter && (
              <span className="text-[11px] font-medium text-cyan-800">
                {isAr ? 'تصفية دقيقة نشطة:' : 'Focused status:'}{' '}
                {isAr
                  ? STATUS_VISUALS[exactStatusFilter].labelAr
                  : STATUS_VISUALS[exactStatusFilter].labelEn}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            {ALL_LEGEND_STATUSES.map((st) => {
              const cfg = STATUS_VISUALS[st];
              const Icon = cfg.icon;
              const isFocused = exactStatusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleToggleLegendStatus(st)}
                  className={`text-start p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    isFocused
                      ? 'border-cyan-700 bg-cyan-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span
                      className={`w-2.5 h-2.5 rounded-xs border shrink-0 ${cfg.swatchClass}`}
                      aria-hidden="true"
                    />
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.labelClass}`} />
                    <span className={`truncate ${cfg.labelClass}`}>
                      {isAr ? cfg.labelAr : cfg.labelEn}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                    {isAr ? cfg.descAr : cfg.descEn}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Chalet Details Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            {(() => {
              const snap = selectedSnapshot;
              const ch = snap.chalet;
              const visual = STATUS_VISUALS[snap.dynamicStatus];
              const StatusIcon = visual.icon;
              const booking = snap.displayBooking;
              const ownerName = snap.owner
                ? isAr
                  ? snap.owner.fullNameAr
                  : snap.owner.fullName
                : '-';

              return (
                <>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyLogo size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold font-mono-num text-slate-900">
                            {ch.chaletNumber}
                          </h3>
                          <span className="text-xs text-slate-400">·</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${visual.labelClass}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            <span>{isAr ? visual.labelAr : visual.labelEn}</span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {COMPANY_BRANDING.companyName} · {isAr ? ch.viewTypeAr : ch.viewType} ·{' '}
                          {isAr ? 'الدور' : 'Floor'} {ch.floor} ·{' '}
                          {snap.isDemoData
                            ? isAr
                              ? 'بيانات تجريبية (Demo)'
                              : 'Demo Data'
                            : isAr
                            ? 'بيانات فعلية (Live)'
                            : 'Live Data'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedSnapshot(null)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      aria-label={t.actions.cancel}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-6 space-y-5 text-xs">
                    {/* Unit & Owner Overview */}
                    <div className="grid grid-cols-2 gap-3.5 pb-4 border-b border-slate-100">
                      <div>
                        <div className="text-slate-500">{isAr ? 'رقم الشاليه' : 'Chalet Number'}</div>
                        <div className="mt-0.5 font-mono-num font-bold text-sm text-slate-900">
                          {ch.chaletNumber}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">{isAr ? 'المالك' : 'Owner'}</div>
                        <div className="mt-0.5 font-semibold text-sm text-slate-900">{ownerName}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">{isAr ? 'الحالة المحسوبة' : 'Current Status'}</div>
                        <div className={`mt-0.5 font-semibold text-sm ${visual.labelClass}`}>
                          {isAr ? visual.labelAr : visual.labelEn}
                          {ch.status === 'cleaning' && snap.dynamicStatus === 'available' && (
                            <span className="text-amber-700 font-normal">
                              {' '}
                              ({t.status.cleaning})
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">
                          {isAr ? 'السعر القياسي لليلة' : 'Standard Nightly Rate'}
                        </div>
                        <div className="mt-0.5 font-mono-num font-semibold text-sm text-slate-900">
                          {showFinancials
                            ? `${ch.nightlyPrice.toLocaleString()} ${t.currency}`
                            : isAr
                            ? 'مصرح للمسؤولين فقط'
                            : 'Authorized users only'}
                        </div>
                      </div>
                    </div>

                    {/* Current / Next Booking Details */}
                    <div className="space-y-3 pb-4 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {snap.currentBooking
                            ? isAr
                              ? 'الحجز الحالي / تسكين اليوم'
                              : 'Current Stay / Today Reservation'
                            : snap.nextBooking
                            ? isAr
                              ? 'الحجز القادم التالي'
                              : 'Next Upcoming Reservation'
                            : isAr
                            ? 'معلومات الحجز'
                            : 'Reservation Status'}
                        </h4>
                        {booking && (
                          <span className="font-mono-num text-slate-500">
                            {booking.bookingCode} ·{' '}
                            {booking.isDemo
                              ? isAr
                                ? 'تجريبي'
                                : 'Demo'
                              : isAr
                              ? 'فعلي'
                              : 'Live'}
                          </span>
                        )}
                      </div>

                      {booking ? (
                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="text-slate-500">
                              {isAr ? 'النزيل الحالي / القادم' : 'Current / Next Guest'}
                            </div>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {booking.guestName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-num">
                              {booking.phone}
                            </div>
                          </div>

                          <div>
                            <div className="text-slate-500">
                              {isAr ? 'قيمة الحجز الحالي' : 'Booking Value'}
                            </div>
                            {showFinancials ? (
                              <>
                                <div className="mt-0.5 font-mono-num font-bold text-sm text-cyan-900">
                                  {booking.totalValue.toLocaleString()} {t.currency}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono-num">
                                  {booking.nights} {t.nights} · {t.status[booking.paymentStatus]}
                                </div>
                              </>
                            ) : (
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {isAr
                                  ? 'القيمة المالية متاحة للإدارة والمالك فقط'
                                  : 'Financial value restricted to authorized staff & owner'}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-slate-500">{isAr ? 'تاريخ الوصول' : 'Check-in'}</div>
                            <div className="mt-0.5 font-mono-num font-semibold text-slate-900">
                              {booking.checkIn}
                            </div>
                          </div>

                          <div>
                            <div className="text-slate-500">{isAr ? 'تاريخ المغادرة' : 'Check-out'}</div>
                            <div className="mt-0.5 font-mono-num font-semibold text-slate-900">
                              {booking.checkOut}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500">
                          {isAr
                            ? 'لا يوجد نزيل مقيم أو حجز قادم مسجل لهذا الشاليه حالياً.'
                            : 'No active stay or upcoming reservation is currently scheduled for this chalet.'}
                        </p>
                      )}

                      {snap.currentBooking && snap.nextBooking && (
                        <div className="mt-2 p-3 rounded-lg bg-indigo-50/60 border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-semibold text-indigo-900">
                              {isAr ? 'الحجز القادم التالي:' : 'Next Scheduled Reservation:'}{' '}
                              {snap.nextBooking.guestName}
                            </div>
                            <div className="text-[11px] font-mono-num text-indigo-700">
                              {snap.nextBooking.bookingCode} · {snap.nextBooking.checkIn} →{' '}
                              {snap.nextBooking.checkOut}
                            </div>
                          </div>
                          {showFinancials && (
                            <span className="font-mono-num font-bold text-indigo-900">
                              {snap.nextBooking.totalValue.toLocaleString()} {t.currency}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Maintenance Status */}
                    <div className="space-y-2.5">
                      <h4 className="font-bold text-slate-900 text-sm">
                        {isAr ? 'حالة الصيانة' : 'Maintenance Status'}
                      </h4>

                      {snap.activeMaintenanceTickets.length > 0 ? (
                        <div className="space-y-2">
                          {snap.activeMaintenanceTickets.map((mt) => (
                            <div
                              key={mt.id}
                              className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900">
                                  {mt.problemType}
                                </span>
                                <span className="font-medium text-red-700">
                                  {t.priority[mt.priority]} · {t.status[mt.status]}
                                </span>
                              </div>
                              <p className="text-slate-600">{mt.description}</p>
                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>
                                  {isAr ? 'الفني:' : 'Technician:'}{' '}
                                  {mt.technicianName || (isAr ? 'غير معين' : 'Unassigned')}
                                </span>
                                {showFinancials && (
                                  <span className="font-mono-num">
                                    {mt.cost.toLocaleString()} {t.currency}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          {ch.status === 'maintenance'
                            ? isAr
                              ? 'الوحدة مصنفة تحت الصيانة التشغيلية حالياً.'
                              : 'Unit is currently marked under operational maintenance.'
                            : isAr
                            ? 'لا توجد بلاغات صيانة مفتوحة على هذا الشاليه.'
                            : 'No open maintenance tickets on this chalet.'}
                          {snap.latestMaintenanceTicket && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {isAr ? 'آخر صيانة مسجلة:' : 'Last recorded ticket:'}{' '}
                              {snap.latestMaintenanceTicket.problemType} (
                              {t.status[snap.latestMaintenanceTicket.status]})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {canAccessChalets && (onOpenChaletDetails || onNavigate) && (
                        <button
                          type="button"
                          onClick={() => {
                            const num = ch.chaletNumber;
                            setSelectedSnapshot(null);
                            if (onOpenChaletDetails) {
                              onOpenChaletDetails(num);
                            } else {
                              onNavigate?.('chalets');
                            }
                          }}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {isAr ? 'تفاصيل الشاليه' : 'Chalet Details'}
                        </button>
                      )}
                      {!canAccessChalets && canAccessOwnerPortal && onNavigate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSnapshot(null);
                            onNavigate('ownerPortal');
                          }}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {t.nav.ownerPortal}
                        </button>
                      )}
                      {canAccessBookings && onNavigate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSnapshot(null);
                            onNavigate('bookings');
                          }}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {t.nav.bookings}
                        </button>
                      )}
                      {canAccessMaintenance && onNavigate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSnapshot(null);
                            onNavigate('maintenance');
                          }}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {t.nav.maintenance}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSnapshot(null)}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer"
                    >
                      {isAr ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
};
