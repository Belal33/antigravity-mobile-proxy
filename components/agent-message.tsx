'use client';

import type { SSEStep } from '@/lib/types';
import ToolCallCard from './tool-call-card';
import ThinkingBlock from './thinking-block';
import HITLDialog from './hitl-dialog';
import TypingIndicator from './typing-indicator';

interface AgentMessageProps {
  content: string;
  steps: SSEStep[];
  isStreaming: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRetry?: () => void;
}

export default function AgentMessage({ content, steps, isStreaming, onApprove, onReject, onRetry }: AgentMessageProps) {
  return (
    <div className={`agent-message ${isStreaming ? 'streaming' : ''}`}>
      <div className="agent-steps">
        {steps.map((step, i) => {
          switch (step.type) {
            case 'thinking':
              return <ThinkingBlock key={`step-${i}`} time={step.data.time} />;
            case 'tool_call':
              return <ToolCallCard key={`step-${i}`} data={step.data} />;
            case 'hitl':
              return <HITLDialog key={`step-${i}`} onApprove={onApprove} onReject={onReject} />;
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
                  <div style={{ marginBottom: !isStreaming && onRetry ? '8px' : '0' }}>⚠️ {String(step.data.message)}</div>
                  {!isStreaming && onRetry && (
                    <button className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors text-sm font-medium" onClick={onRetry}>Try Again</button>
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
  );
}
