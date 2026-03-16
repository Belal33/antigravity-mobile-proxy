'use client';

import type { ChangeFile } from '@/lib/types';

interface ChangesPanelProps {
  open: boolean;
  onClose: () => void;
  changes: ChangeFile[];
}

export default function ChangesPanel({ open, onClose, changes }: ChangesPanelProps) {
  const totalAdditions = changes.reduce((s, c) => s + c.additions, 0);
  const totalDeletions = changes.reduce((s, c) => s + c.deletions, 0);

  const fileIcon = (name: string) => {
    if (name.endsWith('.tsx') || name.endsWith('.jsx')) return '⚛️';
    if (name.endsWith('.ts') || name.endsWith('.js')) return '📘';
    if (name.endsWith('.css')) return '🎨';
    if (name.endsWith('.md')) return '📄';
    if (name.endsWith('.json')) return '📋';
    return '📝';
  };

  return (
    <div className={`changes-panel ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="changes-panel-header">
        <button className="icon-btn" onClick={onClose} title="Close panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h3>Changes Overview</h3>
      </div>

      {/* Summary bar */}
      <div className="changes-summary">
        <span className="changes-count">{changes.length} file{changes.length !== 1 ? 's' : ''} changed</span>
        <div className="changes-stats">
          {totalAdditions > 0 && <span className="changes-additions">+{totalAdditions}</span>}
          {totalDeletions > 0 && <span className="changes-deletions">-{totalDeletions}</span>}
        </div>
      </div>

      {/* File list */}
      <div className="changes-file-list">
        {changes.map(c => (
          <div key={c.filepath} className="changes-file-item">
            <span className="changes-file-icon">{fileIcon(c.filename)}</span>
            <div className="changes-file-info">
              <div className="changes-file-name">{c.filename}</div>
              <div className="changes-file-path">{c.filepath}</div>
            </div>
            <div className="changes-file-diff">
              {c.additions > 0 && <span className="changes-additions">+{c.additions}</span>}
              {c.deletions > 0 && <span className="changes-deletions">-{c.deletions}</span>}
            </div>
          </div>
        ))}
        {changes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No file changes in this conversation
          </div>
        )}
      </div>
    </div>
  );
}
