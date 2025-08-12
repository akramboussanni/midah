import { useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface UpdateInfoPayload {
  version: string;
  changelog: string;
  msi_url?: string | null;
}

export function useUpdater() {
  const [update, setUpdate] = useState<UpdateInfoPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<{ status: string; message?: string } | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<UpdateInfoPayload>('update-available', (event) => {
      setUpdate(event.payload);
      setVisible(true);
    });
    const unlistenProgress = listen<{ status: string; message?: string }>('update-progress', (event) => {
      setProgress(event.payload);
      if (event.payload?.status === 'error') {
        console.error('[updater] error:', event.payload.message);
      }
    });
    return () => {
      unlistenPromise.then((un) => un());
      unlistenProgress.then((un) => un());
    };
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  return { update, visible, dismiss, progress };
}


