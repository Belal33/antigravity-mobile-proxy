'use client';

import type { ChatMessage, SSEStep } from '@/lib/types';
import UserMessage from './user-message';
import AgentMessage from './agent-message';

interface MessageListProps {
  messages: ChatMessage[];
  currentSteps: SSEStep[];
  currentResponse: string;
  isStreaming: boolean;
  onRetry?: () => void;
}

export default function MessageList({ messages, currentSteps, currentResponse, isStreaming, onRetry }: MessageListProps) {
  return (
    <>
      {messages.map((msg, i) => (
        msg.role === 'user' ? (
          <UserMessage key={`msg-${i}`} content={msg.content} />
        ) : (
          <AgentMessage key={`msg-${i}`} content={msg.content} steps={msg.steps || []} isStreaming={false} onRetry={onRetry} />
        )
      ))}

      {/* Active streaming message */}
      {isStreaming && (
        <AgentMessage
          content={currentResponse}
          steps={currentSteps}
          isStreaming={true}
          onRetry={onRetry}
        />
      )}
    </>
  );
}
