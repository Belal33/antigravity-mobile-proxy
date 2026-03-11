/**
 * Full agent state scraper.
 * Scrapes the Antigravity agent side panel DOM to extract comprehensive state.
 */

import fs from 'fs';
import path from 'path';
import { SELECTORS } from '../cdp/selectors';
import type { ProxyContext, AgentState } from '../types';

const DEBUG_FILE = path.join('/tmp', 'proxy-debug-state.json');

/**
 * Get a comprehensive snapshot of the entire agent panel state.
 * Includes turn-based scoping to isolate the current conversation turn.
 */
export async function getFullAgentState(ctx: ProxyContext): Promise<AgentState> {
  if (!ctx.workbenchPage) {
    return {
      isRunning: false,
      turnCount: 0,
      stepGroupCount: 0,
      thinking: [],
      toolCalls: [],
      responses: [],
      notifications: [],
      error: null,
      fileChanges: [],
      lastTurnResponseHTML: '',
    };
  }

  const state = await ctx.workbenchPage.evaluate((spinnerSel: string) => {
    const getClass = (el: Element | null) =>
      (el?.getAttribute ? el.getAttribute('class') : '') || '';

    interface BrowserToolCall {
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

    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel)
      return {
        isRunning: false,
        turnCount: 0,
        stepGroupCount: 0,
        thinking: [] as { time: string }[],
        toolCalls: [] as BrowserToolCall[],
        responses: [] as string[],
        notifications: [] as string[],
        error: null as string | null,
        fileChanges: [] as { fileName: string; type: string }[],
        lastTurnResponseHTML: '',
      };

    // ── 1. Running state (multi-signal) ──
    let isRunning = false;
    let buttonStateDefinitive = false;

    // Check Chat Input Send/Stop button first (Most reliable indicator)
    let inputArea = document.querySelector('#antigravity\\.agentSidePanelInputBox');
    if (!inputArea) inputArea = panel.querySelector('[id*="InputBox"]');
    
    if (inputArea) {
      const wrapper = inputArea.closest('.flex') || inputArea.parentElement?.parentElement || inputArea.parentElement;
      if (wrapper) {
        (window as any).__proxyInputBoxHTML = wrapper.outerHTML;
        const inputBtns = wrapper.querySelectorAll('button');
        
        let hasStop = false;
        let hasSend = false;
        
        for (const btn of inputBtns) {
          const html = btn.innerHTML || '';
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const text = (btn.textContent || '').trim().toLowerCase();
          
          if (
            html.includes('lucide-square') || 
            html.includes('lucide-circle-stop') || 
            html.includes('lucide-octagon') ||
            ariaLabel.includes('stop') ||
            ariaLabel.includes('cancel') ||
            text === 'stop'
          ) {
            hasStop = true;
          }
          
          if (
            html.includes('lucide-send') || 
            html.includes('lucide-arrow-up') ||
            html.includes('lucide-arrow-right') ||
            html.includes('codicon-send') ||
            html.includes('lucide-corner-down-left') ||
            ariaLabel.includes('send') ||
            ariaLabel.includes('submit') ||
            text === 'send'
          ) {
            hasSend = true;
          }
        }
        
        // Let the stop state win if both mistakenly present, otherwise send state wins
        if (hasStop) {
          isRunning = true;
          buttonStateDefinitive = true;
        } else if (hasSend) {
          isRunning = false;
          buttonStateDefinitive = true;
        }
      }
    }

    // Fallback to other signals only if the input button state was ambiguous
    if (!buttonStateDefinitive) {
      // Signal A: Visible spinner
      const spinners = panel.querySelectorAll(spinnerSel);
      for (const spinner of spinners) {
        let el: Element | null = spinner;
        let hidden = false;
        while (el) {
          const cls = getClass(el);
          if (cls.includes('invisible') || cls.includes('opacity-0')) {
            hidden = true;
            break;
          }
          el = el.parentElement;
        }
        if (!hidden) {
          isRunning = true;
          break;
        }
      }

      // Signal B: General Stop/abort button visible elsewhere in the panel
      if (!isRunning) {
        const allBtns = panel.querySelectorAll('button');
        for (const btn of allBtns) {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          const text = (btn.textContent?.trim() || '').toLowerCase();
          if (
            (text === 'stop' ||
              text === 'abort' ||
              label.includes('stop') ||
              label.includes('abort') ||
              label.includes('interrupt')) &&
            getComputedStyle(btn).display !== 'none' &&
            getComputedStyle(btn).visibility !== 'hidden'
          ) {
            isRunning = true;
            break;
          }
        }
      }
    }

    // ── 2. Turn & Step Group structure ──
    const conversation =
      panel.querySelector('#conversation') ||
      document.querySelector('#conversation');
    const scrollArea = conversation?.querySelector('.overflow-y-auto');
    const msgList = scrollArea?.querySelector('.mx-auto');
    const allTurns = msgList ? Array.from(msgList.children) : [];
    const turnCount = allTurns.length;
    const lastTurn =
      allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;

    const contentDiv =
      lastTurn?.querySelector('.relative.flex.flex-col.gap-y-3') || lastTurn;
    const stepGroups = contentDiv ? Array.from(contentDiv.children) : [];
    const stepGroupCount = stepGroups.length;

    const scopeEl = lastTurn || panel;

    // HITL button detection helper
    const HITL_WORDS = [
      'run', 'proceed', 'approve', 'allow', 'yes', 'accept',
      'continue', 'save', 'confirm', 'deny', 'reject', 'cancel', 'no',
      'allow once', 'allow this conversation', 'ask every time', 'relocate',
    ];
    const isHitlAction = (text: string) => {
      if (!text) return false;
      const lower = text.trim().toLowerCase();
      return HITL_WORDS.some((w) => lower === w || lower.startsWith(w));
    };

    // ── 3. Thinking blocks ──
    const thinking: { time: string }[] = [];
    const thinkingBtns = Array.from(scopeEl.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim().startsWith('Thought for')
    );
    for (const btn of thinkingBtns) {
      thinking.push({ time: btn.textContent!.trim() });
    }

    // ── 4. Tool call steps ──
    const toolCalls: BrowserToolCall[] = [];
    const toolContainers = scopeEl.querySelectorAll(
      '.flex.flex-col.gap-2.border.rounded-lg.my-1'
    );
    let toolCounter = (window as any).__proxyToolCounter || 0;

    for (const container of toolContainers) {
      const el = container as HTMLElement;
      if (!el.dataset.proxyToolId) {
        el.dataset.proxyToolId = String(toolCounter++);
      }
      const proxyToolId = el.dataset.proxyToolId;

      const header = el.querySelector('.mb-1.px-2.py-1.text-sm');
      const statusSpan = header?.querySelector('span.opacity-60');
      const status = statusSpan?.textContent?.trim() || '';

      const pathSpan = el.querySelector('span.font-mono.text-sm');
      const filePath = pathSpan?.textContent?.trim() || '';

      let command = '';
      const pre = el.querySelector('pre.whitespace-pre-wrap');
      if (pre) {
        const preText = pre.textContent?.trim() || '';
        const dollarIdx = preText.indexOf('$');
        if (dollarIdx !== -1) {
          command = preText.substring(dollarIdx + 1).trim();
        }
      }

      let exitCode: string | null = null;
      const allEls = el.querySelectorAll('span, div');
      for (const e of allEls) {
        const t = e.textContent?.trim() || '';
        if (t.startsWith('Exit code')) {
          exitCode = t;
          break;
        }
      }

      const allBtns = Array.from(el.querySelectorAll('button'));
      const hasCancelBtn = allBtns.some(
        (b) => b.textContent?.trim() === 'Cancel'
      );
      const footerButtons = allBtns
        .map((b) => b.textContent?.trim() || '')
        .filter(isHitlAction);

      let type = 'unknown';
      const sl = status.toLowerCase();
      if (sl.includes('command')) type = 'command';
      else if (
        sl.includes('file') ||
        sl.includes('edit') ||
        sl.includes('creat') ||
        sl.includes('writ')
      )
        type = 'file';
      else if (sl.includes('search') || sl.includes('grep')) type = 'search';
      else if (sl.includes('read') || sl.includes('view')) type = 'read';
      else if (sl.includes('brows')) type = 'browser';

      const terminal = el.querySelector('.component-shared-terminal');
      let terminalOutput = '';
      if (terminal) {
        const rows =
          terminal.querySelector('.xterm-rows') ||
          terminal.querySelector('.xterm-screen') ||
          terminal.querySelector('[class*="xterm"]');
        if (rows) terminalOutput = rows.textContent?.substring(0, 500) || '';
        if (!terminalOutput)
          terminalOutput = terminal.textContent?.substring(0, 500) || '';
      }

      toolCalls.push({
        id: proxyToolId,
        status,
        type,
        path: filePath,
        command: command || null,
        exitCode,
        hasCancelBtn,
        footerButtons,
        hasTerminal: !!terminal,
        terminalOutput: terminalOutput || null,
      });
    }
    (window as any).__proxyToolCounter = toolCounter;

    // ── 4b. Inline file-system tools ──
    const fileToolRows = scopeEl.querySelectorAll(
      '.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)'
    );
    const statusPattern =
      /^(Edited|Created|Analyzed|Read|Viewed|Wrote|Replaced|Searching|Deleted|Moved|Renamed|MCP Tool)/i;
    for (const row of fileToolRows) {
      try {
        const rowEl = row as HTMLElement;
        const rowText = rowEl.textContent?.trim() || '';
        const match = rowText.match(statusPattern);
        if (!match) continue;
        const statusText = match[1];

        if (!rowEl.dataset.proxyToolId) {
          rowEl.dataset.proxyToolId = String(toolCounter++);
        }
        const proxyToolId = rowEl.dataset.proxyToolId;

        const allSpans = Array.from(rowEl.querySelectorAll('span'));
        let fileName = '';
        let additions: string | null = null;
        let deletions: string | null = null;
        let lineRange: string | null = null;
        let mcpArgs: string | null = null;
        let mcpOutput: string | null = null;
        let mcpToolName: string | null = null;

        if (statusText.startsWith('MCP')) {
          const nameDiv = rowEl.querySelector(
            '.flex.flex-row.items-center.gap-1.overflow-hidden'
          );
          if (nameDiv) {
            const directTexts: string[] = [];
            for (const child of nameDiv.childNodes) {
              if (child.nodeType === 3)
                directTexts.push((child as Text).textContent!.trim());
            }
            mcpToolName = directTexts.join('').trim() || null;
          }
          if (!mcpToolName) {
            const colonIdx = rowText.indexOf(':');
            if (colonIdx > -1) {
              const afterColon = rowText.substring(colonIdx + 1).trim();
              const cutoff = afterColon.search(/\n|Show|Ran/);
              mcpToolName =
                cutoff > -1
                  ? afterColon.substring(0, cutoff).trim()
                  : afterColon.substring(0, 60).trim();
            }
          }
          fileName = mcpToolName || '';

          const argSpans = allSpans.filter((s) =>
            (s.className || '').startsWith('mtk')
          );
          if (argSpans.length > 0) {
            mcpArgs = argSpans.map((s) => s.textContent).join('').trim();
            if (mcpArgs.length > 500) mcpArgs = mcpArgs.substring(0, 500) + '…';
          }

          const outputLabel = allSpans.find(
            (s) => s.textContent?.trim() === 'Output'
          );
          if (outputLabel) {
            const outputParent =
              outputLabel.closest('.flex.flex-col') ||
              outputLabel.parentElement;
            if (outputParent) {
              const fullText = outputParent.textContent || '';
              const outputIdx = fullText.indexOf('Output');
              if (outputIdx > -1) {
                mcpOutput = fullText.substring(outputIdx + 6).trim();
                if (mcpOutput.length > 500)
                  mcpOutput = mcpOutput.substring(0, 500) + '…';
              }
            }
          }
        } else {
          const fileSpan = allSpans.find((s) => {
            const cls = s.className || '';
            return cls.includes('inline-flex') && cls.includes('items-center');
          });
          fileName = fileSpan?.textContent?.trim() || '';

          const addSpan = allSpans.find((s) =>
            (s.className || '').includes('text-green')
          );
          additions = addSpan?.textContent?.trim() || null;

          const delSpan = allSpans.find((s) =>
            (s.className || '').includes('text-red')
          );
          deletions = delSpan?.textContent?.trim() || null;

          const lineSpan = allSpans.find((s) =>
            /^#L\d/.test(s.textContent?.trim() || '')
          );
          lineRange = lineSpan?.textContent?.trim() || null;
        }

        let type = 'file';
        const sl2 = statusText.toLowerCase();
        if (sl2.includes('search') || sl2.includes('grep')) type = 'search';
        else if (
          sl2.includes('read') ||
          sl2.includes('view') ||
          sl2.includes('analyz')
        )
          type = 'read';
        else if (sl2.startsWith('mcp')) type = 'mcp';

        let allRowBtns = Array.from(rowEl.querySelectorAll('button'));

        let ancestor: HTMLElement | null = rowEl.parentElement;
        let depth = 0;
        const foundPermBtns: HTMLButtonElement[] = [];
        while (ancestor && depth < 5) {
          const siblingBtns = Array.from(
            ancestor.querySelectorAll('button')
          ) as HTMLButtonElement[];
          for (const btn of siblingBtns) {
            const t = (btn.textContent || '').trim().toLowerCase();
            if (isHitlAction(t) && !foundPermBtns.includes(btn)) {
              foundPermBtns.push(btn);
            }
          }
          if (foundPermBtns.length > 0 && foundPermBtns.length < 5) {
            allRowBtns = [...allRowBtns, ...foundPermBtns];
            break;
          }
          ancestor = ancestor.parentElement;
          depth++;
        }

        allRowBtns = [...new Set(allRowBtns)];
        const footerButtons = allRowBtns
          .map((b) => b.textContent?.trim() || '')
          .filter(isHitlAction);
        const hasCancelBtn = footerButtons.some(
          (t) => t.toLowerCase() === 'cancel'
        );

        toolCalls.push({
          id: proxyToolId,
          status: statusText,
          type,
          path: fileName,
          command: null,
          exitCode: null,
          hasCancelBtn,
          footerButtons,
          hasTerminal: false,
          terminalOutput: null,
          additions,
          deletions,
          lineRange,
          mcpToolName,
          mcpArgs,
          mcpOutput,
        });
      } catch {
        // Silent skip for resilience
      }
    }
    (window as any).__proxyToolCounter = toolCounter;

    // ── 4c. Permission dialogs ──
    try {
      const allPanelRows = panel.querySelectorAll(
        '.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)'
      );
      for (const permRow of allPanelRows) {
        const permRowEl = permRow as HTMLElement;
        const permBtns = Array.from(permRowEl.querySelectorAll('button'));
        const permBtnTexts = permBtns
          .map((b) => b.textContent?.trim() || '')
          .filter(Boolean);
        const hasPermButtons = permBtnTexts.some((t) =>
          /^(allow|deny|allow once|allow this conversation)$/i.test(t)
        );
        if (!hasPermButtons) continue;

        const alreadyCaptured =
          permRowEl.dataset?.proxyToolId &&
          toolCalls.some(
            (tc: BrowserToolCall) =>
              tc.id === permRowEl.dataset.proxyToolId &&
              tc.footerButtons.length > 0
          );
        if (alreadyCaptured) continue;

        const actionButtons = permBtnTexts.filter(isHitlAction);
        if (actionButtons.length === 0) continue;

        const lastAnalyzed = [...toolCalls]
          .reverse()
          .find((tc: BrowserToolCall) => /^(Analyzed|Read|Viewed)/i.test(tc.status));

        if (lastAnalyzed && lastAnalyzed.footerButtons.length === 0) {
          lastAnalyzed.footerButtons = actionButtons;
          lastAnalyzed.hasCancelBtn = actionButtons.some(
            (t: string) =>
              t.toLowerCase() === 'deny' || t.toLowerCase() === 'cancel'
          );
        } else {
          if (!permRowEl.dataset.proxyToolId) {
            permRowEl.dataset.proxyToolId = String(
              (window as any).__proxyToolCounter++
            );
          }
          const permText = permRowEl.textContent || '';
          const pathMatch = permText.match(/access to\s+(.+?)(?:\?|$)/i);
          const permPath = pathMatch ? pathMatch[1].trim() : '';

          toolCalls.push({
            id: permRowEl.dataset.proxyToolId,
            status: 'Permission Required',
            type: 'read',
            path: permPath,
            command: null,
            exitCode: null,
            hasCancelBtn: true,
            footerButtons: actionButtons,
            hasTerminal: false,
            terminalOutput: null,
            additions: null,
            deletions: null,
            lineRange: null,
            mcpToolName: null,
            mcpArgs: null,
            mcpOutput: null,
          });
        }
      }
    } catch {
      // Silent skip for resilience
    }

    // Signal C: any tool still executing
    if (!isRunning && toolCalls.some((t: BrowserToolCall) => t.hasCancelBtn && !t.exitCode)) {
      isRunning = true;
    }

    // Signal D: Active task boundary / subagent execution
    if (!isRunning) {
      const lastStepGroup = stepGroups[stepGroups.length - 1];
      if (lastStepGroup) {
        const stepSpinners = lastStepGroup.querySelectorAll('.animate-spin');
        for (const spinner of stepSpinners) {
          if (
            spinner.classList.contains('w-4') &&
            spinner.classList.contains('h-4')
          )
            continue;
          let el: Element | null = spinner;
          let hidden = false;
          while (el && el !== lastStepGroup) {
            const cls = getClass(el);
            if (
              cls.includes('invisible') ||
              cls.includes('opacity-0') ||
              cls.includes('hidden')
            ) {
              hidden = true;
              break;
            }
            el = el.parentElement;
          }
          if (!hidden) {
            isRunning = true;
            break;
          }
        }

        if (!isRunning) {
          const indicators = lastStepGroup.querySelectorAll(
            '.animate-pulse, .in-progress-checkbox, .typing-indicator'
          );
          for (const ind of indicators) {
            let el: Element | null = ind;
            let hidden = false;
            while (el && el !== lastStepGroup) {
              const cls = getClass(el);
              if (
                cls.includes('invisible') ||
                cls.includes('opacity-0') ||
                cls.includes('hidden')
              ) {
                hidden = true;
                break;
              }
              el = el.parentElement;
            }
            if (!hidden) {
              isRunning = true;
              break;
            }
          }
        }

        if (!isRunning) {
          const statusTexts = lastStepGroup.querySelectorAll(
            '[class*="text-sm"][class*="opacity"]'
          );
          for (const st of statusTexts) {
            if (getClass(st).includes('invisible')) continue;
            const txt = (st.textContent || '').toLowerCase();
            if (
              txt.includes('running') ||
              txt.includes('progress') ||
              txt.includes('navigat') ||
              txt.includes('executing') ||
              txt.includes('analyzing') ||
              txt.includes('processing') ||
              txt.includes('subagent') ||
              txt.includes('browser')
            ) {
              isRunning = true;
              break;
            }
          }
        }
      }
    }

    // ── 5. Notify user containers ──
    const notifications: string[] = [];
    const notifyBlocks = scopeEl.querySelectorAll('.notify-user-container');
    for (const block of notifyBlocks) {
      const clone = block.cloneNode(true) as Element;
      clone.querySelectorAll('style, script').forEach((el) => el.remove());
      const html = (clone as HTMLElement).innerHTML?.trim();
      if (html) notifications.push(html);
    }

    // ── 6. Final response blocks ──
    const responses: string[] = [];
    let lastTurnResponseHTML = '';
    const textBlocks = Array.from(
      scopeEl.querySelectorAll('.leading-relaxed.select-text')
    );
    const finalBlocks = textBlocks.filter((el) => {
      let ancestor = el.parentElement;
      let depth = 0;
      while (ancestor && ancestor !== scopeEl && depth < 10) {
        const cls = getClass(ancestor);
        if (cls.includes('max-h-0')) return false;
        ancestor = ancestor.parentElement;
        depth++;
      }
      const text = el.textContent?.trim() || '';
      return !!text;
    });
    for (const block of finalBlocks) {
      const clone = block.cloneNode(true) as Element;
      clone.querySelectorAll('style, script').forEach((el) => el.remove());
      const html = (clone as HTMLElement).innerHTML?.trim();
      if (html) responses.push(html);
    }
    if (finalBlocks.length > 0) {
      lastTurnResponseHTML =
        (finalBlocks[finalBlocks.length - 1] as HTMLElement).innerHTML || '';
    }

    // ── 7. Error detection ──
    let error: string | null = null;
    const panelText = panel.textContent || '';
    const errorPatterns = [
      'Agent terminated due to error',
      'error persists',
      'start a new conversation',
    ];
    for (const pattern of errorPatterns) {
      if (panelText.includes(pattern)) {
        const walker = document.createTreeWalker(
          panel,
          NodeFilter.SHOW_TEXT,
          null
        );
        let n;
        while ((n = walker.nextNode())) {
          if (n.textContent!.includes('Agent terminated')) {
            error = n.textContent!.trim();
            break;
          }
        }
        if (!error) error = '[Agent terminated due to error]';
        break;
      }
    }

    // ── 8. File change cards ──
    const fileChanges: { fileName: string; type: string }[] = [];
    const fileDiffIcons = panel.querySelectorAll('svg.lucide-file-diff');
    for (const icon of fileDiffIcons) {
      const parent = icon.closest('.flex.items-center');
      if (parent) {
        const nameSpan = parent.querySelector('span');
        if (nameSpan) {
          fileChanges.push({
            fileName: nameSpan.textContent?.trim() || '',
            type: 'diff',
          });
        }
      }
    }

    return {
      isRunning,
      turnCount,
      stepGroupCount,
      thinking,
      toolCalls,
      responses,
      notifications,
      error,
      fileChanges,
      lastTurnResponseHTML,
      inputBoxHTML: (window as any).__proxyInputBoxHTML || '',
    };
  }, SELECTORS.spinner);

  // Write debug state to file for inspection
  try {
    const debug = {
      timestamp: new Date().toISOString(),
      isRunning: state.isRunning,
      turnCount: state.turnCount,
      toolCallsCount: state.toolCalls.length,
      responsesCount: state.responses.length,
      rawLastTurnResponseHTML: state.lastTurnResponseHTML,
      extractedResponses: state.responses,
      toolCalls: state.toolCalls,
      thinking: state.thinking,
      notifications: state.notifications,
      error: state.error,
      inputBoxHTML: (state as any).inputBoxHTML || '',
    };
    fs.writeFileSync(DEBUG_FILE, JSON.stringify(debug, null, 2));
  } catch (err) {
    console.error('Failed to write debug file', err);
    // Silent — debug file writing should never break scraping
  }

  return state as AgentState;
}
