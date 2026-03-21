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

  return {
    changeFiles,
    changesPanelOpen,
    toggleChangesPanel,
    loadChanges: mutate,  // exposed so SSE events can trigger an immediate refresh
  };
}
