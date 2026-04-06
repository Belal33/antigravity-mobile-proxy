import { useState, useCallback } from 'react';
import useSWR from 'swr';
import type { WorkspaceTree } from '@/lib/types';
import { fetcher, SWR_KEYS } from '@/lib/swr-fetcher';

const POLL_FAST_MS = 5_000;  // panel open
const POLL_SLOW_MS = 60_000; // panel closed (background)

/**
 * Hook for fetching the active IDE workspace file tree.
 * Polls when the panel is open; long-polls when closed.
 */
export function useWorkspace() {
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);

  const { data, mutate, isLoading } = useSWR<WorkspaceTree>(
    SWR_KEYS.workspace,
    fetcher,
    {
      refreshInterval: workspacePanelOpen ? POLL_FAST_MS : POLL_SLOW_MS,
      revalidateOnFocus: workspacePanelOpen,
      revalidateOnReconnect: true,
      dedupingInterval: 3000,
    }
  );

  const workspaceTree: WorkspaceTree | null = data?.workspacePath ? data : null;

  const toggleWorkspacePanel = useCallback(() => {
    setWorkspacePanelOpen(prev => !prev);
  }, []);

  const refreshWorkspace = useCallback(() => {
    mutate();
  }, [mutate]);

  return {
    workspaceTree,
    workspacePanelOpen,
    workspaceLoading: isLoading,
    toggleWorkspacePanel,
    refreshWorkspace,
  };
}
