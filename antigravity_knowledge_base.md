# Antigravity IDE — Technical Knowledge Base

> Compiled during remote access investigation — March 6, 2026  
> Antigravity version: **1.107.0** (installed via `.deb` package)

---

## Architecture

Antigravity is a **heavily modified VS Code fork** built on Electron, launched November 18, 2025 alongside Gemini 3. It takes an "agent-first" approach to software development.

- **Binary:** `/usr/bin/antigravity` (shell script wrapper)
- **Electron app:** `/usr/share/antigravity/antigravity`
- **CLI entry:** `/usr/share/antigravity/resources/app/out/cli.js` (run via `ELECTRON_RUN_AS_NODE=1`)
- **Package ID:** `antigravity` (amd64 `.deb`)
- **Description:** "Experience liftoff"

### Key Directories

```
/usr/share/antigravity/
├── antigravity                          # Electron binary
├── bin/
│   ├── antigravity                      # Shell script (CLI wrapper)
│   └── antigravity-tunnel               # Tunnel/server binary (NOT shipped by default)
└── resources/app/
    ├── out/cli.js                       # CLI logic
    └── extensions/
        └── antigravity/                 # Built-in agent extension
            ├── package.json             # Extension manifest (google.antigravity)
            ├── bin/
            │   ├── fd                   # File discovery tool
            │   ├── language_server_linux_x64  # Language server binary
            │   └── sandbox-wrapper.sh
            ├── dist/
            │   └── languageServer/
            │       └── cert.pem
            ├── out/                     # Compiled extension code
            ├── assets/
            ├── customEditor/
            └── schemas/
                └── mcp_config.schema.json  # MCP configuration schema
```

---

## CLI Commands

### Standard Options
```bash
antigravity [paths...]              # Open files/folders
antigravity -d <file1> <file2>      # Diff two files
antigravity -m <p1> <p2> <base> <r> # Three-way merge
antigravity -g <file:line:col>      # Go to specific location
antigravity -n                      # Force new window
antigravity -r                      # Reuse existing window
antigravity --add-mcp <json>        # Add MCP server to profile
```

### Subcommands

#### `antigravity chat [prompt]`
Opens the agent chat panel with the given prompt.

| Flag | Description |
|---|---|
| `-m --mode <mode>` | `ask`, `edit`, `agent` (default), or custom mode ID |
| `-a --add-file <path>` | Add files as context (repeatable) |
| `--maximize` | Maximize the chat view |
| `-r --reuse-window` | Use last active window |
| `-n --new-window` | Open empty window for chat |
| `--profile <name>` | Use specific profile |
| Stdin support | `cat file.py \| antigravity chat "explain this" -` |

> ⚠️ **Requires GUI** — opens the desktop app, does not run headlessly.

#### `antigravity serve-web`
Serves a web-based editor UI in browsers.

> ⚠️ **Serves vanilla VS Code Server**, not Antigravity. The agent extension (`google.antigravity`) is rejected by the server.

#### `antigravity tunnel`
Creates a secure remote tunnel.

> ⚠️ **Requires `antigravity-tunnel` binary** which is not shipped in the `.deb` package. Can be substituted with the VS Code CLI binary, but will only tunnel vanilla VS Code.

---

## Extension Details

The built-in agent extension (`google.antigravity v0.2.0`) includes:

### Agent Commands
- `antigravity.prioritized.chat.open` — Open agent chat
- `antigravity.prioritized.command.open` — Inline command (Ctrl+I / Cmd+I)
- `antigravity.terminalCommand.run` — Run terminal command (Ctrl+Enter)
- `antigravity.terminalCommand.accept` — Accept suggestion (Alt+Enter)
- `antigravity.terminalCommand.reject` — Reject suggestion (Ctrl+Backspace)
- `antigravity.generateCommitMessage` — AI commit message
- `antigravity.openBrowser` — Built-in browser
- `antigravity.startDemoMode` / `endDemoMode` — Demo mode (Beta)
- `antigravity.openConversationPicker` — Conversation picker (Ctrl+Shift+A)

### Agent Step Controls
- `antigravity.agent.acceptAgentStep` — Accept agent step (Alt+Enter)
- `antigravity.agent.rejectAgentStep` — Reject agent step (Alt+Shift+Backspace)
- `antigravity.prioritized.agentFocusNextHunk` / `PreviousHunk` — Navigate diffs (Alt+J / Alt+K)
- `antigravity.prioritized.agentAcceptFocusedHunk` / `RejectFocusedHunk` — Accept/reject focused diff

### Import Commands
Supports migrating settings and extensions from:
- VS Code
- Cursor
- Windsurf
- Cider (Google internal)

### Configuration Properties
| Setting | Default | Description |
|---|---|---|
| `antigravity.marketplaceExtensionGalleryServiceURL` | `https://open-vsx.org/vscode/gallery` | Extension marketplace URL |
| `antigravity.marketplaceGalleryItemURL` | `https://open-vsx.org/vscode/item` | Extension page URL |
| `antigravity.searchMaxWorkspaceFileCount` | `5000` | Max files for workspace indexing |
| `antigravity.persistentLanguageServer` | `false` | Keep language server alive after editor close |

