/**
 * Shared SWR configuration: fetcher function and centralized cache keys.
 */

export const API_BASE = '/api/v1';

/** Default JSON fetcher for useSWR hooks. */
export const fetcher = (url: string) => fetch(url).then(r => r.json());

/**
 * Centralised SWR cache keys.
 * Using constants prevents typos and makes global `mutate()` calls easy.
 */
export const SWR_KEYS = {
  windows: `${API_BASE}/windows`,
  cdpStatus: `${API_BASE}/windows/cdp-status`,
  conversations: `${API_BASE}/conversations`,
  recentProjects: `${API_BASE}/windows/recent`,
  artifacts: `${API_BASE}/artifacts/active`,
  changes: `${API_BASE}/changes/active`,
  git: `${API_BASE}/git/status`,
  workspace: `${API_BASE}/workspace/files`,
  history: `${API_BASE}/chat/history`,
  mode: `${API_BASE}/chat/mode`,
  agent: `${API_BASE}/chat/agent`,
  health: `${API_BASE}/health`,
} as const;
