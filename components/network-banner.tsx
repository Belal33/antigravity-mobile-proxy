'use client';

import { useEffect, useState } from 'react';

interface NetworkBannerProps {
  networkOnline: boolean;
  isConnected: boolean;
}

/**
 * A subtle animated banner that slides down from the top when the network
 * is offline or while the server is reconnecting, and slides away once
 * everything is back.
 */
export default function NetworkBanner({ networkOnline, isConnected }: NetworkBannerProps) {
  const [visible, setVisible] = useState(false);
  const [justRecovered, setJustRecovered] = useState(false);

  const isDown = !networkOnline || !isConnected;

  useEffect(() => {
    if (isDown) {
      setVisible(true);
      setJustRecovered(false);
    } else if (visible) {
      // Show a brief "restored" state before hiding
      setJustRecovered(true);
      const t = setTimeout(() => {
        setVisible(false);
        setJustRecovered(false);
      }, 2500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDown]);

  if (!visible) return null;

  const label = justRecovered
    ? '✅ Connection restored'
    : !networkOnline
      ? '📡 No network — waiting for connection…'
      : '🔄 Reconnecting to server…';

  return (
    <div
      className={`network-banner ${justRecovered ? 'recovered' : 'offline'}`}
      role="status"
      aria-live="polite"
    >
      <span className="network-banner-pulse" />
      {label}
    </div>
  );
}
