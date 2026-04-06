'use client';

import { useState } from 'react';
import type { GitStatus, GitFile, GitCommit } from '@/lib/types';

interface GitPanelProps {
  open: boolean;
  onClose: () => void;
  gitStatus: GitStatus | null;
  onRefresh: () => void;
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

type ActiveTab = 'changes' | 'commits';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  modified:  { label: 'M', color: '#fbbf24' },
  added:     { label: 'A', color: '#34d399' },
  deleted:   { label: 'D', color: '#ef4444' },
  renamed:   { label: 'R', color: '#a78bfa' },
  copied:    { label: 'C', color: '#60a5fa' },
  untracked: { label: 'U', color: '#94a3b8' },
  unmerged:  { label: '!', color: '#f97316' },
};

function StatusBadge({ status }: { status: string }) {
  const { label, color } = STATUS_LABELS[status] || { label: '?', color: '#94a3b8' };
  return (
    <span className="git-file-status-badge" style={{ color, borderColor: `${color}44`, background: `${color}18` }}>
      {label}
    </span>
  );
}

export default function GitPanel({ open, onClose, gitStatus, onRefresh }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('changes');
  const [diffFile, setDiffFile] = useState<{ path: string; staged: boolean; untracked: boolean } | null>(null);
  const [diffContent, setDiffContent] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openDiff = async (file: GitFile, staged: boolean) => {
    setDiffLoading(true);
    setDiffFile({ path: file.path, staged, untracked: file.status === 'untracked' });
    setDiffContent([]);
    try {
      const params = new URLSearchParams({
        filepath: file.path,
        staged: String(staged),
        untracked: String(file.status === 'untracked'),
      });
      const res = await fetch(`/api/v1/git/diff?${params}`);
      const data = await res.json();
      if (data.diff) {
        setDiffContent(parseDiff(data.diff));
      } else {
        setDiffContent([{ type: 'meta', content: data.error || 'No diff available' }]);
      }
    } catch (e: any) {
      setDiffContent([{ type: 'meta', content: `Error: ${e.message}` }]);
    } finally {
      setDiffLoading(false);
    }
  };

  const closeDiff = () => {
    setDiffFile(null);
    setDiffContent([]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  };

  const fileIcon = (path: string) => {
    if (path.endsWith('.tsx') || path.endsWith('.jsx')) return '⚛️';
    if (path.endsWith('.ts') || path.endsWith('.js')) return '📘';
    if (path.endsWith('.css') || path.endsWith('.scss')) return '🎨';
    if (path.endsWith('.md')) return '📄';
    if (path.endsWith('.json')) return '📋';
    if (path.endsWith('.py')) return '🐍';
    if (path.endsWith('.go')) return '🔹';
    if (path.endsWith('.sh')) return '⚙️';
    return '📝';
  };

  const shortPath = (p: string) => {
    const parts = p.split('/');
    if (parts.length <= 2) return p;
    return `…/${parts.slice(-2).join('/')}`;
  };

  const totalChanged = gitStatus
    ? (gitStatus.staged?.length || 0) + (gitStatus.unstaged?.length || 0) + (gitStatus.untracked?.length || 0)
    : 0;

  return (
    <div className={`git-panel ${open ? 'open' : ''}`} role="complementary" aria-label="Git Panel">
      {/* Header */}
      <div className="git-panel-header">
        <div className="git-panel-title-row">
          <button className="icon-btn" onClick={onClose} title="Close git panel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="git-panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <span>Git</span>
          </div>
          <button
            className={`git-refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            title="Refresh git status"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>

        {gitStatus?.isGitRepo && (
          <div className="git-branch-bar">
            {/* Branch */}
            <div className="git-branch-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span>{gitStatus.branch}</span>
            </div>

            {/* Ahead/Behind */}
            {gitStatus.remoteBranch && (
              <div className="git-sync-badges">
                {gitStatus.ahead > 0 && (
                  <span className="git-sync-badge git-sync-badge--ahead">
                    ↑{gitStatus.ahead}
                  </span>
                )}
                {gitStatus.behind > 0 && (
                  <span className="git-sync-badge git-sync-badge--behind">
                    ↓{gitStatus.behind}
                  </span>
                )}
                {gitStatus.ahead === 0 && gitStatus.behind === 0 && (
                  <span className="git-sync-badge git-sync-badge--synced">✓ synced</span>
                )}
              </div>
            )}

            {gitStatus.stashCount > 0 && (
              <span className="git-stash-badge" title={`${gitStatus.stashCount} stash entries`}>
                📦 {gitStatus.stashCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Non-git repo */}
      {gitStatus && !gitStatus.isGitRepo && (
        <div className="git-not-repo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
            <line x1="6" y1="9" x2="6" y2="21" />
          </svg>
          <p>No git repository detected</p>
          <span>Open a git project in the IDE</span>
        </div>
      )}

      {/* Loading state */}
      {!gitStatus && (
        <div className="git-loading">
          <div className="git-loading-dot" />
          <span>Loading git status…</span>
        </div>
      )}

      {/* Diff viewer */}
      {diffFile && gitStatus?.isGitRepo && (
        <div className="diff-viewer">
          <div className="diff-viewer-header">
            <button className="diff-back-btn" onClick={closeDiff}>← Back</button>
            <span className="diff-viewer-title">{diffFile.path.split('/').pop()}</span>
            <span className="diff-viewer-path" title={diffFile.path}>{shortPath(diffFile.path)}</span>
            <span className={`diff-viewer-badge ${diffFile.staged ? 'staged' : 'unstaged'}`}>
              {diffFile.staged ? 'staged' : diffFile.untracked ? 'untracked' : 'unstaged'}
            </span>
          </div>
          <div className="diff-viewer-body">
            {diffLoading ? (
              <div className="diff-loading">Loading diff…</div>
            ) : diffContent.length === 0 ? (
              <div className="diff-empty">No diff available</div>
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
      )}

      {/* Main content (tabs) */}
      {gitStatus?.isGitRepo && !diffFile && (
        <>
          {/* Summary row */}
          <div className="git-summary-bar">
            <span className="git-summary-stat">
              <span className="git-summary-dot git-summary-dot--changed" />
              {totalChanged} changed
            </span>
            {gitStatus.staged.length > 0 && (
              <span className="git-summary-stat">
                <span className="git-summary-dot git-summary-dot--staged" />
                {gitStatus.staged.length} staged
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="git-tabs">
            <button
              className={`git-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              Changes
              {totalChanged > 0 && (
                <span className="git-tab-badge">{totalChanged}</span>
              )}
            </button>
            <button
              className={`git-tab ${activeTab === 'commits' ? 'active' : ''}`}
              onClick={() => setActiveTab('commits')}
            >
              Commits
              {gitStatus.commits.length > 0 && (
                <span className="git-tab-badge git-tab-badge--neutral">{gitStatus.commits.length}</span>
              )}
            </button>
          </div>

          {/* Changes tab */}
          {activeTab === 'changes' && (
            <div className="git-file-list">
              {/* Staged section */}
              {gitStatus.staged.length > 0 && (
                <div className="git-section">
                  <div className="git-section-header">
                    <span className="git-section-dot git-section-dot--staged" />
                    <span>Staged Changes</span>
                    <span className="git-section-count">{gitStatus.staged.length}</span>
                  </div>
                  {gitStatus.staged.map((f, i) => (
                    <button
                      key={`staged-${i}`}
                      className="git-file-item git-file-item--staged"
                      onClick={() => openDiff(f, true)}
                      title={`View staged diff: ${f.path}`}
                    >
                      <span className="git-file-icon">{fileIcon(f.path)}</span>
                      <div className="git-file-info">
                        <div className="git-file-name">{f.path.split('/').pop()}</div>
                        <div className="git-file-path">{shortPath(f.path)}</div>
                      </div>
                      <StatusBadge status={f.status} />
                    </button>
                  ))}
                </div>
              )}

              {/* Unstaged section */}
              {gitStatus.unstaged.length > 0 && (
                <div className="git-section">
                  <div className="git-section-header">
                    <span className="git-section-dot git-section-dot--unstaged" />
                    <span>Changes</span>
                    <span className="git-section-count">{gitStatus.unstaged.length}</span>
                  </div>
                  {gitStatus.unstaged.map((f, i) => (
                    <button
                      key={`unstaged-${i}`}
                      className="git-file-item"
                      onClick={() => openDiff(f, false)}
                      title={`View diff: ${f.path}`}
                    >
                      <span className="git-file-icon">{fileIcon(f.path)}</span>
                      <div className="git-file-info">
                        <div className="git-file-name">{f.path.split('/').pop()}</div>
                        <div className="git-file-path">{shortPath(f.path)}</div>
                      </div>
                      <StatusBadge status={f.status} />
                    </button>
                  ))}
                </div>
              )}

              {/* Untracked section */}
              {gitStatus.untracked.length > 0 && (
                <div className="git-section">
                  <div className="git-section-header">
                    <span className="git-section-dot git-section-dot--untracked" />
                    <span>Untracked</span>
                    <span className="git-section-count">{gitStatus.untracked.length}</span>
                  </div>
                  {gitStatus.untracked.map((f, i) => (
                    <button
                      key={`untracked-${i}`}
                      className="git-file-item git-file-item--untracked"
                      onClick={() => openDiff(f, false)}
                      title={`View file: ${f.path}`}
                    >
                      <span className="git-file-icon">{fileIcon(f.path)}</span>
                      <div className="git-file-info">
                        <div className="git-file-name">{f.path.split('/').pop()}</div>
                        <div className="git-file-path">{shortPath(f.path)}</div>
                      </div>
                      <StatusBadge status="untracked" />
                    </button>
                  ))}
                </div>
              )}

              {totalChanged === 0 && (
                <div className="git-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p>Working tree clean</p>
                  <span>No uncommitted changes</span>
                </div>
              )}
            </div>
          )}

          {/* Commits tab */}
          {activeTab === 'commits' && (
            <div className="git-commit-list">
              {gitStatus.commits.length === 0 ? (
                <div className="git-empty">
                  <p>No commits yet</p>
                </div>
              ) : (
                gitStatus.commits.map((c, i) => (
                  <div key={i} className="git-commit-item">
                    <div className="git-commit-hash">{c.shortHash}</div>
                    <div className="git-commit-info">
                      <div className="git-commit-subject">{c.subject}</div>
                      <div className="git-commit-meta">
                        <span className="git-commit-author">{c.author}</span>
                        <span className="git-commit-dot">·</span>
                        <span className="git-commit-date">{c.relativeDate}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
