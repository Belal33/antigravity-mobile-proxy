'use client';

import { useState, useRef, useEffect } from 'react';
import type { ConversationInfo } from '@/lib/types';

interface ConversationSelectorProps {
  conversations: ConversationInfo[];
  activeConversation: ConversationInfo | null;
  onSelect: (title: string) => void;
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ConversationSelector({ conversations, activeConversation, onSelect }: ConversationSelectorProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className={`conv-selector-wrapper ${open ? 'open' : ''}`}>
      <button className="conv-selector-btn" onClick={() => setOpen(!open)} title="Switch conversation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>{activeConversation?.title?.substring(0, 22) || 'No conversation'}</span>
        <svg className="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className={`conv-dropdown ${open ? 'open' : ''}`}>
        <div className="conv-dropdown-header">Conversations</div>
        <div className="conv-dropdown-list">
          {conversations.map((c, i) => {
            const displayTitle = c.title || c.id.substring(0, 20) + '…';
            const displayId = c.id && c.id.length > 5 ? c.id.substring(0, 8) : '';
            const topFiles = c.files?.slice(0, 3) || [];
            const remainingCount = c.files ? c.files.length - 3 : 0;
            
            return (
              <button
                key={`conv-${i}`}
                className={`conv-item ${c.title === activeConversation?.title ? 'active' : ''}`}
                onClick={() => {
                  if (c.title !== activeConversation?.title) {
                    onSelect(c.title);
                  }
                  setOpen(false);
                }}
              >
                <div className="conv-item-header">
                  <span className={`conv-item-dot ${c.active ? 'active' : ''}`} />
                  <span className="conv-item-title">{displayTitle}</span>
                  {displayId && <span className="conv-item-id">{displayId}</span>}
                </div>
                {c.mtime && <span className="conv-item-time">{formatRelativeTime(c.mtime)}</span>}
                {c.files && c.files.length > 0 && (
                  <div className="conv-item-files">
                    {topFiles.map((f, fi) => (
                      <span key={fi} className="conv-item-file-badge">{f.name}</span>
                    ))}
                    {remainingCount > 0 && (
                      <span className="conv-item-file-badge">+{remainingCount}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {conversations.length === 0 && (
            <div className="conv-dropdown-empty">No conversations found</div>
          )}
        </div>
      </div>
    </div>
  );
}
