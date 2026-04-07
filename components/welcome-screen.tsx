'use client';

interface WelcomeScreenProps {
  onQuickPrompt: (text: string) => void;
}

const QUICK_PROMPTS = [
  {
    label: 'List workspace files',
    prompt: 'What files are in the current workspace?',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: 'Explain architecture',
    prompt: 'Explain the architecture of this project',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: 'Debug last error',
    prompt: 'Help me debug the most recent error',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    label: 'Review recent changes',
    prompt: 'Review and summarize the most recent code changes',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
];

export default function WelcomeScreen({ onQuickPrompt }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      {/* Logo */}
      <div className="welcome-logo-wrapper">
        <div className="welcome-logo-glow" />
        <div className="welcome-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#wg)" strokeWidth="1.5">
            <defs>
              <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </div>
      </div>

      <h2>Antigravity Agent</h2>
      <p>Ask anything — files, terminal, search, and more, all from your browser.</p>

      <div className="quick-prompts">
        {QUICK_PROMPTS.map((item) => (
          <button
            key={item.prompt}
            className="quick-prompt"
            onClick={() => onQuickPrompt(item.prompt)}
          >
            <div className="quick-prompt-icon">{item.icon}</div>
            <span className="quick-prompt-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
