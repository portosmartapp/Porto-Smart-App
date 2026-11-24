import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppMode, Language } from '../types/platform';

interface PWAInstallButtonProps {
  lang: Language;
  variant?: 'header' | 'hero' | 'menu';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  variant = 'header',
}) => {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const isAr = lang === 'ar';

  if (isInstalled) return null;

  const handleClick = async () => {
    if (canInstall) {
      const outcome = await install();
      if (outcome !== 'unavailable') return;
    }
    setGuideOpen(true);
  };

  const buttonClasses =
    variant === 'hero'
      ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition-colors cursor-pointer shrink-0 no-print'
      : variant === 'menu'
      ? 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-100 text-xs font-medium cursor-pointer no-print'
      : 'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 rounded-lg whitespace-nowrap shrink-0 cursor-pointer no-print';

  const label = isAr ? 'تثبيت التطبيق' : 'Install App';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={buttonClasses}
        title={isAr ? 'تثبيت كتطبيق على الهاتف أو الكمبيوتر' : 'Install on Mobile or Desktop'}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className={variant === 'header' ? 'hidden sm:inline' : ''}>{label}</span>
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden text-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-800" />
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr ? 'تثبيت تطبيق PortoSokhna' : 'Install PortoSokhna App'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs leading-relaxed text-slate-700">
              {isIOS ? (
                <div className="space-y-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Share className="w-3.5 h-3.5 text-cyan-800" />
                    <span>
                      {isAr ? 'خطوات التثبيت على iPhone و iPad (Safari):' : 'iPhone & iPad (Safari):'}
                    </span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>
                      {isAr
                        ? 'افتح الرابط في متصفح Safari مباشرة.'
                        : 'Open this app directly in Safari.'}
                    </li>
                    <li>
                      {isAr
                        ? 'اضغط على زر المشاركة (Share) أسفل الشاشة.'
                        : 'Tap the Share icon at the bottom of Safari.'}
                    </li>
                    <li>
                      {isAr
                        ? 'اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).'
                        : 'Select "Add to Home Screen" and tap Add.'}
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900">
                      {isAr ? 'أندرويد وكمبيوتر (Chrome / Edge):' : 'Android & Desktop (Chrome / Edge):'}
                    </div>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        {isAr
                          ? 'افتح رابط التطبيق في تبويب متصفح مستقل (خارج إطار المعاينة إن وُجد).'
                          : 'Open the app URL in its own browser tab.'}
                      </li>
                      <li>
                        {isAr
                          ? 'من قائمة المتصفح (⋮) أو شريط العنوان اختر "تثبيت التطبيق" (Install App) أو "الإضافة للشاشة الرئيسية".'
                          : 'Click "Install App" in the address bar or browser menu (⋮).'}
                      </li>
                    </ol>
                  </div>
                  <div className="space-y-1.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900">
                      {isAr ? 'آيفون وآيباد (Safari):' : 'iPhone & iPad (Safari):'}
                    </div>
                    <p>
                      {isAr
                        ? 'اضغط زر المشاركة (Share) ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).'
                        : 'Tap Share in Safari, then choose "Add to Home Screen".'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'تم' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface OfflineIndicatorProps {
  lang: Language;
  appMode?: AppMode;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  lang,
  appMode = 'demo',
}) => {
  const isOnline = useOnlineStatus();
  const isAr = lang === 'ar';

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 z-50 no-print pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs shadow-lg border border-slate-700">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          {appMode === 'demo'
            ? isAr
              ? 'أنت غير متصل بالإنترنت — الواجهة والوضع التجريبي يعملان محلياً دون فقدان البيانات.'
              : 'Offline mode — cached workspace and local Demo Mode remain active.'
            : isAr
            ? 'أنت غير متصل بالإنترنت — ستُستأنف مزامنة Supabase فور عودة الاتصال.'
            : 'You are offline — Supabase sync will resume automatically once reconnected.'}
        </span>
      </div>
    </div>
  );
};
