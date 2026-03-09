const { diffStates } = require('../src/diff');

/**
 * Factory to create a minimal agent state for testing.
 */
function makeState(overrides = {}) {
    return {
        isRunning: false,
        turnCount: 1,
        stepGroupCount: 1,
        thinking: [],
        toolCalls: [],
        responses: [],
        notifications: [],
        error: null,
        fileChanges: [],
        lastTurnResponseHTML: '',
        ...overrides,
    };
}

describe('diffStates', () => {
    // ── Thinking ──────────────────────────────────────────────
    describe('thinking events', () => {
        test('emits thinking event for new thinking blocks', () => {
            const prev = makeState({ thinking: [] });
            const curr = makeState({ thinking: [{ time: 'Thought for 3s' }] });

            const events = diffStates(prev, curr);
            const thinkingEvents = events.filter(e => e.type === 'thinking');

            expect(thinkingEvents).toHaveLength(1);
            expect(thinkingEvents[0].data).toEqual({ time: 'Thought for 3s' });
        });

        test('emits multiple thinking events for multiple new blocks', () => {
            const prev = makeState({ thinking: [{ time: 'Thought for 1s' }] });
            const curr = makeState({
                thinking: [{ time: 'Thought for 1s' }, { time: 'Thought for 5s' }, { time: 'Thought for 10s' }],
            });

            const events = diffStates(prev, curr);
            const thinkingEvents = events.filter(e => e.type === 'thinking');

            expect(thinkingEvents).toHaveLength(2);
        });

        test('does not emit thinking events when count is unchanged', () => {
            const state = makeState({ thinking: [{ time: 'Thought for 3s' }] });
            const events = diffStates(state, { ...state });
            expect(events.filter(e => e.type === 'thinking')).toHaveLength(0);
        });
    });

    // ── Tool Calls ────────────────────────────────────────────
    describe('tool call events', () => {
        const tool1 = {
            id: '0', status: 'Running command', type: 'command',
            path: '', command: 'ls', exitCode: null, hasCancelBtn: true,
            footerButtons: ['Cancel'], hasTerminal: true, terminalOutput: 'output',
        };
        const tool1Done = { ...tool1, exitCode: 'Exit code 0', hasCancelBtn: false, footerButtons: [] };

        test('emits new tool_call with isNew=true', () => {
            const prev = makeState({ toolCalls: [] });
            const curr = makeState({ toolCalls: [tool1] });

            const events = diffStates(prev, curr);
            const toolEvents = events.filter(e => e.type === 'tool_call');

            expect(toolEvents).toHaveLength(1);
            expect(toolEvents[0].data.isNew).toBe(true);
            expect(toolEvents[0].data.index).toBe(0);
            expect(toolEvents[0].data.id).toBe('0');
        });

        test('emits updated tool_call with isNew=false on status change', () => {
            const prev = makeState({ toolCalls: [tool1] });
            const curr = makeState({ toolCalls: [tool1Done] });

            const events = diffStates(prev, curr);
            const toolEvents = events.filter(e => e.type === 'tool_call');

            expect(toolEvents).toHaveLength(1);
            expect(toolEvents[0].data.isNew).toBe(false);
            expect(toolEvents[0].data.exitCode).toBe('Exit code 0');
        });

        test('emits updated tool_call on footer button change', () => {
            const prev = makeState({ toolCalls: [{ ...tool1, footerButtons: ['Cancel'] }] });
            const curr = makeState({ toolCalls: [{ ...tool1, footerButtons: ['Allow', 'Deny'] }] });

            const events = diffStates(prev, curr);
            const toolEvents = events.filter(e => e.type === 'tool_call');

            expect(toolEvents).toHaveLength(1);
        });

        test('does not emit tool_call when nothing changed', () => {
            const state = makeState({ toolCalls: [tool1] });
            const events = diffStates(state, { ...state, toolCalls: [{ ...tool1 }] });

            // footerButtons comparison is JSON-based, so identical arrays should match
            const toolEvents = events.filter(e => e.type === 'tool_call');
            expect(toolEvents).toHaveLength(0);
        });

        test('handles both new and updated tools simultaneously', () => {
            const prev = makeState({ toolCalls: [tool1] });
            const curr = makeState({ toolCalls: [tool1Done, { ...tool1, id: '1' }] });

            const events = diffStates(prev, curr);
            const toolEvents = events.filter(e => e.type === 'tool_call');

            expect(toolEvents).toHaveLength(2);
            expect(toolEvents[0].data.isNew).toBe(true);  // new (emitted first)
            expect(toolEvents[1].data.isNew).toBe(false); // updated
        });
    });

    // ── HITL ──────────────────────────────────────────────────
    describe('HITL events', () => {
        const toolWithCancel = {
            id: '0', status: 'Running', type: 'command', path: '',
            command: 'rm -rf /', exitCode: null, hasCancelBtn: true,
            footerButtons: ['Cancel'], hasTerminal: false, terminalOutput: null,
        };
        const toolWithoutCancel = { ...toolWithCancel, hasCancelBtn: false, footerButtons: [] };

        test('emits approval_required when cancel button appears', () => {
            const prev = makeState({ toolCalls: [toolWithoutCancel] });
            const curr = makeState({ toolCalls: [toolWithCancel] });

            const events = diffStates(prev, curr);
            const hitlEvents = events.filter(e => e.type === 'hitl');

            expect(hitlEvents).toHaveLength(1);
            expect(hitlEvents[0].data.action).toBe('approval_required');
        });

        test('emits resolved when cancel button disappears', () => {
            const prev = makeState({ toolCalls: [toolWithCancel] });
            const curr = makeState({ toolCalls: [toolWithoutCancel] });

            const events = diffStates(prev, curr);
            const hitlEvents = events.filter(e => e.type === 'hitl');

            expect(hitlEvents).toHaveLength(1);
            expect(hitlEvents[0].data.action).toBe('resolved');
        });

        test('does not emit HITL when no cancel button change', () => {
            const prev = makeState({ toolCalls: [toolWithCancel] });
            const curr = makeState({ toolCalls: [toolWithCancel] });

            const events = diffStates(prev, curr);
            const hitlEvents = events.filter(e => e.type === 'hitl');

            expect(hitlEvents).toHaveLength(0);
        });
    });

    // ── Responses ─────────────────────────────────────────────
    describe('response events', () => {
        test('emits response for new response blocks', () => {
            const prev = makeState({ responses: [] });
            const curr = makeState({ responses: ['<p>Hello world</p>'], isRunning: false });

            const events = diffStates(prev, curr);
            const responseEvents = events.filter(e => e.type === 'response');

            expect(responseEvents).toHaveLength(1);
            expect(responseEvents[0].data.content).toBe('<p>Hello world</p>');
            expect(responseEvents[0].data.index).toBe(0);
            expect(responseEvents[0].data.partial).toBe(false);
        });

        test('emits partial response when agent is running', () => {
            const prev = makeState({ responses: [] });
            const curr = makeState({ responses: ['partial...'], isRunning: true });

            const events = diffStates(prev, curr);
            const responseEvents = events.filter(e => e.type === 'response');

            expect(responseEvents[0].data.partial).toBe(true);
        });

        test('emits update when last response content changes (streaming)', () => {
            const prev = makeState({ responses: ['Hello'] });
            const curr = makeState({ responses: ['Hello world'] });

            const events = diffStates(prev, curr);
            const responseEvents = events.filter(e => e.type === 'response');

            expect(responseEvents).toHaveLength(1);
            expect(responseEvents[0].data.content).toBe('Hello world');
        });

        test('does not emit when response content is identical', () => {
            const prev = makeState({ responses: ['Same'] });
            const curr = makeState({ responses: ['Same'] });

            const events = diffStates(prev, curr);
            expect(events.filter(e => e.type === 'response')).toHaveLength(0);
        });
    });

    // ── Notifications ─────────────────────────────────────────
    describe('notification events', () => {
        test('emits notification for new blocks', () => {
            const prev = makeState({ notifications: [] });
            const curr = makeState({ notifications: ['<div>Review required</div>'] });

            const events = diffStates(prev, curr);
            const notifEvents = events.filter(e => e.type === 'notification');

            expect(notifEvents).toHaveLength(1);
            expect(notifEvents[0].data.content).toContain('Review required');
        });
    });

    // ── File Changes ──────────────────────────────────────────
    describe('file change events', () => {
        test('emits file_change for new diff entries', () => {
            const prev = makeState({ fileChanges: [] });
            const curr = makeState({ fileChanges: [{ fileName: 'index.js', type: 'diff' }] });

            const events = diffStates(prev, curr);
            const fileEvents = events.filter(e => e.type === 'file_change');

            expect(fileEvents).toHaveLength(1);
            expect(fileEvents[0].data.fileName).toBe('index.js');
        });
    });

    // ── Status ────────────────────────────────────────────────
    describe('status events', () => {
        test('emits status when isRunning changes to true', () => {
            const prev = makeState({ isRunning: false });
            const curr = makeState({ isRunning: true });

            const events = diffStates(prev, curr);
            const statusEvents = events.filter(e => e.type === 'status');

            expect(statusEvents).toHaveLength(1);
            expect(statusEvents[0].data.isRunning).toBe(true);
        });

        test('emits status when isRunning changes to false', () => {
            const prev = makeState({ isRunning: true });
            const curr = makeState({ isRunning: false });

            const events = diffStates(prev, curr);
            const statusEvents = events.filter(e => e.type === 'status');

            expect(statusEvents).toHaveLength(1);
            expect(statusEvents[0].data.isRunning).toBe(false);
        });

        test('does not emit status when isRunning is unchanged', () => {
            const prev = makeState({ isRunning: true });
            const curr = makeState({ isRunning: true });

            const events = diffStates(prev, curr);
            expect(events.filter(e => e.type === 'status')).toHaveLength(0);
        });
    });

    // ── Errors ────────────────────────────────────────────────
    describe('error events', () => {
        test('emits error when error appears', () => {
            const prev = makeState({ error: null });
            const curr = makeState({ error: 'Agent terminated due to error' });

            const events = diffStates(prev, curr);
            const errorEvents = events.filter(e => e.type === 'error');

            expect(errorEvents).toHaveLength(1);
            expect(errorEvents[0].data.message).toBe('Agent terminated due to error');
        });

        test('does not emit error when both states have error', () => {
            const prev = makeState({ error: 'old' });
            const curr = makeState({ error: 'old' });

            const events = diffStates(prev, curr);
            expect(events.filter(e => e.type === 'error')).toHaveLength(0);
        });

        test('does not re-emit when error remains null', () => {
            const prev = makeState({ error: null });
            const curr = makeState({ error: null });

            const events = diffStates(prev, curr);
            expect(events.filter(e => e.type === 'error')).toHaveLength(0);
        });
    });

    // ── Combined scenarios ────────────────────────────────────
    describe('combined scenarios', () => {
        test('returns empty array when states are identical', () => {
            const state = makeState();
            const events = diffStates(state, { ...state });
            expect(events).toEqual([]);
        });

        test('emits multiple event types in a complex diff', () => {
            const prev = makeState({
                isRunning: true,
                thinking: [],
                toolCalls: [],
                responses: [],
            });
            const curr = makeState({
                isRunning: false,
                thinking: [{ time: 'Thought for 5s' }],
                toolCalls: [{
                    id: '0', status: 'Edited', type: 'file', path: 'server.js',
                    command: null, exitCode: null, hasCancelBtn: false,
                    footerButtons: [], hasTerminal: false, terminalOutput: null,
                }],
                responses: ['<p>Done!</p>'],
            });

            const events = diffStates(prev, curr);
            const types = events.map(e => e.type);

            expect(types).toContain('thinking');
            expect(types).toContain('tool_call');
            expect(types).toContain('response');
            expect(types).toContain('status');
        });
    });
});
