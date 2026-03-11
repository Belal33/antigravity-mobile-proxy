<div align="center">

# 🌐 Antigravity Chat Proxy

**Chat with the Antigravity AI Agent from any browser**

A Next.js proxy that bridges your browser to the [Antigravity IDE](https://github.com/anthropics/antigravity) via Chrome DevTools Protocol (CDP), providing a real-time chat interface with full access to the agent's capabilities — file operations, terminal commands, search, MCP tools, and more.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Development](#development)

---

## Overview

Antigravity Chat Proxy acts as a bridge between your web browser and the Antigravity IDE (a VS Code fork with an embedded AI agent). It connects to the IDE via **Chrome DevTools Protocol (CDP)** using Puppeteer, scrapes the agent's UI state in real-time, and exposes it through a clean **REST + SSE API** consumed by a React frontend.

This enables you to:
- Chat with the Antigravity agent from **any device** on your network
- See real-time tool calls, thinking blocks, and responses via **Server-Sent Events**
- Approve or reject **Human-in-the-Loop (HITL)** actions remotely
- Browse conversation artifacts and switch between IDE windows
- Access the full agent experience outside the IDE's native panel

---

## Architecture

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│                 │       │                      │       │                 │
│   Browser UI    │◄─SSE──│   Next.js Proxy       │◄─CDP──│  Antigravity    │
│   (React)       │──REST─│   (API Routes)        │──────│  IDE (Electron) │
│                 │       │                      │       │                 │
└─────────────────┘       └──────────────────────┘       └─────────────────┘
     Port 3000                  lib/ services               Port 9223
```

### Data Flow

1. **User sends a message** → React UI → `POST /api/v1/chat/stream`
2. **Proxy types into IDE** → CDP → Puppeteer → Antigravity chat input → `Enter`
3. **Proxy polls agent state** → DOM scraping every 500ms → multi-signal running detection
4. **State diffs emitted as SSE** → thinking blocks, tool calls, HITL events, responses
5. **Frontend renders in real-time** → tool call cards, approve/reject buttons, streaming response HTML

---

## Features

### 🔄 Real-Time SSE Streaming
State diffing engine compares agent snapshots every 500ms and emits granular typed events:
- `thinking` — "Thought for 5s" blocks
- `tool_call` — command execution, file edits, search, MCP tools
- `hitl` — approval required / approval resolved
- `response` — streaming HTML response content
- `notification` — agent notifications
- `file_change` — file diff indicators
- `status` — running state transitions
- `error` — agent error detection
- `done` — completion with final response

### 🛡️ Multi-Signal Completion Detection
Avoids premature stream termination using 4 independent signals:
1. **Spinner visibility** — CSS animation detection
2. **Stop button presence** — aria-label / text matching
3. **Pending tool calls** — cancel button without exit code
4. **Step group activity** — progress indicators, status text matching

### 🔧 Human-in-the-Loop (HITL)
Remote approve/reject for destructive operations:
- One-click approve (`/api/v1/chat/approve`) or reject (`/api/v1/chat/reject`)
- Per-tool action buttons via `/api/v1/chat/action` with `toolId` + `buttonText`
- Permission dialog detection for MCP tools and file access

### 📁 Artifact Browser
Browse and read agent-generated artifacts:
- List conversations from `~/.gemini/antigravity/brain/`
- List files per conversation
- Serve artifact content with proper MIME types

### 🪟 Multi-Window Support
Connect to any Antigravity workbench window:
- Auto-discover all `workbench.html` pages via CDP
- Switch between windows at runtime
- Environment variable for default window (`PROXY_PAGE`)

### 🎨 Glassmorphism Dark Theme
Premium UI with:
- Dark mode with glass-morphism effects and backdrop blur
- Animated gradient accents (indigo → purple → pink)
- Tool call cards with status-based coloring and pulse animations
- Typing indicator, thinking blocks, and HITL dialogs with micro-animations
- Inter + JetBrains Mono typography via `next/font`

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Antigravity IDE** running with remote debugging enabled:
  ```bash
  antigravity --remote-debugging-port=9223
  ```

### Installation

```bash
git clone <repo-url>
cd antigravity-chat-proxy-next
npm install
```

### Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

Open **http://localhost:3000** in your browser.

---

## API Reference

All endpoints are versioned under `/api/v1/`.

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Connection status |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/chat` | Send message (blocking — waits for full response) |
| `POST` | `/api/v1/chat/stream` | Send message (SSE streaming — real-time events) |
| `GET` | `/api/v1/chat/state` | Current agent panel state snapshot |
| `GET` | `/api/v1/chat/history` | Full conversation history (scrolls to de-virtualize) |
| `POST` | `/api/v1/chat/new` | Start a new chat session in the IDE |
| `POST` | `/api/v1/chat/approve` | Click the approve/run HITL button |
| `POST` | `/api/v1/chat/reject` | Click the reject/cancel HITL button |
| `POST` | `/api/v1/chat/action` | Click any footer button by `toolId` + `buttonText` |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/conversations` | List all conversations with metadata |
| `POST` | `/api/v1/conversations/select` | Set active conversation (switches in IDE) |
| `GET` | `/api/v1/conversations/active` | Get current active conversation |

### Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/artifacts` | List all artifact directories |
| `GET` | `/api/v1/artifacts/:convId` | List files in a conversation |
| `GET` | `/api/v1/artifacts/:convId/:filename` | Serve a specific artifact file |

### Windows

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/windows` | List available Antigravity workbench windows |
| `POST` | `/api/v1/windows/select` | Switch to a different window |

### Debug

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/debug/dom` | Raw HTML dump of the agent panel |

### SSE Event Types

When using `/api/v1/chat/stream`, the response is a stream of `data: {JSON}\n\n` lines:

```jsonc
// Thinking block
data: {"type":"thinking","time":"Thought for 5s"}

// Tool call (new or updated)
data: {"type":"tool_call","index":0,"id":"0","status":"Running command","type":"command","command":"ls -la","isNew":true}

// HITL approval required
data: {"type":"hitl","action":"approval_required","tool":{...}}

// Streaming response (HTML)
data: {"type":"response","content":"<p>Here are the files...</p>","index":0,"partial":true}

// Completion
data: {"type":"done","finalResponse":"<p>Done!</p>","isHTML":true}
```

---

## Project Structure

```
antigravity-chat-proxy-next/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, metadata, global CSS)
│   ├── page.tsx                  # Main chat page
│   ├── globals.css               # Consolidated design system (200+ lines)
│   └── api/v1/                   # 18 versioned API routes
│       ├── health/route.ts
│       ├── chat/
│       │   ├── route.ts          # POST → blocking chat
│       │   ├── stream/route.ts   # POST → SSE streaming (core endpoint)
│       │   ├── state/route.ts    # GET → agent state snapshot
│       │   ├── history/route.ts  # GET → conversation history
│       │   ├── new/route.ts      # POST → start new chat
│       │   ├── approve/route.ts  # POST → HITL approve
│       │   ├── reject/route.ts   # POST → HITL reject
│       │   └── action/route.ts   # POST → click any button
│       ├── conversations/        # 3 routes (list, select, active)
│       ├── artifacts/            # 3 routes (list, files, serve)
│       ├── windows/              # 2 routes (list, select)
│       └── debug/dom/route.ts    # DOM dump
│
├── components/                   # React UI Components
│   ├── header.tsx                # Logo, status, window selector, new chat
│   ├── welcome-screen.tsx        # Landing screen with quick prompts
│   ├── message-list.tsx          # Scrollable message container
│   ├── user-message.tsx          # User chat bubble
│   ├── agent-message.tsx         # Agent response with steps
│   ├── tool-call-card.tsx        # Tool call visualization
│   ├── thinking-block.tsx        # "Thought for Xs" indicator
│   ├── hitl-dialog.tsx           # Approve/reject dialog
│   ├── typing-indicator.tsx      # Bouncing dots animation
│   └── chat-input.tsx            # Auto-resizing textarea + send btn
│
├── hooks/
│   └── use-chat.ts               # Central hook: SSE, state, health, HITL
│
├── lib/                          # Server-side services (Node.js only)
│   ├── types.ts                  # Shared TypeScript types
│   ├── context.ts                # Singleton shared state (replaces ctx)
│   ├── init.ts                   # Lazy CDP initialization
│   ├── utils.ts                  # sleep() utility
│   ├── cdp/
│   │   ├── connection.ts         # Puppeteer CDP connect/discover/select
│   │   └── selectors.ts          # DOM selector constants
│   ├── scraper/
│   │   ├── agent-state.ts        # Full agent panel scraper (500+ lines)
│   │   └── chat-history.ts       # Conversation history with scroll de-virtualization
│   ├── actions/
│   │   ├── send-message.ts       # Type + Enter via CDP
│   │   ├── hitl.ts               # Approve/reject/action button clicks
│   │   ├── new-chat.ts           # Multi-strategy new chat button detection
│   │   └── switch-conversation.ts # Switch active conversation in IDE
│   └── sse/
│       └── diff-states.ts        # State diffing engine for SSE events
│
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## How It Works

### CDP Connection
The proxy connects to Antigravity's Electron app via `puppeteer-core` using the Chrome DevTools Protocol. The IDE must be launched with `--remote-debugging-port=9223`. The connection is established lazily on the first API request and the Puppeteer `Page` instance is reused across all subsequent requests via a module-level singleton.

### DOM Scraping
The scraper (`lib/scraper/agent-state.ts`) runs inside `page.evaluate()` — a function injected into the IDE's renderer process. It walks the agent side panel DOM to extract:

- **Running state** using 4 independent signals (spinner, stop button, pending tools, step indicators)
- **Thinking blocks** — buttons starting with "Thought for"
- **Tool calls** — border containers with status headers, commands, terminal output, exit codes
- **Inline file tools** — file edit/read/search rows with additions/deletions
- **MCP tools** — tool name, arguments, output
- **Permission dialogs** — allow/deny button groups
- **Response blocks** — `.leading-relaxed.select-text` elements (HTML preserved)
- **Notifications** — `.notify-user-container` blocks
- **Errors** — text pattern matching for agent termination
- **File changes** — SVG icon-based diff indicators

### SSE State Diffing
The diff engine (`lib/sse/diff-states.ts`) compares consecutive agent state snapshots and emits only the changes as typed events. This ensures clients receive granular, efficient updates rather than full state dumps.

### Virtualization Handling
The IDE uses DOM virtualization for long conversations. The scraper handles this by:
- **Chat history**: Scrolling from top to bottom in increments to force all content to render
- **Tool calls**: Assigning persistent `data-proxy-tool-id` attributes and tracking tools in a session-scoped `Map` that survives DOM recycling
- **Responses**: Accumulating responses in a session array that only grows, never shrinks

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PORT` | `9223` | Remote debugging port of the Antigravity IDE |
| `PROXY_PAGE` | `0` | Index of the workbench window to connect to |
| `PORT` | `3000` | Next.js server port |

---

## Development

```bash
# Start dev server with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Production build
npm run build

# Start production server
npm start
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Module singleton** for shared state | Next.js API routes share the Node.js process — a module-level object persists across requests without global state hacks |
| **Lazy CDP init** | Connection is established on first API call, not at import time — avoids crashes when IDE isn't running |
| **API versioning** (`/api/v1/`) | Future-proofs the API for breaking changes without disrupting existing consumers |
| **`legacy.js` dropped** | The 5 blocking helper functions were superseded by the SSE streaming path — the blocking `/api/v1/chat` endpoint uses the scraper directly instead |
| **HTML response preservation** | `innerHTML` extraction preserves rich formatting (code blocks, lists, links) from the agent's output |
| **Multi-signal completion** | Using a single signal (e.g., spinner) is unreliable — combining 4 signals prevents premature stream termination |

---

<div align="center">

**Built with [Next.js](https://nextjs.org) · [Puppeteer](https://pptr.dev) · [TypeScript](https://typescriptlang.org)**

</div>
