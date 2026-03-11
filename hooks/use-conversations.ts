import { useState, useCallback } from 'react';
import type { WindowInfo, ConversationInfo } from '@/lib/types';

const API_BASE = '/api/v1';

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

export function useConversations(
  fetchHistory: () => Promise<void>,
  setShowWelcome: (s: boolean) => void,
  onConversationSwitched?: () => void
) {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationInfo | null>(null);
  const [cdpStatus, setCdpStatus] = useState<CdpStatus>({ active: false, windowCount: 0 });
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  const loadWindows = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/windows`);
      const data = await res.json();
      setWindows(data.windows || []);
    } catch { /* ignore */ }
  }, []);

  const checkCdpStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/windows/cdp-status`);
      const data = await res.json();
      setCdpStatus({
        active: data.active,
        windowCount: data.windowCount,
        error: data.error,
      });
      return data.active;
    } catch {
      setCdpStatus({ active: false, windowCount: 0, error: 'Failed to check' });
      return false;
    }
  }, []);

  const startCdpServer = useCallback(async (projectDir?: string, killExisting?: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/windows/cdp-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: projectDir || '.', killExisting: killExisting || false }),
      });
      const data = await res.json();
      if (data.success) {
        await checkCdpStatus();
        await loadWindows();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to start CDP server' };
    }
  }, [checkCdpStatus, loadWindows]);

  const openNewWindow = useCallback(async (projectDir: string) => {
    try {
      const res = await fetch(`${API_BASE}/windows/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh window list after opening
        await loadWindows();
        await checkCdpStatus();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to open window' };
    }
  }, [loadWindows, checkCdpStatus]);

  const closeWindowByIndex = useCallback(async (index: number) => {
    try {
      const res = await fetch(`${API_BASE}/windows/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (data.success) {
        await loadWindows();
        await checkCdpStatus();
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to close window' };
    }
  }, [loadWindows, checkCdpStatus]);

  const selectWindow = useCallback(async (idx: number) => {
    try {
      await fetch(`${API_BASE}/windows/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      await loadWindows();
    } catch { /* ignore */ }
  }, [loadWindows]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const data = await res.json();
      const convs: ConversationInfo[] = data.conversations || [];
      setConversations(convs);
      const active = convs.find((c) => c.active);
      if (active) {
        setActiveConversation(active);
      }
    } catch { /* ignore */ }
  }, []);

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
            const resList = await fetch(`${API_BASE}/conversations`);
            const dList = await resList.json();
            const convs = dList.conversations || [];
            const active = convs.find((c: any) => c.active);
            if ((active && active.title === title) || attempts > 10) {
              setConversations(convs);
              if (active) setActiveConversation(active);
              await fetchHistory();
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
  }, [fetchHistory, setShowWelcome, onConversationSwitched]);

  const loadRecentProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/windows/recent`);
      const data = await res.json();
      setRecentProjects(data.recentProjects || []);
    } catch { /* ignore */ }
  }, []);

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
