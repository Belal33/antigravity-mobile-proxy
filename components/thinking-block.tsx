'use client';

interface ThinkingBlockProps {
  time: string;
}

export default function ThinkingBlock({ time }: ThinkingBlockProps) {
  return (
    <div className="thinking-block">
      <span className="thinking-icon">💭</span>
      <span>{time}</span>
    </div>
  );
}
