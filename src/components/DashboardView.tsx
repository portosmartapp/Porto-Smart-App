import React from 'react';
import {
  Building2,
  CalendarCheck2,
  LogIn,
  LogOut,
  TrendingUp,
  Zap,
  Droplets,
  Wrench,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { getT } from '../i18n/translations';
import { Language, PlatformDataset, UserRole } from '../types/platform';
import {
  ExpensesDonutChart,
  HorizontalRevenueChart,
  MonthlyIncomeBarChart,
  OccupancyAreaChart,
  OwnerVsMgmtChart,
} from './Charts';
import { HistoricalBookingTrendsChart } from './HistoricalBookingTrendsChart';
import { ChaletOccupancyMap } from './ChaletOccupancyMap';
import { CompanyLogo } from './CompanyLogo';
import { COMPANY_BRANDING } from '../constants/branding';
import { computeChaletOccupancy } from '../utils/chaletOccupancy';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from '../utils/egyptTime';

interface DashboardViewProps {
  dataset: PlatformDataset;
  lang: Language;
  dataSource?: 'demo' | 'supabase';
  userRole?: UserRole;
  onNavigate: (tab: string) => void;
  onOpenChaletDetails?: (chaletNumber: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  lang,
  dataSource = 'demo',
  userRole = 'super_admin',
  onNavigate,
  onOpenChaletDetails,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const today = getEgyptTodayIsoDate();

  const ownerMap = new Map(dataset.owners.map((o) => [o.id, o]));
  const activeChalets = dataset.chalets.filter((c) => c.isActive);
  const occupancySnapshots = activeChalets.map((ch) =>
    computeChaletOccupancy(ch, dataset.bookings, dataset.maintenance, ownerMap, today)
  );
  const occupiedCount = occupancySnapshots.filter(
    (s) => s.filterBucket === 'occupied'
  ).length;
  const availableCount = occupancySnapshots.filter(
    (s) => s.filterBucket === 'available'
  ).length;

  const activeBookings = dataset.bookings.filter((b) => b.status !== 'cancelled');
  const upcomingBookings = activeBookings.filter((b) => b.status === 'upcoming').length;
  const todayCheckIns = activeBookings.filter(
    (b) => normalizeToEgyptDateString(b.checkIn) === today && b.status !== 'checked_out'
  );
  const todayCheckOuts = activeBookings.filter(
    (b) => normalizeToEgyptDateString(b.checkOut) === today && b.status === 'checked_in'
  );

  // Financials computed from chalet percentages
  const chaletMap = new Map(dataset.chalets.map((c) => [c.id, c]));
  let totalRevenue = 0;
  let totalOwnerShare = 0;
  let totalMgmtShare = 0;

  activeBookings.forEach((b) => {
    totalRevenue += b.totalValue;
    const ch = chaletMap.get(b.chaletId);
    const ownerPct = ch ? ch.ownerPct : 75;
    const mgmtPct = ch ? ch.managementPct : 25;
    totalOwnerShare += (b.totalValue * ownerPct) / 100;
    totalMgmtShare += (b.totalValue * mgmtPct) / 100;
  });

  const avgElectricity =
    dataset.utilities.length > 0
      ? Math.round(
          dataset.utilities.reduce((s, u) => s + u.electricityBalance, 0) /
            dataset.utilities.length
        )
      : 0;
  const avgWater =
    dataset.utilities.length > 0
      ? Math.round(
          dataset.utilities.reduce((s, u) => s + u.waterBalance, 0) /
            dataset.utilities.length
        )
      : 0;

  const openMaintenance = dataset.maintenance.filter(
    (m) => m.status !== 'completed' && m.status !== 'closed'
  ).length;
  const openHousekeeping = dataset.housekeeping.filter(
    (h) => h.status !== 'completed'
  ).length;

  const lowBalanceAlerts = dataset.utilities.filter(
    (u) =>
      u.electricityBalance < u.electricityThreshold ||
      u.waterBalance < u.waterThreshold
  );

  // Chart data
  const monthlyIncomeData = isAr
    ? [
        { label: 'يونيو', value: 142000 },
        { label: 'يوليو', value: 238000 },
        { label: 'أغسطس', value: 294000 },
        { label: 'سبتمبر', value: 196000 },
        { label: 'أكتوبر', value: 164000 },
        { label: 'نوفمبر', value: Math.round(totalRevenue) },
      ]
    : [
        { label: 'Jun', value: 142000 },
        { label: 'Jul', value: 238000 },
        { label: 'Aug', value: 294000 },
        { label: 'Sep', value: 196000 },
        { label: 'Oct', value: 164000 },
        { label: 'Nov', value: Math.round(totalRevenue) },
      ];

  const occupancyPctNow =
    activeChalets.length > 0
      ? Math.round((occupiedCount / activeChalets.length) * 100)
      : 0;

  const occupancySeries = isAr
    ? [
        { label: 'يونيو', pct: 58 },
        { label: 'يوليو', pct: 86 },
        { label: 'أغسطس', pct: 94 },
        { label: 'سبتمبر', pct: 74 },
        { label: 'أكتوبر', pct: 61 },
        { label: 'الحالي', pct: occupancyPctNow },
      ]
    : [
        { label: 'Jun', pct: 58 },
        { label: 'Jul', pct: 86 },
        { label: 'Aug', pct: 94 },
        { label: 'Sep', pct: 74 },
        { label: 'Oct', pct: 61 },
        { label: 'Now', pct: occupancyPctNow },
      ];

  const revenueByChaletMap = new Map<string, number>();
  activeBookings.forEach((b) => {
    revenueByChaletMap.set(b.chaletId, (revenueByChaletMap.get(b.chaletId) ?? 0) + b.totalValue);
  });
  const topChaletRevenue = Array.from(revenueByChaletMap.entries())
    .map(([chaletId, val]) => ({
      label: chaletMap.get(chaletId)?.chaletNumber || chaletId,
      value: val,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const ownerEarnings = dataset.owners.map((owner) => {
    const ownerChaletIds = new Set(
      dataset.chalets.filter((c) => c.ownerId === owner.id).map((c) => c.id)
    );
    let ownerShare = 0;
    let mgmtShare = 0;
    activeBookings.forEach((b) => {
      if (ownerChaletIds.has(b.chaletId)) {
        const ch = chaletMap.get(b.chaletId);
        const op = ch ? ch.ownerPct : 75;
        ownerShare += (b.totalValue * op) / 100;
        mgmtShare += (b.totalValue * (100 - op)) / 100;
      }
    });
    return {
      label: isAr ? owner.fullNameAr : owner.fullName,
      ownerShare: Math.round(ownerShare),
      mgmtShare: Math.round(mgmtShare),
    };
  });

  const expColors: Record<string, string> = {
    electricity: '#0e7490',
    water: '#0284c7',
    housekeeping: '#d97706',
    maintenance: '#dc2626',
    other: '#64748b',
  };
  const expTotals: Record<string, number> = {
    electricity: 0,
    water: 0,
    housekeeping: 0,
    maintenance: 0,
    other: 0,
  };
  dataset.expenses.forEach((e) => {
    expTotals[e.category] = (expTotals[e.category] ?? 0) + e.amount;
  });
  const expenseChartItems = Object.entries(expTotals).map(([cat, value]) => ({
    label: t.expenseCategories[cat as keyof typeof t.expenseCategories],
    value,
    color: expColors[cat],
  }));

  const kpiCards = [
    {
      label: t.dashboard.totalChalets,
      value: activeChalets.length,
      sub: `${occupiedCount} ${t.status.occupied} · ${availableCount} ${t.status.available}`,
      icon: Building2,
      tab: 'chalets',
    },
    {
      label: t.dashboard.upcomingBookings,
      value: upcomingBookings,
      sub: `${todayCheckIns.length} ${t.dashboard.todayCheckIns} · ${todayCheckOuts.length} ${t.dashboard.todayCheckOuts}`,
      icon: CalendarCheck2,
      tab: 'bookings',
    },
    {
      label: t.dashboard.totalRevenue,
      value: `${Math.round(totalRevenue).toLocaleString()} ${t.currency}`,
      sub: `${t.dashboard.ownerShares}: ${Math.round(totalOwnerShare).toLocaleString()}`,
      icon: TrendingUp,
      tab: 'financials',
    },
    {
      label: t.dashboard.mgmtRevenue,
      value: `${Math.round(totalMgmtShare).toLocaleString()} ${t.currency}`,
      sub: `${isAr ? 'متوسط عمولة الإدارة' : 'Management Commission'}`,
      icon: TrendingUp,
      tab: 'financials',
    },
  ];

  const secondaryKpis = [
    {
      label: t.dashboard.occupiedChalets,
      value: `${occupiedCount} / ${activeChalets.length}`,
      icon: Building2,
      tab: 'chalets',
    },
    {
      label: t.dashboard.availableChalets,
      value: availableCount,
      icon: Building2,
      tab: 'chalets',
    },
    {
      label: t.dashboard.todayCheckIns,
      value: todayCheckIns.length,
      icon: LogIn,
      tab: 'bookings',
    },
    {
      label: t.dashboard.todayCheckOuts,
      value: todayCheckOuts.length,
      icon: LogOut,
      tab: 'bookings',
    },
    {
      label: t.dashboard.electricityBalance,
      value: `${avgElectricity} ${t.currency}`,
      icon: Zap,
      tab: 'utilities',
    },
    {
      label: t.dashboard.waterBalance,
      value: `${avgWater} ${t.currency}`,
      icon: Droplets,
      tab: 'utilities',
    },
    {
      label: t.dashboard.maintenanceRequests,
      value: openMaintenance,
      icon: Wrench,
      tab: 'maintenance',
    },
    {
      label: t.dashboard.housekeepingRequests,
      value: openHousekeeping,
      icon: Sparkles,
      tab: 'housekeeping',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Official Company & Platform Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <CompanyLogo size="md" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-cyan-800 truncate">
              {COMPANY_BRANDING.companyName}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {t.brandFull}
            </h2>
            <p className="text-xs text-slate-500 truncate">{t.brandSubtitle}</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 sm:text-end shrink-0">
          <div className="font-medium text-slate-700">{t.managedBy}</div>
          <div className="text-[11px] font-mono-num text-slate-500">{today}</div>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.tab)}
              className="text-start bg-white rounded-xl border border-slate-200 p-5 hover:border-cyan-700/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">{card.label}</span>
                <Icon className="w-4 h-4 text-cyan-800" />
              </div>
              <div className="mt-2.5 text-2xl font-bold font-mono-num text-slate-900">
                {card.value}
              </div>
              <div className="mt-1.5 text-xs text-slate-500 truncate">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Operational Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {secondaryKpis.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="text-start bg-white rounded-lg border border-slate-200 p-3.5 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-base font-bold font-mono-num text-slate-900">{item.value}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.label}</div>
            </button>
          );
        })}
      </div>

      {/* Interactive 22-Chalet Occupancy Status Map */}
      <ChaletOccupancyMap
        chalets={dataset.chalets}
        bookings={dataset.bookings}
        owners={dataset.owners}
        maintenance={dataset.maintenance}
        lang={lang}
        dataSource={dataSource}
        userRole={userRole}
        canViewBookingValue={
          userRole === 'super_admin' ||
          userRole === 'manager' ||
          userRole === 'owner' ||
          userRole === 'reception'
        }
        canAccessChalets={userRole === 'super_admin' || userRole === 'manager' || userRole === 'reception'}
        canAccessBookings={userRole === 'super_admin' || userRole === 'manager' || userRole === 'reception'}
        canAccessMaintenance={
          userRole === 'super_admin' ||
          userRole === 'manager' ||
          userRole === 'owner' ||
          userRole === 'reception' ||
          userRole === 'maintenance'
        }
        canAccessOwnerPortal={userRole === 'owner' || userRole === 'super_admin'}
        onNavigate={onNavigate}
        onOpenChaletDetails={onOpenChaletDetails}
      />

      {/* 12-Month Historical Booking Trends & Month-over-Month Occupancy Growth (Recharts) */}
      <HistoricalBookingTrendsChart
        bookings={dataset.bookings}
        chalets={dataset.chalets}
        lang={lang}
        dataSource={dataSource}
      />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">{t.dashboard.monthlyIncomeChart}</h3>
            <span className="text-xs text-slate-500">{t.currency}</span>
          </div>
          <MonthlyIncomeBarChart data={monthlyIncomeData} currency={t.currency} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">{t.dashboard.occupancyChart}</h3>
            <span className="text-xs font-mono-num font-semibold text-cyan-800">
              {occupancyPctNow}% {isAr ? 'الإشغال الحالي' : 'Current'}
            </span>
          </div>
          <OccupancyAreaChart data={occupancySeries} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {t.dashboard.revenueByChaletChart}
          </h3>
          <HorizontalRevenueChart items={topChaletRevenue} currency={t.currency} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {t.dashboard.ownerVsMgmtChart}
          </h3>
          <OwnerVsMgmtChart items={ownerEarnings} currency={t.currency} lang={lang} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {t.dashboard.expensesChart}
          </h3>
          <ExpensesDonutChart items={expenseChartItems} currency={t.currency} />
        </div>
      </div>

      {/* Live Operational Desk & Low Balance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'حركة الوصول والمغادرة اليوم' : "Today's Arrivals & Departures"}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('bookings')}
              className="text-xs font-medium text-cyan-800 hover:underline cursor-pointer"
            >
              {isAr ? 'عرض الكل' : 'View Desk'}
            </button>
          </div>
          {todayCheckIns.length === 0 && todayCheckOuts.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              {isAr ? 'لا توجد حركات وصول أو مغادرة مجدولة اليوم.' : 'No arrivals or departures scheduled for today.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayCheckIns.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{b.guestName}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono-num text-cyan-800">
                      {chaletMap.get(b.chaletId)?.chaletNumber}
                    </span>
                  </div>
                  <span className="text-emerald-700 font-medium">
                    {isAr ? 'وصول اليوم' : 'Check-in Today'}
                  </span>
                </div>
              ))}
              {todayCheckOuts.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{b.guestName}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono-num text-cyan-800">
                      {chaletMap.get(b.chaletId)?.chaletNumber}
                    </span>
                  </div>
                  <span className="text-amber-700 font-medium">
                    {isAr ? 'مغادرة اليوم' : 'Check-out Today'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{t.dashboard.lowBalanceAlerts}</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('utilities')}
              className="text-xs font-medium text-cyan-800 hover:underline cursor-pointer"
            >
              {isAr ? 'إدارة العدادات' : 'Manage Meters'}
            </button>
          </div>
          {lowBalanceAlerts.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              {isAr ? 'جميع عدادات الكهرباء والمياه بأرصدة آمنة.' : 'All utility meters are above alert thresholds.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowBalanceAlerts.map((u) => {
                const ch = chaletMap.get(u.chaletId);
                return (
                  <div key={u.id} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-mono-num font-semibold text-slate-900">
                      {ch?.chaletNumber}
                    </span>
                    <div className="flex items-center gap-3 font-mono-num">
                      {u.electricityBalance < u.electricityThreshold && (
                        <span className="text-red-700 font-medium">
                          {isAr ? 'كهرباء:' : 'Elec:'} {u.electricityBalance} {t.currency}
                        </span>
                      )}
                      {u.waterBalance < u.waterThreshold && (
                        <span className="text-amber-700 font-medium">
                          {isAr ? 'مياه:' : 'Water:'} {u.waterBalance} {t.currency}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
