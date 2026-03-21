import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChangeFile } from '@/lib/types';

const API_BASE = '/api/v1';

/**
 * Background polling intervals (ms).
 * We poll ALWAYS—even when the panel is closed—so the badge count stays fresh.
 */
const POLL_FAST_MS  = 3_000;  // panel open
const POLL_SLOW_MS  = 8_000;  // panel closed (background)

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

  // Always poll — faster when the panel is open, slower in the background
  useEffect(() => {
    loadChanges();

    const interval = changesPanelOpen ? POLL_FAST_MS : POLL_SLOW_MS;
    pollingRef.current = setInterval(loadChanges, interval);

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
    loadChanges,  // exposed so SSE events can trigger an immediate refresh
  };
}
