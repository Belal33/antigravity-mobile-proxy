'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  currentMode: 'planning' | 'fast';
  onToggleMode: () => void;
}

export default function ChatInput({ onSend, isStreaming, currentMode, onToggleMode }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSend(value);
        setValue('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  };

  const handleSend = () => {
    if (!isStreaming && value.trim()) {
      onSend(value);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <footer className="input-area">
      <div className="input-wrapper">
        <button
          className={`mode-toggle ${currentMode}`}
          onClick={onToggleMode}
          title={`Mode: ${currentMode === 'planning' ? 'Planning' : 'Fast'} — Click to switch`}
          aria-label={`Switch mode (currently ${currentMode})`}
          type="button"
        >
          <span className="mode-icon">{currentMode === 'planning' ? '📋' : '⚡'}</span>
          <span className="mode-label">{currentMode === 'planning' ? 'Plan' : 'Fast'}</span>
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask the Antigravity agent..."
          rows={1}
          aria-label="Chat message input"
          enterKeyHint="send"
          autoComplete="off"
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isStreaming || !value.trim()}
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div className="input-hint">
        <span>Enter to send · Shift+Enter for new line · Ctrl+N for new chat</span>
        <span id="model-info"></span>
      </div>
    </footer>
  );
}
