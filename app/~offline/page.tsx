'use client';

export default function OfflinePage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0a0a1a 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div>
        {/* Animated orbital icon */}
        <div
          style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            margin: '0 auto 2rem',
          }}
        >
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="offRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
            </defs>
            <ellipse
              cx="60"
              cy="60"
              rx="42"
              ry="16"
              fill="none"
              stroke="url(#offRing)"
              strokeWidth="2.5"
              opacity="0.4"
              transform="rotate(-25, 60, 60)"
            />
            <ellipse
              cx="60"
              cy="60"
              rx="36"
              ry="13"
              fill="none"
              stroke="url(#offRing)"
              strokeWidth="2"
              opacity="0.3"
              transform="rotate(35, 60, 60)"
            />
            <circle cx="60" cy="60" r="8" fill="#6366f1" opacity="0.5" />
            <circle cx="60" cy="60" r="5" fill="#818cf8" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            marginBottom: '0.75rem',
            background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          You&apos;re offline
        </h1>

        <p
          style={{
            color: '#6b7280',
            marginBottom: '2rem',
            fontSize: '1rem',
            lineHeight: 1.6,
            maxWidth: '320px',
          }}
        >
          Antigravity needs a network connection to chat with the AI agent.
          Please check your connection and try again.
        </p>

        <button
          onClick={() => location.reload()}
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
            color: '#fff',
            border: 'none',
            padding: '0.875rem 2rem',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseDown={(e) => {
            (e.target as HTMLButtonElement).style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            (e.target as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          ↻ Retry Connection
        </button>
      </div>
    </div>
  );
}
