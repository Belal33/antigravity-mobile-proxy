'use client';

import { useState } from 'react';
import type { ConversationInfo, ArtifactFile } from '@/lib/types';

interface ArtifactPanelProps {
  open: boolean;
  onClose: () => void;
  activeConversation: ConversationInfo | null;
  files: ArtifactFile[];
}

export default function ArtifactPanel({ open, onClose, activeConversation, files }: ArtifactPanelProps) {
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(false);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatTime = (mtime: string) => {
    const d = new Date(mtime);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString();
  };

  const openFile = async (fileName: string) => {
    if (!activeConversation) return;
    setLoading(true);
    setViewingFile(fileName);
    try {
      const res = await fetch(`/api/v1/artifacts/active/${encodeURIComponent(fileName)}`);
      const text = await res.text();
      setFileContent(text);
    } catch (e: any) {
      setFileContent(`Error loading file: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fileIcon = (name: string) => {
    if (name.endsWith('.md')) return '📄';
    if (name.endsWith('.json')) return '📋';
    if (name.endsWith('.ts') || name.endsWith('.tsx')) return '📘';
    if (name.endsWith('.css')) return '🎨';
    return '📁';
  };

  return (
    <div className={`artifact-panel ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="artifact-panel-header">
        <button className="icon-btn" onClick={onClose} title="Close panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h3>Artifacts</h3>
      </div>

      {/* Active conversation banner */}
      {activeConversation ? (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(99,102,241,0.04)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeConversation.title || 'Untitled'}
          </div>
          <div style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
            {files.length} file{files.length !== 1 ? 's' : ''}
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No active conversation
        </div>
      )}

      {/* File viewer or file list */}
      {viewingFile ? (
        <div className="artifact-viewer">
          <div className="artifact-viewer-header">
            <button className="artifact-back-btn" onClick={() => { setViewingFile(null); setFileContent(''); }}>
              ← Back
            </button>
            <span className="artifact-viewer-title">{viewingFile}</span>
          </div>
          <div className="artifact-viewer-body">
            {loading ? (
              <div style={{ color: 'var(--text-muted)', padding: '16px' }}>Loading...</div>
            ) : viewingFile.endsWith('.md') ? (
              <div className="agent-response" dangerouslySetInnerHTML={{
                __html: fileContent
                  .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                  .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                  .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/`([^`]+)`/g, '<code>$1</code>')
                  .replace(/^- (.*$)/gim, '<li>$1</li>')
                  .replace(/\n\n/g, '</p><p>')
                  .replace(/\n/g, '<br/>')
              }} />
            ) : (
              <pre style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {fileContent}
              </pre>
            )}
          </div>
        </div>
      ) : (
        <div className="artifact-file-list">
          {files.map(f => (
            <button key={f.name} className="artifact-file-item" onClick={() => openFile(f.name)}>
              <span className="artifact-file-icon">{fileIcon(f.name)}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div className="artifact-file-name">{f.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatTime(f.mtime)}</div>
              </div>
              <span className="artifact-file-size">{formatSize(f.size)}</span>
            </button>
          ))}
          {files.length === 0 && activeConversation && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No artifacts in this conversation
            </div>
          )}
        </div>
      )}
    </div>
  );
}
