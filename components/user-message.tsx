'use client';

interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="user-message">
      <div className="message-content">{content}</div>
      {/* User avatar — initials placeholder */}
      <div className="user-avatar" aria-hidden="true">U</div>
    </div>
  );
}
