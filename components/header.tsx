'use client';

import { useState, useRef, useEffect } from 'react';
import type { WindowInfo, ConversationInfo } from '@/lib/types';
import ConversationSelector from './conversation-selector';

interface HeaderProps {
  statusState: string;
  statusText: string;
  windows: WindowInfo[];
  conversations: ConversationInfo[];
  activeConversation: ConversationInfo | null;
  onSelectWindow: (idx: number) => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onToggleArtifacts: () => void;
}

export default function Header({
  statusState, statusText, windows, conversations, activeConversation,
  onSelectWindow, onSelectConversation, onNewChat, onToggleArtifacts,
}: HeaderProps) {
  const [windowOpen, setWindowOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setWindowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <div className="header-title">
          <h1>Antigravity</h1>
          <span className={`header-subtitle status-${statusState}`}>{statusText}</span>
        </div>
      </div>
      <div className="header-right">
        {/* Conversation Selector */}
        <ConversationSelector
          conversations={conversations}
          activeConversation={activeConversation}
          onSelect={onSelectConversation}
        />

        {/* Window Selector */}
        <div ref={wrapperRef} className={`window-selector-wrapper ${windowOpen ? 'open' : ''}`}>
          <button className="window-selector-btn" onClick={() => setWindowOpen(!windowOpen)} title="Select Antigravity window">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'bottom' }}>
              {windows.find(w => w.active)?.title || 'Window'}
            </span>
            <svg className="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className={`window-dropdown ${windowOpen ? 'open' : ''}`}>
            <div className="window-dropdown-header">Antigravity Windows</div>
            {windows.map(w => (
              <button key={w.index} className={`window-item ${w.active ? 'active' : ''}`} onClick={() => { onSelectWindow(w.index); setWindowOpen(false); }}>
                <span className="window-dot" />
                <span>{w.title}</span>
              </button>
            ))}
            {windows.length === 0 && <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>No windows found</div>}
          </div>
        </div>

        {/* Artifacts Button */}
        <button className="icon-btn" onClick={onToggleArtifacts} title="Artifacts" aria-label="Artifacts">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </button>

        {/* New Chat Button */}
        <button className="icon-btn" onClick={onNewChat} title="New Chat" aria-label="New Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
