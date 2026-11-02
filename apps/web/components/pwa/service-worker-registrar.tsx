'use client';

import { useEffect } from 'react';
// Loaded from the root layout so `beforeinstallprompt` is captured on whichever page fires it,
// not only once a page containing the install banner has loaded.
import '@/lib/pwa/install-store';
import { showToast } from '@/lib/toast-store';

/**
 * Registers /sw.js in production builds and drives the update flow: when a new version has
 * installed, the user is asked to reload; the waiting worker is activated only on consent so a
 * game in progress is never reloaded underneath the player.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    if (process.env.NODE_ENV !== 'production') {
      // Avoid stale caches during development.
      void container.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }

    // The first install takes control without a reload; only replacements trigger one.
    const hadController = container.controller !== null;
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    container.addEventListener('controllerchange', onControllerChange);

    const offerUpdate = (worker: ServiceWorker) => {
      showToast('Đã có phiên bản mới của ứng dụng.', {
        durationMs: null,
        action: { label: 'Tải lại', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
      });
    };

    let registration: ServiceWorkerRegistration | undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void registration?.update();
    };

    container
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && container.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && container.controller) offerUpdate(worker);
          });
        });
        document.addEventListener('visibilitychange', onVisible);
      })
      .catch(() => {
        // Registration failure only disables offline support; the app keeps working.
      });

    return () => {
      container.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
