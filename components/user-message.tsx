'use client';

interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="user-message">
      <div className="message-content">{content}</div>
    </div>
  );
}
