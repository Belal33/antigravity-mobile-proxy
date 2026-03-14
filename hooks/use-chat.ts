'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useConversations } from './use-conversations';
import { useArtifacts } from './use-artifacts';
import type { ChatMessage, SSEStep } from '@/lib/types';

const API_BASE = '/api/v1';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [statusText, setStatusText] = useState('Agent');
  const [statusState, setStatusState] = useState('connected');
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSteps, setCurrentSteps] = useState<SSEStep[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentMode, setCurrentMode] = useState<'planning' | 'fast'>('planning');
  
  const controllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef('');
  const currentStepsRef = useRef<SSEStep[]>([]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const setStatus = useCallback((state: string, text: string) => {
    setStatusState(state);
    setStatusText(text);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/history`);
      const data = await res.json();
      if (data.turns && data.turns.length > 0) {
        setShowWelcome(false);
        setMessages(data.turns.map((t: any) => ({ role: t.role, content: t.content })));
      }
    } catch { /* ignore */ }
  }, []);

  const {
    artifactFiles,
    artifactPanelOpen,
    toggleArtifactPanel,
    openArtifactPanel,
    loadArtifacts
  } = useArtifacts();

  // Auto-open artifact panel and refresh files when a conversation switch completes
  const handleConversationSwitched = useCallback(() => {
    openArtifactPanel();
    loadArtifacts();
  }, [openArtifactPanel, loadArtifacts]);

  const {
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
  } = useConversations(fetchHistory, setShowWelcome, handleConversationSwitched);


  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/mode`);
      const data = await res.json();
      if (data.mode) setCurrentMode(data.mode);
    } catch { /* ignore */ }
  }, []);

  const toggleMode = useCallback(async () => {
    const newMode = currentMode === 'planning' ? 'fast' : 'planning';
    setCurrentMode(newMode); // Optimistic update
    try {
      const res = await fetch(`${API_BASE}/chat/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (data.mode) setCurrentMode(data.mode);
    } catch {
      setCurrentMode(currentMode); // Rollback on error
    }
  }, [currentMode]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setIsConnected(data.connected);
      setStatus(data.connected ? 'connected' : 'disconnected', data.connected ? 'Agent' : 'Disconnected');
    } catch {
      setIsConnected(false);
      setStatus('disconnected', 'Offline');
    }
  }, [setStatus]);

  const handleSSEvent = useCallback((payload: any) => {
    const { type, ...data } = payload;

    switch (type) {
      case 'tool_call':
        // Update existing tool call in-place, or append if new
        setCurrentSteps(prev => {
          const existingIdx = prev.findIndex(
            s => s.type === 'tool_call' && s.data?.id === data.id
          );
          let updated;
          if (existingIdx >= 0) {
            updated = [...prev];
            updated[existingIdx] = { type, data };
          } else {
            updated = [...prev, { type, data }];
          }
          currentStepsRef.current = updated;
          return updated;
        });
        break;

      case 'thinking':
      case 'hitl':
      case 'file_change':
      case 'error':
      case 'notification':
        setCurrentSteps(prev => {
          const updated = [...prev, { type, data }];
          currentStepsRef.current = updated;
          return updated;
        });
        break;

      case 'response':
        setCurrentResponse(data.content || '');
        currentResponseRef.current = data.content || '';
        break;

      case 'status':
        setStatus(data.isRunning ? 'streaming' : 'connected', data.isRunning ? 'Agent working...' : 'Agent');
        break;

      case 'done':
        if (data.finalResponse) {
          setCurrentResponse(data.finalResponse);
          currentResponseRef.current = data.finalResponse;
        }
        setStatus('connected', 'Agent');
        setIsStreaming(false);
        break;
    }
    scrollToBottom();
  }, [setStatus, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming || !text.trim()) return;

    setShowWelcome(false);
    const trimmed = text.trim();

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsStreaming(true);
    setCurrentSteps([]);
    setCurrentResponse('');
    currentResponseRef.current = '';
    currentStepsRef.current = [];
    setStatus('streaming', 'Agent typing...');

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            handleSSEvent(payload);
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setCurrentSteps(prev => [...prev, { type: 'error', data: { message: e.message } }]);
        setStatus('error', 'Error');
      }
    } finally {
      const finalResponse = currentResponseRef.current;
      const finalSteps = [...currentStepsRef.current];

      setIsStreaming(false);
      controllerRef.current = null;

      if (finalResponse || finalSteps.length > 0) {
        setMessages(prev => [
          ...prev,
          { role: 'agent', content: finalResponse, steps: finalSteps },
        ]);
      }
      setStatus('connected', 'Agent');
    }
  }, [isStreaming, handleSSEvent, setStatus]);

  const startNewChat = useCallback(async () => {
    if (controllerRef.current) controllerRef.current.abort();
    setMessages([]);
    setCurrentSteps([]);
    setCurrentResponse('');
    setShowWelcome(true);

    try {
      const res = await fetch(`${API_BASE}/chat/new`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus('connected', 'New Chat');
      }
    } catch { /* ignore */ }
  }, [setStatus]);

  const approve = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/chat/approve`, { method: 'POST' });
      setStatus('streaming', 'Agent');
    } catch { /* ignore */ }
  }, [setStatus]);

  const reject = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/chat/reject`, { method: 'POST' });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    checkHealth();
    loadWindows();
    fetchHistory();
    loadConversations();
    loadArtifacts();
    fetchMode();
    checkCdpStatus();
    loadRecentProjects();

    // Passive polling for health and CDP status
    const healthTimer = setInterval(checkHealth, 30000);
    const cdpTimer = setInterval(checkCdpStatus, 15000);
    return () => { clearInterval(healthTimer); clearInterval(cdpTimer); };
  }, [checkHealth, loadWindows, fetchHistory, loadConversations, loadArtifacts, fetchMode, checkCdpStatus, loadRecentProjects]);

  useEffect(scrollToBottom, [messages, currentSteps, currentResponse, scrollToBottom]);

  return {
    messages, isStreaming, isConnected, statusText, statusState,
    showWelcome, currentSteps, currentResponse, windows,
    conversations, activeConversation, artifactFiles, artifactPanelOpen,
    currentMode, cdpStatus, recentProjects,
    sendMessage, startNewChat, approve, reject,
    selectWindow, selectConversation, toggleArtifactPanel, openArtifactPanel,
    toggleMode, startCdpServer, openNewWindow, closeWindowByIndex,
    messagesEndRef, setShowWelcome,
  };
}
