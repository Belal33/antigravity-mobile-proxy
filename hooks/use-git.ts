import { useState, useCallback } from 'react';
import useSWR from 'swr';
import type { GitStatus } from '@/lib/types';
import { fetcher, SWR_KEYS } from '@/lib/swr-fetcher';

const POLL_FAST_MS = 4_000;  // panel open
const POLL_SLOW_MS = 15_000; // panel closed (background)

/**
 * Hook for fetching live git status from the active IDE workspace.
 * Polls the git status API and exposes the panel open/close state.
 */
export function useGit() {
  const [gitPanelOpen, setGitPanelOpen] = useState(false);

  const { data, mutate } = useSWR<GitStatus>(SWR_KEYS.git, fetcher, {
    refreshInterval: gitPanelOpen ? POLL_FAST_MS : POLL_SLOW_MS,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  });

  const gitStatus: GitStatus | null = data?.isGitRepo !== undefined ? (data as GitStatus) : null;

  // Total dirty file count (staged + unstaged + untracked) for badge
  const gitChangedCount = gitStatus
    ? (gitStatus.staged?.length || 0) + (gitStatus.unstaged?.length || 0) + (gitStatus.untracked?.length || 0)
    : 0;

  const toggleGitPanel = useCallback(() => {
    setGitPanelOpen(prev => !prev);
  }, []);

  const refreshGit = useCallback(() => {
    mutate();
  }, [mutate]);

  return {
    gitStatus,
    gitPanelOpen,
    gitChangedCount,
    toggleGitPanel,
    refreshGit,
  };
}
