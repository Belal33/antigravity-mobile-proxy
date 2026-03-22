import { useCallback } from 'react';
import useSWR from 'swr';
import type { WindowInfo, ConversationInfo } from '@/lib/types';
import { fetcher, SWR_KEYS } from '@/lib/swr-fetcher';

export interface CdpStatus {
  active: boolean;
  windowCount: number;
  error?: string | null;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
}

const API_BASE = '/api/v1';

export function useConversations(
  fetchHistory: () => void,
  setShowWelcome: (s: boolean) => void,
  onConversationSwitched?: () => void
) {
  // ── SWR-powered read-only data ──
  const { data: windowsData, mutate: mutateWindows } = useSWR<{ windows?: WindowInfo[] }>(
    SWR_KEYS.windows, fetcher, { revalidateOnFocus: true }
  );
  const windows: WindowInfo[] = windowsData?.windows || [];

  const { data: cdpData, mutate: mutateCdpStatus } = useSWR<{ active: boolean; windowCount: number; error?: string | null }>(
    SWR_KEYS.cdpStatus, fetcher, { refreshInterval: 15000, revalidateOnFocus: true }
  );
  const cdpStatus: CdpStatus = {
    active: cdpData?.active ?? false,
    windowCount: cdpData?.windowCount ?? 0,
    error: cdpData?.error ?? null,
  };

  const { data: convsData, mutate: mutateConversations } = useSWR<{ conversations?: ConversationInfo[] }>(
    SWR_KEYS.conversations, fetcher, { revalidateOnFocus: true }
  );
  const conversations: ConversationInfo[] = convsData?.conversations || [];
  const activeConversation: ConversationInfo | null = conversations.find((c) => c.active) || null;

  const { data: recentData, mutate: mutateRecentProjects } = useSWR<{ recentProjects?: RecentProject[] }>(
    SWR_KEYS.recentProjects, fetcher, { revalidateOnFocus: true }
  );
  const recentProjects: RecentProject[] = recentData?.recentProjects || [];

  // ── Mutations (POST actions) — revalidate SWR caches on success ──

  const startCdpServer = useCallback(async (projectDir?: string, killExisting?: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/windows/cdp-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: projectDir || '.', killExisting: killExisting || false }),
      });
      const data = await res.json();
      if (data.success) {
        mutateCdpStatus();
        mutateWindows();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to start CDP server' };
    }
  }, [mutateCdpStatus, mutateWindows]);

  const openNewWindow = useCallback(async (projectDir: string) => {
    try {
      const res = await fetch(`${API_BASE}/windows/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir }),
      });
      const data = await res.json();
      if (data.success) {
        mutateWindows();
        mutateCdpStatus();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to open window' };
    }
  }, [mutateWindows, mutateCdpStatus]);

  const closeWindowByIndex = useCallback(async (index: number) => {
    try {
      const res = await fetch(`${API_BASE}/windows/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (data.success) {
        mutateWindows();
        mutateCdpStatus();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to close window' };
    }
  }, [mutateWindows, mutateCdpStatus]);

  const selectWindow = useCallback(async (idx: number) => {
    try {
      // Clear current chat and show welcome while we load the new window's history
      setShowWelcome(true);
      await fetch(`${API_BASE}/windows/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      mutateWindows();
      // Fetch the new window's chat history
      fetchHistory();
      // Refresh conversations list for the new window — use a short delay so the
      // server has time to settle the window context before we re-fetch.
      // A second pass fires 1.5s later to catch any slower propagation.
      setTimeout(() => mutateConversations(), 300);
      setTimeout(() => mutateConversations(), 1500);
      // Notify parent (for artifact sync etc.)
      onConversationSwitched?.();
    } catch { /* ignore */ }
  }, [mutateWindows, fetchHistory, setShowWelcome, mutateConversations, onConversationSwitched]);

  const selectConversation = useCallback(async (title: string) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.success) {
        setShowWelcome(false);
        let attempts = 0;
        const poll = async () => {
          attempts++;
          try {
            // Re-fetch conversations to see if active one has switched
            const resList = await fetch(`${API_BASE}/conversations`);
            const dList = await resList.json();
            const convs = dList.conversations || [];
            const active = convs.find((c: any) => c.active);
            if ((active && active.title === title) || attempts > 10) {
              // Update the SWR cache with this fresh data
              mutateConversations({ conversations: convs }, { revalidate: false });
              fetchHistory();
              // Notify parent that the switch is complete (for artifact sync)
              onConversationSwitched?.();
              return;
            }
          } catch { /* ignore */ }
          setTimeout(poll, 500);
        };
        poll();
      }
    } catch { /* ignore */ }
  }, [fetchHistory, setShowWelcome, mutateConversations, onConversationSwitched]);

  // ── Expose imperative refresh functions (backwards-compatible names) ──
  const loadWindows = mutateWindows;
  const loadConversations = mutateConversations;
  const checkCdpStatus = mutateCdpStatus;
  const loadRecentProjects = mutateRecentProjects;

  return {
    windows,
    conversations,
    activeConversation,
    cdpStatus,
    recentProjects,
    loadWindows,
    selectWindow,
    loadConversations,
    selectConversation,
    checkCdpStatus,
    startCdpServer,
    openNewWindow,
    closeWindowByIndex,
    loadRecentProjects,
  };
}
