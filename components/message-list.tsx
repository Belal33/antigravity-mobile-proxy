'use client';

import type { ChatMessage, SSEStep } from '@/lib/types';
import UserMessage from './user-message';
import AgentMessage from './agent-message';

interface MessageListProps {
  messages: ChatMessage[];
  currentSteps: SSEStep[];
  currentResponse: string;
  isStreaming: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRetry?: () => void;
}

export default function MessageList({ messages, currentSteps, currentResponse, isStreaming, onApprove, onReject, onRetry }: MessageListProps) {
  return (
    <>
      {messages.map((msg, i) => (
        msg.role === 'user' ? (
          <UserMessage key={`msg-${i}`} content={msg.content} />
        ) : (
          <AgentMessage key={`msg-${i}`} content={msg.content} steps={msg.steps || []} isStreaming={false} onApprove={onApprove} onReject={onReject} onRetry={onRetry} />
        )
      ))}

      {/* Active streaming message */}
      {isStreaming && (
        <AgentMessage
          content={currentResponse}
          steps={currentSteps}
          isStreaming={true}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
        />
      )}
    </>
  );
}
