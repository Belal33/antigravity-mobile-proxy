'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { WorkspaceNode, WorkspaceTree } from '@/lib/types';

interface WorkspacePanelProps {
  open: boolean;
  onClose: () => void;
  workspaceTree: WorkspaceTree | null;
  workspaceLoading: boolean;
  onRefresh: () => void;
}

// ── Extension → language label ──────────────────────────────────────────────
const EXT_ICONS: Record<string, string> = {
  ts: '📘', tsx: '⚛️', js: '📜', jsx: '⚛️',
  json: '📋', md: '📄', mdx: '📄',
  css: '🎨', scss: '🎨', sass: '🎨',
  py: '🐍', go: '🔹', rs: '🦀',
  sh: '⚙️', bash: '⚙️', zsh: '⚙️',
  sql: '🗄️', graphql: '🔷', gql: '🔷',
  yaml: '📐', yml: '📐', toml: '📐', env: '🔑',
  svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  lock: '🔒', gitignore: '👁️',
};

function fileIcon(node: WorkspaceNode): string {
  if (node.type === 'dir') return '📁';
  return EXT_ICONS[node.ext || ''] || '📝';
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

// ── File viewer state ────────────────────────────────────────────────────────
interface FileView {
  path: string;
  name: string;
  content: string | null;
  lang: string;
  lines: number;
  size: number;
  error: string | null;
  loading: boolean;
  binary?: boolean;
  tooLarge?: boolean;
}

// ── Tree Node component ──────────────────────────────────────────────────────
interface TreeNodeProps {
  node: WorkspaceNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileOpen: (node: WorkspaceNode) => void;
  selectedPath: string | null;
}

function TreeNode({
  node, depth, expandedPaths, onToggle, onFileOpen, selectedPath,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isDir = node.type === 'dir';
  const isSelected = selectedPath === node.path;
  const paddingLeft = 12 + depth * 14;

  const handleClick = useCallback(() => {
    if (isDir) onToggle(node.path);
    else onFileOpen(node);
  }, [isDir, node, onToggle, onFileOpen]);

  return (
    <>
      <button
        className={`workspace-tree-node ${isDir ? 'is-dir' : 'is-file'} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        title={isDir ? (isExpanded ? 'Collapse' : 'Expand') : node.path}
      >
        {isDir ? (
          <svg
            className={`workspace-arrow ${isExpanded ? 'open' : ''}`}
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        ) : (
          <span className="workspace-arrow-spacer" />
        )}
        <span className="workspace-node-icon">{fileIcon(node)}</span>
        <span className="workspace-node-name">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="workspace-node-size">{formatSize(node.size)}</span>
        )}
        {isDir && node.children !== undefined && (
          <span className="workspace-node-count">{node.children.length}</span>
        )}
      </button>

      {isDir && isExpanded && node.children && (
        <div className="workspace-tree-children">
          {node.children.length === 0 ? (
            <div className="workspace-empty-dir" style={{ paddingLeft: paddingLeft + 14 }}>
              empty
            </div>
          ) : (
            node.children.map(child => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onFileOpen={onFileOpen}
                selectedPath={selectedPath}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}

// ── Search filter ─────────────────────────────────────────────────────────────
function filterTree(nodes: WorkspaceNode[], query: string): WorkspaceNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();

  const filterNode = (n: WorkspaceNode): WorkspaceNode | null => {
    if (n.name.toLowerCase().includes(q)) return n;
    if (n.type === 'dir' && n.children) {
      const kids = n.children.map(filterNode).filter(Boolean) as WorkspaceNode[];
      if (kids.length > 0) return { ...n, children: kids };
    }
    return null;
  };

  return nodes.map(filterNode).filter(Boolean) as WorkspaceNode[];
}

function getAllDirPaths(nodes: WorkspaceNode[]): string[] {
  const paths: string[] = [];
  const walk = (n: WorkspaceNode) => {
    if (n.type === 'dir') { paths.push(n.path); n.children?.forEach(walk); }
  };
  nodes.forEach(walk);
  return paths;
}

// ── File Content Viewer ───────────────────────────────────────────────────────
interface FileViewerProps {
  view: FileView;
  onClose: () => void;
  onCopyPath: (path: string) => void;
  workspacePath: string;
}

function addLineNumbers(code: string): { num: number; text: string }[] {
  return code.split('\n').map((text, i) => ({ num: i + 1, text }));
}

function FileViewer({ view, onClose, onCopyPath, workspacePath }: FileViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyContent = () => {
    if (view.content) {
      navigator.clipboard.writeText(view.content).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyPath = () => {
    onCopyPath(view.path);
  };

  const lines = view.content ? addLineNumbers(view.content) : [];

  return (
    <div className="workspace-file-viewer">
      {/* Viewer header */}
      <div className="workspace-viewer-header">
        <button className="workspace-viewer-back" onClick={onClose} title="Back to file tree">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>
        <div className="workspace-viewer-title">
          <span className="workspace-viewer-name">{view.name}</span>
          {view.lang && view.lang !== 'plaintext' && (
            <span className="workspace-viewer-lang">{view.lang}</span>
          )}
        </div>
        <div className="workspace-viewer-actions">
          {view.content && (
            <button
              className="workspace-viewer-action-btn"
              onClick={handleCopyContent}
              title="Copy file content"
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
          <button
            className="workspace-viewer-action-btn"
            onClick={handleCopyPath}
            title="Copy file path"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
      </div>

      {/* Meta bar */}
      <div className="workspace-viewer-meta">
        <span className="workspace-viewer-path" title={`${workspacePath}/${view.path}`}>
          {view.path}
        </span>
        {!view.loading && !view.error && view.content && (
          <span className="workspace-viewer-stats">
            {view.lines} lines · {formatSize(view.size)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="workspace-viewer-body">
        {view.loading && (
          <div className="git-loading">
            <div className="git-loading-dot" />
            <span>Loading…</span>
          </div>
        )}

        {!view.loading && view.error && (
          <div className="workspace-viewer-error">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{view.error}</p>
            {view.binary && <span>Binary files cannot be displayed as text.</span>}
            {view.tooLarge && <span>Try opening the file directly in the IDE.</span>}
          </div>
        )}

        {!view.loading && !view.error && view.content !== null && (
          <div className="workspace-code-scroll">
            <table className="workspace-code-table">
              <tbody>
                {lines.map(({ num, text }) => (
                  <tr key={num} className="workspace-code-row">
                    <td className="workspace-line-num">{num}</td>
                    <td className="workspace-line-code">
                      <span>{text || '\u00A0'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function WorkspacePanel({
  open, onClose, workspaceTree, workspaceLoading, onRefresh,
}: WorkspacePanelProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [fileView, setFileView] = useState<FileView | null>(null);

  // Close file viewer when panel closes
  useEffect(() => {
    if (!open) setFileView(null);
  }, [open]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    const fullPath = workspaceTree
      ? `${workspaceTree.workspacePath}/${path}`
      : path;
    navigator.clipboard.writeText(fullPath).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }, [workspaceTree]);

  const handleFileOpen = useCallback(async (node: WorkspaceNode) => {
    // Show loading state immediately
    setFileView({
      path: node.path,
      name: node.name,
      content: null,
      lang: '',
      lines: 0,
      size: node.size || 0,
      error: null,
      loading: true,
    });

    try {
      const res = await fetch(`/api/v1/workspace/content?path=${encodeURIComponent(node.path)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        setFileView(prev => prev ? {
          ...prev,
          loading: false,
          error: data.error || 'Failed to load file',
          binary: data.binary,
          tooLarge: data.tooLarge,
        } : null);
      } else {
        setFileView({
          path: node.path,
          name: data.name,
          content: data.content,
          lang: data.lang,
          lines: data.lines,
          size: data.size,
          error: null,
          loading: false,
        });
      }
    } catch (e: any) {
      setFileView(prev => prev ? {
        ...prev,
        loading: false,
        error: `Network error: ${e.message}`,
      } : null);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    await new Promise(r => setTimeout(r, 700));
    setRefreshing(false);
  };

  const filteredTree = useMemo(() => {
    if (!workspaceTree) return [];
    return filterTree(workspaceTree.tree, searchQuery);
  }, [workspaceTree, searchQuery]);

  const rootLabel = workspaceTree?.rootLabel
    || workspaceTree?.workspacePath?.split('/').pop()
    || 'Workspace';

  const workspacePath = workspaceTree?.workspacePath || '';

  // Stable ref to selected path — extracted before conditional render so TS doesn't narrow to never
  const selectedFilePath: string | null = fileView ? fileView.path : null;

  return (
    <div className={`workspace-panel ${open ? 'open' : ''}`} role="complementary" aria-label="Workspace Panel">

      {/* ── File Viewer (overlaid) ── */}
      {fileView && (
        <FileViewer
          view={fileView}
          onClose={() => setFileView(null)}
          onCopyPath={handleCopyPath}
          workspacePath={workspacePath}
        />
      )}

      {/* ── Tree View ── */}
      {!fileView && (
        <>
          {/* Header */}
          <div className="workspace-panel-header">
            <div className="workspace-panel-title-row">
              <button className="icon-btn" onClick={onClose} title="Close workspace panel">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="workspace-panel-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Working Directory</span>
              </div>
              <button
                className={`git-refresh-btn ${refreshing ? 'spinning' : ''}`}
                onClick={handleRefresh}
                title="Refresh file tree"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>

            {workspacePath && (
              <div className="workspace-path-bar" title={workspacePath}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M2 12h4M18 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
                <span className="workspace-path-text">{workspacePath}</span>
              </div>
            )}
          </div>

          {/* Search bar */}
          {workspaceTree && (
            <div className="workspace-search-bar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="workspace-search-input"
                type="text"
                placeholder={`Filter in ${rootLabel}…`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="workspace-search-clear" onClick={() => setSearchQuery('')} title="Clear filter">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {workspaceLoading && !workspaceTree && (
            <div className="git-loading">
              <div className="git-loading-dot" />
              <span>Loading workspace…</span>
            </div>
          )}

          {/* No workspace */}
          {!workspaceLoading && !workspaceTree && (
            <div className="git-not-repo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p>No workspace detected</p>
              <span>Open a project in the IDE</span>
            </div>
          )}

          {/* Copy path toast */}
          {copiedPath && (
            <div className="workspace-copy-toast">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Path copied!
            </div>
          )}

          {/* File tree */}
          {workspaceTree && (
            <div className="workspace-tree">
              <div className="workspace-root-label">
                <span className="workspace-root-icon">🗂️</span>
                <span className="workspace-root-name">{rootLabel}</span>
                <span className="workspace-node-count">{workspaceTree.tree.length}</span>
              </div>

              {filteredTree.length === 0 ? (
                <div className="git-empty">
                  <p>{searchQuery ? 'No matches' : 'Directory is empty'}</p>
                </div>
              ) : (
                <div className="workspace-tree-list">
                  {filteredTree.map(node => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      expandedPaths={searchQuery ? new Set(getAllDirPaths(filteredTree)) : expandedPaths}
                      onToggle={handleToggle}
                      onFileOpen={handleFileOpen}
                      selectedPath={selectedFilePath}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
