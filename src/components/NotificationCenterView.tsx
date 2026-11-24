import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  Map,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import { getT } from '../i18n/translations';
import {
  Language,
  MutationResult,
  NotificationChannel,
  NotificationDelivery,
  NotificationEventKey,
  NotificationPreference,
  NotificationRecipient,
  NotificationSettings,
  NotificationTemplate,
  PlatformDataset,
  PlatformUser,
} from '../types/platform';
import { normalizeToEgyptDateString } from '../utils/egyptTime';
import { IMPLEMENTATION_ROADMAP, renderTemplateText } from '../utils/notificationEngine';

interface NotificationCenterViewProps {
  dataset: PlatformDataset;
  lang: Language;
  currentUser: PlatformUser;
  dataSource: 'demo' | 'supabase';
  canManage: boolean;
  onMarkRead: (id: string) => Promise<void> | void;
  onMarkAllRead: () => Promise<void> | void;
  onUpdateSettings: (settings: NotificationSettings) => Promise<MutationResult | void> | MutationResult | void;
  onToggleTemplate: (templateId: string, patch: Partial<NotificationTemplate>) => Promise<MutationResult | void> | MutationResult | void;
  onAddRecipient: (recipient: NotificationRecipient) => Promise<MutationResult | void> | MutationResult | void;
  onToggleRecipientActive: (recipientId: string) => Promise<MutationResult | void> | MutationResult | void;
  onDispatchPreview: (payload: {
    eventKey: NotificationEventKey;
    channel: NotificationChannel;
    recipient: NotificationRecipient;
    variables: Record<string, string | number>;
    relatedEntityId: string;
    forceAllowDuplicate?: boolean;
  }) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };
  onRetryDelivery: (deliveryId: string) => Promise<void> | void;
  onUpdatePreference: (pref: NotificationPreference) => Promise<void> | void;
}

