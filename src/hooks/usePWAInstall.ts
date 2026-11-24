import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const checkInstalled = () => {
      const standalone =
        standaloneQuery.matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };

    checkInstalled();

    const ua = window.navigator.userAgent;
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice && !isInstalled);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneQuery.addEventListener?.('change', checkInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneQuery.removeEventListener?.('change', checkInstalled);
    };
  }, [isInstalled]);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    return outcome;
  }, [deferredPrompt]);

  return {
    canInstall: !isInstalled && deferredPrompt !== null,
    isInstalled,
    isIOS,
    install,
  };
}
