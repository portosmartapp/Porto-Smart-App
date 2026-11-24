import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  CalendarCheck2,
  Wallet,
  Zap,
  Sparkles,
  Wrench,
  Utensils,
  Bell,
  Users,
  UserCheck,
  Compass,
  Globe,
  LogOut,
  Menu,
  X,
  Database,
  LayoutGrid,
  CreditCard,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Info,
  UserCog,
} from 'lucide-react';
import { createEmptyDataset, DEMO_USERS, INITIAL_DEMO_DATASET } from './data/demoData';
import { getT } from './i18n/translations';
import { isSupabaseConfigured, supabase, SupabaseErrorKind } from './lib/supabase';
import {
  loadProductionDataset,
  scopeDatasetForUser,
  supabaseSync,
} from './services/platformStore';
import {
  WeeklyEmailTask,
  scheduleWeeklyOwnerSummaryEmail,
  startWeeklyReportScheduler,
} from './services/reportEngine';
import { getEgyptTodayIsoDate } from './utils/egyptTime';
import {
  loadCompletedDemoSteps,
  loadPersistedDemoDataset,
  resetPersistedDemoDataset,
  saveCompletedDemoSteps,
  savePersistedDemoDataset,
} from './utils/demoStorage';
import {
  ChaletPortalAction,
  findChaletByPortalRef,
  parseChaletGuestPortalUrl,
} from './utils/chaletQr';
import { dispatchNotification, retryNotificationDelivery } from './utils/notificationEngine';
import { issuePaymentRefundOrCorrection, recordManualPayment } from './utils/paymentLedger';
import {
  AppMode,
  AppNotification,
  Booking,
  Chalet,
  Expense,
  Guest,
  HousekeepingStatus,
  HousekeepingTask,
  Language,
  MaintenanceTicket,
  MutationResult,
  NotificationChannel,
  NotificationEventKey,
  NotificationPreference,
  NotificationRecipient,
  NotificationSettings,
  NotificationTemplate,
  Owner,
  PartnerOffer,
  Payment,
  PaymentMethod,
  PlatformDataset,
  PlatformUser,
  UserRole,
} from './types/platform';
import { LoginView } from './components/LoginView';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import { DemoStepTarget, DemoWalkthroughModal } from './components/DemoWalkthroughModal';
import { CompanyLogo } from './components/CompanyLogo';
import { OfflineIndicator, PWAInstallButton } from './components/PWABannerControls';
import { COMPANY_BRANDING } from './constants/branding';
import { DashboardView } from './components/DashboardView';
import { UsersManagementView } from './components/UsersManagementView';
import { ChaletsView } from './components/ChaletsView';
import { BookingsView } from './components/BookingsView';
import { OwnerPortalView } from './components/OwnerPortalView';
import { FinancialsView } from './components/FinancialsView';
import { UtilitiesView } from './components/UtilitiesView';
import { HousekeepingView } from './components/OperationsView';
import { MaintenanceDashboardView } from './components/MaintenanceDashboardView';
import { ChaletOccupancyMap } from './components/ChaletOccupancyMap';
import { PaymentsView } from './components/PaymentsView';
import { NotificationCenterView } from './components/NotificationCenterView';
import {
  GuestPortalView,
  OffersView,
} from './components/OffersAndGuestView';

type NavTab =
  | 'dashboard'
  | 'chalets'
  | 'occupancyMap'
  | 'bookings'
  | 'ownerPortal'
  | 'owners'
  | 'users'
  | 'payments'
  | 'financials'
  | 'utilities'
  | 'housekeeping'
  | 'maintenance'
  | 'offers'
  | 'notifications'
  | 'guestPortal';

const ROLE_ALLOWED_TABS: Record<UserRole, NavTab[]> = {
  super_admin: [
    'dashboard',
    'chalets',
    'occupancyMap',
    'bookings',
    'owners',
    'users',
    'ownerPortal',
    'payments',
    'financials',
    'utilities',
    'housekeeping',
    'maintenance',
    'offers',
    'notifications',
    'guestPortal',
  ],
  manager: [
    'dashboard',
    'chalets',
    'occupancyMap',
    'bookings',
    'owners',
    'users',
    'payments',
    'financials',
    'utilities',
    'housekeeping',
    'maintenance',
    'offers',
    'notifications',
  ],
  owner: ['ownerPortal', 'occupancyMap', 'payments', 'maintenance', 'offers', 'notifications'],
  housekeeping: ['housekeeping', 'notifications'],
  maintenance: ['maintenance', 'utilities', 'notifications'],
  reception: ['bookings', 'occupancyMap', 'chalets', 'payments', 'maintenance', 'offers', 'notifications'],
  guest: ['guestPortal', 'offers'],
};

