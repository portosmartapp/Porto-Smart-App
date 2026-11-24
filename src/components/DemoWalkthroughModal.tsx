import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Compass,
  ShieldCheck,
  LayoutGrid,
  CalendarCheck2,
  QrCode,
  Wallet,
  UserCheck,
  Bell,
} from 'lucide-react';
import { ChaletPortalAction } from '../utils/chaletQr';
import { Language, UserRole } from '../types/platform';
import { CompanyLogo } from './CompanyLogo';

export interface DemoStepTarget {
  role: UserRole;
  tab: string;
  portalAction?: ChaletPortalAction;
}

interface DemoWalkthroughStep {
  id: string;
  number: number;
  icon: React.ComponentType<{ className?: string }>;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  actionLabelAr: string;
  actionLabelEn: string;
  target: DemoStepTarget;
  secondaryAction?: {
    labelAr: string;
    labelEn: string;
    target: DemoStepTarget;
  };
}

export const DEMO_WALKTHROUGH_STEPS: DemoWalkthroughStep[] = [
  {
    id: 'step-roles',
    number: 1,
    icon: ShieldCheck,
    titleAr: 'استعراض لوحة الإدارة وتبديل الأدوار (6 صلاحيات)',
    titleEn: 'Explore Executive Dashboard & Role Switcher (6 Roles)',
    descAr:
      'ابدأ كـ Super Admin لمراجعة إجمالي الإيرادات ونسب الإشغال، ثم جرّب تبديل الدور من القائمة الجانبية (مدير، استقبال، نظافة، صيانة، مالك، نزيل) لملاحظة تغيّر الشاشات تلقائياً.',
    descEn:
      'Start as Super Admin to review revenue and occupancy KPIs, then switch roles in the sidebar (Manager, Reception, Housekeeping, Maintenance, Owner, Guest) to see tailored permissions.',
    actionLabelAr: 'افتح لوحة الإدارة',
    actionLabelEn: 'Open Dashboard',
    target: { role: 'super_admin', tab: 'dashboard' },
  },
  {
    id: 'step-occupancy',
    number: 2,
    icon: LayoutGrid,
    titleAr: 'خريطة الإشغال التفاعلية لـ 22 شاليه (توقيت القاهرة)',
    titleEn: 'Interactive 22-Chalet Occupancy Map (Egypt Time)',
    descAr:
      'تفقد حالة كل شاليه اليوم (متاح، مشغول، وصول اليوم، مغادرة اليوم، أو تقليب في نفس اليوم) مع تصفية فورية حسب الإطلالة أو حالة الإشغال.',
    descEn:
      'Inspect live daily status across all 22 chalets (Available, Occupied, Check-in Today, Check-out Today, Same-day Turnover) with instant filtering.',
    actionLabelAr: 'افتح خريطة الإشغال',
    actionLabelEn: 'Open Occupancy Map',
    target: { role: 'super_admin', tab: 'occupancyMap' },
  },
  {
    id: 'step-bookings',
    number: 3,
    icon: CalendarCheck2,
    titleAr: 'إنشاء حجز + منع التداخل + طباعة تقرير الحجوزات',
    titleEn: 'Create Booking, Double-Booking Guard & Print Report',
    descAr:
      'جرّب إنشاء حجز جديد على نفس تواريخ حجز قائم لتختبر الحماية من الحجز المزدوج، أو نفّذ تسجيل وصول/مغادرة، واضغط زر "طباعة" لإصدار تقرير نظيف جاهز للطباعة.',
    descEn:
      'Try creating an overlapping booking to verify the double-booking guard, run check-in/check-out actions, and click Print for a clean management report.',
    actionLabelAr: 'جرّب شاشة الحجوزات',
    actionLabelEn: 'Try Bookings View',
    target: { role: 'reception', tab: 'bookings' },
  },
  {
    id: 'step-qr-guest',
    number: 4,
    icon: QrCode,
    titleAr: 'رموز QR للشاليهات والوصول المباشر لبوابة النزيل (?action=)',
    titleEn: 'Per-Chalet QR Codes & Deep-Linked Guest Portal (?action=)',
    descAr:
      'اضغط "QR" على أي شاليه لتوليد رابط وملصق QR مخصص (تسجيل الوصول، التدبير الفندقي، الصيانة، العروض)، أو اختبر الانتقال المباشر إلى نموذج بلاغ الصيانة كما لو أن النزيل مسح الكود.',
    descEn:
      'Click "QR" on any chalet card to generate action-specific QR posters (Check-In, Housekeeping, Maintenance, Offers), or jump straight into the deep-linked Maintenance form.',
    actionLabelAr: 'افتح الشاليهات ورموز QR',
    actionLabelEn: 'Open Chalets & QR',
    target: { role: 'super_admin', tab: 'chalets' },
    secondaryAction: {
      labelAr: 'معاينة ?action=maintenance',
      labelEn: 'Preview ?action=maintenance',
      target: { role: 'guest', tab: 'guestPortal', portalAction: 'maintenance' },
    },
  },
  {
    id: 'step-financials',
    number: 5,
    icon: Wallet,
    titleAr: 'المدفوعات والتسوية المالية (75% / 25%) والطباعة',
    titleEn: 'Payments Ledger, 75%/25% Split & Printable Statements',
    descAr:
      'سجّل دفعة بوسيلة دفع من 6 طرق متاحة أو نفّذ استرداداً بسجل تدقيق غير قابل للتعديل في المدفوعات، ثم افتح الحسابات لتعديل نسبة المالك وطباعة كشف الحساب.',
    descEn:
      'Record payments across 6 methods or issue an audit-logged refund, then review Financials to adjust chalet owner/management splits and print statements.',
    actionLabelAr: 'افتح الحسابات والطباعة',
    actionLabelEn: 'Open Financials',
    target: { role: 'manager', tab: 'financials' },
    secondaryAction: {
      labelAr: 'افتح سجل المدفوعات',
      labelEn: 'Open Payments',
      target: { role: 'manager', tab: 'payments' },
    },
  },
  {
    id: 'step-owner-isolation',
    number: 6,
    icon: UserCheck,
    titleAr: 'اختبار عزل بيانات المالك (Owner Isolation)',
    titleEn: 'Verify Strict Owner Data Isolation',
    descAr:
      'ادخل بحساب مالك شاليهات للتأكد من أنه يرى فقط شاليهاته الخاصة وحجوزاتها وصافي مستحقاته، دون أي وصول لبيانات الملاك الآخرين.',
    descEn:
      'Enter as an Owner account to confirm they only view their own chalets, reservations, and net earnings with zero visibility into other owners.',
    actionLabelAr: 'ادخل كمالك شاليهات',
    actionLabelEn: 'Enter as Owner',
    target: { role: 'owner', tab: 'ownerPortal' },
  },
  {
    id: 'step-ops-notifications',
    number: 7,
    icon: Bell,
    titleAr: 'التنبيهات والتدبير الفندقي والصيانة + حفظ التجربة محلياً',
    titleEn: 'Operations, Alerts & Persistent Local Demo State',
    descAr:
      'راجع مركز الإشعارات، العدادات، وطلبات الصيانة والتدبير الفندقي. كل تعديل تجربه يُحفظ تلقائياً في متصفحك، ويمكنك الضغط على "إعادة ضبط البيانات" في أي وقت للبدء من جديد.',
    descEn:
      'Explore Notifications, Utilities, Housekeeping, and Maintenance. Every edit persists automatically in your browser, and you can reset demo data anytime.',
    actionLabelAr: 'افتح مركز الإشعارات',
    actionLabelEn: 'Open Notifications',
    target: { role: 'super_admin', tab: 'notifications' },
  },
];