type NotifSubTab =
  | 'inbox'
  | 'templates'
  | 'recipients'
  | 'history'
  | 'settings'
  | 'roadmap';

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  dataset,
  lang,
  currentUser,
  dataSource,
  canManage,
  onMarkRead,
  onMarkAllRead,
  onUpdateSettings,
  onToggleTemplate,
  onAddRecipient,
  onToggleRecipientActive,
  onDispatchPreview,
  onRetryDelivery,
  onUpdatePreference,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [subTab, setSubTab] = useState<NotifSubTab>('inbox');

  // Test/Trigger modal or inline form state
  const [triggerEvent, setTriggerEvent] = useState<NotificationEventKey>('booking_confirmation');
  const [triggerChannel, setTriggerChannel] = useState<NotificationChannel>('email');
  const [triggerRecipientId, setTriggerRecipientId] = useState<string>(
    dataset.notificationRecipients[0]?.id || ''
  );
  const [dispatchMessage, setDispatchMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Delivery history filters
  const [channelFilter, setChannelFilter] = useState<'all' | NotificationChannel>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | NotificationDelivery['status']>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'demo' | 'live'>('all');

  // Add recipient modal
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [newRcpName, setNewRcpName] = useState('');
  const [newRcpNameAr, setNewRcpNameAr] = useState('');
  const [newRcpRole, setNewRcpRole] = useState<'guest' | 'owner' | 'staff'>('guest');
  const [newRcpPhone, setNewRcpPhone] = useState('');
  const [newRcpEmail, setNewRcpEmail] = useState('');
  const [newRcpLang, setNewRcpLang] = useState<Language>('ar');

  const settings = dataset.notificationSettings;
  const unreadCount = dataset.notifications.filter((n) => !n.isRead).length;

  const filteredDeliveries = useMemo(() => {
    return [...dataset.notificationDeliveries]
      .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))
      .filter((d) => {
        if (channelFilter !== 'all' && d.channel !== channelFilter) return false;
        if (statusFilter !== 'all' && d.status !== statusFilter) return false;
        if (sourceFilter === 'demo' && !d.isDemo) return false;
        if (sourceFilter === 'live' && d.isDemo) return false;
        return true;
      });
  }, [dataset.notificationDeliveries, channelFilter, statusFilter, sourceFilter]);

  const sampleBooking = dataset.bookings[0];
  const sampleChalet = dataset.chalets.find((c) => c.id === sampleBooking?.chaletId) || dataset.chalets[0];
  const sampleOwner = dataset.owners[0];

  const handleRunDispatch = async (forceDup = false) => {
    const rcp = dataset.notificationRecipients.find((r) => r.id === triggerRecipientId);
    if (!rcp) {
      setDispatchMessage({
        ok: false,
        text: isAr ? 'يرجى اختيار مستلم أولاً.' : 'Please select a recipient first.',
      });
      return;
    }

    const res = await onDispatchPreview({
      eventKey: triggerEvent,
      channel: triggerChannel,
      recipient: rcp,
      relatedEntityId: sampleBooking?.id || 'manual-trigger',
      forceAllowDuplicate: forceDup,
      variables: {
        guestName: sampleBooking?.guestName || (isAr ? rcp.fullNameAr : rcp.fullName),
        chaletNumber: sampleChalet?.chaletNumber || 'PS-101',
        bookingCode: sampleBooking?.bookingCode || 'BK-2601',
        checkIn: sampleBooking?.checkIn || '2026-06-01',
        checkOut: sampleBooking?.checkOut || '2026-06-05',
        amount: sampleBooking?.totalValue?.toLocaleString() || '12,000',
        dueDate: sampleBooking?.paymentDueDate || sampleBooking?.checkIn || '2026-06-01',
        problemType: 'HVAC Check',
        utilityType: isAr ? 'الكهرباء' : 'Electricity',
        balance: '185',
        ownerName: isAr ? sampleOwner?.fullNameAr || '' : sampleOwner?.fullName || '',
        monthLabel: isAr ? 'الشهر الحالي' : 'Current Month',
      },
    });

    setDispatchMessage({
      ok: res.ok,
      text:
        res.reason ||
        (res.ok
          ? isAr
            ? 'تم تسجيل الإشعار في سجل التسليم بدون إرسال خارجي.'
            : 'Notification logged in delivery history (external sending disabled).'
          : isAr
          ? 'تم حظر الإرسال.'
          : 'Dispatch blocked.'),
    });
  };

  const handleSubmitRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRcpName.trim()) return;
    const res = await onAddRecipient({
      id: `nrcp-${Date.now()}`,
      fullName: newRcpName.trim(),
      fullNameAr: newRcpNameAr.trim() || newRcpName.trim(),
      role: newRcpRole,
      phone: newRcpPhone.trim(),
      email: newRcpEmail.trim(),
      preferredLang: newRcpLang,
      smsOptIn: Boolean(newRcpPhone.trim()),
      emailOptIn: Boolean(newRcpEmail.trim()),
      inAppOptIn: true,
      ownerId: currentUser.ownerId || null,
      chaletId: null,
      isActive: true,
      isDemo: false,
      createdAt: new Date().toISOString(),
    });
    if (res && !res.ok) return;
    setNewRcpName('');
    setNewRcpNameAr('');
    setNewRcpPhone('');
    setNewRcpEmail('');
    setShowAddRecipient(false);
  };

  const deliveryStats = useMemo(() => {
    const list = dataset.notificationDeliveries;
    return {
      total: list.length,
      sentOrSim: list.filter((d) => d.status === 'sent' || d.status === 'simulated').length,
      queuedDisabled: list.filter((d) => d.status === 'queued_disabled').length,
      failed: list.filter((d) => d.status === 'failed').length,
    };
  }, [dataset.notificationDeliveries]);

  return (
    <div className="space-y-6">
      {/* External Provider Safety Lock Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-950">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold">
              {isAr
                ? 'إرسال رسائل SMS والبريد الإلكتروني الخارجي معطل حالياً (وضع المعاينة الآمن)'
                : 'External SMS & Email Sending is DISABLED (Safe Architecture Mode)'}
            </div>
            <p className="text-amber-900">
              {isAr
                ? 'تم بناء كامل بنية التنبيهات (12 قالباً، المستلمين، سجل التسليم، منع التكرار، وإعادة المحاولة). لن يتم إرسال رسائل حقيقية حتى يتم إعداد مفاتيح المزودين على الخادم وتفعيلها.'
                : 'Full notification architecture (12 bilingual templates, recipients, delivery history, dedup guard, and retry engine) is ready. No live SMS/Email is transmitted until server provider keys are configured & activated.'}
            </p>
          </div>
        </div>
        <span className="font-mono-num text-[11px] font-bold px-2.5 py-1 rounded bg-white border border-amber-300 text-amber-900 shrink-0 self-start">
          {dataSource === 'supabase' ? 'LIVE + SAFE QUEUE' : 'DEMO DATA · SAFE QUEUE'}
        </span>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'القوالب ثنائية اللغة' : 'Bilingual Templates'}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-slate-900">
            {dataset.notificationTemplates.filter((tpl) => tpl.isActive).length} / {dataset.notificationTemplates.length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'تسليم داخلي / محاكاة آمنة' : 'In-App / Safe Simulated'}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-emerald-700">
            {deliveryStats.sentOrSim}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'بانتظار تفعيل المزود' : 'Queued (Provider Disabled)'}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-amber-700">
            {deliveryStats.queuedDisabled}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">
            {isAr ? 'عمليات فاشلة (قابلة للإعادة)' : 'Failed (Retryable)'}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono-num text-red-700">
            {deliveryStats.failed}
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-1 overflow-x-auto">
        {(
          [
            { id: 'inbox', ar: `التنبيهات (${unreadCount})`, en: `In-App Inbox (${unreadCount})`, icon: Bell },
            { id: 'templates', ar: 'القوالب (12)', en: 'Templates (12)', icon: FileText },
            { id: 'recipients', ar: 'المستلمون', en: 'Recipients', icon: Users },
            { id: 'history', ar: 'سجل التسليم والإعادة', en: 'Delivery History', icon: Clock },
            { id: 'settings', ar: 'الإعدادات والتفضيلات', en: 'Settings & Prefs', icon: Settings },
            { id: 'roadmap', ar: 'خارطة التنفيذ', en: 'Roadmap', icon: Map },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                subTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{isAr ? tab.ar : tab.en}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: IN-APP INBOX & SAFE DISPATCH SIMULATOR */}
      {subTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                {isAr
                  ? `التنبيهات الداخلية (${unreadCount} غير مقروء)`
                  : `In-App Notifications (${unreadCount} unread)`}
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
              {dataset.notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => onMarkRead(n.id)}
                  className={`p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                    n.isRead ? 'bg-white' : 'bg-cyan-50/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {isAr ? n.titleAr : n.title}
                      </span>
                      <span className={`text-[10px] font-semibold ${n.isDemo ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {n.isDemo ? 'DEMO' : 'LIVE'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">{isAr ? n.messageAr : n.message}</div>
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-400 whitespace-nowrap">
                    {normalizeToEgyptDateString(n.createdAt) || n.createdAt.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-cyan-800" />
                <span>
                  {isAr
                    ? 'اختبار توجيه الإشعارات (بدون إرسال خارجي)'
                    : 'Test Notification Queue & Dedup Check'}
                </span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الحدث / القالب' : 'Event Template'}
                  </label>
                  <select
                    value={triggerEvent}
                    onChange={(e) => setTriggerEvent(e.target.value as NotificationEventKey)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {dataset.notificationTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.eventKey}>
                        {isAr ? tpl.titleAr : tpl.titleEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'القناة' : 'Channel'}
                  </label>
                  <select
                    value={triggerChannel}
                    onChange={(e) => setTriggerChannel(e.target.value as NotificationChannel)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="email">Email ({isAr ? 'معطل خارجياً' : 'External Disabled'})</option>
                    <option value="sms">SMS ({isAr ? 'معطل خارجياً' : 'External Disabled'})</option>
                    <option value="in_app">In-App</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'المستلم' : 'Recipient'}
                  </label>
                  <select
                    value={triggerRecipientId}
                    onChange={(e) => setTriggerRecipientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {dataset.notificationRecipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {isAr ? r.fullNameAr : r.fullName} ({r.role})
                      </option>
                    ))}
                  </select>
                </div>

                {dispatchMessage && (
                  <div
                    className={`p-3 rounded-lg border text-xs ${
                      dispatchMessage.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {dispatchMessage.text}
                  </div>
                )}

                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleRunDispatch(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
                    >
                      {isAr ? 'تشغيل القاعدة (مع منع التكرار)' : 'Queue Notification (Dedup Safe)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 12 BILINGUAL TEMPLATES */}
      {subTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dataset.notificationTemplates.map((tpl) => {
            const previewText = renderTemplateText(
              isAr ? tpl.emailBodyAr : tpl.emailBodyEn,
              {
                guestName: isAr ? 'أحمد منصور' : 'Ahmed Mansour',
                chaletNumber: 'PS-101',
                bookingCode: 'BK-2601',
                checkIn: '2026-06-01',
                checkOut: '2026-06-05',
                amount: '15,200',
                dueDate: '2026-05-30',
                problemType: 'A/C Maintenance',
                utilityType: isAr ? 'الكهرباء' : 'Electricity',
                balance: '185',
                ownerName: isAr ? 'م. طارق المصري' : 'Eng. Tarek El-Masry',
                monthLabel: isAr ? 'نوفمبر' : 'November',
              }
            );

            return (
              <div key={tpl.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {isAr ? tpl.titleAr : tpl.titleEn}
                    </div>
                    <div className="text-[11px] font-mono-num text-slate-400">
                      {tpl.eventKey} · {tpl.category}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onToggleTemplate(tpl.id, { isActive: !tpl.isActive })}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                        tpl.isActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {tpl.isActive ? (isAr ? 'مفعّل' : 'Active') : isAr ? 'معطل' : 'Disabled'}
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-800">
                    <Mail className="w-3.5 h-3.5 inline me-1 text-cyan-800" />
                    {isAr ? tpl.emailSubjectAr : tpl.emailSubjectEn}
                  </div>
                  <div className="text-slate-600 leading-relaxed">{previewText}</div>
                  <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-500">
                    <MessageSquare className="w-3 h-3 inline me-1 text-amber-700" />
                    SMS: {isAr ? tpl.smsBodyAr : tpl.smsBodyEn}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={tpl.defaultSms}
                      onChange={(e) => onToggleTemplate(tpl.id, { defaultSms: e.target.checked })}
                    />
                    <span>SMS</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={tpl.defaultEmail}
                      onChange={(e) => onToggleTemplate(tpl.id, { defaultEmail: e.target.checked })}
                    />
                    <span>Email</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={tpl.defaultInApp}
                      onChange={(e) => onToggleTemplate(tpl.id, { defaultInApp: e.target.checked })}
                    />
                    <span>In-App</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: RECIPIENTS */}
      {subTab === 'recipients' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {isAr
                ? `دليل المستلمين (${dataset.notificationRecipients.length})`
                : `Recipient Directory (${dataset.notificationRecipients.length})`}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddRecipient(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة مستلم' : 'Add Recipient'}</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الاسم' : 'Name'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الدور' : 'Role'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الهاتف (SMS)' : 'Phone (SMS)'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'البريد (Email)' : 'Email'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'اللغة' : 'Lang'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'القنوات' : 'Opt-in'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.notificationRecipients.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {isAr ? r.fullNameAr : r.fullName}
                      <span className={`ms-2 text-[10px] ${r.isDemo ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {r.isDemo ? 'DEMO' : 'LIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.role}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-700">{r.phone || '-'}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-700">{r.email || '-'}</td>
                    <td className="py-3 px-4 uppercase font-mono-num">{r.preferredLang}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {[r.smsOptIn ? 'SMS' : null, r.emailOptIn ? 'Email' : null, r.inAppOptIn ? 'In-App' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="py-3 px-4 text-end">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => onToggleRecipientActive(r.id)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                          r.isActive
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {r.isActive ? (isAr ? 'نشط' : 'Active') : isAr ? 'موقوف' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DELIVERY HISTORY & RETRIES */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">{isAr ? 'كل القنوات' : 'All Channels'}</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="in_app">In-App</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
              <option value="sent">{isAr ? 'مرسل داخلياً' : 'Sent (In-App)'}</option>
              <option value="simulated">{isAr ? 'محاكاة آمنة' : 'Simulated Preview'}</option>
              <option value="queued_disabled">{isAr ? 'مؤجل (مزود معطل)' : 'Queued (Provider Disabled)'}</option>
              <option value="failed">{isAr ? 'فشل' : 'Failed'}</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">{isAr ? 'الكل (فعلي + تجريبي)' : 'All (Live + Demo)'}</option>
              <option value="live">{isAr ? 'فعلي فقط' : 'Live Only'}</option>
              <option value="demo">{isAr ? 'تجريبي فقط' : 'Demo Only'}</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {filteredDeliveries.map((d) => {
              const badgeCls =
                d.status === 'sent'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : d.status === 'simulated'
                  ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                  : d.status === 'queued_disabled'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-red-50 text-red-800 border-red-200';
              return (
                <div key={d.id} className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold uppercase font-mono-num text-slate-900">
                        {d.channel}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${badgeCls}`}>
                        {d.status}
                      </span>
                      <span className="font-semibold text-slate-800">{d.recipientName}</span>
                      <span className="font-mono-num text-slate-500">({d.recipientAddress})</span>
                      <span className={`text-[10px] font-semibold ${d.isDemo ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {d.isDemo ? 'DEMO' : 'LIVE'}
                      </span>
                    </div>
                    <div className="font-medium text-slate-800">{d.subject}</div>
                    <div className="text-slate-600">{d.body}</div>
                    {d.errorReason && (
                      <div className="text-[11px] text-amber-800">{d.errorReason}</div>
                    )}
                    <div className="text-[10px] font-mono-num text-slate-400">
                      Dedup: {d.dedupKey} · Attempts: {d.attemptCount}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(d.status === 'failed' || d.status === 'queued_disabled') && canManage && (
                      <button
                        type="button"
                        onClick={() => onRetryDelivery(d.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-cyan-800" />
                        <span>{isAr ? 'إعادة محاولة' : 'Retry'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS & USER PREFERENCES */}
      {subTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-800" />
              <span>{isAr ? 'إعدادات قنوات الإشعارات' : 'Notification Channel Settings'}</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">
                    {isAr ? 'تفعيل المزودين الخارجيين (SMS / Email)' : 'External Provider Activation'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr
                      ? 'مقفل على مستوى الخادم حتى إعداد مفاتيح API'
                      : 'Server-locked OFF until SMS_API_KEY & EMAIL_API_KEY are configured'}
                  </div>
                </div>
                <span className="font-mono-num font-bold text-red-700">DISABLED</span>
              </div>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="font-medium text-slate-800">
                  {isAr ? 'السماح بوضع المحاكاة الآمنة في السجل' : 'Safe In-App Simulation Preview'}
                </span>
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={settings.simulationMode}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      simulationMode: e.target.checked,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                <span className="font-medium text-slate-800">
                  {isAr ? 'تنبيهات داخل التطبيق (In-App)' : 'In-App Notifications'}
                </span>
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={settings.inAppEnabled}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      inAppEnabled: e.target.checked,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">
                    {isAr ? 'بداية ساعات الهدوء (توقيت القاهرة)' : 'Quiet Hours Start (Cairo)'}
                  </label>
                  <input
                    type="time"
                    disabled={!canManage}
                    value={settings.quietHoursStart}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        quietHoursStart: e.target.value,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    {isAr ? 'نهاية ساعات الهدوء' : 'Quiet Hours End (Cairo)'}
                  </label>
                  <input
                    type="time"
                    disabled={!canManage}
                    value={settings.quietHoursEnd}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        quietHoursEnd: e.target.value,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'تفضيلات الإشعارات للمستخدم' : 'User Notification Preferences'}
            </h3>
            <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
              {dataset.notificationTemplates.map((tpl) => {
                const pref = dataset.notificationPreferences.find(
                  (p) => p.eventKey === tpl.eventKey
                ) || {
                  id: `npref-${tpl.eventKey}`,
                  userId: currentUser.id,
                  eventKey: tpl.eventKey,
                  inAppEnabled: tpl.defaultInApp,
                  emailEnabled: tpl.defaultEmail,
                  smsEnabled: tpl.defaultSms,
                  preferredLang: lang,
                };
                return (
                  <div key={tpl.eventKey} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {isAr ? tpl.titleAr : tpl.titleEn}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={pref.inAppEnabled}
                          onChange={(e) =>
                            onUpdatePreference({ ...pref, inAppEnabled: e.target.checked })
                          }
                        />
                        <span>App</span>
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={pref.emailEnabled}
                          onChange={(e) =>
                            onUpdatePreference({ ...pref, emailEnabled: e.target.checked })
                          }
                        />
                        <span>Email</span>
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={pref.smsEnabled}
                          onChange={(e) =>
                            onUpdatePreference({ ...pref, smsEnabled: e.target.checked })
                          }
                        />
                        <span>SMS</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: UPDATED IMPLEMENTATION ROADMAP */}
      {subTab === 'roadmap' && (
        <div className="space-y-4">
          {IMPLEMENTATION_ROADMAP.map((m, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono-num font-bold text-cyan-800">
                    {m.phase}
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {isAr ? m.moduleAr : m.moduleEn}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{isAr ? m.detailsAr : m.detailsEn}</p>
              </div>
              <span
                className={`px-2.5 py-1 text-[11px] font-semibold rounded border shrink-0 self-start ${
                  m.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {m.status === 'completed' ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isAr ? 'مكتمل ومفعّل' : 'Active Now'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {isAr ? 'مجهز — بانتظار التفعيل' : 'Prepared — Disabled'}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ADD RECIPIENT MODAL */}
      {showAddRecipient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRecipient}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'إضافة مستلم إشعارات' : 'Add Notification Recipient'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddRecipient(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'الاسم (إنجليزي)' : 'Full Name (EN)'}
                </label>
                <input
                  required
                  value={newRcpName}
                  onChange={(e) => setNewRcpName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'الاسم (عربي)' : 'Full Name (AR)'}
                </label>
                <input
                  value={newRcpNameAr}
                  onChange={(e) => setNewRcpNameAr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الدور' : 'Role'}
                  </label>
                  <select
                    value={newRcpRole}
                    onChange={(e) => setNewRcpRole(e.target.value as typeof newRcpRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="guest">{isAr ? 'نزيل' : 'Guest'}</option>
                    <option value="owner">{isAr ? 'مالك' : 'Owner'}</option>
                    <option value="staff">{isAr ? 'طاقم العمل' : 'Staff'}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'اللغة المفضلة' : 'Preferred Lang'}
                  </label>
                  <select
                    value={newRcpLang}
                    onChange={(e) => setNewRcpLang(e.target.value as Language)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'رقم الهاتف (SMS)' : 'Phone (SMS)'}
                </label>
                <input
                  value={newRcpPhone}
                  onChange={(e) => setNewRcpPhone(e.target.value)}
                  placeholder="+2010..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  value={newRcpEmail}
                  onChange={(e) => setNewRcpEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddRecipient(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white cursor-pointer"
              >
                {t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