export default function App() {
  const initialPortalParams = useMemo(() => {
    if (typeof window === 'undefined') {
      return { isGuestPortal: false, chaletRef: null, action: 'stay' as ChaletPortalAction };
    }
    return parseChaletGuestPortalUrl(window.location.search);
  }, []);

  const [lang, setLang] = useState<Language>('ar');

  // Strict isolated mode: Production (Supabase) vs Demo (Standalone Trial)
  const [appMode, setAppMode] = useState<AppMode>(() =>
    isSupabaseConfigured ? 'production' : 'demo'
  );
  const dataSource: 'supabase' | 'demo' = appMode === 'production' ? 'supabase' : 'demo';

  const [currentUser, setCurrentUser] = useState<PlatformUser | null>(() => {
    if (!isSupabaseConfigured && initialPortalParams.isGuestPortal) {
      return DEMO_USERS.find((u) => u.role === 'guest') || null;
    }
    return null;
  });

  const [dataset, setDataset] = useState<PlatformDataset>(() =>
    isSupabaseConfigured ? createEmptyDataset() : loadPersistedDemoDataset()
  );

  const [authLoading, setAuthLoading] = useState<boolean>(
    () => Boolean(isSupabaseConfigured && supabase)
  );
  const [authNotice, setAuthNotice] = useState<string>('');
  const [productionLoading, setProductionLoading] = useState<boolean>(false);
  const [productionError, setProductionError] = useState<{
    message: string;
    kind?: SupabaseErrorKind;
  } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>(() =>
    isSupabaseConfigured ? [] : DEMO_USERS
  );

  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    initialPortalParams.isGuestPortal ? 'guestPortal' : 'dashboard'
  );
  const [guestPortalChaletId, setGuestPortalChaletId] = useState<string>(() => {
    if (isSupabaseConfigured) return '';
    const matched = findChaletByPortalRef(
      INITIAL_DEMO_DATASET.chalets,
      initialPortalParams.chaletRef
    );
    return matched?.id || '';
  });
  const [guestPortalAction, setGuestPortalAction] = useState<ChaletPortalAction>(
    initialPortalParams.action
  );
  const [guestPortalQrLocked, setGuestPortalQrLocked] = useState<boolean>(
    initialPortalParams.isGuestPortal && Boolean(initialPortalParams.chaletRef)
  );
  const [focusedChaletSearch, setFocusedChaletSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [demoGuideOpen, setDemoGuideOpen] = useState(false);
  const [completedDemoSteps, setCompletedDemoSteps] = useState<string[]>(() =>
    loadCompletedDemoSteps()
  );
  const [demoNotice, setDemoNotice] = useState('');

  const t = getT(lang);
  const isAr = lang === 'ar';

  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;
  const langRef = useRef(lang);
  langRef.current = lang;
  const appModeRef = useRef(appMode);
  appModeRef.current = appMode;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const productionErrorRef = useRef(productionError);
  productionErrorRef.current = productionError;

  // Keep HTML dir & lang attributes synchronized
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Persist Demo Mode dataset updates ONLY when in Demo Mode (strict isolation from Production)
  useEffect(() => {
    if (appMode === 'demo') {
      savePersistedDemoDataset(dataset);
    }
  }, [dataset, appMode]);

  // Clear transient action banner automatically
  useEffect(() => {
    if (!actionFeedback) return;
    const timer = window.setTimeout(() => setActionFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [actionFeedback]);

  // Automatic background weekly owner report scheduler
  useEffect(() => {
    const stop = startWeeklyReportScheduler({
      getDataset: () => datasetRef.current,
      getLang: () => langRef.current,
      onTasksScheduled: (result) => {
        if (result.deliveries.length === 0) return;
        setDataset((prev) => ({
          ...prev,
          notificationDeliveries: [...result.deliveries, ...prev.notificationDeliveries],
        }));
        if (
          appModeRef.current === 'production' &&
          currentUserRef.current &&
          !productionErrorRef.current
        ) {
          result.deliveries.forEach((d) => {
            void supabaseSync.insertNotificationDelivery(d, langRef.current).catch(() => undefined);
          });
        }
      },
    });
    return stop;
  }, []);

  // Production Data Loader (never falls back to Demo Mode on missing tables or error)
  const refreshProductionData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || appModeRef.current !== 'production') {
      return;
    }
    setProductionLoading(true);
    try {
      const res = await loadProductionDataset(langRef.current);
      if (res.error) {
        setProductionError({ message: res.error, kind: res.errorKind });
        setDataset(createEmptyDataset());
      } else {
        setProductionError(null);
        setDataset(res.dataset);
        if (
          currentUserRef.current?.role === 'super_admin' ||
          currentUserRef.current?.role === 'manager'
        ) {
          try {
            const fetchedUsers = await supabaseSync.fetchAllUsers(langRef.current);
            setPlatformUsers(fetchedUsers);
          } catch {
            // Keep existing list if profile fetch lacks permissions
          }
        }
        if (initialPortalParams.isGuestPortal && initialPortalParams.chaletRef) {
          const matched = findChaletByPortalRef(
            res.dataset.chalets,
            initialPortalParams.chaletRef
          );
          if (matched) setGuestPortalChaletId(matched.id);
        }
      }
    } finally {
      setProductionLoading(false);
    }
  }, [initialPortalParams.chaletRef, initialPortalParams.isGuestPortal]);

  // Supabase Session Restore & Auth State Listener (Production Mode only)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || appMode !== 'production') {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    setAuthLoading(true);

    const resolveSessionProfile = async (authUserId: string, email: string) => {
      try {
        const profile = await supabaseSync.fetchUserProfile(
          authUserId,
          email,
          langRef.current
        );
        if (!mounted) return;
        setAuthNotice('');
        setCurrentUser(profile);
      } catch (err: any) {
        await supabase?.auth.signOut();
        if (!mounted) return;
        setCurrentUser(null);
        setAuthNotice(err?.message || 'Unable to verify user role in public.users.');
      }
    };

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const authUser = data.session?.user;
        if (authUser) {
          await resolveSessionProfile(authUser.id, authUser.email || '');
        }
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || appModeRef.current !== 'production') return;
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setDataset(createEmptyDataset());
        setProductionError(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        void resolveSessionProfile(session.user.id, session.user.email || '');
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [appMode]);

  // Load live Supabase data whenever an authenticated user is active in Production Mode
  useEffect(() => {
    if (appMode === 'production' && currentUser) {
      void refreshProductionData();
    }
  }, [appMode, currentUser?.id, refreshProductionData]);

  // Ensure activeTab is always valid for currentUser.role
  useEffect(() => {
    if (!currentUser) return;
    const allowed = ROLE_ALLOWED_TABS[currentUser.role];
    if (!allowed.includes(activeTab)) {
      setActiveTab(allowed[0]);
    }
  }, [currentUser, activeTab]);

  // Enforce Owner Isolation on the dataset
  const scopedDataset = useMemo(() => {
    if (!currentUser) return dataset;
    return scopeDatasetForUser(dataset, currentUser);
  }, [dataset, currentUser]);

  // Explicit isolated mode switchers (never triggered automatically)
  const handleEnterDemoMode = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setAppMode('demo');
    setProductionError(null);
    setAuthNotice('');
    setActionFeedback(null);
    setDataset(loadPersistedDemoDataset());
    setPlatformUsers(DEMO_USERS);
    setCurrentUser(null);
    setDemoGuideOpen(false);
  };

  const handleExitDemoMode = () => {
    setAppMode('production');
    setCurrentUser(null);
    setDataset(createEmptyDataset());
    setPlatformUsers([]);
    setProductionError(null);
    setAuthNotice('');
    setActionFeedback(null);
    setDemoGuideOpen(false);
  };

  const handleSavePlatformUser = async (user: PlatformUser): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const saved = await supabaseSync.upsertUserProfile(user, lang);
        setPlatformUsers((prev) => {
          const exists = prev.some((u) => u.id === saved.id);
          return exists ? prev.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...prev];
        });
        setActionFeedback({
          ok: true,
          text: isAr ? 'تم حفظ وتحديث صلاحيات المستخدم.' : 'User access profile saved.',
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حفظ المستخدم.' : 'Failed to save user.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    const demoSaved: PlatformUser = { ...user, isDemo: true };
    setPlatformUsers((prev) => {
      const exists = prev.some((u) => u.id === demoSaved.id);
      return exists ? prev.map((u) => (u.id === demoSaved.id ? demoSaved : u)) : [demoSaved, ...prev];
    });
    return { ok: true };
  };

  const handleDeletePlatformUser = async (userId: string): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        await supabaseSync.deleteUserProfile(userId, lang);
        setPlatformUsers((prev) => prev.filter((u) => u.id !== userId));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حذف المستخدم.' : 'Failed to delete user.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setPlatformUsers((prev) => prev.filter((u) => u.id !== userId));
    return { ok: true };
  };

  const pushSecondaryNotification = (
    notif: Omit<AppNotification, 'id' | 'isRead' | 'isDemo' | 'createdAt'>
  ) => {
    if (appModeRef.current === 'production') {
      void supabaseSync
        .insertNotification(notif, langRef.current)
        .then((confirmed) => {
          setDataset((prev) => ({
            ...prev,
            notifications: [confirmed, ...prev.notifications],
          }));
        })
        .catch(() => undefined);
      return;
    }

    setDataset((prev) => ({
      ...prev,
      notifications: [
        {
          id: `not-${Date.now()}`,
          ...notif,
          isRead: false,
          isDemo: true,
          createdAt: new Date().toISOString(),
        },
        ...prev.notifications,
      ],
    }));
  };

  // --- Awaited CRUD Handlers (DB-confirmed before updating UI in Production Mode) ---

  const handleSaveChalet = async (
    chalet: Chalet,
    isNew: boolean
  ): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const res = await supabaseSync.upsertChalet(chalet, isNew, lang);
        setDataset((prev) => ({
          ...prev,
          chalets: isNew
            ? [...prev.chalets, res.chalet]
            : prev.chalets.map((c) => (c.id === res.chalet.id ? res.chalet : c)),
          utilities: isNew && res.utility ? [...prev.utilities, res.utility] : prev.utilities,
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حفظ الشاليه.' : 'Failed to save chalet.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    const demoChalet: Chalet = { ...chalet, isDemo: true };
    setDataset((prev) => ({
      ...prev,
      chalets: isNew
        ? [...prev.chalets, demoChalet]
        : prev.chalets.map((c) => (c.id === demoChalet.id ? demoChalet : c)),
      utilities: isNew
        ? [
            ...prev.utilities,
            {
              id: `ut-${Date.now()}`,
              chaletId: demoChalet.id,
              electricityBalance: 500,
              waterBalance: 300,
              electricityThreshold: 300,
              waterThreshold: 150,
              lastElectricityRecharge: 500,
              lastElectricityDate: new Date().toISOString(),
              lastWaterRecharge: 300,
              lastWaterDate: new Date().toISOString(),
              isDemo: true,
            },
          ]
        : prev.utilities,
    }));
    return { ok: true };
  };

  const handleDeleteChalet = async (id: string): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        await supabaseSync.deleteChalet(id, lang);
        setDataset((prev) => ({
          ...prev,
          chalets: prev.chalets.filter((c) => c.id !== id),
          utilities: prev.utilities.filter((u) => u.chaletId !== id),
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حذف الشاليه.' : 'Failed to delete chalet.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      chalets: prev.chalets.filter((c) => c.id !== id),
      utilities: prev.utilities.filter((u) => u.chaletId !== id),
    }));
    return { ok: true };
  };

  const handleToggleChaletActive = async (chalet: Chalet): Promise<MutationResult> => {
    const updated: Chalet = {
      ...chalet,
      isActive: !chalet.isActive,
      status: !chalet.isActive ? 'available' : 'inactive',
    };
    return handleSaveChalet(updated, false);
  };

  const handleCreateBooking = async (booking: Booking): Promise<MutationResult> => {
    const chalet = dataset.chalets.find((c) => c.id === booking.chaletId);

    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertBooking(booking, lang);
        setDataset((prev) => ({
          ...prev,
          bookings: [confirmed, ...prev.bookings],
        }));
        pushSecondaryNotification({
          type: 'new_booking',
          title: `New Booking ${confirmed.bookingCode} (${chalet?.chaletNumber || ''})`,
          titleAr: `حجز جديد ${confirmed.bookingCode} (${chalet?.chaletNumber || ''})`,
          message: `${confirmed.guestName} · ${confirmed.checkIn} to ${confirmed.checkOut} (${confirmed.totalValue.toLocaleString()} EGP)`,
          messageAr: `${confirmed.guestName} · من ${confirmed.checkIn} إلى ${confirmed.checkOut} (${confirmed.totalValue.toLocaleString()} ج.م)`,
          targetRole: 'manager',
          targetOwnerId: chalet?.ownerId || null,
          chaletId: confirmed.chaletId,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || t.actions.doubleBookingError;
        return { ok: false, error: msg };
      }
    }

    const demoBooking: Booking = { ...booking, isDemo: true };
    setDataset((prev) => ({
      ...prev,
      bookings: [demoBooking, ...prev.bookings],
    }));
    pushSecondaryNotification({
      type: 'new_booking',
      title: `New Booking ${demoBooking.bookingCode} (${chalet?.chaletNumber || ''})`,
      titleAr: `حجز جديد ${demoBooking.bookingCode} (${chalet?.chaletNumber || ''})`,
      message: `${demoBooking.guestName} · ${demoBooking.checkIn} to ${demoBooking.checkOut} (${demoBooking.totalValue.toLocaleString()} EGP)`,
      messageAr: `${demoBooking.guestName} · من ${demoBooking.checkIn} إلى ${demoBooking.checkOut} (${demoBooking.totalValue.toLocaleString()} ج.م)`,
      targetRole: 'manager',
      targetOwnerId: chalet?.ownerId || null,
      chaletId: demoBooking.chaletId,
    });
    return { ok: true };
  };

  const handleCheckIn = async (
    bookingId: string,
    payload: { idPassport: string; depositAmount: number; numGuests: number; notes: string }
  ): Promise<MutationResult> => {
    const target = dataset.bookings.find((b) => b.id === bookingId);
    if (!target) return { ok: false, error: 'Booking not found' };

    const updated: Booking = {
      ...target,
      status: 'checked_in',
      idPassport: payload.idPassport,
      depositAmount: payload.depositAmount,
      numGuests: payload.numGuests,
      notes: payload.notes,
      checkInTime: new Date().toISOString(),
    };

    if (appMode === 'production') {
      try {
        const confirmedBooking = await supabaseSync.updateBooking(updated, lang);
        const confirmedChalet = await supabaseSync.updateChaletStatus(
          target.chaletId,
          'occupied',
          lang
        );
        setDataset((prev) => ({
          ...prev,
          bookings: prev.bookings.map((b) => (b.id === bookingId ? confirmedBooking : b)),
          chalets: prev.chalets.map((c) => (c.id === target.chaletId ? confirmedChalet : c)),
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تأكيد تسجيل الدخول.' : 'Check-in failed.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === bookingId ? updated : b)),
      chalets: prev.chalets.map((c) =>
        c.id === target.chaletId ? { ...c, status: 'occupied' } : c
      ),
    }));
    return { ok: true };
  };

  const handleCheckOut = async (
    bookingId: string,
    payload: {
      inspectionNotes: string;
      damageReport: string;
      outstandingAmount: number;
      notes: string;
    }
  ): Promise<MutationResult> => {
    const target = dataset.bookings.find((b) => b.id === bookingId);
    if (!target) return { ok: false, error: 'Booking not found' };

    const updated: Booking = {
      ...target,
      status: 'checked_out',
      paymentStatus: payload.outstandingAmount === 0 ? 'paid' : target.paymentStatus,
      inspectionNotes: payload.inspectionNotes,
      damageReport: payload.damageReport,
      outstandingAmount: payload.outstandingAmount,
      notes: payload.notes,
      checkOutTime: new Date().toISOString(),
    };

    const autoCleanTask: HousekeepingTask = {
      id: `hk-${Date.now()}`,
      chaletId: target.chaletId,
      taskType: 'checkout_cleaning',
      status: 'pending',
      assignedName: 'Mona Ibrahim',
      notes: `Auto-created on check-out (${target.bookingCode})`,
      scheduledDate: getEgyptTodayIsoDate(),
      completedAt: null,
      isDemo: appMode === 'demo',
    };

    if (appMode === 'production') {
      try {
        const confirmedBooking = await supabaseSync.updateBooking(updated, lang);
        const confirmedChalet = await supabaseSync.updateChaletStatus(
          target.chaletId,
          'cleaning',
          lang
        );
        const confirmedTask = await supabaseSync.insertHousekeeping(autoCleanTask, lang);
        setDataset((prev) => ({
          ...prev,
          bookings: prev.bookings.map((b) => (b.id === bookingId ? confirmedBooking : b)),
          chalets: prev.chalets.map((c) => (c.id === target.chaletId ? confirmedChalet : c)),
          housekeeping: [confirmedTask, ...prev.housekeeping],
        }));
        pushSecondaryNotification({
          type: 'housekeeping_request',
          title: 'Check-out Cleaning Assigned',
          titleAr: 'مهمة تنظيف بعد المغادرة',
          message: `Chalet ready for check-out cleaning after ${target.bookingCode}.`,
          messageAr: `تم إنشاء مهمة تنظيف تلقائياً بعد مغادرة ${target.bookingCode}.`,
          targetRole: 'housekeeping',
          chaletId: target.chaletId,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر إتمام تسجيل المغادرة.' : 'Check-out failed.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === bookingId ? updated : b)),
      chalets: prev.chalets.map((c) =>
        c.id === target.chaletId ? { ...c, status: 'cleaning' } : c
      ),
      housekeeping: [autoCleanTask, ...prev.housekeeping],
    }));
    pushSecondaryNotification({
      type: 'housekeeping_request',
      title: 'Check-out Cleaning Assigned',
      titleAr: 'مهمة تنظيف بعد المغادرة',
      message: `Chalet ready for check-out cleaning after ${target.bookingCode}.`,
      messageAr: `تم إنشاء مهمة تنظيف تلقائياً بعد مغادرة ${target.bookingCode}.`,
      targetRole: 'housekeeping',
      chaletId: target.chaletId,
    });
    return { ok: true };
  };

  const handleCancelBooking = async (bookingId: string): Promise<MutationResult> => {
    const target = dataset.bookings.find((b) => b.id === bookingId);
    if (!target) return { ok: false, error: 'Booking not found' };
    const updated: Booking = { ...target, status: 'cancelled' };

    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.updateBooking(updated, lang);
        setDataset((prev) => ({
          ...prev,
          bookings: prev.bookings.map((b) => (b.id === bookingId ? confirmed : b)),
        }));
        pushSecondaryNotification({
          type: 'booking_cancellation',
          title: `Booking Cancelled: ${target.bookingCode}`,
          titleAr: `إلغاء حجز: ${target.bookingCode}`,
          message: `${target.guestName} (${target.checkIn} → ${target.checkOut})`,
          messageAr: `${target.guestName} (${target.checkIn} → ${target.checkOut})`,
          targetRole: 'manager',
          chaletId: target.chaletId,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر إلغاء الحجز.' : 'Failed to cancel booking.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === bookingId ? updated : b)),
    }));
    pushSecondaryNotification({
      type: 'booking_cancellation',
      title: `Booking Cancelled: ${target.bookingCode}`,
      titleAr: `إلغاء حجز: ${target.bookingCode}`,
      message: `${target.guestName} (${target.checkIn} → ${target.checkOut})`,
      messageAr: `${target.guestName} (${target.checkIn} → ${target.checkOut})`,
      targetRole: 'manager',
      chaletId: target.chaletId,
    });
    return { ok: true };
  };

  const handleAddOwner = async (owner: Owner): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertOwner(owner, lang);
        setDataset((prev) => ({
          ...prev,
          owners: [...prev.owners, confirmed],
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حفظ بيانات المالك.' : 'Failed to save owner.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      owners: [...prev.owners, { ...owner, isDemo: true }],
    }));
    return { ok: true };
  };

  const handleSaveGuest = async (
    guest: Guest,
    isNew: boolean
  ): Promise<MutationResult<Guest>> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.upsertGuest(guest, isNew, lang);
        setDataset((prev) => ({
          ...prev,
          guests: isNew
            ? [confirmed, ...prev.guests]
            : prev.guests.map((g) => (g.id === confirmed.id ? confirmed : g)),
        }));
        return { ok: true, data: confirmed };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حفظ سجل النزيل.' : 'Failed to save guest.');
        return { ok: false, error: msg };
      }
    }

    const demoGuest: Guest = { ...guest, isDemo: true };
    setDataset((prev) => ({
      ...prev,
      guests: isNew
        ? [demoGuest, ...prev.guests]
        : prev.guests.map((g) => (g.id === demoGuest.id ? demoGuest : g)),
    }));
    return { ok: true, data: demoGuest };
  };

  const handleDeleteGuest = async (guestId: string): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        await supabaseSync.deleteGuest(guestId, lang);
        setDataset((prev) => ({
          ...prev,
          guests: prev.guests.filter((g) => g.id !== guestId),
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حذف النزيل.' : 'Failed to delete guest.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      guests: prev.guests.filter((g) => g.id !== guestId),
    }));
    return { ok: true };
  };

  const handleAddExpense = async (expense: Expense): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertExpense(expense, currentUser?.id, lang);
        setDataset((prev) => ({
          ...prev,
          expenses: [confirmed, ...prev.expenses],
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تسجيل المصروف.' : 'Failed to record expense.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      expenses: [{ ...expense, isDemo: true }, ...prev.expenses],
    }));
    return { ok: true };
  };

  const handleDeleteExpense = async (expenseId: string): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        await supabaseSync.deleteExpense(expenseId, lang);
        setDataset((prev) => ({
          ...prev,
          expenses: prev.expenses.filter((e) => e.id !== expenseId),
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر حذف المصروف.' : 'Failed to delete expense.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== expenseId),
    }));
    return { ok: true };
  };

  const handleUpdateChaletSplit = async (
    chaletId: string,
    ownerPct: number
  ): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.updateChaletSplit(chaletId, ownerPct, lang);
        setDataset((prev) => ({
          ...prev,
          chalets: prev.chalets.map((c) => (c.id === chaletId ? confirmed : c)),
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تحديث نسبة توزيع الإيرادات.' : 'Failed to update revenue split.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      chalets: prev.chalets.map((c) =>
        c.id === chaletId ? { ...c, ownerPct, managementPct: 100 - ownerPct } : c
      ),
    }));
    return { ok: true };
  };

  const handleRechargeUtility = async (
    chaletId: string,
    type: 'electricity' | 'water',
    amount: number,
    notes: string
  ): Promise<MutationResult> => {
    const ch = dataset.chalets.find((c) => c.id === chaletId);
    const currentAccount = dataset.utilities.find((u) => u.chaletId === chaletId);

    if (appMode === 'production') {
      try {
        const res = await supabaseSync.rechargeUtility(
          {
            chaletId,
            chaletNumber: ch?.chaletNumber || '',
            type,
            amount,
            notes,
            currentAccount,
            recordedByUserId: currentUser?.id,
          },
          lang
        );
        setDataset((prev) => {
          const exists = prev.utilities.some((u) => u.chaletId === chaletId);
          return {
            ...prev,
            utilities: exists
              ? prev.utilities.map((u) => (u.chaletId === chaletId ? res.utility : u))
              : [...prev.utilities, res.utility],
            utilityTransactions: [res.transaction, ...prev.utilityTransactions],
            expenses: [res.expense, ...prev.expenses],
          };
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تسجيل شحن العداد.' : 'Failed to recharge meter.');
        return { ok: false, error: msg };
      }
    }

    const nowIso = new Date().toISOString();
    let newBalance = amount;

    setDataset((prev) => {
      const utilities = prev.utilities.map((u) => {
        if (u.chaletId !== chaletId) return u;
        if (type === 'electricity') {
          newBalance = u.electricityBalance + amount;
          return {
            ...u,
            electricityBalance: newBalance,
            lastElectricityRecharge: amount,
            lastElectricityDate: nowIso,
          };
        }
        newBalance = u.waterBalance + amount;
        return {
          ...u,
          waterBalance: newBalance,
          lastWaterRecharge: amount,
          lastWaterDate: nowIso,
        };
      });

      const tx = {
        id: `utx-${Date.now()}`,
        chaletId,
        utilityType: type,
        transactionType: 'recharge' as const,
        amount,
        balanceAfter: newBalance,
        transactionDate: nowIso,
        notes: notes || 'Manual recharge',
        isDemo: true,
      };

      const exp: Expense = {
        id: `exp-${Date.now()}`,
        chaletId,
        category: type,
        description: `${type === 'electricity' ? 'Electricity' : 'Water'} meter recharge (${ch?.chaletNumber || ''})`,
        descriptionAr: `شحن عداد ${type === 'electricity' ? 'الكهرباء' : 'المياه'} (${ch?.chaletNumber || ''})`,
        amount,
        expenseDate: nowIso.slice(0, 10),
        isDemo: true,
      };

      return {
        ...prev,
        utilities,
        utilityTransactions: [tx, ...prev.utilityTransactions],
        expenses: [exp, ...prev.expenses],
      };
    });
    return { ok: true };
  };

  const handleCreateHousekeeping = async (
    task: HousekeepingTask
  ): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertHousekeeping(task, lang);
        setDataset((prev) => ({
          ...prev,
          housekeeping: [confirmed, ...prev.housekeeping],
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر إنشاء مهمة التدبير الفندقي.' : 'Failed to create task.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      housekeeping: [{ ...task, isDemo: true }, ...prev.housekeeping],
    }));
    return { ok: true };
  };

  const handleUpdateHousekeeping = async (
    taskId: string,
    status: HousekeepingStatus
  ): Promise<MutationResult> => {
    const target = dataset.housekeeping.find((h) => h.id === taskId);
    if (!target) return { ok: false, error: 'Task not found' };
    const updated: HousekeepingTask = {
      ...target,
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
    };

    if (appMode === 'production') {
      try {
        const confirmedTask = await supabaseSync.updateHousekeeping(updated, lang);
        const ch = dataset.chalets.find((c) => c.id === target.chaletId);
        let confirmedChalet: Chalet | undefined;
        if (status === 'completed' && ch && ch.status === 'cleaning') {
          confirmedChalet = await supabaseSync.updateChaletStatus(
            target.chaletId,
            'available',
            lang
          );
        }
        setDataset((prev) => ({
          ...prev,
          housekeeping: prev.housekeeping.map((h) => (h.id === taskId ? confirmedTask : h)),
          chalets: confirmedChalet
            ? prev.chalets.map((c) => (c.id === target.chaletId ? confirmedChalet! : c))
            : prev.chalets,
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تحديث حالة النظافة.' : 'Failed to update housekeeping task.');
        setActionFeedback({ ok: false, text: msg });
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      housekeeping: prev.housekeeping.map((h) => (h.id === taskId ? updated : h)),
      chalets:
        status === 'completed'
          ? prev.chalets.map((c) =>
              c.id === target.chaletId && c.status === 'cleaning'
                ? { ...c, status: 'available' }
                : c
            )
          : prev.chalets,
    }));
    return { ok: true };
  };

  const handleCreateMaintenance = async (
    ticket: MaintenanceTicket
  ): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertMaintenance(ticket, lang);
        setDataset((prev) => ({
          ...prev,
          maintenance: [confirmed, ...prev.maintenance],
        }));
        pushSecondaryNotification({
          type: 'maintenance_request',
          title: `Maintenance Ticket: ${confirmed.problemType}`,
          titleAr: `بلاغ صيانة جديد: ${confirmed.problemType}`,
          message: confirmed.description,
          messageAr: confirmed.description,
          targetRole: 'maintenance',
          chaletId: confirmed.chaletId,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تسجيل بلاغ الصيانة.' : 'Failed to create ticket.');
        return { ok: false, error: msg };
      }
    }

    const demoTicket: MaintenanceTicket = { ...ticket, isDemo: true };
    setDataset((prev) => ({
      ...prev,
      maintenance: [demoTicket, ...prev.maintenance],
    }));
    pushSecondaryNotification({
      type: 'maintenance_request',
      title: `Maintenance Ticket: ${demoTicket.problemType}`,
      titleAr: `بلاغ صيانة جديد: ${demoTicket.problemType}`,
      message: demoTicket.description,
      messageAr: demoTicket.description,
      targetRole: 'maintenance',
      chaletId: demoTicket.chaletId,
    });
    return { ok: true };
  };

  const handleUpdateMaintenance = async (
    updated: MaintenanceTicket
  ): Promise<MutationResult> => {
    const prevTicket = dataset.maintenance.find((m) => m.id === updated.id);
    if (!prevTicket) return { ok: false, error: 'Ticket not found' };
    const isFinished = updated.status === 'completed' || updated.status === 'closed';
    const normalized: MaintenanceTicket = {
      ...updated,
      completedAt: isFinished ? updated.completedAt || new Date().toISOString() : null,
    };

    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.updateMaintenance(normalized, lang);
        setDataset((prev) => ({
          ...prev,
          maintenance: prev.maintenance.map((m) => (m.id === confirmed.id ? confirmed : m)),
        }));
        if (prevTicket.status !== confirmed.status && isFinished) {
          const ch = dataset.chalets.find((c) => c.id === confirmed.chaletId);
          pushSecondaryNotification({
            type: 'maintenance_request',
            title: `Maintenance ${confirmed.status === 'closed' ? 'Closed' : 'Completed'}: ${confirmed.problemType}`,
            titleAr: `${confirmed.status === 'closed' ? 'إغلاق' : 'اكتمال'} صيانة: ${confirmed.problemType}`,
            message: `${ch?.chaletNumber || ''} · Cost ${confirmed.cost.toLocaleString()} EGP`,
            messageAr: `${ch?.chaletNumber || ''} · التكلفة ${confirmed.cost.toLocaleString()} ج.م`,
            targetRole: 'manager',
            targetOwnerId: ch?.ownerId || null,
            chaletId: confirmed.chaletId,
          });
        }
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تحديث بلاغ الصيانة.' : 'Failed to update ticket.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      maintenance: prev.maintenance.map((m) => (m.id === normalized.id ? normalized : m)),
    }));
    if (prevTicket.status !== normalized.status && isFinished) {
      const ch = dataset.chalets.find((c) => c.id === normalized.chaletId);
      pushSecondaryNotification({
        type: 'maintenance_request',
        title: `Maintenance ${normalized.status === 'closed' ? 'Closed' : 'Completed'}: ${normalized.problemType}`,
        titleAr: `${normalized.status === 'closed' ? 'إغلاق' : 'اكتمال'} صيانة: ${normalized.problemType}`,
        message: `${ch?.chaletNumber || ''} · Cost ${normalized.cost.toLocaleString()} EGP`,
        messageAr: `${ch?.chaletNumber || ''} · التكلفة ${normalized.cost.toLocaleString()} ج.م`,
        targetRole: 'manager',
        targetOwnerId: ch?.ownerId || null,
        chaletId: normalized.chaletId,
      });
    }
    return { ok: true };
  };

  const handleAddOffer = async (offer: PartnerOffer): Promise<MutationResult> => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertOffer(offer, lang);
        setDataset((prev) => ({
          ...prev,
          offers: [confirmed, ...prev.offers],
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر إضافة العرض.' : 'Failed to save offer.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      offers: [{ ...offer, isDemo: true }, ...prev.offers],
    }));
    return { ok: true };
  };

  // --- Payment Collection & Refund Handlers ---
  const handleRecordPayment = async (payload: {
    booking?: Booking | null;
    chalet?: Chalet | null;
    ownerId?: string | null;
    paymentType: 'guest_payment' | 'deposit' | 'owner_payout';
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNo: string;
    notes: string;
    paymentDueDate?: string;
  }): Promise<MutationResult> => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };
    const result = recordManualPayment({
      ...payload,
      actor: currentUser,
      existingPayments: dataset.payments,
    });
    if (!result.ok || !result.payment || !result.auditLog) {
      return { ok: false, error: result.error };
    }

    const updatedBooking = result.updatedBooking
      ? {
          ...result.updatedBooking,
          paymentDueDate: payload.paymentDueDate || result.updatedBooking.paymentDueDate,
        }
      : undefined;

    if (appMode === 'production') {
      try {
        const savedPayment = await supabaseSync.insertPayment(
          result.payment,
          result.auditLog,
          lang
        );
        const savedBooking = updatedBooking
          ? await supabaseSync.updateBooking(updatedBooking, lang)
          : undefined;
        setDataset((prev) => ({
          ...prev,
          payments: [savedPayment.payment, ...prev.payments],
          paymentAuditLogs: savedPayment.auditLog
            ? [savedPayment.auditLog, ...prev.paymentAuditLogs]
            : prev.paymentAuditLogs,
          bookings: savedBooking
            ? prev.bookings.map((b) => (b.id === savedBooking.id ? savedBooking : b))
            : prev.bookings,
        }));
        pushSecondaryNotification({
          type: payload.paymentType === 'deposit' ? 'deposit_received' : 'payment_recorded',
          title: `Payment Recorded: ${savedPayment.payment.amount.toLocaleString()} EGP`,
          titleAr: `تسجيل دفعة مالية: ${savedPayment.payment.amount.toLocaleString()} ج.م`,
          message: `${savedPayment.payment.receiptNumber || savedPayment.payment.referenceNo} (${savedPayment.payment.paymentMethod})`,
          messageAr: `${savedPayment.payment.receiptNumber || savedPayment.payment.referenceNo} (${savedPayment.payment.paymentMethod})`,
          targetRole: 'manager',
          targetOwnerId: savedPayment.payment.ownerId || null,
          chaletId: payload.booking?.chaletId || null,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تسجيل الدفعة المالية.' : 'Failed to record payment.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      payments: [{ ...result.payment!, isDemo: true }, ...prev.payments],
      paymentAuditLogs: [{ ...result.auditLog!, isDemo: true }, ...prev.paymentAuditLogs],
      bookings: updatedBooking
        ? prev.bookings.map((b) => (b.id === updatedBooking.id ? updatedBooking : b))
        : prev.bookings,
    }));
    pushSecondaryNotification({
      type: payload.paymentType === 'deposit' ? 'deposit_received' : 'payment_recorded',
      title: `Payment Recorded: ${result.payment.amount.toLocaleString()} EGP`,
      titleAr: `تسجيل دفعة مالية: ${result.payment.amount.toLocaleString()} ج.م`,
      message: `${result.payment.receiptNumber || result.payment.referenceNo} (${result.payment.paymentMethod})`,
      messageAr: `${result.payment.receiptNumber || result.payment.referenceNo} (${result.payment.paymentMethod})`,
      targetRole: 'manager',
      targetOwnerId: result.payment.ownerId || null,
      chaletId: payload.booking?.chaletId || null,
    });
    return { ok: true };
  };

  const handleIssueAdjustment = async (payload: {
    booking?: Booking | null;
    targetPayment: Payment;
    mode: 'refund' | 'correction';
    correctionDirection?: 'inflow' | 'outflow';
    amount: number;
    paymentMethod: PaymentMethod;
    reason: string;
  }): Promise<MutationResult> => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };
    const result = issuePaymentRefundOrCorrection({
      ...payload,
      actor: currentUser,
      existingPayments: dataset.payments,
    });
    if (!result.ok || !result.payment || !result.auditLog) {
      return { ok: false, error: result.error };
    }

    if (appMode === 'production') {
      try {
        const savedPayment = await supabaseSync.insertPayment(
          result.payment,
          result.auditLog,
          lang
        );
        const savedBooking = result.updatedBooking
          ? await supabaseSync.updateBooking(result.updatedBooking, lang)
          : undefined;
        setDataset((prev) => ({
          ...prev,
          payments: [savedPayment.payment, ...prev.payments],
          paymentAuditLogs: savedPayment.auditLog
            ? [savedPayment.auditLog, ...prev.paymentAuditLogs]
            : prev.paymentAuditLogs,
          bookings: savedBooking
            ? prev.bookings.map((b) => (b.id === savedBooking.id ? savedBooking : b))
            : prev.bookings,
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || (isAr ? 'تعذر تسجيل التسوية المالية.' : 'Failed to issue adjustment.');
        return { ok: false, error: msg };
      }
    }

    setDataset((prev) => ({
      ...prev,
      payments: [{ ...result.payment!, isDemo: true }, ...prev.payments],
      paymentAuditLogs: [{ ...result.auditLog!, isDemo: true }, ...prev.paymentAuditLogs],
      bookings: result.updatedBooking
        ? prev.bookings.map((b) =>
            b.id === result.updatedBooking!.id ? result.updatedBooking! : b
          )
        : prev.bookings,
    }));
    return { ok: true };
  };

  // --- Notification Management Handlers ---
  const handleMarkNotificationRead = async (id: string) => {
    if (appMode === 'production') {
      try {
        await supabaseSync.markNotificationRead(id, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error updating notification' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    }));
  };

  const handleMarkAllNotificationsRead = async () => {
    const unreadIds = scopedDataset.notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (appMode === 'production' && unreadIds.length > 0) {
      try {
        await supabaseSync.markAllNotificationsRead(unreadIds, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error updating notifications' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
    }));
  };

  const handleUpdateNotificationSettings = async (settings: NotificationSettings) => {
    const safeSettings: NotificationSettings = {
      ...settings,
      providersActivated: false, // Enforce external sending disabled in Phase 1
    };
    if (appMode === 'production') {
      try {
        await supabaseSync.upsertNotificationSettings(safeSettings, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error saving settings' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notificationSettings: safeSettings,
    }));
  };

  const handleToggleNotificationTemplate = async (
    templateId: string,
    patch: Partial<NotificationTemplate>
  ) => {
    if (appMode === 'production') {
      try {
        await supabaseSync.updateNotificationTemplate(templateId, patch, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error updating template' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notificationTemplates: prev.notificationTemplates.map((tpl) =>
        tpl.id === templateId ? { ...tpl, ...patch } : tpl
      ),
    }));
  };

  const handleAddNotificationRecipient = async (recipient: NotificationRecipient) => {
    if (appMode === 'production') {
      try {
        const confirmed = await supabaseSync.insertNotificationRecipient(recipient, lang);
        setDataset((prev) => ({
          ...prev,
          notificationRecipients: [confirmed, ...prev.notificationRecipients],
        }));
        return;
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error adding recipient' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notificationRecipients: [{ ...recipient, isDemo: true }, ...prev.notificationRecipients],
    }));
  };

  const handleToggleRecipientActive = async (recipientId: string) => {
    const target = dataset.notificationRecipients.find((r) => r.id === recipientId);
    if (!target) return;
    const nextActive = !target.isActive;
    if (appMode === 'production') {
      try {
        await supabaseSync.toggleNotificationRecipientActive(recipientId, nextActive, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Error updating recipient' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notificationRecipients: prev.notificationRecipients.map((r) =>
        r.id === recipientId ? { ...r, isActive: nextActive } : r
      ),
    }));
  };

  const handleDispatchPreview = async (payload: {
    eventKey: NotificationEventKey;
    channel: NotificationChannel;
    recipient: NotificationRecipient;
    variables: Record<string, string | number>;
    relatedEntityId: string;
    forceAllowDuplicate?: boolean;
  }): Promise<{ ok: boolean; reason?: string }> => {
    const tpl = dataset.notificationTemplates.find((tItem) => tItem.eventKey === payload.eventKey);
    if (!tpl) return { ok: false, reason: 'Template not found.' };

    const res = dispatchNotification({
      template: tpl,
      channel: payload.channel,
      recipient: payload.recipient,
      variables: payload.variables,
      relatedEntityId: payload.relatedEntityId,
      settings: dataset.notificationSettings,
      preferences: dataset.notificationPreferences,
      existingDeliveries: dataset.notificationDeliveries,
      forceAllowDuplicate: payload.forceAllowDuplicate,
    });

    if (!res.ok || !res.delivery) {
      return { ok: false, reason: res.reason };
    }

    if (appMode === 'production') {
      try {
        const saved = await supabaseSync.insertNotificationDelivery(res.delivery, lang);
        setDataset((prev) => ({
          ...prev,
          notificationDeliveries: [saved || res.delivery!, ...prev.notificationDeliveries],
        }));
        return { ok: true, reason: res.reason };
      } catch (err: any) {
        return { ok: false, reason: err?.message || 'Failed to save notification delivery.' };
      }
    }

    setDataset((prev) => ({
      ...prev,
      notificationDeliveries: [{ ...res.delivery!, isDemo: true }, ...prev.notificationDeliveries],
    }));
    return { ok: true, reason: res.reason };
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    const target = dataset.notificationDeliveries.find((d) => d.id === deliveryId);
    if (!target) return;
    const retried = retryNotificationDelivery(target, dataset.notificationSettings);
    if (appMode === 'production') {
      try {
        await supabaseSync.updateNotificationDelivery(retried, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Retry failed' });
        return;
      }
    }
    setDataset((prev) => ({
      ...prev,
      notificationDeliveries: prev.notificationDeliveries.map((d) =>
        d.id === deliveryId ? retried : d
      ),
    }));
  };

  const handleUpdateNotificationPreference = async (pref: NotificationPreference) => {
    if (appMode === 'production') {
      try {
        await supabaseSync.upsertNotificationPreference(pref, lang);
      } catch (err: any) {
        setActionFeedback({ ok: false, text: err?.message || 'Failed to save preferences' });
        return;
      }
    }
    setDataset((prev) => {
      const exists = prev.notificationPreferences.some((p) => p.eventKey === pref.eventKey);
      return {
        ...prev,
        notificationPreferences: exists
          ? prev.notificationPreferences.map((p) => (p.eventKey === pref.eventKey ? pref : p))
          : [...prev.notificationPreferences, pref],
      };
    });
  };

  const handleScheduleWeeklyOwnerReport = (ownerId: string): WeeklyEmailTask => {
    const task = scheduleWeeklyOwnerSummaryEmail({
      dataset,
      ownerId,
      lang,
    });
    if (task.delivery) {
      const delivery = task.delivery;
      setDataset((prev) => ({
        ...prev,
        notificationDeliveries: [delivery, ...prev.notificationDeliveries],
      }));
      if (appMode === 'production') {
        void supabaseSync.insertNotificationDelivery(delivery, lang).catch((err) => {
          setActionFeedback({
            ok: false,
            text: err?.message || 'Failed to persist weekly delivery log',
          });
        });
      }
    }
    return task;
  };

  const handleToggleDemoStep = (stepId: string) => {
    setCompletedDemoSteps((prev) => {
      const next = prev.includes(stepId)
        ? prev.filter((id) => id !== stepId)
        : [...prev, stepId];
      saveCompletedDemoSteps(next);
      return next;
    });
  };

  const handleRunDemoStep = (target: DemoStepTarget, stepId: string) => {
    if (appMode !== 'demo') return;
    const targetUser =
      DEMO_USERS.find((u) => u.role === target.role) || DEMO_USERS[0];
    setCurrentUser(targetUser);
    if (target.portalAction) {
      setGuestPortalAction(target.portalAction);
      setGuestPortalQrLocked(false);
      if (!guestPortalChaletId && dataset.chalets[0]) {
        setGuestPortalChaletId(dataset.chalets[0].id);
      }
    }
    setActiveTab(target.tab as NavTab);
    setCompletedDemoSteps((prev) => {
      if (prev.includes(stepId)) return prev;
      const next = [...prev, stepId];
      saveCompletedDemoSteps(next);
      return next;
    });
    setDemoGuideOpen(false);
    setMobileMenuOpen(false);
  };

  const handleResetDemoData = () => {
    if (appMode !== 'demo') return;
    const fresh = resetPersistedDemoDataset();
    setDataset(fresh);
    setCompletedDemoSteps([]);
    setDemoNotice(
      lang === 'ar'
        ? 'تمت استعادة البيانات التجريبية الأصلية (22 شاليه) بنجاح.'
        : 'Demo dataset restored to clean 22-chalet initial state.'
    );
    window.setTimeout(() => setDemoNotice(''), 3500);
  };

  if (authLoading && appMode === 'production' && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-200">
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 text-center space-y-2 max-w-sm w-full">
          <div className="text-sm font-bold text-white">{t.brandFull}</div>
          <div className="text-xs text-slate-400">
            {isAr ? 'جاري التحقق من جلسة العمل...' : 'Verifying active session...'}
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginView
          lang={lang}
          appMode={appMode}
          isSupabaseConfigured={isSupabaseConfigured}
          authNotice={authNotice}
          onToggleLang={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
          onLoginUser={(u) => {
            setAuthNotice('');
            setCurrentUser(u);
          }}
          onEnterDemoMode={() => {
            void handleEnterDemoMode();
          }}
          onExitDemoMode={isSupabaseConfigured ? handleExitDemoMode : undefined}
          onStartGuidedDemo={
            appMode === 'demo'
              ? () => {
                  const adminDemo =
                    DEMO_USERS.find((u) => u.role === 'super_admin') || DEMO_USERS[0];
                  setCurrentUser(adminDemo);
                  setActiveTab('dashboard');
                  setDemoGuideOpen(true);
                }
              : undefined
          }
          onOpenSetupGuide={() => setSetupModalOpen(true)}
        />
        <SupabaseSetupModal
          open={setupModalOpen}
          onClose={() => setSetupModalOpen(false)}
          lang={lang}
        />
        <OfflineIndicator lang={lang} appMode={appMode} />
      </>
    );
  }

  const allowedTabs = ROLE_ALLOWED_TABS[currentUser.role];
  const unreadNotifs = scopedDataset.notifications.filter((n) => !n.isRead).length;
  const isStaffManager =
    currentUser.role === 'super_admin' || currentUser.role === 'manager';

  const allNavItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<any>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'chalets', label: t.nav.chalets, icon: Building2 },
    { id: 'occupancyMap', label: t.nav.occupancyMap, icon: LayoutGrid },
    { id: 'bookings', label: t.nav.bookings, icon: CalendarCheck2 },
    { id: 'owners', label: t.nav.owners, icon: Users },
    { id: 'users', label: t.nav.users, icon: UserCog },
    { id: 'ownerPortal', label: t.nav.ownerPortal, icon: UserCheck },
    { id: 'payments', label: t.nav.payments, icon: CreditCard },
    { id: 'financials', label: t.nav.financials, icon: Wallet },
    { id: 'utilities', label: t.nav.utilities, icon: Zap },
    { id: 'housekeeping', label: t.nav.housekeeping, icon: Sparkles },
    { id: 'maintenance', label: t.nav.maintenance, icon: Wrench },
    { id: 'offers', label: t.nav.offers, icon: Utensils },
    { id: 'notifications', label: t.nav.notifications, icon: Bell, badge: unreadNotifs },
    { id: 'guestPortal', label: t.nav.guestPortal, icon: Compass },
  ];
  const navItems = allNavItems.filter((item) => allowedTabs.includes(item.id));

  const currentNavLabel = navItems.find((n) => n.id === activeTab)?.label || t.brandName;

  const handleLogout = async () => {
    if (appMode === 'production' && isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      setDataset(createEmptyDataset());
      setProductionError(null);
    }
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-slate-950 text-slate-200 shrink-0 no-print">
        <div className="p-4 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center gap-3">
            <CompanyLogo size="md" className="border-slate-700" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-300 tracking-tight truncate">
                {COMPANY_BRANDING.companyName}
              </div>
              <div className="text-sm font-bold text-white leading-snug truncate">
                {t.brandName}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 leading-snug line-clamp-2">
            {t.brandFull} · {t.brandSubtitle}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-800 text-white'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono-num text-[11px] font-bold text-amber-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3 text-xs">
          <div className="space-y-0.5">
            <div className="font-semibold text-white truncate">
              {isAr ? currentUser.fullNameAr : currentUser.fullName}
            </div>
            <div className="text-slate-400">{t.roles[currentUser.role]}</div>
          </div>

          {appMode === 'demo' && currentUser.isDemo && (
            <select
              aria-label="Switch Demo Role"
              value={currentUser.id}
              onChange={(e) => {
                const found = DEMO_USERS.find((u) => u.id === e.target.value);
                if (found) setCurrentUser(found);
              }}
              className="w-full px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-xs"
            >
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {t.roles[u.role]} — {isAr ? u.fullNameAr : u.fullName}
                </option>
              ))}
            </select>
          )}

          {appMode === 'demo' && (
            <button
              type="button"
              onClick={handleResetDemoData}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-amber-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط التجربة' : 'Reset Demo Data'}</span>
            </button>
          )}

          {appMode === 'demo' && isSupabaseConfigured && (
            <button
              type="button"
              onClick={handleExitDemoMode}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 text-emerald-200 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isAr ? 'الانتقال لوضع الإنتاج' : 'Switch to Production'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.nav.logout}</span>
          </button>

          <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-300 truncate">
              {COMPANY_BRANDING.companyName}
            </span>
            <span className="truncate">
              {t.ceoLabel}: {COMPANY_BRANDING.ceoName}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-slate-950 text-slate-200 flex flex-col h-full">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <CompanyLogo size="sm" className="border-slate-700" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-amber-300 truncate">
                    {COMPANY_BRANDING.companyName}
                  </div>
                  <span className="font-bold text-white text-xs block truncate">
                    {t.brandName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer ${
                      active ? 'bg-cyan-800 text-white' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="font-mono-num text-[11px] font-bold text-amber-300">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800 space-y-2 text-xs">
              {appMode === 'demo' && currentUser.isDemo && (
                <select
                  value={currentUser.id}
                  onChange={(e) => {
                    const found = DEMO_USERS.find((u) => u.id === e.target.value);
                    if (found) setCurrentUser(found);
                  }}
                  className="w-full px-2.5 py-2 rounded-md bg-slate-900 border border-slate-700 text-slate-200"
                >
                  {DEMO_USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {t.roles[u.role]} — {isAr ? u.fullNameAr : u.fullName}
                    </option>
                  ))}
                </select>
              )}
              {appMode === 'demo' && (
                <button
                  type="button"
                  onClick={() => {
                    handleResetDemoData();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-amber-300 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة ضبط التجربة' : 'Reset Demo Data'}</span>
                </button>
              )}
              {appMode === 'demo' && isSupabaseConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    handleExitDemoMode();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-200 cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{isAr ? 'الانتقال لوضع الإنتاج' : 'Switch to Production'}</span>
                </button>
              )}
              <PWAInstallButton lang={lang} variant="menu" />
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-slate-200 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.nav.logout}</span>
              </button>
              <div className="pt-1 text-[10px] text-slate-400 flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-300">
                  {COMPANY_BRANDING.companyName}
                </span>
                <span>
                  {t.ceoLabel}: {COMPANY_BRANDING.ceoName}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Clean 3-Zone Contract) */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
              aria-label="Open Navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <CompanyLogo size="sm" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentNavLabel}
              </h1>
              <div className="text-[11px] text-slate-500 truncate">
                <span className="font-semibold text-slate-700">
                  {COMPANY_BRANDING.companyName}
                </span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className={appMode === 'production' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {appMode === 'production' ? t.supabaseConnectedLabel : t.demoModeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {appMode === 'demo' ? (
              <button
                type="button"
                onClick={() => setDemoGuideOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-cyan-800 bg-cyan-800 hover:bg-cyan-900 text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-amber-300" />
                <span>{isAr ? 'دليل التجربة بالخطوات' : 'Demo Steps'}</span>
                <span className="font-mono-num text-[10px] bg-white/15 px-1.5 py-0.5 rounded">
                  {completedDemoSteps.length}/7
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={productionLoading}
                  onClick={() => void refreshProductionData()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-800 ${productionLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{isAr ? 'تحديث البيانات' : 'Sync'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleEnterDemoMode()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden md:inline">{isAr ? 'الوضع التجريبي' : 'Demo'}</span>
                </button>
              </>
            )}

            <PWAInstallButton lang={lang} variant="header" />

            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-cyan-800" />
              <span className="hidden sm:inline">{t.setupGuide}</span>
            </button>

            <button
              type="button"
              onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.switchLang}</span>
            </button>

            {allowedTabs.includes('notifications') && (
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="relative p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                aria-label={t.nav.notifications}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -end-1 px-1 min-w-[16px] h-4 rounded-full bg-amber-600 text-white text-[10px] font-mono-num font-bold flex items-center justify-center">
                    {unreadNotifs}
                  </span>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {appMode === 'production' && productionError && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-red-900">
                    {productionError.kind === 'missing_tables'
                      ? isAr
                        ? 'قاعدة بيانات الإنتاج غير مهيأة بالجداول بعد (No tables)'
                        : 'Production Database Tables Missing (No tables)'
                      : isAr
                      ? 'تعذر تحميل بيانات الإنتاج من Supabase'
                      : 'Unable to load Production data from Supabase'}
                  </div>
                  <p className="text-red-800 leading-relaxed">{productionError.message}</p>
                  <p className="text-[11px] text-red-700">
                    {isAr
                      ? 'لن يتم الرجوع تلقائياً إلى البيانات التجريبية لضمان عزل بيئة الإنتاج.'
                      : 'Automatic fallback to Demo Mode is disabled to protect Production isolation.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void refreshProductionData()}
                  className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-900 text-white text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'إعادة المحاولة' : 'Retry'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleEnterDemoMode()}
                  className="px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-900 text-xs font-semibold cursor-pointer"
                >
                  {isAr ? 'فتح الوضع التجريبي المعزول' : 'Open Isolated Demo'}
                </button>
              </div>
            </div>
          )}

          {appMode === 'production' &&
            !productionError &&
            !productionLoading &&
            dataset.chalets.length === 0 &&
            dataset.owners.length === 0 && (
              <div className="mb-5 p-4 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
                <div className="flex items-start gap-2.5 text-xs">
                  <Info className="w-4 h-4 text-cyan-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      {isAr
                        ? 'متصل بقاعدة بيانات الإنتاج — قاعدة البيانات فارغة حالياً:'
                        : 'Connected to Production Supabase — Database Currently Empty:'}
                    </span>{' '}
                    {isAr
                      ? 'لا توجد شاليهات أو ملاك مسجلين بعد. يمكنك البدء بإضافة الملاك والشاليهات أو تهيئة البيانات.'
                      : 'No owners or chalets are recorded yet. Start by adding real owners and chalets.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshProductionData()}
                  className="px-3 py-1.5 rounded-lg border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-900 text-xs font-semibold shrink-0 cursor-pointer"
                >
                  {isAr ? 'إعادة الفحص' : 'Refresh'}
                </button>
              </div>
            )}

          {actionFeedback && (
            <div
              className={`mb-4 p-3 rounded-lg border text-xs font-medium no-print flex items-center justify-between gap-3 ${
                actionFeedback.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{actionFeedback.text}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="p-1 rounded hover:bg-black/5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {demoNotice && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 no-print">
              {demoNotice}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              dataset={scopedDataset}
              lang={lang}
              dataSource={dataSource}
              userRole={currentUser.role}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
              onOpenChaletDetails={(chaletNumber) => {
                setFocusedChaletSearch(chaletNumber);
                setActiveTab('chalets');
              }}
            />
          )}

          {activeTab === 'chalets' && (
            <ChaletsView
              chalets={scopedDataset.chalets}
              owners={scopedDataset.owners}
              lang={lang}
              canEdit={isStaffManager}
              initialSearch={focusedChaletSearch}
              onSaveChalet={handleSaveChalet}
              onDeleteChalet={handleDeleteChalet}
              onToggleActive={handleToggleChaletActive}
              onOpenGuestPortal={(chalet, action = 'stay') => {
                setGuestPortalChaletId(chalet.id);
                setGuestPortalAction(action);
                setGuestPortalQrLocked(false);
                setActiveTab('guestPortal');
              }}
            />
          )}

          {activeTab === 'occupancyMap' && (
            <ChaletOccupancyMap
              chalets={scopedDataset.chalets}
              bookings={scopedDataset.bookings}
              owners={scopedDataset.owners}
              maintenance={scopedDataset.maintenance}
              lang={lang}
              dataSource={dataSource}
              userRole={currentUser.role}
              canViewBookingValue={
                currentUser.role === 'super_admin' ||
                currentUser.role === 'manager' ||
                currentUser.role === 'owner' ||
                currentUser.role === 'reception'
              }
              canAccessChalets={allowedTabs.includes('chalets')}
              canAccessBookings={allowedTabs.includes('bookings')}
              canAccessMaintenance={allowedTabs.includes('maintenance')}
              canAccessOwnerPortal={allowedTabs.includes('ownerPortal')}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
              onOpenChaletDetails={(chaletNumber) => {
                setFocusedChaletSearch(chaletNumber);
                setActiveTab('chalets');
              }}
            />
          )}

          {activeTab === 'bookings' && (
            <BookingsView
              bookings={scopedDataset.bookings}
              chalets={scopedDataset.chalets}
              guests={scopedDataset.guests}
              lang={lang}
              canManage={isStaffManager || currentUser.role === 'reception'}
              onCreateBooking={handleCreateBooking}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onCancelBooking={handleCancelBooking}
              onSaveGuest={handleSaveGuest}
              onDeleteGuest={handleDeleteGuest}
            />
          )}

          {(activeTab === 'ownerPortal' || activeTab === 'owners') && (
            <OwnerPortalView
              dataset={scopedDataset}
              currentUser={currentUser}
              lang={lang}
              mode={activeTab === 'owners' ? 'directory' : 'portal'}
              onAddOwner={isStaffManager ? handleAddOwner : undefined}
              onScheduleWeeklyEmail={isStaffManager ? handleScheduleWeeklyOwnerReport : undefined}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
            />
          )}

          {activeTab === 'users' && (
            <UsersManagementView
              users={platformUsers}
              owners={scopedDataset.owners}
              currentUser={currentUser}
              lang={lang}
              appMode={appMode}
              onSaveUser={handleSavePlatformUser}
              onDeleteUser={handleDeletePlatformUser}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              dataset={scopedDataset}
              lang={lang}
              currentUser={currentUser}
              dataSource={dataSource}
              canRecordPayments={isStaffManager || currentUser.role === 'reception'}
              canIssueRefunds={isStaffManager}
              onRecordPayment={handleRecordPayment}
              onIssueAdjustment={handleIssueAdjustment}
            />
          )}

          {activeTab === 'financials' && (
            <FinancialsView
              dataset={scopedDataset}
              lang={lang}
              canManage={isStaffManager}
              onAddExpense={handleAddExpense}
              onDeleteExpense={isStaffManager ? handleDeleteExpense : undefined}
              onUpdateChaletSplit={handleUpdateChaletSplit}
              onOpenPayments={() => setActiveTab('payments')}
            />
          )}

          {activeTab === 'utilities' && (
            <UtilitiesView
              chalets={scopedDataset.chalets}
              utilities={scopedDataset.utilities}
              transactions={scopedDataset.utilityTransactions}
              lang={lang}
              canRecharge={isStaffManager || currentUser.role === 'maintenance'}
              onRecharge={handleRechargeUtility}
            />
          )}

          {activeTab === 'housekeeping' && (
            <HousekeepingView
              tasks={scopedDataset.housekeeping}
              chalets={scopedDataset.chalets}
              lang={lang}
              canAssign={isStaffManager || currentUser.role === 'reception'}
              onCreateTask={handleCreateHousekeeping}
              onUpdateTaskStatus={handleUpdateHousekeeping}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceDashboardView
              tickets={scopedDataset.maintenance}
              chalets={scopedDataset.chalets}
              lang={lang}
              userRole={currentUser.role}
              canCreate={
                isStaffManager ||
                currentUser.role === 'maintenance' ||
                currentUser.role === 'reception'
              }
              canManage={isStaffManager || currentUser.role === 'maintenance'}
              onCreateTicket={handleCreateMaintenance}
              onUpdateTicket={handleUpdateMaintenance}
            />
          )}

          {activeTab === 'offers' && (
            <OffersView
              offers={scopedDataset.offers}
              lang={lang}
              canManage={isStaffManager}
              onAddOffer={handleAddOffer}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationCenterView
              dataset={scopedDataset}
              lang={lang}
              currentUser={currentUser}
              dataSource={dataSource}
              canManage={isStaffManager || currentUser.role === 'reception'}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onUpdateSettings={handleUpdateNotificationSettings}
              onToggleTemplate={handleToggleNotificationTemplate}
              onAddRecipient={handleAddNotificationRecipient}
              onToggleRecipientActive={handleToggleRecipientActive}
              onDispatchPreview={handleDispatchPreview}
              onRetryDelivery={handleRetryDelivery}
              onUpdatePreference={handleUpdateNotificationPreference}
            />
          )}

          {activeTab === 'guestPortal' && (
            <GuestPortalView
              dataset={scopedDataset}
              lang={lang}
              selectedChaletId={guestPortalChaletId}
              initialAction={guestPortalAction}
              lockChaletSelection={guestPortalQrLocked && currentUser.role === 'guest'}
              onChaletChange={(id) => {
                setGuestPortalChaletId(id);
                setGuestPortalAction('stay');
              }}
              onExpressCheckIn={handleCheckIn}
              onRequestHousekeeping={async (chaletId, notes) => {
                const res = await handleCreateHousekeeping({
                  id: `hk-${Date.now()}`,
                  chaletId,
                  taskType: 'linen_replacement',
                  status: 'pending',
                  assignedName: 'Mona Ibrahim',
                  notes,
                  scheduledDate: getEgyptTodayIsoDate(),
                  completedAt: null,
                  isDemo: appMode === 'demo',
                });
                if (res.ok) {
                  pushSecondaryNotification({
                    type: 'housekeeping_request',
                    title: 'Guest Housekeeping Request',
                    titleAr: 'طلب تدبير فندقي من النزيل',
                    message: notes,
                    messageAr: notes,
                    targetRole: 'housekeeping',
                    chaletId,
                  });
                }
                return res;
              }}
              onReportMaintenance={async (chaletId, problemType, description) => {
                const newId =
                  typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `mnt-${Date.now()}`;
                return handleCreateMaintenance({
                  id: newId,
                  chaletId,
                  problemType,
                  description,
                  photos: [],
                  priority: 'high',
                  status: 'open',
                  technicianName: '',
                  cost: 0,
                  notes: 'Reported from Guest Portal',
                  createdAt: new Date().toISOString(),
                  completedAt: null,
                  isDemo: appMode === 'demo',
                });
              }}
            />
          )}
        </main>
      </div>

      {appMode === 'demo' && (
        <DemoWalkthroughModal
          open={demoGuideOpen}
          onClose={() => setDemoGuideOpen(false)}
          lang={lang}
          isDemoMode={dataSource === 'demo'}
          completedStepIds={completedDemoSteps}
          onToggleStepComplete={handleToggleDemoStep}
          onRunStep={handleRunDemoStep}
          onResetDemoData={handleResetDemoData}
        />
      )}

      <SupabaseSetupModal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        lang={lang}
      />
      <OfflineIndicator lang={lang} appMode={appMode} />
    </div>
  );
}
