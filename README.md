# Antigravity Chat Proxy

A CDP-based HTTP proxy that lets you interact with the **Antigravity IDE agent** via a REST API and a built-in web UI. It connects to Antigravity's Electron process through Chrome DevTools Protocol, types messages into the agent chat, and extracts the final response from the DOM.

## Features

- **REST API** — Send messages and receive agent responses via HTTP
- **Streaming API** — Server-Sent Events for real-time response streaming
- **Multi-window support** — List and switch between Antigravity IDE windows at runtime
- **Web UI** — Built-in chat interface with window selection dropdown
- **Error detection** — Detects agent crashes and returns error messages immediately
- **Smart response extraction** — Filters out agent "thinking" blocks, returns only the final reply

## Prerequisites

1. **Antigravity IDE** — Must be launched with CDP enabled:
   ```bash
   # Kill ALL existing instances first (Electron reuses processes)
   killall antigravity

   # Launch the binary directly (NOT the CLI wrapper)
   /usr/share/antigravity/antigravity --remote-debugging-port=9223 /path/to/project
   ```

   > ⚠️ Using `antigravity . --remote-debugging-port=9223` (the CLI wrapper) will **NOT** work — it passes flags to Node.js, not Electron.

2. **Node.js** — v18+

3. **Dependencies**:
   ```bash
   npm install
   ```

## Quick Start

```bash
# Start the proxy (default: CDP port 9223, HTTP port 3457)
node proxy-server.js

# Or with custom ports
CDP_PORT=9223 HTTP_PORT=3457 node proxy-server.js
```

Open `http://localhost:3457` in your browser for the web UI.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message, get full response (JSON) |
| `POST` | `/api/chat/stream` | Send message, receive SSE stream |
| `GET` | `/api/windows` | List all Antigravity workbench windows |
| `POST` | `/api/windows/select` | Switch target window: `{"index": 1}` |
| `GET` | `/api/health` | Health check |
| `GET` | `/` | Web chat UI |

### Examples

```bash
# Simple chat
curl -X POST http://localhost:3457/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is 2+2?"}'
# → {"response": "4"}

# List windows
curl http://localhost:3457/api/windows
# → {"windows": [{"index":0,"title":"myproject - Antigravity","active":true}]}

# Switch window
curl -X POST http://localhost:3457/api/windows/select \
  -H "Content-Type: application/json" \
  -d '{"index": 1}'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PORT` | `9223` | Chrome DevTools Protocol port |
| `HTTP_PORT` | `3457` | HTTP server port |
| `PROXY_PAGE` | `0` | Default workbench window index |

## Architecture

```
┌─────────────┐     HTTP      ┌──────────────┐      CDP       ┌──────────────────┐
│  Client /    │◄────────────►│  Proxy Server │◄────────────►│  Antigravity IDE  │
│  Web UI      │   REST/SSE   │  (Node.js)    │  Puppeteer    │  (Electron app)   │
└─────────────┘              └──────────────┘              └──────────────────┘
```

The proxy:
1. Connects to Antigravity via CDP using `puppeteer-core`
2. Types messages into the agent's chat input
3. Polls the DOM for the agent's response (filtering out "thinking" blocks)
4. Returns the final response via HTTP

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Failed to fetch browser webSocket URL` | CDP not enabled or wrong port | Kill all Antigravity instances, relaunch with `/usr/share/antigravity/antigravity --remote-debugging-port=9223 .` |
| `No workbench pages found` | Connected to wrong process (e.g. Chrome browser) | Verify CDP_PORT points to Antigravity, not Chrome |
| Proxy hangs on "Thinking..." | Spinner detection issue | Already fixed — uses Tailwind `invisible` class check |
| Empty response | Agent used `notify_user` or thinking blocks only | Already fixed — checks both `.gap-y-3` blocks and `.notify-user-container` |
| `Port 3457 is already in use` | Previous proxy instance running | `kill $(lsof -t -i:3457)` |

## License

MIT
