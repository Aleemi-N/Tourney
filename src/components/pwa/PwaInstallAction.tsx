'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallAction({ className = '', onComplete }: { className?: string; onComplete?: () => void }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const updateInstalled = () => setIsInstalled(standalone.matches || navigatorWithStandalone.standalone === true);
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    const initialStateTimer = window.setTimeout(() => {
      updateInstalled();
      setIsIosSafari(ios && safari);
    }, 0);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      updateInstalled();
    };
    const handleInstalled = () => {
      setPrompt(null);
      setIsInstalled(true);
      setShowIosHelp(false);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    standalone.addEventListener('change', updateInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      standalone.removeEventListener('change', updateInstalled);
      window.clearTimeout(initialStateTimer);
    };
  }, []);

  if (isInstalled || (!prompt && !isIosSafari)) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      onComplete?.();
      return;
    }
    setShowIosHelp(true);
  }

  return (
    <>
      <button type="button" onClick={install} className={className}>
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        Install Tourny
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-tourny-title">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-2xl">
            <button type="button" onClick={() => setShowIosHelp(false)} className="absolute right-3 top-3 rounded-lg p-2 text-text-secondary hover:bg-white/5" aria-label="Close install instructions">
              <X className="h-5 w-5" />
            </button>
            <h2 id="install-tourny-title" className="pr-10 text-lg font-bold text-text-primary">Install Tourny</h2>
            <ol className="mt-4 space-y-3 text-sm text-text-secondary">
              <li className="flex gap-3"><span className="font-bold text-primary">1.</span><span>Tap the <Share className="mx-1 inline h-4 w-4" aria-label="Share" /> Share button in Safari.</span></li>
              <li className="flex gap-3"><span className="font-bold text-primary">2.</span><span>Choose <strong className="text-text-primary">Add to Home Screen</strong>.</span></li>
              <li className="flex gap-3"><span className="font-bold text-primary">3.</span><span>Confirm <strong className="text-text-primary">Add</strong>.</span></li>
            </ol>
            <button type="button" onClick={() => { setShowIosHelp(false); onComplete?.(); }} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover">Done</button>
          </div>
        </div>
      )}
    </>
  );
}
