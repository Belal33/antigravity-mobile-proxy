'use client';

import { useState } from 'react';
import type { ChangeFile } from '@/lib/types';

interface ChangesPanelProps {
  open: boolean;
  onClose: () => void;
  changes: ChangeFile[];
  onAcceptAll: () => Promise<any>;
  onRejectAll: () => Promise<any>;
  isAccepting: boolean;
  isRejecting: boolean;
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'header' | 'meta';
  content: string;
  lineNum?: number;
}

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let addLineNum = 0;
  let delLineNum = 0;

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      lines.push({ type: 'meta', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'meta', content: line });
    } else if (line.startsWith('@@')) {
      // Parse hunk header for line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        delLineNum = parseInt(match[1]);
        addLineNum = parseInt(match[2]);
      }
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      lines.push({ type: 'add', content: line.substring(1), lineNum: addLineNum++ });
    } else if (line.startsWith('-')) {
      lines.push({ type: 'del', content: line.substring(1), lineNum: delLineNum++ });
    } else if (line.startsWith(' ')) {
      lines.push({ type: 'context', content: line.substring(1), lineNum: addLineNum });
      addLineNum++;
      delLineNum++;
    }
  }

  return lines;
}

export default function ChangesPanel({
  open, onClose, changes,
  onAcceptAll, onRejectAll, isAccepting, isRejecting,
}: ChangesPanelProps) {
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<DiffLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingFilename, setViewingFilename] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const openDiff = async (change: ChangeFile) => {
    setLoading(true);
    setViewingFile(change.filepath);
    setViewingFilename(change.filename);
    setDiffContent([]);
    try {
      const res = await fetch(`/api/v1/changes/diff?filepath=${encodeURIComponent(change.filepath)}`);
      const data = await res.json();
      if (data.diff) {
        setDiffContent(parseDiff(data.diff));
      } else {
        setDiffContent([{ type: 'meta', content: data.message || 'No diff available' }]);
      }
    } catch (e: any) {
      setDiffContent([{ type: 'meta', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const closeDiffViewer = () => {
    setViewingFile(null);
    setDiffContent([]);
    setViewingFilename('');
  };

  const handleAcceptAll = async () => {
    setActionMessage(null);
    const result = await onAcceptAll();
    if (result?.success) {
      setActionMessage({ type: 'success', text: 'All changes accepted ✓' });
    } else {
      setActionMessage({ type: 'error', text: result?.error || 'Failed to accept changes' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleRejectAll = async () => {
    setActionMessage(null);
    const result = await onRejectAll();
    if (result?.success) {
      setActionMessage({ type: 'success', text: 'All changes rejected ✓' });
    } else {
      setActionMessage({ type: 'error', text: result?.error || 'Failed to reject changes' });
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const isActionPending = isAccepting || isRejecting;

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

      {viewingFile ? (
        /* Diff viewer */
        <div className="diff-viewer">
          <div className="diff-viewer-header">
            <button className="diff-back-btn" onClick={closeDiffViewer}>← Back</button>
            <span className="diff-viewer-title">{viewingFilename}</span>
            <span className="diff-viewer-path">{viewingFile}</span>
          </div>
          <div className="diff-viewer-body">
            {loading ? (
              <div style={{ color: 'var(--text-muted)', padding: '16px', fontStyle: 'italic' }}>Loading diff...</div>
            ) : diffContent.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '16px' }}>No changes found</div>
            ) : (
              <div className="diff-lines">
                {diffContent.map((line, i) => (
                  <div key={i} className={`diff-line diff-line-${line.type}`}>
                    <span className="diff-line-num">
                      {line.lineNum !== undefined ? line.lineNum : ''}
                    </span>
                    <span className="diff-line-indicator">
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'header' ? '@@' : ''}
                    </span>
                    <span className="diff-line-content">{line.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* File list */
        <>
          {/* Summary bar */}
          <div className="changes-summary">
            <span className="changes-count">{changes.length} file{changes.length !== 1 ? 's' : ''} changed</span>
            <div className="changes-stats">
              {totalAdditions > 0 && <span className="changes-additions">+{totalAdditions}</span>}
              {totalDeletions > 0 && <span className="changes-deletions">-{totalDeletions}</span>}
            </div>
          </div>

          {/* Accept/Reject All action bar */}
          {changes.length > 0 && (
            <div className="changes-action-bar">
              <button
                className="changes-reject-all-btn"
                onClick={handleRejectAll}
                disabled={isActionPending}
                title="Reject all file changes"
              >
                {isRejecting ? (
                  <>
                    <svg className="changes-action-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Rejecting…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Reject All
                  </>
                )}
              </button>
              <button
                className="changes-accept-all-btn"
                onClick={handleAcceptAll}
                disabled={isActionPending}
                title="Accept all file changes"
              >
                {isAccepting ? (
                  <>
                    <svg className="changes-action-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Accepting…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Accept All
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action feedback message */}
          {actionMessage && (
            <div className={`changes-action-message changes-action-message--${actionMessage.type}`}>
              {actionMessage.text}
            </div>
          )}

          <div className="changes-file-list">
            {changes.map(c => (
              <button
                key={c.filepath}
                className="changes-file-item"
                onClick={() => openDiff(c)}
                title={`View diff: ${c.filepath}`}
              >
                <span className="changes-file-icon">{fileIcon(c.filename)}</span>
                <div className="changes-file-info">
                  <div className="changes-file-name">{c.filename}</div>
                  <div className="changes-file-path">{c.filepath}</div>
                </div>
                <div className="changes-file-diff">
                  {c.additions > 0 && <span className="changes-additions">+{c.additions}</span>}
                  {c.deletions > 0 && <span className="changes-deletions">-{c.deletions}</span>}
                </div>
              </button>
            ))}
            {changes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No file changes in this conversation
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
