import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Database,
  Globe,
  KeyRound,
  Mail,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { COMPANY_BRANDING } from '../constants/branding';
import { DEMO_USERS, RESORT_IMAGES } from '../data/demoData';
import { classifySupabaseError, supabase } from '../lib/supabase';
import { getT } from '../i18n/translations';
import { supabaseSync } from '../services/platformStore';
import { AppMode, Language, PlatformUser } from '../types/platform';
import { CompanyLogo } from './CompanyLogo';
import { PWAInstallButton } from './PWABannerControls';

interface LoginViewProps {
  lang: Language;
  appMode: AppMode;
  isSupabaseConfigured: boolean;
  authNotice?: string;
  onToggleLang: () => void;
  onLoginUser: (user: PlatformUser) => void;
  onEnterDemoMode: () => void;
  onExitDemoMode?: () => void;
  onStartGuidedDemo?: () => void;
  onOpenSetupGuide: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  appMode,
  isSupabaseConfigured,
  authNotice = '',
  onToggleLang,
  onLoginUser,
  onEnterDemoMode,
  onExitDemoMode,
  onStartGuidedDemo,
  onOpenSetupGuide,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [authTab, setAuthTab] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState<{
    title: string;
    message: string;
    uid?: string;
  } | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [loading, setLoading] = useState(false);

  const isProductionLogin = isSupabaseConfigured && appMode === 'production';

  const switchAuthTab = (tab: 'signin' | 'signup' | 'reset') => {
    setAuthTab(tab);
    setAuthError('');
    setAuthSuccess(null);
  };

  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(true);
      window.setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError('');
    setAuthSuccess(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(classifySupabaseError(error, lang).message);
      }
      if (!data.user) {
        throw new Error(
          isAr ? 'تعذر التحقق من حساب المستخدم.' : 'Unable to verify authenticated user.'
        );
      }

