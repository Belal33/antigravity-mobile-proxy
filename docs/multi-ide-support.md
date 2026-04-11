# Multi-IDE Support Strategy

## Overview

The Antigravity Chat Proxy can be extended to support VS Code and Cursor (both Electron-based VS Code forks). This document outlines the coupling points, abstraction strategy, and implementation approaches.

## Current Coupling Points

The proxy is tightly coupled to Antigravity's DOM via:
- **CSS selectors** in `lib/cdp/selectors.ts` (e.g., `.antigravity-agent-side-panel`, `#antigravity\\.agentSidePanelInputBox`)
- **DOM scraping** in `lib/scraper/agent-state.ts` (1000+ lines of Antigravity-specific element traversal)
- **Binary management** in `lib/cdp/process-manager.ts` (Antigravity executable paths)

## IDE-Agnostic Components

These parts don't need changes:
- SSE streaming engine (`lib/sse/`)
- Type definitions (`lib/types.ts`)
- Frontend UI (`components/`, `app/`)

## Recommended Architecture: IDE Adapter Pattern

Introduce an `IdeAdapter` interface that each IDE implements:

```typescript
interface IdeAdapter {
  connect(config): Promise<void>;
  getAgentState(): Promise<AgentState>;
  getChanges(): Promise<IdeChangesResult>;
  sendMessage(message: string): Promise<void>;
  handleHitlAction(toolId: string, action: string): Promise<void>;
  stopAgent(): Promise<void>;
  // ...
}
```

### Adapter Implementations
- `AntigravityAdapter` — wraps current CDP + DOM scraping code
- `VSCodeAdapter` — connects to a companion VS Code extension
- `CursorAdapter` — CDP scraping of Cursor's chat panel or extension bridge

## Approaches

1. **CDP DOM Scraping** — Same pattern, different selectors per IDE. Fragile but fast to prototype.
2. **VS Code Extension** — Build a companion extension that exposes agent state via a local HTTP server. Most stable approach.
3. **LSP Bridge** — Custom protocol over LSP. Most portable but highest effort.

## CDP Ports

| IDE | Port | Launch |
|-----|------|--------|
| Antigravity | 9223 | `--remote-debugging-port=9223` |
| VS Code | 9222 | `code --remote-debugging-port=9222` |
| Cursor | 9224 | `cursor --remote-debugging-port=9224` |

## See Also

Full analysis: `.gemini/antigravity/brain/.../artifacts/multi_ide_extension_analysis.md`
