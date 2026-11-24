import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Edit2,
  FilterX,
  Info,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { getT } from '../i18n/translations';
import { normalizeToEgyptDateString } from '../utils/egyptTime';
import {
  Chalet,
  Language,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceTicket,
  MutationResult,
  UserRole,
} from '../types/platform';

interface MaintenanceDashboardViewProps {
  tickets: MaintenanceTicket[];
  chalets: Chalet[];
  lang: Language;
  userRole: UserRole;
  canCreate: boolean;
  canManage: boolean;
  onCreateTicket: (ticket: MaintenanceTicket) => Promise<MutationResult | void> | MutationResult | void;
  onUpdateTicket: (ticket: MaintenanceTicket) => Promise<MutationResult | void> | MutationResult | void;
}

const PRIORITIES: MaintenancePriority[] = ['low', 'medium', 'high', 'emergency'];
const STATUSES: MaintenanceStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'completed',
  'closed',
];

const PRIORITY_TEXT_COLOR: Record<MaintenancePriority, string> = {
  low: 'text-slate-600',
  medium: 'text-cyan-800',
  high: 'text-amber-700',
  emergency: 'text-red-700 font-bold',
};

const PRIORITY_BAR_COLOR: Record<MaintenancePriority, string> = {
  low: 'bg-slate-400',
  medium: 'bg-cyan-700',
  high: 'bg-amber-600',
  emergency: 'bg-red-600',
};

const STATUS_TEXT_COLOR: Record<MaintenanceStatus, string> = {
  open: 'text-amber-700',
  assigned: 'text-cyan-800',
  in_progress: 'text-indigo-700',
  completed: 'text-emerald-700',
  closed: 'text-slate-500',
};

const AR_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const EN_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatMonthLabel(monthKey: string, isAr: boolean): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const shortY = String(y).slice(2);
  const name = isAr ? AR_MONTH_NAMES[m - 1] : EN_MONTH_NAMES[m - 1];
  return `${name} '${shortY}`;
}

