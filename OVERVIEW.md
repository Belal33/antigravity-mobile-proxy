# Antigravity Chat Proxy — Overview

> A CDP-powered bridge that turns the Antigravity IDE's agent chat into an accessible web API + premium real-time chat UI.

---

## What It Does

The Antigravity Chat Proxy connects to the [Antigravity IDE](https://antigravity.dev) (a VS Code / Electron fork) via **Chrome DevTools Protocol (CDP)** and exposes its AI agent chat through:

1. **A REST / SSE HTTP API** — programmatic access from any client.
2. **A premium web chat UI** — glassmorphic dark theme served at `http://localhost:3457`.

This lets you interact with the Antigravity agent from **any device** (phone, tablet, another machine) without needing the full desktop IDE open in front of you.

---

## Architecture

```
┌───────────────────┐       CDP (port 9223)       ┌────────────────────────┐
│  Antigravity IDE  │◄──────────────────────────►  │   proxy-server.js      │
│  (Electron App)   │   puppeteer-core connect     │   Node.js HTTP server  │
└───────────────────┘                              │   (port 3457)          │
                                                   └──────┬─────────────────┘
                                                          │
                                        ┌─────────────────┼─────────────────┐
                                        │                 │                 │
                                   REST API         SSE Stream        Static Files
                                  /api/chat       /api/chat/stream     /web/*
                                        │                 │                 │
                                        └─────────────────┼─────────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │  Browser UI  │
                                                   │  (any device) │
                                                   └──────────────┘
```

### Core Flow

1. **CDP Connection** — `puppeteer-core` connects to the Electron process via `--remote-debugging-port=9223`.
2. **DOM Scraping** — The proxy reads the agent panel's DOM to extract thinking blocks, tool calls, responses, notifications, errors, and file changes.
3. **State Diffing** — Every 500ms, a full state snapshot is compared against the previous one. Only deltas are emitted as typed SSE events.
4. **Message Injection** — User messages are typed into the IDE's chat input via `document.execCommand('insertText')` + Enter keypress.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| CDP Client | `puppeteer-core` v24 |
| HTTP Server | Built-in `node:http` (no Express) |
| Streaming | Server-Sent Events (SSE) |
| Frontend | Vanilla HTML / CSS / JS |
| Styling | Glassmorphic dark theme with CSS custom properties |
| Code Highlighting | highlight.js |

---

## Project Structure

```
antigravity-chat-proxy/
├── proxy-server.js          # Main server — CDP connection, DOM scraper, HTTP API, SSE streaming
├── package.json             # Dependencies & scripts (v0.2.0)
├── web/
│   ├── index.html           # Chat UI shell
│   ├── style.css            # Glassmorphic dark theme (23 KB)
│   └── app.js               # Frontend logic — SSE parser, dynamic rendering (30 KB)
├── debug-dom.js             # DOM diagnostic utility
├── test-electron-cdp.js     # CDP connection tester
└── IMPLEMENTATION.md        # Implementation notes
```

---

## API Reference

All endpoints are served from `http://localhost:3457`.

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | **Blocking** — Send a message, wait for the full response. |
| `POST` | `/api/chat/stream` | **SSE Streaming** — Send a message, receive granular typed events in real-time. |
| `GET` | `/api/chat/state` | Snapshot of the current agent panel state (running, tools, responses, etc.). |

### Human-in-the-Loop (HITL)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat/approve` | Click the "Run" / "Approve" button in the IDE. |
| `POST` | `/api/chat/reject` | Click the "Cancel" / "Reject" button in the IDE. |

### Window Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/windows` | List all discovered Antigravity workbench windows. |
| `POST` | `/api/windows/select` | Switch the proxy target to a different window. Body: `{ "index": N }` |

### Diagnostics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check — returns `{ status: "ok", connected: bool }`. |
| `GET` | `/api/debug/dom` | Raw DOM diagnostic data (turn count, step groups, tool containers). |

---

## SSE Event Protocol

When using `/api/chat/stream`, the proxy emits the following typed events:

| Event | Payload | Description |
|-------|---------|-------------|
| `status` | `{ isRunning, phase }` | Agent lifecycle updates (`sending` → `waiting` → `processing`). |
| `thinking` | `{ time }` | A new "Thought for X seconds" reasoning block appeared. |
| `tool_call` | `{ id, status, type, path, command, exitCode, isNew, index, ... }` | A tool step was created or updated. Types: `command`, `file`, `search`, `read`, `browser`. |
| `hitl` | `{ action, tool? }` | Human-in-the-loop: `approval_required` (with tool context) or `resolved`. |
| `response` | `{ content, index, partial }` | Incremental response HTML from the agent. |
| `notification` | `{ content, index }` | Result of `notify_user` tool calls. |
| `file_change` | `{ fileName, type }` | File diff detected in the IDE. |
| `error` | `{ message }` | Agent error (e.g. "Agent terminated due to error"). |
| `done` | `{ finalResponse, isHTML, thinking, toolCalls }` | Stream completion signal with full context. |

---

## Key Design Decisions

### Multi-Signal Running Detection

The IDE spinner (`.animate-spin`) is unreliable — it drops for ~500ms between tool calls. The proxy uses **four signals** to determine if the agent is truly running:

1. **Visible Spinner** — Primary indicator, with visibility ancestry check.
2. **Stop/Abort Button** — Only rendered during active generation.
3. **Step Group Count** — An increase means new activity started.
4. **Pending Tool Calls** — Any tool with a "Cancel" button but no exit code.

### Completion Stability ("Done" Threshold)

To avoid premature stream termination:

- **10 consecutive idle polls** (~5 seconds) before marking "Done".
- **Content change resets** — Any new tool call, response, or thinking block resets the counter to 0.
- **HTML stabilization** — The last response's `innerHTML` must remain identical for ≥3 polls.

### HTML-First Formatting

Antigravity renders markdown internally. The proxy extracts `innerHTML` (not `textContent`) to preserve tables, code blocks, bold text, and headers natively — no double-parsing needed.

### Virtualization Handling

The IDE virtualizes older step groups (replacing them with gray skeleton blocks). The proxy:

- Tracks tool calls by persistent `data-proxyToolId` attributes.
- Accumulates tool calls in a `sessionToolCalls` Map across polls.
- Ignores skeleton placeholders (`bg-gray-500/10`).

---

## Frontend Features

- **Glassmorphic dark theme** — `backdrop-filter: blur(20px)`, semi-transparent surfaces, subtle shadows.
- **Dynamic tool call cards** — Animated status badges (running → success/error), command display with `$` prefix, terminal output snippets.
- **HITL approval UI** — In-chat approve/reject dialog for tool execution.
- **Streaming glow effect** — Pulsing border animation while the agent is active.
- **Window selector** — Switch between multiple Antigravity workbench windows from the UI.
- **Responsive** — Usable on mobile devices.

---

## Quick Start

### Prerequisites

- Antigravity IDE launched with remote debugging:
  ```bash
  antigravity . --remote-debugging-port=9223
  ```
- Node.js installed.

### Run

```bash
cd antigravity-chat-proxy
npm install
node proxy-server.js
```

Open **http://localhost:3457** in any browser.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PORT` | `9223` | Antigravity's remote debugging port. |
| `PROXY_PAGE` | `0` | Index of the workbench window to target. |

---


