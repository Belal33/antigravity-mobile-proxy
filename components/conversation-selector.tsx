'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} wk${weeks !== 1 ? 's' : ''} ago`;
}

export default function ConversationSelector({ conversations, activeConversation, onSelect }: ConversationSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setShowAll(false);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeDropdown]);

  // ── Partition conversations into sections ──
  // 1. "Current" — the active conversation (especially index === -1 synthetic ones)
  // 2. "Recent"  — the rest, sorted by mtime desc
  const current = conversations.find(c => c.active) || null;
  const others = conversations.filter(c => !c.active);

  // Sort others by mtime descending
  const sorted = [...others].sort((a, b) => {
    if (!a.mtime && !b.mtime) return 0;
    if (!a.mtime) return 1;
    if (!b.mtime) return -1;
    return new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
  });

  const SHOW_LIMIT = 5;
  const visible = showAll ? sorted : sorted.slice(0, SHOW_LIMIT);
  const hiddenCount = sorted.length - SHOW_LIMIT;

  return (
    <div ref={wrapperRef} className={`conv-selector-wrapper ${open ? 'open' : ''}`}>
      <button className="conv-selector-btn" onClick={() => setOpen(!open)} title="Switch conversation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>{activeConversation?.title?.substring(0, 22) || 'Select a conversation'}</span>
        <svg className="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className={`conv-dropdown ${open ? 'open' : ''}`}>
        <div className="conv-dropdown-header">Select a conversation</div>
        <div className="conv-dropdown-list">

          {/* ── Current Section ── */}
          {current && (
            <div className="conv-section">
              <div className="conv-section-label">Current</div>
              <button
                className="conv-item active"
                onClick={() => {
                  // Only allow switching if this conversation exists in the IDE (index !== -1)
                  if (current.index !== -1) {
                    onSelect(current.title);
                  }
                  closeDropdown();
                }}
              >
                <div className="conv-item-header">
                  <span className="conv-item-title">{current.title || 'Untitled'}</span>
                  {current.mtime && (
                    <span className="conv-item-time">{formatRelativeTime(current.mtime)}</span>
                  )}
                  {/* Trash icon placeholder — matches IDE style */}
                  <span
                    role="button"
                    tabIndex={0}
                    className="conv-item-action"
                    title="Current conversation"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* ── Recent Conversations Section ── */}
          {visible.length > 0 && (
            <div className="conv-section">
              <div className="conv-section-label">
                Recent{sorted.length > 0 && <span className="conv-section-count">{sorted.length}</span>}
              </div>
              {visible.map((c, i) => {
                const displayTitle = c.title || c.id.substring(0, 20) + '…';
                return (
                  <button
                    key={`conv-${i}`}
                    className="conv-item"
                    onClick={() => {
                      onSelect(c.title);
                      closeDropdown();
                    }}
                  >
                    <div className="conv-item-header">
                      {c.active && <span className="conv-item-dot active" />}
                      <span className="conv-item-title">{displayTitle}</span>
                      {c.mtime && (
                        <span className="conv-item-time">{formatRelativeTime(c.mtime)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {!showAll && hiddenCount > 0 && (
                <button
                  className="conv-show-more"
                  onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
                >
                  Show {hiddenCount} more…
                </button>
              )}
            </div>
          )}

          {conversations.length === 0 && (
            <div className="conv-dropdown-empty">No conversations found</div>
          )}
        </div>
      </div>
    </div>
  );
}