      try {
        const profile = await supabaseSync.fetchUserProfile(
          data.user.id,
          data.user.email || email,
          lang
        );
        onLoginUser(profile);
      } catch (profileErr) {
        await supabase.auth.signOut();
        throw profileErr;
      }
    } catch (err: any) {
      setAuthError(
        err?.message ||
          (isAr ? 'تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور.' : 'Invalid credentials.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSupabaseSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError('');
    setAuthSuccess(null);

    if (password.length < 6) {
      setAuthError(
        isAr ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' : 'Password must be at least 6 characters.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setAuthError(isAr ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        },
      });
      if (error) {
        throw new Error(classifySupabaseError(error, lang).message);
      }
      if (
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        throw new Error(
          isAr
            ? 'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول أو استعادة كلمة المرور.'
            : 'This email is already registered. Please sign in or reset your password.'
        );
      }

      const createdUid = data.user?.id;
      if (data.session) {
        await supabase.auth.signOut();
      }

      setAuthSuccess({
        title: isAr ? 'تم إنشاء حساب الدخول بنجاح!' : 'Account Created Successfully!',
        message: isAr
          ? 'تواصل مع المدير العام لتفعيل صلاحيتك داخل المنصة (مالك / موظف / استقبال / صيانة) باستخدام معرّف المستخدم التالي:'
          : 'Share your User UID below with your Platform Admin so they can activate your role (Owner / Staff / Reception / Maintenance):',
        uid: createdUid,
      });
    } catch (err: any) {
      setAuthError(
        err?.message ||
          (isAr ? 'تعذر إنشاء الحساب الجديد.' : 'Unable to create account.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError('');
    setAuthSuccess(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (error) {
        throw new Error(classifySupabaseError(error, lang).message);
      }
      setAuthSuccess({
        title: isAr ? 'تم إرسال رابط استعادة كلمة المرور' : 'Password Reset Email Sent',
        message: isAr
          ? 'راجع بريدك الإلكتروني (وصندوق الرسائل غير المرغوب فيها) لفتح رابط تعيين كلمة مرور جديدة.'
          : 'Check your inbox (and spam folder) for the password reset link.',
      });
    } catch (err: any) {
      setAuthError(
        err?.message ||
          (isAr ? 'تعذر إرسال رابط الاستعادة.' : 'Unable to send reset email.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left / Hero Architectural Showcase */}
      <div className="relative lg:w-1/2 min-h-[280px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between p-8 lg:p-12">
        <img
          src={RESORT_IMAGES.hero}
          alt="Porto El Sokhna Marina Resort"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/55 to-slate-950/40" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-white min-w-0">
            <CompanyLogo size="lg" className="shadow-sm border-white/30" />
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                {COMPANY_BRANDING.companyName}
              </div>
              <div className="text-xs text-amber-300 truncate">{t.brandName}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton lang={lang} variant="hero" />
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition-colors cursor-pointer shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.switchLang}</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-4 mt-10 lg:mt-0">
          <p className="text-xs font-medium text-amber-300 tracking-wide">
            {t.managedBy} · {isAr ? 'العين السخنة' : 'Ain Sokhna'}
          </p>
          <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight [text-wrap:balance]">
            {t.brandFull}
          </h1>
          <p className="text-slate-200 text-sm lg:text-base leading-relaxed">
            {t.brandSubtitle}
          </p>
          <div className="pt-4 border-t border-white/15 grid grid-cols-3 gap-4 text-white">
            <div>
              <div className="text-xl font-mono-num font-bold">22+</div>
              <div className="text-xs text-slate-300">
                {isAr ? 'شاليه مُدار' : 'Managed Chalets'}
              </div>
            </div>
            <div>
              <div className="text-xl font-mono-num font-bold">6</div>
              <div className="text-xs text-slate-300">
                {isAr ? 'أدوار وصلاحيات' : 'Access Roles'}
              </div>
            </div>
            <div>
              <div className="text-xl font-mono-num font-bold">100%</div>
              <div className="text-xs text-slate-300">
                {isAr ? 'عزل بيانات الملاك' : 'Owner Isolation'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right / Auth & Isolated Demo Access Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3 min-w-0">
              <CompanyLogo size="md" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">
                  {COMPANY_BRANDING.companyName}
                </div>
                <div className="text-xs text-slate-500 truncate">{t.brandFull}</div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border shrink-0 ${
                isProductionLogin
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {isProductionLogin
                ? isAr
                  ? 'إنتاج · Supabase'
                  : 'Production · Supabase'
                : isAr
                ? 'وضع التجربة المعزول'
                : 'Isolated Demo'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-slate-900">
                {isProductionLogin
                  ? isAr
                    ? 'تسجيل الدخول للمنصة (Production)'
                    : 'Production Sign In'
                  : isAr
                  ? 'النسخة التجريبية التفاعلية'
                  : 'Interactive Demo Access'}
              </h2>
              <button
                type="button"
                onClick={onOpenSetupGuide}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-800 hover:text-cyan-950 underline underline-offset-4 cursor-pointer shrink-0"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{t.setupGuide}</span>
              </button>
            </div>
            <p className="text-sm text-slate-600">
              {isProductionLogin
                ? isAr
                  ? 'متصل بمشروع Supabase. أدخل بيانات حسابك المفعل في جدول الصلاحيات للمتابعة.'
                  : 'Connected to your Supabase project. Sign in with an active provisioned account.'
                : isAr
                ? 'يعمل هذا المسار بوضع العرض التجريبي المعزول (22 شاليه) ولا يؤثر على قاعدة بيانات الإنتاج.'
                : 'Running in isolated Demo Mode (22 chalets). Changes here never touch Production database tables.'}
            </p>
          </div>

          {authNotice && !authSuccess && (
            <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
              {authNotice}
            </div>
          )}

          {isProductionLogin ? (
            <>
              <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
                {/* Sign In / Create Account Switcher */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => switchAuthTab('signin')}
                    className={`py-2 rounded-md transition-colors cursor-pointer ${
                      authTab === 'signin'
                        ? 'bg-white text-cyan-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? 'تسجيل الدخول' : 'Sign In'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchAuthTab('signup')}
                    className={`py-2 rounded-md transition-colors cursor-pointer ${
                      authTab === 'signup'
                        ? 'bg-white text-cyan-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? 'إنشاء حساب جديد' : 'Create Account'}
                  </button>
                </div>

                {authSuccess && (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{authSuccess.title}</span>
                    </div>
                    <p className="leading-relaxed">{authSuccess.message}</p>
                    {authSuccess.uid && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded bg-white border border-emerald-200">
                        <span className="font-mono-num text-[11px] text-slate-800 truncate dir-ltr">
                          {authSuccess.uid}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyUid(authSuccess.uid!)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                        >
                          {copiedUid ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedUid ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ UID' : 'Copy UID'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {authTab === 'signin' && (
                  <form onSubmit={handleSupabaseLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@porto-sokhna.com"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-700">
                          {isAr ? 'كلمة المرور' : 'Password'}
                        </label>
                        <button
                          type="button"
                          onClick={() => switchAuthTab('reset')}
                          className="text-[11px] text-cyan-800 hover:underline cursor-pointer"
                        >
                          {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                      />
                    </div>
                    {authError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {authError}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 bg-cyan-800 hover:bg-cyan-900 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>
                        {loading
                          ? isAr
                            ? 'جاري التحقق من الحساب والصلاحيات...'
                            : 'Verifying credentials & role...'
                          : isAr
                          ? 'تسجيل الدخول للمنصة'
                          : 'Sign In'}
                      </span>
                    </button>
                  </form>
                )}

                {authTab === 'signup' && (
                  <form onSubmit={handleSupabaseSignUp} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {isAr ? 'الاسم الكامل' : 'Full Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={isAr ? 'أحمد محمد' : 'Ahmed Mohamed'}
                        className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {isAr ? 'البريد الإلكتروني' : 'Email'}
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="user@email.com"
                          className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {isAr ? 'رقم الهاتف' : 'Phone'}
                        </label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+20 10..."
                          className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 font-mono-num focus:outline-none focus:ring-2 focus:ring-cyan-700"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {isAr ? 'كلمة المرور' : 'Password'}
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                        />
                      </div>
                    </div>
                    {authError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {authError}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 bg-cyan-800 hover:bg-cyan-900 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {loading
                          ? isAr
                            ? 'جاري تسجيل الحساب...'
                            : 'Creating account...'
                          : isAr
                          ? 'تسجيل حساب مستخدم جديد'
                          : 'Register Account'}
                      </span>
                    </button>
                  </form>
                )}

                {authTab === 'reset' && (
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {isAr ? 'البريد الإلكتروني المسجّل' : 'Registered Email'}
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@porto-sokhna.com"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
                      />
                    </div>
                    {authError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {authError}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => switchAuthTab('signin')}
                        className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        {isAr ? 'رجوع' : 'Back'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-2.5 px-4 bg-cyan-800 hover:bg-cyan-900 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <Mail className="w-4 h-4" />
                        <span>
                          {loading
                            ? isAr
                              ? 'جاري الإرسال...'
                              : 'Sending...'
                            : isAr
                            ? 'إرسال رابط الاستعادة'
                            : 'Send Reset Link'}
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800">
                    {isAr ? 'تريد استعراض النسخة التجريبية؟' : 'Want to preview Demo Mode?'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? 'بيئة عرض معزولة تماماً عن بيانات الإنتاج'
                      : 'Completely isolated sandbox from Production'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onEnterDemoMode}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold shrink-0 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{isAr ? 'فتح الوضع التجريبي' : 'Open Demo'}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {isSupabaseConfigured && onExitDemoMode && (
                <button
                  type="button"
                  onClick={onExitDemoMode}
                  className="w-full px-4 py-2.5 rounded-xl border border-cyan-800 bg-white hover:bg-cyan-50 text-cyan-900 text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span>
                    {isAr
                      ? 'العودة إلى تسجيل الدخول الفعلي (Production Mode)'
                      : 'Return to Live Production Login (Supabase)'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              )}

              {/* Interactive Guided Trial Launcher */}
              {onStartGuidedDemo && (
                <button
                  type="button"
                  onClick={onStartGuidedDemo}
                  className="w-full p-4 rounded-xl bg-cyan-900 hover:bg-cyan-950 text-white text-start flex items-center justify-between gap-3 shadow-xs transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <Compass className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>
                        {isAr
                          ? 'ابدأ التجربة التفاعلية خطوة بخطوة'
                          : 'Start Interactive Step-by-Step Trial'}
                      </span>
                    </div>
                    <p className="text-xs text-cyan-100">
                      {isAr
                        ? 'جولة عملية من 7 خطوات لاختبار الحجوزات، QR، الحسابات، وعزل الملاك.'
                        : '7-step hands-on tour covering bookings, QR portals, financials & owner isolation.'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-white/15 text-xs font-semibold shrink-0">
                    {isAr ? 'ابدأ الآن' : 'Launch'}
                  </span>
                </button>
              )}

              {/* Role-based Instant Demo Access */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-700" />
                    {isAr
                      ? 'دخول تجريبي سريع حسب الصلاحية (Demo)'
                      : 'Quick Role Demo Access (Test Permissions)'}
                  </span>
                  <span className="text-[11px] text-slate-500">{t.demoTag}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_USERS.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => onLoginUser(u)}
                      className="text-start px-3 py-2.5 rounded-lg border border-slate-200 hover:border-cyan-700 hover:bg-cyan-50/50 transition-colors cursor-pointer group"
                    >
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-cyan-900 truncate">
                        {isAr ? u.fullNameAr : u.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {t.roles[u.role]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 border-t border-slate-200">
            <span className="font-semibold text-slate-700">
              {COMPANY_BRANDING.companyName}
            </span>
            <span>
              {t.ceoLabel}: {COMPANY_BRANDING.ceoName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