export const MaintenanceDashboardView: React.FC<MaintenanceDashboardViewProps> = ({
  tickets,
  chalets,
  lang,
  userRole,
  canCreate,
  canManage,
  onCreateTicket,
  onUpdateTicket,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';

  // Filters
  const [search, setSearch] = useState('');
  const [chaletFilter, setChaletFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Create / Edit Modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draftTicket, setDraftTicket] = useState<MaintenanceTicket | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const chaletMap = useMemo(
    () => new Map(chalets.map((c) => [c.id, c])),
    [chalets]
  );

  // Unique technicians list from live/demo tickets + resort staff defaults
  const technicianOptions = useMemo(() => {
    const names = new Set<string>([
      'Eng. Mahmoud Sayed',
      'Karim Fathy',
      'Hassan El-Gamal',
    ]);
    tickets.forEach((tk) => {
      if (tk.technicianName.trim()) names.add(tk.technicianName.trim());
    });
    return Array.from(names).sort();
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((tk) => {
      if (chaletFilter !== 'all' && tk.chaletId !== chaletFilter) return false;
      if (priorityFilter !== 'all' && tk.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && tk.status !== statusFilter) return false;
      if (technicianFilter === 'unassigned' && tk.technicianName.trim() !== '') return false;
      if (
        technicianFilter !== 'all' &&
        technicianFilter !== 'unassigned' &&
        tk.technicianName.trim() !== technicianFilter
      ) {
        return false;
      }
      const createdDate = normalizeToEgyptDateString(tk.createdAt);
      if (dateFrom && createdDate < dateFrom) return false;
      if (dateTo && createdDate > dateTo) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const chNum = chaletMap.get(tk.chaletId)?.chaletNumber.toLowerCase() || '';
        return (
          chNum.includes(q) ||
          tk.problemType.toLowerCase().includes(q) ||
          tk.description.toLowerCase().includes(q) ||
          tk.technicianName.toLowerCase().includes(q) ||
          tk.notes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    tickets,
    chaletFilter,
    priorityFilter,
    statusFilter,
    technicianFilter,
    dateFrom,
    dateTo,
    search,
    chaletMap,
  ]);

  const hasActiveFilters =
    search !== '' ||
    chaletFilter !== 'all' ||
    priorityFilter !== 'all' ||
    statusFilter !== 'all' ||
    technicianFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '';

  const resetFilters = () => {
    setSearch('');
    setChaletFilter('all');
    setPriorityFilter('all');
    setStatusFilter('all');
    setTechnicianFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  // Live metrics computed strictly from filteredTickets (no static numbers)
  const metrics = useMemo(() => {
    const total = filteredTickets.length;
    const open = filteredTickets.filter((tk) => tk.status === 'open').length;
    const assigned = filteredTickets.filter((tk) => tk.status === 'assigned').length;
    const inProgress = filteredTickets.filter((tk) => tk.status === 'in_progress').length;
    const completed = filteredTickets.filter((tk) => tk.status === 'completed').length;
    const closed = filteredTickets.filter((tk) => tk.status === 'closed').length;
    const emergency = filteredTickets.filter((tk) => tk.priority === 'emergency').length;
    const activeEmergency = filteredTickets.filter(
      (tk) =>
        tk.priority === 'emergency' &&
        tk.status !== 'completed' &&
        tk.status !== 'closed'
    ).length;
    const totalCost = filteredTickets.reduce((s, tk) => s + Number(tk.cost || 0), 0);
    const demoCount = filteredTickets.filter((tk) => tk.isDemo).length;
    const liveCount = total - demoCount;

    return {
      total,
      open,
      assigned,
      inProgress,
      completed,
      closed,
      completedAndClosed: completed + closed,
      emergency,
      activeEmergency,
      totalCost,
      demoCount,
      liveCount,
    };
  }, [filteredTickets]);

  // Priority breakdown
  const priorityStats = useMemo(() => {
    const total = Math.max(filteredTickets.length, 1);
    return PRIORITIES.map((p) => {
      const items = filteredTickets.filter((tk) => tk.priority === p);
      return {
        priority: p,
        count: items.length,
        pct: filteredTickets.length > 0 ? Math.round((items.length / total) * 100) : 0,
        cost: items.reduce((s, tk) => s + Number(tk.cost || 0), 0),
      };
    });
  }, [filteredTickets]);

  // Status breakdown
  const statusStats = useMemo(() => {
    return STATUSES.map((st) => {
      const items = filteredTickets.filter((tk) => tk.status === st);
      return {
        status: st,
        count: items.length,
        cost: items.reduce((s, tk) => s + Number(tk.cost || 0), 0),
      };
    });
  }, [filteredTickets]);

  // Costs by Month (Recharts)
  const costByMonthData = useMemo(() => {
    const map = new Map<string, { cost: number; count: number }>();
    filteredTickets.forEach((tk) => {
      const key = tk.createdAt.slice(0, 7);
      const prev = map.get(key) ?? { cost: 0, count: 0 };
      map.set(key, {
        cost: prev.cost + Number(tk.cost || 0),
        count: prev.count + 1,
      });
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        key,
        label: formatMonthLabel(key, isAr),
        cost: val.cost,
        count: val.count,
      }));
  }, [filteredTickets, isAr]);

  // Costs by Chalet (Recharts)
  const costByChaletData = useMemo(() => {
    const map = new Map<string, { cost: number; count: number }>();
    filteredTickets.forEach((tk) => {
      const prev = map.get(tk.chaletId) ?? { cost: 0, count: 0 };
      map.set(tk.chaletId, {
        cost: prev.cost + Number(tk.cost || 0),
        count: prev.count + 1,
      });
    });

    return Array.from(map.entries())
      .map(([chaletId, val]) => ({
        chaletId,
        chaletNumber: chaletMap.get(chaletId)?.chaletNumber || chaletId,
        cost: val.cost,
        count: val.count,
      }))
      .sort((a, b) => b.cost - a.cost || b.count - a.count)
      .slice(0, 8);
  }, [filteredTickets, chaletMap]);

  // Technician Workloads
  const technicianWorkloads = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        activeCount: number;
        completedCount: number;
        urgentCount: number;
        totalCost: number;
      }
    >();

    filteredTickets.forEach((tk) => {
      const key = tk.technicianName.trim() || '__unassigned__';
      const entry = map.get(key) ?? {
        name: key,
        activeCount: 0,
        completedCount: 0,
        urgentCount: 0,
        totalCost: 0,
      };
      const isDone = tk.status === 'completed' || tk.status === 'closed';
      if (isDone) {
        entry.completedCount += 1;
      } else {
        entry.activeCount += 1;
        if (tk.priority === 'emergency' || tk.priority === 'high') {
          entry.urgentCount += 1;
        }
      }
      entry.totalCost += Number(tk.cost || 0);
      map.set(key, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.activeCount - a.activeCount);
  }, [filteredTickets]);

  const openCreateModal = () => {
    setModalError('');
    setModalMode('create');
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mnt-${Date.now()}`;
    setDraftTicket({
      id: newId,
      chaletId: chalets[0]?.id || '',
      problemType: '',
      description: '',
      photos: [],
      priority: 'medium',
      status: 'open',
      technicianName: '',
      cost: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      completedAt: null,
      isDemo: false,
    });
  };

  const openEditModal = (ticket: MaintenanceTicket) => {
    setModalError('');
    setModalMode('edit');
    setDraftTicket({ ...ticket });
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTicket || saving) return;
    setModalError('');
    setSaving(true);

    const normalized: MaintenanceTicket = {
      ...draftTicket,
      status:
        modalMode === 'create' &&
        draftTicket.technicianName.trim() !== '' &&
        draftTicket.status === 'open'
          ? 'assigned'
          : draftTicket.status,
      completedAt:
        draftTicket.status === 'completed' || draftTicket.status === 'closed'
          ? draftTicket.completedAt || new Date().toISOString()
          : null,
    };

    try {
      const res =
        modalMode === 'create'
          ? await onCreateTicket(normalized)
          : await onUpdateTicket(normalized);
      if (res && !res.ok) {
        setModalError(res.error || (isAr ? 'تعذر حفظ بلاغ الصيانة.' : 'Failed to save ticket.'));
        return;
      }
      setModalMode(null);
      setDraftTicket(null);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = (ticket: MaintenanceTicket, newStatus: MaintenanceStatus) => {
    void onUpdateTicket({
      ...ticket,
      status: newStatus,
      completedAt:
        newStatus === 'completed' || newStatus === 'closed'
          ? ticket.completedAt || new Date().toISOString()
          : null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Data Source & Owner Isolation Banners */}
      <div className="space-y-2.5">
        {userRole === 'owner' && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-950">
            <ShieldCheck className="w-4 h-4 text-cyan-800 shrink-0" />
            <span>
              {isAr
                ? 'عرض المالك المعزول: تعرض هذه اللوحة بلاغات وتكاليف الصيانة الخاصة بشاليهاتك فقط.'
                : 'Owner Isolated View: Showing maintenance tickets and repair costs strictly for your own chalets.'}
            </span>
          </div>
        )}

        {metrics.demoCount > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
            <div className="flex items-start sm:items-center gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong className="font-bold">DEMO DATA:</strong>{' '}
                {isAr
                  ? `يعرض هذا القسم ${metrics.demoCount} بلاغات تجريبية و ${metrics.liveCount} بلاغات فعلية مضافة.`
                  : `Currently displaying ${metrics.demoCount} demo ticket(s) and ${metrics.liveCount} live ticket(s).`}
              </span>
            </div>
            <span className="font-mono-num text-[11px] font-bold text-amber-800 whitespace-nowrap">
              {metrics.liveCount} {isAr ? 'فعلي' : 'LIVE'} · {metrics.demoCount}{' '}
              {isAr ? 'تجريبي' : 'DEMO'}
            </span>
          </div>
        ) : (
          metrics.total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  <strong className="font-bold">LIVE DATA:</strong>{' '}
                  {isAr
                    ? `جميع البلاغات المعروضة (${metrics.liveCount}) بيانات فعلية حية.`
                    : `All ${metrics.liveCount} displayed ticket(s) are live operational records.`}
                </span>
              </div>
              <span className="font-mono-num text-[11px] font-bold text-emerald-800 whitespace-nowrap">
                {metrics.liveCount} {isAr ? 'فعلي' : 'LIVE'}
              </span>
            </div>
          )
        )}
      </div>

      {/* Header Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {isAr ? 'لوحة متابعة الصيانة والتشغيل الفني' : 'Maintenance Operations Dashboard'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr
              ? `إجمالي التكلفة في العرض الحالي: ${metrics.totalCost.toLocaleString()} ${t.currency}`
              : `Total Repair Cost in View: ${metrics.totalCost.toLocaleString()} ${t.currency}`}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.actions.addTicket}</span>
          </button>
        )}
      </div>

      {/* 5 Core KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'إجمالي البلاغات' : 'Total Tickets'}</span>
            <Wrench className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900">
            {metrics.total}
          </div>
          <div className="mt-1 text-[11px] font-mono-num text-slate-500">
            {metrics.totalCost.toLocaleString()} {t.currency}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'البلاغات المفتوحة' : 'Open Tickets'}</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-amber-700">
            {metrics.open}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {metrics.assigned} {isAr ? 'مكلفة لفني' : 'Assigned'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'بلاغات الطوارئ' : 'Emergency Tickets'}</span>
            <AlertOctagon className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-red-700">
            {metrics.emergency}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {metrics.activeEmergency} {isAr ? 'نشط حالياً' : 'Active now'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'قيد التنفيذ' : 'In Progress'}</span>
            <Wrench className="w-4 h-4 text-cyan-800" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-cyan-800">
            {metrics.inProgress}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {isAr ? 'جاري العمل بالموقع' : 'Active on site'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'المكتملة والمغلقة' : 'Completed Tickets'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-emerald-700">
            {metrics.completedAndClosed}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {metrics.completed} {t.status.completed} · {metrics.closed} {t.status.closed}
          </div>
        </div>
      </div>

      {/* Filters Bar (Chalet, Priority, Status, Technician, Date From/To, Search) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? 'بحث في البلاغات...' : 'Search tickets...'}
              className="w-full ps-8 pe-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-700"
            />
          </div>

          <select
            aria-label={isAr ? 'تصفية بالشاليه' : 'Filter by chalet'}
            value={chaletFilter}
            onChange={(e) => setChaletFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="all">{isAr ? 'كل الشاليهات' : 'All Chalets'}</option>
            {chalets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.chaletNumber}
              </option>
            ))}
          </select>

          <select
            aria-label={isAr ? 'تصفية بالأولوية' : 'Filter by priority'}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="all">{isAr ? 'كل الأولويات' : 'All Priorities'}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t.priority[p]}
              </option>
            ))}
          </select>

          <select
            aria-label={isAr ? 'تصفية بالحالة' : 'Filter by status'}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {t.status[st]}
              </option>
            ))}
          </select>

          <select
            aria-label={isAr ? 'تصفية بالفني' : 'Filter by technician'}
            value={technicianFilter}
            onChange={(e) => setTechnicianFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="all">{isAr ? 'كل الفنيين' : 'All Technicians'}</option>
            <option value="unassigned">{isAr ? 'غير معين' : 'Unassigned'}</option>
            {technicianOptions.map((tech) => (
              <option key={tech} value={tech}>
                {tech}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-1.5 sm:col-span-2 lg:col-span-2 xl:col-span-1">
            <input
              type="date"
              aria-label={isAr ? 'من تاريخ' : 'From date'}
              title={isAr ? 'من تاريخ' : 'From date'}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full min-w-0 px-2 py-2 border border-slate-300 rounded-lg font-mono-num text-[11px]"
            />
            <input
              type="date"
              aria-label={isAr ? 'إلى تاريخ' : 'To date'}
              title={isAr ? 'إلى تاريخ' : 'To date'}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full min-w-0 px-2 py-2 border border-slate-300 rounded-lg font-mono-num text-[11px]"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-slate-500">
              {isAr
                ? `عرض ${filteredTickets.length} من أصل ${tickets.length} بلاغ`
                : `Showing ${filteredTickets.length} of ${tickets.length} tickets`}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-cyan-800 hover:underline font-medium cursor-pointer"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Priority & Status Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'البلاغات حسب الأولوية' : 'Tickets Grouped by Priority'}
          </h3>
          <div className="space-y-3">
            {priorityStats.map((item) => (
              <button
                key={item.priority}
                type="button"
                onClick={() =>
                  setPriorityFilter((prev) =>
                    prev === item.priority ? 'all' : item.priority
                  )
                }
                className={`w-full text-start p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  priorityFilter === item.priority
                    ? 'border-cyan-700 bg-cyan-50/40'
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className={`font-semibold ${PRIORITY_TEXT_COLOR[item.priority]}`}>
                    {t.priority[item.priority]}
                  </span>
                  <span className="font-mono-num text-slate-700">
                    <strong>{item.count}</strong> ({item.pct}%) · {item.cost.toLocaleString()}{' '}
                    {t.currency}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${PRIORITY_BAR_COLOR[item.priority]}`}
                    style={{ width: `${Math.max(item.count > 0 ? 6 : 0, item.pct)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'البلاغات حسب الحالة' : 'Tickets Grouped by Status'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {statusStats.map((item) => (
              <button
                key={item.status}
                type="button"
                onClick={() =>
                  setStatusFilter((prev) => (prev === item.status ? 'all' : item.status))
                }
                className={`text-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  statusFilter === item.status
                    ? 'border-cyan-700 bg-cyan-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`text-xs font-semibold ${STATUS_TEXT_COLOR[item.status]}`}>
                  {t.status[item.status]}
                </div>
                <div className="mt-1.5 text-xl font-bold font-mono-num text-slate-900">
                  {item.count}
                </div>
                <div className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                  {item.cost.toLocaleString()} {t.currency}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Maintenance Cost Charts (By Month & By Chalet) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'تكاليف الصيانة حسب الشهر' : 'Maintenance Costs by Month'}
            </h3>
            <span className="text-xs text-slate-500">{t.currency}</span>
          </div>
          {costByMonthData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500">
              {isAr ? 'لا توجد بيانات مطابقة للفلتر.' : 'No tickets match active filters.'}
            </div>
          ) : (
            <div dir="ltr" className="w-full h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByMonthData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    reversed={isAr}
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    orientation={isAr ? 'right' : 'left'}
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [
                      `${Number(val).toLocaleString()} ${t.currency}`,
                      isAr ? 'تكلفة الصيانة' : 'Maintenance Cost',
                    ]}
                  />
                  <Bar dataKey="cost" fill="#0e7490" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'تكاليف الصيانة حسب الشاليه' : 'Maintenance Costs by Chalet'}
            </h3>
            <span className="text-xs text-slate-500">{t.currency}</span>
          </div>
          {costByChaletData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500">
              {isAr ? 'لا توجد بيانات مطابقة للفلتر.' : 'No tickets match active filters.'}
            </div>
          ) : (
            <div dir="ltr" className="w-full h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={costByChaletData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="chaletNumber"
                    width={58}
                    tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [
                      `${Number(val).toLocaleString()} ${t.currency}`,
                      isAr ? 'إجمالي التكلفة' : 'Total Cost',
                    ]}
                  />
                  <Bar dataKey="cost" fill="#d97706" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Assigned Technicians & Active Workloads */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-800" />
            <span>{isAr ? 'الفنيون المكلفون وحجم العمل النشط' : 'Assigned Technicians & Active Workloads'}</span>
          </h3>
          <span className="text-xs text-slate-500">
            {isAr ? 'اضغط على فني لتصفية البلاغات' : 'Click technician to filter'}
          </span>
        </div>

        {technicianWorkloads.length === 0 ? (
          <p className="text-xs text-slate-500">
            {isAr ? 'لا توجد تكليفات في النطاق الحالي.' : 'No technician assignments in view.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {technicianWorkloads.map((tech) => {
              const filterKey =
                tech.name === '__unassigned__' ? 'unassigned' : tech.name;
              const isSelected = technicianFilter === filterKey;
              return (
                <button
                  key={tech.name}
                  type="button"
                  onClick={() =>
                    setTechnicianFilter((prev) =>
                      prev === filterKey ? 'all' : filterKey
                    )
                  }
                  className={`text-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-cyan-700 bg-cyan-50/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {tech.name === '__unassigned__'
                      ? isAr
                        ? 'بلاغات غير معينة'
                        : 'Unassigned Queue'
                      : tech.name}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{isAr ? 'مهام نشطة:' : 'Active:'}</span>
                    <span className="font-mono-num font-bold text-cyan-800">
                      {tech.activeCount}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {isAr ? 'مكتمل:' : 'Done:'}{' '}
                      <strong className="font-mono-num text-slate-800">
                        {tech.completedCount}
                      </strong>
                    </span>
                    {tech.urgentCount > 0 && (
                      <span className="text-red-700 font-semibold font-mono-num">
                        {tech.urgentCount} {isAr ? 'عاجل' : 'Urgent'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Maintenance Tickets Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'سجل بلاغات الصيانة' : 'Maintenance Tickets'}
          </h3>
          <span className="text-xs font-mono-num text-slate-500">
            {filteredTickets.length}
          </span>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredTickets.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-500">
              {isAr
                ? 'لا توجد بلاغات صيانة مطابقة للبحث.'
                : 'No maintenance tickets match the selected filters.'}
            </div>
          ) : (
            filteredTickets.map((tk) => (
              <div key={tk.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-slate-900">
                        {chaletMap.get(tk.chaletId)?.chaletNumber || '-'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {tk.isDemo ? (isAr ? 'تجريبي' : 'Demo') : isAr ? 'فعلي' : 'Live'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 mt-0.5">{tk.problemType}</div>
                  </div>
                  <span className={`whitespace-nowrap ${PRIORITY_TEXT_COLOR[tk.priority]}`}>
                    {t.priority[tk.priority]}
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed">{tk.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    {isAr ? 'الفني:' : 'Tech:'}{' '}
                    <strong className="text-slate-700 font-medium">
                      {tk.technicianName || (isAr ? 'غير معين' : 'Unassigned')}
                    </strong>
                  </span>
                  <span className="font-mono-num">{normalizeToEgyptDateString(tk.createdAt)}</span>
                  <span className="font-mono-num font-semibold text-slate-900">
                    {tk.cost.toLocaleString()} {t.currency}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {canManage ? (
                    <select
                      aria-label={isAr ? 'تحديث الحالة' : 'Update status'}
                      value={tk.status}
                      onChange={(e) =>
                        handleQuickStatus(tk, e.target.value as MaintenanceStatus)
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs font-medium"
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {t.status[st]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`font-semibold ${STATUS_TEXT_COLOR[tk.status]}`}>
                      {t.status[tk.status]}
                    </span>
                  )}

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(tk)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{t.actions.edit}</span>
                      </button>
                      {tk.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={() => handleQuickStatus(tk, 'closed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          <Lock className="w-3 h-3" />
                          <span>{isAr ? 'إغلاق' : 'Close'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'العطل والتفاصيل' : 'Problem & Details'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الأولوية' : 'Priority'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الفني المكلف' : 'Technician'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التاريخ' : 'Created'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التكلفة' : 'Cost'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                {canManage && (
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="py-8 text-center text-slate-500"
                  >
                    {isAr
                      ? 'لا توجد بلاغات صيانة مطابقة للبحث.'
                      : 'No maintenance tickets match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredTickets.map((tk) => (
                  <tr key={tk.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {chaletMap.get(tk.chaletId)?.chaletNumber || '-'}
                      <div className="text-[10px] font-normal text-slate-400">
                        {tk.isDemo ? (isAr ? 'تجريبي' : 'Demo') : isAr ? 'فعلي' : 'Live'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{tk.problemType}</div>
                      <div className="text-slate-500 max-w-xs truncate">{tk.description}</div>
                      {tk.notes && (
                        <div className="text-[11px] text-slate-400 max-w-xs truncate">
                          {tk.notes}
                        </div>
                      )}
                    </td>
                    <td className={`py-3 px-4 whitespace-nowrap ${PRIORITY_TEXT_COLOR[tk.priority]}`}>
                      {t.priority[tk.priority]}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {tk.technicianName || (
                        <span className="text-slate-400">
                          {isAr ? 'غير معين' : 'Unassigned'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                      {normalizeToEgyptDateString(tk.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {tk.cost.toLocaleString()} {t.currency}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {canManage ? (
                        <select
                          aria-label={isAr ? 'تحديث الحالة' : 'Update status'}
                          value={tk.status}
                          onChange={(e) =>
                            handleQuickStatus(tk, e.target.value as MaintenanceStatus)
                          }
                          className="px-2 py-1 border border-slate-300 rounded-md bg-white text-xs font-medium"
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {t.status[st]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-semibold ${STATUS_TEXT_COLOR[tk.status]}`}>
                          {t.status[tk.status]}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(tk)}
                            title={isAr ? 'تعيين / تعديل' : 'Assign / Edit'}
                            className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {tk.status !== 'closed' && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatus(tk, 'closed')}
                              title={isAr ? 'إغلاق البلاغ' : 'Close Ticket'}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-medium cursor-pointer"
                            >
                              <Lock className="w-3 h-3" />
                              <span>{isAr ? 'إغلاق' : 'Close'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Assign / Update Ticket Modal */}
      {modalMode && draftTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveModal}
            className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'create'
                  ? t.actions.addTicket
                  : isAr
                  ? 'تحديث وتكليف بلاغ الصيانة'
                  : 'Assign & Update Maintenance Ticket'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setDraftTicket(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الشاليه' : 'Chalet'}
                </label>
                <select
                  disabled={modalMode === 'edit'}
                  value={draftTicket.chaletId}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, chaletId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
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
                  {isAr ? 'الأولوية' : 'Priority'}
                </label>
                <select
                  value={draftTicket.priority}
                  onChange={(e) =>
                    setDraftTicket({
                      ...draftTicket,
                      priority: e.target.value as MaintenancePriority,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t.priority[p]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'نوع العطل' : 'Problem Type'}
                </label>
                <input
                  required
                  value={draftTicket.problemType}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, problemType: e.target.value })
                  }
                  placeholder={isAr ? 'مثال: تكييف، سباكة، كهرباء' : 'e.g. HVAC, Plumbing, Electrical'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الفني المكلف' : 'Assigned Technician'}
                </label>
                <input
                  list="maintenance-tech-list"
                  value={draftTicket.technicianName}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, technicianName: e.target.value })
                  }
                  placeholder={isAr ? 'اختر أو اكتب اسم الفني' : 'Select or enter name'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <datalist id="maintenance-tech-list">
                  {technicianOptions.map((tech) => (
                    <option key={tech} value={tech} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'التكلفة' : 'Repair Cost'} ({t.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  value={draftTicket.cost}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, cost: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>

              {modalMode === 'edit' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'الحالة' : 'Ticket Status'}
                  </label>
                  <select
                    value={draftTicket.status}
                    onChange={(e) =>
                      setDraftTicket({
                        ...draftTicket,
                        status: e.target.value as MaintenanceStatus,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {t.status[st]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'وصف المشكلة' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={draftTicket.description}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات الفني / الإدارة' : 'Technician / Admin Notes'}
                </label>
                <textarea
                  rows={2}
                  value={draftTicket.notes}
                  onChange={(e) =>
                    setDraftTicket({ ...draftTicket, notes: e.target.value })
                  }
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
                onClick={() => {
                  setModalMode(null);
                  setDraftTicket(null);
                }}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
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
    </div>
  );
};
