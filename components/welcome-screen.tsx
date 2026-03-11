'use client';

interface WelcomeScreenProps {
  onQuickPrompt: (text: string) => void;
}

export default function WelcomeScreen({ onQuickPrompt }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" strokeWidth="1.5">
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#6366f1' }} />
              <stop offset="100%" style={{ stopColor: '#a855f7' }} />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </div>
      <h2>Antigravity Agent</h2>
      <p>Ask anything. The agent has access to your IDE — files, terminal, search, and more.</p>
      <div className="quick-prompts">
        <button className="quick-prompt" onClick={() => onQuickPrompt('What files are in the current workspace?')}>
          📁 List workspace files
        </button>
        <button className="quick-prompt" onClick={() => onQuickPrompt('Explain the architecture of this project')}>
          🏗️ Explain architecture
        </button>
        <button className="quick-prompt" onClick={() => onQuickPrompt('Help me debug the most recent error')}>
          🐛 Debug last error
        </button>
      </div>
    </div>
  );
}
