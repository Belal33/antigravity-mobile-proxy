import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChangeFile } from '@/lib/types';

const API_BASE = '/api/v1';
const POLL_INTERVAL_MS = 5000;

/**
 * Hook for fetching and managing the "Changes Overview" data
 * scraped from the IDE's conversation panel.
 */
export function useChanges() {
  const [changeFiles, setChangeFiles] = useState<ChangeFile[]>([]);
  const [changesPanelOpen, setChangesPanelOpen] = useState(false);

  const lastHashRef = useRef('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChanges = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/changes/active`);
      const data = await res.json();
      const changes: ChangeFile[] = data.changes || [];

      const newHash = JSON.stringify(changes.map(c => `${c.filename}+${c.additions}-${c.deletions}`));
      if (newHash !== lastHashRef.current) {
        lastHashRef.current = newHash;
        setChangeFiles(changes);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleChangesPanel = useCallback(() => {
    setChangesPanelOpen(prev => !prev);
  }, []);

  // Poll when panel is open
  useEffect(() => {
    if (changesPanelOpen) {
      loadChanges();
      pollingRef.current = setInterval(loadChanges, POLL_INTERVAL_MS);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [changesPanelOpen, loadChanges]);

  return {
    changeFiles,
    changesPanelOpen,
    toggleChangesPanel,
    loadChanges,
  };
}
