import { useState, useCallback, useEffect, useRef } from 'react';
import type { ArtifactFile } from '@/lib/types';

const API_BASE = '/api/v1';

/**
 * Background polling interval (ms).
 * We poll ALWAYS—even when the panel is closed—so the badge count stays fresh.
 * When the panel is open we use a faster cadence.
 */
const POLL_FAST_MS  = 3_000;  // panel open
const POLL_SLOW_MS  = 8_000;  // panel closed (background)

/**
 * Computes a simple hash string from file metadata to detect changes
 * without unnecessary re-renders.
 */
function computeFileHash(files: ArtifactFile[]): string {
  return JSON.stringify(files.map(f => f.name + f.size + f.mtime));
}

export function useArtifacts(activeConversationId?: string | null) {
  const [artifactFiles, setArtifactFiles] = useState<ArtifactFile[]>([]);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);

  const lastHashRef = useRef('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/artifacts/active`);
      const data = await res.json();
      const files: ArtifactFile[] = data.files || [];

      // Hash-based change detection: only update state if files actually changed
      const newHash = computeFileHash(files);
      if (newHash !== lastHashRef.current) {
        lastHashRef.current = newHash;
        setArtifactFiles(files);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(prev => !prev);
  }, []);

  const openArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(true);
  }, []);

  // Always poll — faster when the panel is open, slower in the background
  useEffect(() => {
    // Fetch immediately on mount / whenever the panel state changes
    loadArtifacts();

    const interval = artifactPanelOpen ? POLL_FAST_MS : POLL_SLOW_MS;
    pollingRef.current = setInterval(loadArtifacts, interval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [artifactPanelOpen, loadArtifacts]);

  // Re-fetch when the active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      lastHashRef.current = '';
      loadArtifacts();
    }
  }, [activeConversationId, loadArtifacts]);

  return {
    artifactFiles,
    artifactPanelOpen,
    toggleArtifactPanel,
    openArtifactPanel,
    loadArtifacts  // exposed so SSE events can trigger an immediate refresh
  };
}
