'use client';

import { useState, useRef, useEffect } from 'react';

interface AgentOption {
  name: string;
  active: boolean;
  description?: string;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  currentMode: 'planning' | 'fast';
  onToggleMode: () => void;
  currentAgent: string | null;
  agents: AgentOption[];
  isLoadingAgents: boolean;
  onFetchAgents: () => void;
  onSwitchAgent: (agentName: string) => void;
  onToggleArtifacts: () => void;
  artifactCount: number;
  artifactPanelOpen: boolean;
  onToggleChanges: () => void;
  changesCount: number;
  changesPanelOpen: boolean;
}

export default function ChatInput({
  onSend, onStop, isStreaming, currentMode, onToggleMode,
  currentAgent, agents, isLoadingAgents, onFetchAgents, onSwitchAgent,
  onToggleArtifacts, artifactCount, artifactPanelOpen,
  onToggleChanges, changesCount, changesPanelOpen,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (value.trim()) {
        // Works in both idle and streaming states — sendMessage handles interruption
        onSend(value);
        setValue('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      } else if (isStreaming) {
        // Enter with empty box while streaming → stop
        onStop();
      }
    }
  };

  const handleSend = () => {
    if (value.trim()) {
      // Has text: send (interrupts any current stream via sendMessage)
      onSend(value);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } else if (isStreaming) {
      // No text + streaming: stop
      onStop();
    }
  };

  const handleAgentClick = () => {
    if (!agentDropdownOpen) {
      onFetchAgents();
    }
    setAgentDropdownOpen(!agentDropdownOpen);
  };

  const handleAgentSelect = (agentName: string) => {
    onSwitchAgent(agentName);
    setAgentDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  /** Short label for the agent button */
  const agentLabel = currentAgent
    ? currentAgent.replace(/^(Claude\s+|Google\s+|OpenAI\s+)/i, '').substring(0, 20)
    : 'Agent';

  return (
    <footer className="input-area">
      {/* Toolbar row — agent selector + mode toggle */}
      <div className="input-toolbar">
        <div ref={dropdownRef} className="agent-selector-wrapper">
          <button
            className="agent-selector-btn"
            onClick={handleAgentClick}
            title={currentAgent ? `Agent: ${currentAgent} — Click to switch` : 'Select AI agent'}
            aria-label={`Switch agent (currently ${currentAgent || 'unknown'})`}
            type="button"
          >
            <span className="agent-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M4 21v-2a4 4 0 0 1 3-3.87" />
                <circle cx="12" cy="17" r="1" />
                <path d="M9 17h6" />
              </svg>
            </span>
            <span className="agent-label">{agentLabel}</span>
            <svg className={`agent-chevron ${agentDropdownOpen ? 'open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Agent Dropdown */}
          <div className={`agent-dropdown ${agentDropdownOpen ? 'open' : ''}`}>
            <div className="agent-dropdown-header">Select Agent</div>
            {isLoadingAgents ? (
              <div className="agent-dropdown-loading">
                <span className="wm-spinner" />
                <span>Loading agents...</span>
              </div>
            ) : agents.length === 0 ? (
              <div className="agent-dropdown-empty">
                No agents detected. Make sure the IDE has a workbench open.
              </div>
            ) : (
              <div className="agent-dropdown-list">
                {agents.map((agent, idx) => (
                  <button
                    key={idx}
                    className={`agent-option ${agent.active ? 'active' : ''} ${currentAgent === agent.name ? 'current' : ''}`}
                    onClick={() => handleAgentSelect(agent.name)}
                    type="button"
                  >
                    <span className="agent-option-name">{agent.name}</span>
                    {agent.description && (
                      <span className="agent-option-desc">{agent.description}</span>
                    )}
                    {(agent.active || currentAgent === agent.name) && (
                      <svg className="agent-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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

        {/* Artifacts Toggle */}
        <button
          className={`artifact-toggle-btn ${artifactPanelOpen ? 'active' : ''}`}
          onClick={onToggleArtifacts}
          title={`Artifacts${artifactCount > 0 ? ` (${artifactCount})` : ''}`}
          aria-label="Toggle artifacts panel"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {artifactCount > 0 && (
            <span className="artifact-badge">{artifactCount}</span>
          )}
        </button>

        {/* Changes Overview Toggle */}
        <button
          className={`changes-toggle-btn ${changesPanelOpen ? 'active' : ''}`}
          onClick={onToggleChanges}
          title={`Changes${changesCount > 0 ? ` (${changesCount})` : ''}`}
          aria-label="Toggle changes panel"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {changesCount > 0 && (
            <span className="changes-badge">{changesCount}</span>
          )}
        </button>

        <span className="toolbar-agent-name" id="model-info">{currentAgent || ''}</span>
      </div>

      {/* Text input row — textarea + send */}
      <div className="input-wrapper">
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
          className={`send-btn${
            isStreaming && value.trim()
              ? ' send-btn--interrupt'
              : isStreaming
              ? ' send-btn--stop'
              : ''
          }`}
          onClick={handleSend}
          disabled={!isStreaming && !value.trim()}
          aria-label={
            isStreaming && value.trim()
              ? 'Interrupt and send new message'
              : isStreaming
              ? 'Stop generation'
              : 'Send message'
          }
          title={
            isStreaming && value.trim()
              ? 'Interrupt agent and send new message'
              : isStreaming
              ? 'Stop generation (Esc)'
              : 'Send message'
          }
        >
          {isStreaming && !value.trim() ? (
            /* Stop icon — filled square (no text, just stop) */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
          ) : (
            /* Send icon — works in idle AND during streaming (interrupt + send) */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <div className="input-hint">
        <span>Enter to send · Shift+Enter for new line · Ctrl+N for new chat · Esc to stop</span>
      </div>
    </footer>
  );
}
