/**
 * SSE Stream Regression Tests
 *
 * These tests cover the two production bugs discovered during manual testing:
 *
 * Bug #1: SSE used `event: type\ndata: {...}` format, but the frontend reads
 *         `payload.type` from the JSON data line. The event type was never in
 *         the data payload, so all events were silently dropped.
 *         Fix: Embed event type in JSON: `data: {..., "type":"tool_call"}`
 *
 * Bug #2: `{ type, ...data }` was overwritten when `data` had its own `type`
 *         field (e.g., tool type "command"). The SSE line ended up with
 *         `type: "command"` instead of `type: "tool_call"`.
 *         Fix: Changed to `{ ...data, type }` so the event type always wins.
 */

jest.mock('../../src/scraper', () => ({
    getFullAgentState: jest.fn(),
}));
jest.mock('../../src/actions', () => ({
    sendMessage: jest.fn(),
}));
jest.mock('../../src/legacy', () => ({
    waitForResponse: jest.fn(),
}));
// Use the REAL diffStates — this is critical for testing the full pipeline
const { diffStates: realDiffStates } = jest.requireActual('../../src/diff');
jest.mock('../../src/diff', () => ({
    diffStates: jest.fn(),
}));

const { createMockRes, createMockReq, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleChat } = require('../../src/routes/chat');
const { getFullAgentState } = require('../../src/scraper');
const { sendMessage } = require('../../src/actions');
const { diffStates } = require('../../src/diff');

/**
 * Parse SSE lines from a response body string.
 * Returns array of parsed JSON objects from `data: {...}` lines.
 */
function parseSSELines(body) {
    return body
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => {
            try { return JSON.parse(line.slice(6)); }
            catch { return null; }
        })
        .filter(Boolean);
}

function makeState(overrides = {}) {
    return {
        isRunning: false, turnCount: 1, stepGroupCount: 1,
        thinking: [], toolCalls: [], responses: [],
        notifications: [], error: null, fileChanges: [],
        lastTurnResponseHTML: '',
        ...overrides,
    };
}

