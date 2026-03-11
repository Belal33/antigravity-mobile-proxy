import { useState, useCallback } from 'react';
import type { WindowInfo, ConversationInfo } from '@/lib/types';

const API_BASE = '/api/v1';

export function useConversations(
  fetchHistory: () => Promise<void>,
  setShowWelcome: (s: boolean) => void,
  onConversationSwitched?: () => void
) {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationInfo | null>(null);

  const loadWindows = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/windows`);
      const data = await res.json();
      setWindows(data.windows || []);
    } catch { /* ignore */ }
  }, []);

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

  return {
    windows,
    conversations,
    activeConversation,
    loadWindows,
    selectWindow,
    loadConversations,
    selectConversation
  };
}