### Key Bindings
| Shortcut | Action |
|---|---|
| `Ctrl+I` (editor) | Open inline command |
| `Ctrl+I` (terminal) | Open terminal command |
| `Ctrl+Enter` | Run/accept terminal suggestion |
| `Alt+Enter` | Accept suggestion/agent step |
| `Ctrl+Backspace` | Reject suggestion |
| `Alt+J` / `Alt+K` | Navigate agent edit hunks |
| `Alt+\` | Trigger inline suggestion |
| `Tab` | Accept autocomplete |
| `Escape` | Dismiss suggestions |
| `Ctrl+Shift+A` | Open conversation picker |

### Marketplace
Antigravity uses **Open VSX** by default (not the official VS Code Marketplace). This can be changed in settings.

### MCP Support
Antigravity supports **Model Context Protocol** servers:
- CLI: `antigravity --add-mcp '{"name":"server-name","command":...}'`
- Config schema: `mcp_config.json` validated by built-in JSON schema
- Language support for `jsonc` in MCP config files

---

## Limitations Discovered

| Limitation | Detail |
|---|---|
| **No headless agent mode** | `antigravity chat` requires the desktop GUI — no terminal-only agent |
| **`serve-web` serves vanilla VS Code** | The command delegates to VS Code CLI which downloads a standard server |
| **Agent extension rejected by VS Code Server** | `Marked extension as removed google.antigravity-0.2.0` — cannot copy into `.vscode-server` |
| **`antigravity-tunnel` not shipped** | The binary at `/usr/share/antigravity/bin/antigravity-tunnel` is missing from the `.deb` package |
| **Tight desktop coupling** | The agent depends on Electron APIs and Antigravity-specific VS Code modifications not present in the server |

---

## Workarounds & Notes

1. **The VS Code CLI binary can substitute for `antigravity-tunnel`** — fixes `serve-web` and `tunnel` commands, but they serve vanilla VS Code
2. **VS Code Server extensions get stored at** `~/.vscode-server/extensions/` — separate from desktop extensions
3. **The server auto-installs `google.geminicodeassist`** — Gemini Code Assist works in the web version but is NOT the same as the Antigravity agent
4. **`loginctl enable-linger $USER`** may be needed for user-level systemd services to persist after logout
5. **SSE Stream Polling:** When migrating from Node.js `http.createServer` + `setInterval` to Next.js `ReadableStream`, use `setInterval` for polling instead of recursive `async` functions. `setInterval` survives per-tick errors; recursive `await` propagates errors and kills the stream. Also set `ctx.lastActionTimestamp` after `sendMessage` to activate the 15-second done-detection guard.

---

## CDP Process Management (Learned March 2026)

### Starting CDP
- **Must use the direct binary**, not the CLI wrapper
- **Process reuse is critical**: If ANY Antigravity window exists, new launched instances merge into the existing Electron process and immediately shut down their CDP server. Always kill all existing instances before a fresh CDP start.
- Launch command: `<binary> --remote-debugging-port=9223 /path/to/project`
- Verify with: `curl -s http://localhost:9223/json`

### Cross-Platform Binary Paths
| OS | Default Binary Path |
|---|---|
| **Linux** | `/usr/share/antigravity/antigravity` |
| **macOS** | `/Applications/Antigravity.app/Contents/MacOS/Antigravity` |
| **Windows** | `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe` or `C:\Program Files\Google\Antigravity\Antigravity.exe` |
| **WSL** | Auto-scanned via `/mnt/c/Users/*/AppData/Local/Programs/Antigravity/Antigravity.exe` and `/mnt/c/Program Files/...` |

All can be overridden with the `ANTIGRAVITY_BINARY` environment variable.

### WSL Detection (Learned March 2026)
- **`process.platform` returns `'linux'` in WSL**, not `'win32'` — the code must explicitly detect WSL.
- **Detection method:** Read `/proc/version` and check for `/microsoft|wsl/i` regex match.
- **Binary resolution in WSL:** The Windows filesystem is mounted at `/mnt/c/`. Scan `/mnt/c/Users/` (skipping system dirs like `Public`, `Default`) to find user-installed binaries.
- **Process management in WSL:** Use `taskkill.exe` (with `.exe` suffix) instead of `killall`/`taskkill` to invoke the Windows process killer from WSL.

### Cross-Platform Process Kill
| OS | Command |
|---|---|
| **Linux/macOS** | `killall antigravity 2>/dev/null \|\| true` |
| **Windows** | `taskkill /F /IM Antigravity.exe 2>nul \|\| exit 0` |

### Spawn Differences
- **Linux/macOS**: Use `detached: true` to prevent the child from blocking Node
- **Windows**: Use `shell: true` for `.exe` resolution; `detached` is not needed

### Opening New Windows
- If CDP is already active (an Antigravity instance is running), launching the binary with just a directory path (`/usr/share/antigravity/antigravity /path/to/project`) opens a new window in the same Electron process — CDP remains active and discovers the new window.
- After opening, re-discover workbenches via the `/json` endpoint to pick up the new page.

### Closing Windows
- Individual windows can be closed via the CDP `/json/close/{targetId}` endpoint.
- The `targetId` comes from the `/json` endpoint's page listing.
- After closing, re-discover workbenches and reset the active window index if needed.

### CDP Health Checking
- Poll `http://localhost:{port}/json` — if it returns a valid JSON array, CDP is active.
- Filter for `workbench.html` pages (excluding `jetski`) to get the actual IDE windows.

### Recent Projects / Workspace Storage
- Antigravity stores workspace history in `<config>/Antigravity/User/workspaceStorage/`
- Each subdirectory contains `workspace.json` with `{"folder": "file:///absolute/path"}`
- Directory **mtime** indicates when the workspace was last active
- Config root by OS: Linux → `~/.config`, macOS → `~/Library/Application Support`, Windows → `%APPDATA%`
- Filter out `vscode-remote://` entries (remote SSH) and playground dirs
- Use `path.resolve()` (not `path.join()`) when the user provides directory paths — `join(cwd, '/abs/path')` produces wrong results