describe('SSE stream format (regression)', () => {
    beforeEach(() => jest.clearAllMocks());

    // Helper: create an SSE stream request and let it run through one poll cycle
    async function runSSEStream(stateSequence) {
        jest.useFakeTimers();

        let callCount = 0;
        getFullAgentState.mockImplementation(async () => {
            const state = stateSequence[callCount] || stateSequence[stateSequence.length - 1];
            callCount++;
            return state;
        });

        sendMessage.mockResolvedValue();

        // If diffStates hasn't been set by the test, use real implementation
        if (!diffStates.mock.calls.length && !diffStates.getMockImplementation()) {
            diffStates.mockImplementation(realDiffStates);
        }

        const req = createMockReq('POST', JSON.stringify({ message: 'test' }));
        const res = createMockRes();
        const ctx = createMockCtx();

        const promise = handleChat(req, res, createMockUrl('/api/chat/stream'), ctx);

        // Let the req 'data'/'end' events fire
        await jest.advanceTimersByTimeAsync(0);
        // Let the sendMessage and initial state capture run
        await jest.advanceTimersByTimeAsync(0);
        // Advance one poll interval
        await jest.advanceTimersByTimeAsync(500);

        // Abort the stream to stop the interval
        req.emit('close');
        await promise;

        jest.useRealTimers();
        return { res, events: parseSSELines(res.body) };
    }

    // ───────────────────────────────────────────
    // Bug #1: SSE format uses data: lines with type in JSON
    // ───────────────────────────────────────────

    test('SSE events use data: lines with type inside JSON (not event: headers)', async () => {
        const state = makeState();
        const { res } = await runSSEStream([state]);

        // Verify NO `event:` headers in the raw output
        const lines = res.body.split('\n');
        const eventHeaders = lines.filter(l => l.startsWith('event:'));
        expect(eventHeaders).toHaveLength(0);

        // Verify ALL data lines are valid JSON with a `type` field
        const dataLines = lines.filter(l => l.startsWith('data: '));
        expect(dataLines.length).toBeGreaterThan(0);

        for (const line of dataLines) {
            const json = JSON.parse(line.slice(6));
            expect(json).toHaveProperty('type');
            expect(typeof json.type).toBe('string');
        }
    });

    test('initial status events have correct type field', async () => {
        const state = makeState();
        const { events } = await runSSEStream([state]);

        const statusEvents = events.filter(e => e.type === 'status');
        expect(statusEvents.length).toBeGreaterThanOrEqual(2);
        expect(statusEvents[0]).toMatchObject({ type: 'status', isRunning: true, phase: 'sending' });
        expect(statusEvents[1]).toMatchObject({ type: 'status', isRunning: true, phase: 'waiting' });
    });

    // ───────────────────────────────────────────
    // Bug #2: Tool data's type field overriding event type
    // ───────────────────────────────────────────

    test('tool_call event type is preserved even when data has type="command"', async () => {
        const tool = { id: '0', type: 'command', status: 'Ran command', hasCancelBtn: false, exitCode: null, footerButtons: [] };

        // State 0: no tools (initial). State 1: one tool appears.
        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: [tool], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const toolEvents = events.filter(e => e.type === 'tool_call');
        expect(toolEvents.length).toBeGreaterThanOrEqual(1);
        expect(toolEvents[0].type).toBe('tool_call');
        expect(toolEvents[0].id).toBe('0');
        expect(toolEvents[0].status).toBe('Ran command');
    });

    test('tool_call event type is preserved when data has type="read"', async () => {
        const tool = { id: '1', type: 'read', status: 'Analyzed', hasCancelBtn: false, exitCode: null, footerButtons: [] };

        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: [tool], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const toolEvents = events.filter(e => e.type === 'tool_call');
        expect(toolEvents.length).toBeGreaterThanOrEqual(1);
        expect(toolEvents[0].type).toBe('tool_call');
    });

    test('tool_call event type is preserved when data has type="file"', async () => {
        const tool = { id: '2', type: 'file', status: 'Edited', hasCancelBtn: false, exitCode: null, footerButtons: [] };

        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: [tool], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const toolEvents = events.filter(e => e.type === 'tool_call');
        expect(toolEvents.length).toBeGreaterThanOrEqual(1);
        expect(toolEvents[0].type).toBe('tool_call');
    });

    test('tool_call event type is preserved when data has type="browser"', async () => {
        const tool = { id: '3', type: 'browser', status: 'Navigating', hasCancelBtn: false, exitCode: null, footerButtons: [] };

        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: [tool], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const toolEvents = events.filter(e => e.type === 'tool_call');
        expect(toolEvents.length).toBeGreaterThanOrEqual(1);
        expect(toolEvents[0].type).toBe('tool_call');
    });

    test('response event type is preserved in SSE output', async () => {
        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, responses: ['<p>Hello</p>'], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const responseEvents = events.filter(e => e.type === 'response');
        expect(responseEvents.length).toBeGreaterThanOrEqual(1);
        expect(responseEvents[0].type).toBe('response');
        expect(responseEvents[0].content).toBe('<p>Hello</p>');
    });

    test('hitl event with nested tool.type does not override event type', async () => {
        const tool = { id: '5', type: 'command', status: 'Run command?', hasCancelBtn: true, exitCode: null, footerButtons: ['Allow', 'Deny'] };

        // State 0: no HITL. State 1: tool with cancel button appears.
        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: [tool], isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const hitlEvents = events.filter(e => e.type === 'hitl');
        expect(hitlEvents.length).toBeGreaterThanOrEqual(1);
        expect(hitlEvents[0].type).toBe('hitl');
        expect(hitlEvents[0].action).toBe('approval_required');
    });

    // ───────────────────────────────────────────
    // Combined: multiple tool types in one turn
    // ───────────────────────────────────────────

    test('multiple tool_call events preserve correct type for each', async () => {
        const tools = [
            { id: '10', type: 'read', status: 'Analyzed', hasCancelBtn: false, exitCode: null, footerButtons: [] },
            { id: '11', type: 'file', status: 'Edited', hasCancelBtn: false, exitCode: null, footerButtons: [] },
            { id: '12', type: 'command', status: 'Ran command', hasCancelBtn: false, exitCode: 'Exit code 0', footerButtons: [] },
        ];

        const state0 = makeState({ turnCount: 1 });
        const state1 = makeState({ turnCount: 2, toolCalls: tools, isRunning: true });

        const { events } = await runSSEStream([state0, state1]);

        const toolEvents = events.filter(e => e.type === 'tool_call');
        expect(toolEvents.length).toBe(3);
        // ALL must have type='tool_call', not their tool type
        for (const evt of toolEvents) {
            expect(evt.type).toBe('tool_call');
        }
        // Verify individual tool data is preserved
        expect(toolEvents[0].id).toBe('10');
        expect(toolEvents[1].id).toBe('11');
        expect(toolEvents[2].id).toBe('12');
    });
});
