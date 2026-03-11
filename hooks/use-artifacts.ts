import { useState, useCallback, useEffect, useRef } from 'react';
import type { ArtifactFile } from '@/lib/types';

const API_BASE = '/api/v1';
const POLL_INTERVAL_MS = 3000;

/**
 * Computes a simple hash string from file metadata to detect changes
 * without unnecessary re-renders (mirrors old app's approach).
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

  // Start/stop polling based on panel visibility
  useEffect(() => {
    if (artifactPanelOpen) {
      // Fetch immediately when panel opens
      loadArtifacts();

      // Start polling every 3 seconds
      pollingRef.current = setInterval(loadArtifacts, POLL_INTERVAL_MS);
    } else {
      // Stop polling when panel is closed
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

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
      // Reset hash so we always show fresh data for the new conversation
      lastHashRef.current = '';
      loadArtifacts();
    }
  }, [activeConversationId, loadArtifacts]);

  return {
    artifactFiles,
    artifactPanelOpen,
    toggleArtifactPanel,
    openArtifactPanel,
    loadArtifacts
  };
}
