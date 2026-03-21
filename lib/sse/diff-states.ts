/**
 * State diffing for SSE stream.
 * Compares two agent states and returns typed events for any changes.
 */

import type { AgentState, SSEStep } from '@/lib/types';
import { logger } from '@/lib/logger';

export function diffStates(prev: AgentState, curr: AgentState): SSEStep[] {
  const events: SSEStep[] = [];

  // New thinking blocks
  if (curr.thinking.length > prev.thinking.length) {
    for (let i = prev.thinking.length; i < curr.thinking.length; i++) {
      events.push({ type: 'thinking', data: curr.thinking[i] as any });
    }
  }

  // New or updated tool calls
  if (curr.toolCalls.length > prev.toolCalls.length) {
    for (let i = prev.toolCalls.length; i < curr.toolCalls.length; i++) {
      logger.debug(
        `[Diff] Detected tool_call change at index ${i}: id=${curr.toolCalls[i]?.id}, status=${curr.toolCalls[i]?.status}`
      );
      events.push({
        type: 'tool_call',
        data: { ...curr.toolCalls[i], index: i, isNew: true } as any,
      });
    }
  }

  // Updated existing tool calls
  const sharedLen = Math.min(prev.toolCalls.length, curr.toolCalls.length);
  for (let i = 0; i < sharedLen; i++) {
    const p = prev.toolCalls[i];
    const c = curr.toolCalls[i];
    const footerChanged =
      JSON.stringify(p.footerButtons) !== JSON.stringify(c.footerButtons);
    if (
      p.status !== c.status ||
      p.exitCode !== c.exitCode ||
      p.hasCancelBtn !== c.hasCancelBtn ||
      footerChanged ||
      // Emit update when terminal output arrives (null → string after command finishes)
      (p.terminalOutput === null && c.terminalOutput !== null)
    ) {
      console.log(
        `[diffStates] UPDATED tool_call at index ${i}: status ${p.status}->${c.status}, exitCode ${p.exitCode}->${c.exitCode}, footerChanged=${footerChanged}`
      );
      events.push({
        type: 'tool_call',
        data: { ...c, index: i, isNew: false } as any,
      });
    }
  }

  // HITL state changes
  // Detect actual HITL approval requests by checking for real approval/deny
  // buttons in footerButtons — NOT hasCancelBtn which just means a command
  // is still executing (the Cancel button on running tools).
  const HITL_APPROVAL_WORDS = [
    'run', 'proceed', 'approve', 'allow', 'yes', 'accept',
    'deny', 'reject',
    'allow once', 'allow this conversation',
  ];
  const hasApprovalButtons = (t: typeof curr.toolCalls[0]) =>
    t.footerButtons &&
    t.footerButtons.some((btn) =>
      HITL_APPROVAL_WORDS.some(
        (w) => btn.toLowerCase() === w || btn.toLowerCase().startsWith(w)
      )
    );
  const prevHITL = prev.toolCalls.some(hasApprovalButtons);
  const currHITL = curr.toolCalls.some(hasApprovalButtons);
  if (currHITL && !prevHITL) {
    const hitlTool = curr.toolCalls.find(hasApprovalButtons);
    events.push({
      type: 'hitl',
      data: { action: 'approval_required', tool: hitlTool } as any,
    });
  } else if (!currHITL && prevHITL) {
    events.push({
      type: 'hitl',
      data: { action: 'resolved' } as any,
    });
  }

  // New response blocks
  if (curr.responses.length > prev.responses.length) {
    for (let i = prev.responses.length; i < curr.responses.length; i++) {
      events.push({
        type: 'response',
        data: {
          content: curr.responses[i],
          index: i,
          partial: curr.isRunning,
        } as any,
      });
    }
  }
  // Updated last response
  if (
    curr.responses.length > 0 &&
    prev.responses.length > 0 &&
    curr.responses.length === prev.responses.length
  ) {
    const lastIdx = curr.responses.length - 1;
    if (curr.responses[lastIdx] !== prev.responses[lastIdx]) {
      events.push({
        type: 'response',
        data: {
          content: curr.responses[lastIdx],
          index: lastIdx,
          partial: curr.isRunning,
        } as any,
      });
    }
  }

  // Notification blocks
  if (curr.notifications.length > prev.notifications.length) {
    for (let i = prev.notifications.length; i < curr.notifications.length; i++) {
      events.push({
        type: 'notification',
        data: { content: curr.notifications[i], index: i } as any,
      });
    }
  }

  // File changes
  if (
    curr.fileChanges &&
    prev.fileChanges &&
    curr.fileChanges.length > prev.fileChanges.length
  ) {
    for (let i = prev.fileChanges.length; i < curr.fileChanges.length; i++) {
      events.push({ type: 'file_change', data: curr.fileChanges[i] as any });
    }
  }

  // Status change
  if (prev.isRunning !== curr.isRunning) {
    events.push({
      type: 'status',
      data: { isRunning: curr.isRunning } as any,
    });
  }

  // Error
  if (curr.error && !prev.error) {
    events.push({
      type: 'error',
      data: { message: curr.error } as any,
    });
  }

  return events;
}
