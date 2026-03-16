/**
 * Shared TypeScript types for the Antigravity Chat Proxy.
 */

import type { Page, Browser } from 'puppeteer-core';

// ── Context (shared server state) ──

export interface ProxyContext {
  workbenchPage: Page | null;
  browser: Browser | null;
  allWorkbenches: WorkbenchInfo[];
  activeWindowIdx: number;
  activeConversationId: string | null;
  activeTitle?: string | null;
  lastActionTimestamp: number;
}

export interface WorkbenchInfo {
  page: Page;
  title: string;
  url: string;
}

// ── Agent State (from scraper) ──

export interface ToolCall {
  id: string;
  status: string;
  type: string;
  path: string;
  command: string | null;
  exitCode: string | null;
  hasCancelBtn: boolean;
  footerButtons: string[];
  hasTerminal: boolean;
  terminalOutput: string | null;
  additions?: string | null;
  deletions?: string | null;
  lineRange?: string | null;
  mcpToolName?: string | null;
  mcpArgs?: string | null;
  mcpOutput?: string | null;
}

export interface ThinkingBlock {
  time: string;
}

export interface FileChange {
  fileName: string;
  type: string;
}

export interface AgentState {
  isRunning: boolean;
  turnCount: number;
  stepGroupCount: number;
  thinking: ThinkingBlock[];
  toolCalls: ToolCall[];
  responses: string[];
  notifications: string[];
  error: string | null;
  fileChanges: FileChange[];
  lastTurnResponseHTML: string;
}

export interface ChatTurn {
  role: 'user' | 'agent';
  content: string;
}

export interface ChatHistory {
  isRunning: boolean;
  turnCount: number;
  turns: ChatTurn[];
}

// ── SSE Events ──

export type SSEEventType =
  | 'thinking'
  | 'tool_call'
  | 'hitl'
  | 'response'
  | 'notification'
  | 'file_change'
  | 'status'
  | 'done'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

// ── Conversation & Artifacts ──

export interface ConversationFile {
  name: string;
  size: number;
  mtime: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  files: ConversationFile[];
  mtime: string;
  active: boolean;
}

// ── Frontend Types ──

export interface WindowInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export interface ConversationInfo {
  id: string; // The backend brain UUID, or "-1" for unknown
  title: string;
  active: boolean;
  index: number;
  mtime?: string;
  files?: ArtifactFile[];
}

export interface ArtifactFile {
  name: string;
  size: number;
  mtime: string;
  /** Whether this is a file with an extension (can be opened/viewed) or a named IDE artifact */
  isFile?: boolean;
  /** Where this artifact was detected from */
  source?: 'ide' | 'brain' | 'none';
}

export interface ChangeFile {
  filename: string;
  filepath: string;
  additions: number;
  deletions: number;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  steps?: SSEStep[];
}

export interface SSEStep {
  type: string;
  data: Record<string, any>;
}
