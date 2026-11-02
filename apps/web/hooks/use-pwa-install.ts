'use client';

import { useSyncExternalStore } from 'react';
import {
  canPromptInstall,
  dismissInstallBanner,
  isAndroidDevice,
  isInstallBannerDismissed,
  isIosDevice,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '@/lib/pwa/install-store';

export type InstallMode = 'hidden' | 'prompt' | 'ios-instructions' | 'android-instructions';

function subscribe(callback: () => void) {
  const unsubscribe = subscribeInstall(callback);
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', callback);
  return () => {
    unsubscribe();
    media.removeEventListener('change', callback);
  };
}

function getMode(): InstallMode {
  if (isStandalone() || isInstallBannerDismissed()) return 'hidden';
  if (canPromptInstall()) return 'prompt';
  if (isIosDevice()) return 'ios-instructions';
  if (isAndroidDevice()) return 'android-instructions';
  return 'hidden';
}

export function usePwaInstall() {
  const mode = useSyncExternalStore(subscribe, getMode, (): InstallMode => 'hidden');
  return { mode, install: promptInstall, dismiss: dismissInstallBanner };
}