interface DemoWalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  isDemoMode: boolean;
  completedStepIds: string[];
  onToggleStepComplete: (stepId: string) => void;
  onRunStep: (target: DemoStepTarget, stepId: string) => void;
  onResetDemoData: () => void;
}

export const DemoWalkthroughModal: React.FC<DemoWalkthroughModalProps> = ({
  open,
  onClose,
  lang,
  isDemoMode,
  completedStepIds,
  onToggleStepComplete,
  onRunStep,
  onResetDemoData,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  if (!open) return null;

  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const completedCount = DEMO_WALKTHROUGH_STEPS.filter((s) =>
    completedStepIds.includes(s.id)
  ).length;
  const progressPct = Math.round((completedCount / DEMO_WALKTHROUGH_STEPS.length) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl border border-slate-200 shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <CompanyLogo size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-800 shrink-0" />
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {isAr
                    ? 'دليل التجربة التفاعلي خطوة بخطوة (وضع العرض التجريبي)'
                    : 'Interactive Step-by-Step Trial Walkthrough (Demo Mode)'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {isAr
                  ? 'اختبر جميع وظائف المنصة بالبيانات الجاهزة (22 شاليه) — تُحفظ التغييرات محلياً دون الحاجة لقاعدة بيانات.'
                  : 'Test every workflow with 22 preloaded chalets — all changes save locally in your browser with zero setup.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-semibold text-slate-700">
            {isAr
              ? `تقدّم التجربة: ${completedCount} من ${DEMO_WALKTHROUGH_STEPS.length} خطوات`
              : `Trial Progress: ${completedCount} of ${DEMO_WALKTHROUGH_STEPS.length} steps`}
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-800 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-mono-num font-bold text-cyan-800">{progressPct}%</span>
          </div>
        </div>

        {/* Steps List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {DEMO_WALKTHROUGH_STEPS.map((step) => {
            const Icon = step.icon;
            const done = completedStepIds.includes(step.id);

            return (
              <div
                key={step.id}
                className={`rounded-xl border p-4 transition-colors ${
                  done ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleStepComplete(step.id)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-700 cursor-pointer shrink-0"
                      title={isAr ? 'تحديد كمكتمل' : 'Toggle completed'}
                    >
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-mono-num font-bold">
                          {step.number}
                        </span>
                        <Icon className="w-4 h-4 text-cyan-800" />
                        <h4 className="text-sm font-bold text-slate-900">
                          {isAr ? step.titleAr : step.titleEn}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {isAr ? step.descAr : step.descEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRunStep(step.target, step.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <span>{isAr ? step.actionLabelAr : step.actionLabelEn}</span>
                      <ArrowIcon className="w-3.5 h-3.5" />
                    </button>

                    {step.secondaryAction && (
                      <button
                        type="button"
                        onClick={() => onRunStep(step.secondaryAction!.target, step.id)}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {isAr ? step.secondaryAction.labelAr : step.secondaryAction.labelEn}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {isDemoMode ? (
            confirmReset ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-amber-800">
                  {isAr
                    ? 'هل تريد استعادة البيانات التجريبية الأصلية؟'
                    : 'Restore original 22-chalet demo state?'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onResetDemoData();
                    setConfirmReset(false);
                  }}
                  className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                >
                  {isAr ? 'نعم، أعد الضبط' : 'Yes, Reset'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>
                  {isAr ? 'إعادة ضبط البيانات التجريبية' : 'Reset Demo Data'}
                </span>
              </button>
            )
          ) : (
            <span className="text-xs text-slate-500">
              {isAr
                ? 'أنت متصل بـ Supabase حالياً.'
                : 'Currently running with live Supabase data.'}
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
          >
            {isAr ? 'متابعة التجربة' : 'Continue Exploring'}
          </button>
        </div>
      </div>
    </div>
  );
};
