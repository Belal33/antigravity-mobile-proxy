'use client';

import type { SSEStep } from '@/lib/types';
import ToolCallCard from './tool-call-card';
import ThinkingBlock from './thinking-block';
import TypingIndicator from './typing-indicator';

interface AgentMessageProps {
  content: string;
  steps: SSEStep[];
  isStreaming: boolean;
  onRetry?: () => void;
}

/** Minimalist Antigravity logo — rendered inline, no SVG ID conflicts */
function AgentAvatarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#ag-av)" strokeWidth="1.5">
      <defs>
        <linearGradient id="ag-av" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export default function AgentMessage({ content, steps, isStreaming, onRetry }: AgentMessageProps) {
  return (
    <div className={`agent-message ${isStreaming ? 'streaming' : ''}`}>
      {/* Agent avatar */}
      <div className="agent-avatar" aria-hidden="true">
        <AgentAvatarIcon />
      </div>

      {/* Message body */}
      <div className="agent-message-body">
        <div className="agent-steps">
          {steps.map((step, i) => {
            switch (step.type) {
              case 'thinking':
                return <ThinkingBlock key={`step-${i}`} time={step.data.time} />;
              case 'tool_call':
                return <ToolCallCard key={`step-${i}`} data={step.data} />;
              case 'hitl':
                return null;
              case 'file_change':
                return (
                  <div key={`step-${i}`} className="file-change-indicator">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="file-change-name">{step.data.fileName}</span>
                  </div>
                );
              case 'error':
                return (
                  <div key={`step-${i}`} className="error-banner">
                    <div style={{ marginBottom: !isStreaming && onRetry ? '8px' : '0' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {String(step.data.message)}
                    </div>
                    {!isStreaming && onRetry && (
                      <button
                        style={{
                          padding: '6px 14px',
                          background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.35)',
                          borderRadius: 8,
                          color: '#fca5a5',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onClick={onRetry}
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                );
              case 'notification':
                return null;
              default:
                return null;
            }
          })}
          {isStreaming && <TypingIndicator />}
        </div>

        {content && (
          <div className="agent-response" dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </div>
    </div>
  );
}
