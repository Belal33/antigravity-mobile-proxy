import { useState, useCallback } from 'react';
import useSWR from 'swr';
import type { ChangeFile } from '@/lib/types';
import { fetcher, SWR_KEYS } from '@/lib/swr-fetcher';

/**
 * Polling intervals (ms).
 * We poll ALWAYS—even when the panel is closed—so the badge count stays fresh.
 */
const POLL_FAST_MS  = 3_000;  // panel open
const POLL_SLOW_MS  = 8_000;  // panel closed (background)

/**
 * Hook for fetching and managing the "Changes Overview" data
 * scraped from the IDE's conversation panel.
 */
export function useChanges() {
  const [changesPanelOpen, setChangesPanelOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const { data, mutate } = useSWR(SWR_KEYS.changes, fetcher, {
    refreshInterval: changesPanelOpen ? POLL_FAST_MS : POLL_SLOW_MS,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const changeFiles: ChangeFile[] = data?.changes || [];

  const toggleChangesPanel = useCallback(() => {
    setChangesPanelOpen(prev => !prev);
  }, []);

  /**
   * Accept all file changes by clicking the IDE's "Accept all" button.
   */
  const acceptAllChanges = useCallback(async () => {
    setIsAccepting(true);
    try {
      const res = await fetch('/api/v1/changes/accept-all', { method: 'POST' });
      const result = await res.json();
      // Refresh the changes list after accepting
      await new Promise(r => setTimeout(r, 500));
      await mutate();
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      setIsAccepting(false);
    }
  }, [mutate]);

  /**
   * Reject all file changes by clicking the IDE's "Reject all" button.
   */
  const rejectAllChanges = useCallback(async () => {
    setIsRejecting(true);
    try {
      const res = await fetch('/api/v1/changes/reject-all', { method: 'POST' });
      const result = await res.json();
      // Refresh the changes list after rejecting
      await new Promise(r => setTimeout(r, 500));
      await mutate();
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      setIsRejecting(false);
    }
  }, [mutate]);

  return {
    changeFiles,
    changesPanelOpen,
    toggleChangesPanel,
    loadChanges: mutate,  // exposed so SSE events can trigger an immediate refresh
    acceptAllChanges,
    rejectAllChanges,
    isAccepting,
    isRejecting,
  };
}
