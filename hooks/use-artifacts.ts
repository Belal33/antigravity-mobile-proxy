import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import type { ArtifactFile } from '@/lib/types';
import { fetcher, SWR_KEYS } from '@/lib/swr-fetcher';

/**
 * Polling intervals (ms).
 * We poll ALWAYS—even when the panel is closed—so the badge count stays fresh.
 * When the panel is open we use a faster cadence.
 */
const POLL_FAST_MS  = 3_000;  // panel open
const POLL_SLOW_MS  = 8_000;  // panel closed (background)

export function useArtifacts(activeConversationId?: string | null) {
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);

  const { data, mutate } = useSWR(SWR_KEYS.artifacts, fetcher, {
    refreshInterval: artifactPanelOpen ? POLL_FAST_MS : POLL_SLOW_MS,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const artifactFiles: ArtifactFile[] = data?.files || [];

  const toggleArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(prev => !prev);
  }, []);

  const openArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(true);
  }, []);

  // Re-fetch when the active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      mutate();
    }
  }, [activeConversationId, mutate]);

  return {
    artifactFiles,
    artifactPanelOpen,
    toggleArtifactPanel,
    openArtifactPanel,
    loadArtifacts: mutate,  // exposed so SSE events can trigger an immediate refresh
  };
}
