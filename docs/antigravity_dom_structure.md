# Antigravity IDE — Agent DOM Structure

> Compiled during remote access scraping optimizations — April 2026

The Antigravity agent interfaces with the IDE through an Electron-rendered web view. The primary container for the agent is `.antigravity-agent-side-panel`.

## Root Containers

```css
.antigravity-agent-side-panel
└── #conversation
    └── .overflow-y-auto
        └── .mx-auto (main flex-column holding all turns)
            ├── child div (Turn 1)
            ├── child div (Turn n...)
            └── child div (Last Turn / active context)
```

## Turn Structure
Each turn represents one back-and-forth interaction (prompt + agent execution). The last turn in `.mx-auto` contains the active steps.

```css
.mx-auto > div (A Turn)
├── div.user-prompt (The user's query)
├── div.thinking-blocks
└── div.agent-responses-and-tools
    ├── p (Markdown prose output)
    ├── .flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2) (Tool Action Group)
    └── div.my-1.flex.w-full.items-center.justify-between (Permission Dialog)
```

## Tool Action Cards (Execution, Viewing, Editing)
Regular tool executions (file reads, commands, searches) use a consistent `.flex` container structure that can be easily parsed.

**Selector:** `.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)`

```css
.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)
└── div
    ├── button (Expand/Collapse accordion)
    ├── .grow.min-w-0
    │   ├── .text-xs (Tool Status e.g., "Ran background command")
    │   └── .opacity-60 (Tool target e.g., "ls -al")
    └── .flex.items-center.gap-1.opacity-0.group-hover:opacity-100
        └── div[role="button"] (Cancel/Interrupt button, if active)
```
*Note: We inject a custom `data-proxy-tool-id` attribute on these row elements to track state continuity across SSE chunks because the IDE employs virtualization.*

## Permission Dialogs (HITL)
When the framework needs Human-in-the-Loop (HITL) permission for a sensitive action, it DOES NOT use the standard Tool Action Card structure. It floats the dialog anywhere in the turn, often outside the `space-y-2` layout.

**Detection Strategy:** Broad Regex scan of `<button>` text instead of structural selectors.

```css
/* Example layout of a permission prompt container */
div.my-1.flex.w-full.flex-wrap.items-center.justify-between
├── div.px-2.py-1
│   └── "The agent needs access to read /path/to/file?"
└── div.ml-auto.flex.flex-row.gap-x-2.gap-y-2
    ├── button ("Deny")
    ├── button ("Allow Once")
    └── button ("Allow This Conversation")
```

Because these elements can appear inside `.mx-auto` distinct from the execution card that caused them, the robust way to capture them is scanning the full `.antigravity-agent-side-panel` for text matching `/^(allow|deny|allow once|allow this conversation|block)$/i` and walking up to find a shared parent.

## Changes Overview Panel (File Diff Viewing)
For reviewing multi-file changes at the end of an edit session.

```css
.antigravity-agent-side-panel
└── div.absolute.inset-0.bg-ide-background (Changes Panel overlay)
    ├── .flex.items-center.justify-between (Header with "Accept All" / "Reject All")
    └── .overflow-y-auto
        └── .group.flex.flex-col (Individual File Change)
            ├── .flex.items-center.justify-between (File name row)
            │   ├── span (Filename)
            │   └── div (Accept/Reject individual buttons)
            └── .font-mono.text-xs (Diff view container)
```

## Useful Proxies & Attributes
- `__proxyToolCounter` on `window` tracks assigned tool IDs.
- `__oldNodeMap` on `window` caches text content to detect React virtualization churn.
- `.animate-spin.w-4.h-4` is explicitly checked to determine if a generic step is actively spinning (e.g., reading workspace), which indicates `isRunning: true` when no specific tool call is active.
