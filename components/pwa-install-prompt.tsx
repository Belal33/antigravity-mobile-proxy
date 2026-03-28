'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return; // Already installed, don't show

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return; // Don't show for 7 days after dismiss
    }

    // Detect iOS (Safari doesn't fire beforeinstallprompt)
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
    setIsIOS(isiOS && isSafari);

    if (isiOS && isSafari) {
      // Show iOS instructions after a short delay
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Chrome: Listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault(); // Prevent the mini-infobar from appearing on mobile
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also listen for successful install
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowBanner(false);
      }
    } catch (err) {
      console.error('PWA install error:', err);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, []);

  if (!showBanner || isStandalone) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: '12px 16px',
      background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.98), rgba(30, 25, 50, 0.98))',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(139, 92, 246, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      animation: 'slideUp 0.3s ease-out',
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* App Icon */}
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}>
        <img
          src="/icons/icon-192.png"
          alt="Antigravity"
          width={44}
          height={44}
          style={{ display: 'block' }}
        />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#f0f0f5',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          Install Antigravity
        </div>
        <div style={{
          color: '#9ca3af',
          fontSize: '12px',
          fontFamily: 'Inter, system-ui, sans-serif',
          marginTop: 2,
        }}>
          {isIOS
            ? 'Tap the Share button, then "Add to Home Screen"'
            : 'Add to home screen for quick access'
          }
        </div>
      </div>

      {/* Action Buttons */}
      {!isIOS && (
        <button
          onClick={handleInstall}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Install
        </button>
      )}

      {/* Close Button */}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#6b7280',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '4px',
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss install prompt"
      >
        ✕
      </button>
    </div>
  );
}
