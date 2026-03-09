/**
 * State diffing for SSE stream.
 * Compares two agent states and returns typed events for any changes.
 */

function diffStates(prev, curr) {
    const events = [];

    // New thinking blocks
    if (curr.thinking.length > prev.thinking.length) {
        for (let i = prev.thinking.length; i < curr.thinking.length; i++) {
            events.push({ type: 'thinking', data: curr.thinking[i] });
        }
    }

    // New or updated tool calls
    if (curr.toolCalls.length > prev.toolCalls.length) {
        for (let i = prev.toolCalls.length; i < curr.toolCalls.length; i++) {
            console.log(`[diffStates] NEW tool_call at index ${i}: id=${curr.toolCalls[i]?.id}, status=${curr.toolCalls[i]?.status}`);
            events.push({ type: 'tool_call', data: { ...curr.toolCalls[i], index: i, isNew: true } });
        }
    }
    // Updated existing tool calls (status change, exit code appeared, cancel disappeared)
    const sharedLen = Math.min(prev.toolCalls.length, curr.toolCalls.length);
    for (let i = 0; i < sharedLen; i++) {
        const p = prev.toolCalls[i];
        const c = curr.toolCalls[i];
        const footerChanged = JSON.stringify(p.footerButtons) !== JSON.stringify(c.footerButtons);
        if (p.status !== c.status || p.exitCode !== c.exitCode || p.hasCancelBtn !== c.hasCancelBtn || footerChanged) {
            console.log(`[diffStates] UPDATED tool_call at index ${i}: status ${p.status}->${c.status}, exitCode ${p.exitCode}->${c.exitCode}, footerChanged=${footerChanged}`);
            events.push({ type: 'tool_call', data: { ...c, index: i, isNew: false } });
        }
    }

    // HITL: cancel button appeared on any tool call
    const prevHITL = prev.toolCalls.some(t => t.hasCancelBtn);
    const currHITL = curr.toolCalls.some(t => t.hasCancelBtn);
    if (currHITL && !prevHITL) {
        const hitlTool = curr.toolCalls.find(t => t.hasCancelBtn);
        events.push({ type: 'hitl', data: { action: 'approval_required', tool: hitlTool } });
    } else if (!currHITL && prevHITL) {
        events.push({ type: 'hitl', data: { action: 'resolved' } });
    }

    // New response blocks
    if (curr.responses.length > prev.responses.length) {
        for (let i = prev.responses.length; i < curr.responses.length; i++) {
            events.push({ type: 'response', data: { content: curr.responses[i], index: i, partial: curr.isRunning } });
        }
    }
    // Updated last response (text grew)
    if (curr.responses.length > 0 && prev.responses.length > 0 &&
        curr.responses.length === prev.responses.length) {
        const lastIdx = curr.responses.length - 1;
        if (curr.responses[lastIdx] !== prev.responses[lastIdx]) {
            events.push({ type: 'response', data: { content: curr.responses[lastIdx], index: lastIdx, partial: curr.isRunning } });
        }
    }

    // Notification blocks
    if (curr.notifications.length > prev.notifications.length) {
        for (let i = prev.notifications.length; i < curr.notifications.length; i++) {
            events.push({ type: 'notification', data: { content: curr.notifications[i], index: i } });
        }
    }

    // File changes
    if (curr.fileChanges && prev.fileChanges && curr.fileChanges.length > prev.fileChanges.length) {
        for (let i = prev.fileChanges.length; i < curr.fileChanges.length; i++) {
            events.push({ type: 'file_change', data: curr.fileChanges[i] });
        }
    }

    // Status change
    if (prev.isRunning !== curr.isRunning) {
        events.push({ type: 'status', data: { isRunning: curr.isRunning } });
    }

    // Error
    if (curr.error && !prev.error) {
        events.push({ type: 'error', data: { message: curr.error } });
    }

    return events;
}

module.exports = { diffStates };
