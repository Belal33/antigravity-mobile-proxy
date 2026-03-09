const { createMockCtx } = require('./helpers/mock-http');
const { getFullAgentState } = require('../src/scraper');

describe('scraper', () => {
    describe('getFullAgentState()', () => {
        test('returns correct state shape when panel exists', async () => {
            const mockState = {
                isRunning: false,
                turnCount: 3,
                stepGroupCount: 2,
                thinking: [{ time: 'Thought for 5s' }],
                toolCalls: [],
                responses: ['<p>Response</p>'],
                notifications: [],
                error: null,
                fileChanges: [],
                lastTurnResponseHTML: '<p>Response</p>',
            };
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(mockState);

            const result = await getFullAgentState(ctx);

            expect(result).toEqual(mockState);
            expect(ctx.workbenchPage.evaluate).toHaveBeenCalledTimes(1);
        });

        test('returns empty state when panel is missing', async () => {
            const emptyState = {
                isRunning: false, turnCount: 0, stepGroupCount: 0,
                thinking: [], toolCalls: [], responses: [],
                notifications: [], error: null, fileChanges: [],
                lastTurnResponseHTML: '',
            };
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(emptyState);

            const result = await getFullAgentState(ctx);

            expect(result.isRunning).toBe(false);
            expect(result.turnCount).toBe(0);
            expect(result.toolCalls).toEqual([]);
            expect(result.responses).toEqual([]);
        });

        test('passes spinner selector to evaluate', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({});

            await getFullAgentState(ctx);

            // The second argument to evaluate should be the spinner selector
            const call = ctx.workbenchPage.evaluate.mock.calls[0];
            expect(call.length).toBe(2);
            expect(call[1]).toContain('animate-spin');
        });

        test('detects running state from tool calls with cancel buttons', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                isRunning: true,
                turnCount: 1,
                stepGroupCount: 1,
                thinking: [],
                toolCalls: [{
                    id: '0', status: 'Running command', type: 'command',
                    hasCancelBtn: true, exitCode: null,
                    footerButtons: ['Cancel'], hasTerminal: true,
                }],
                responses: [],
                notifications: [],
                error: null,
                fileChanges: [],
                lastTurnResponseHTML: '',
            });

            const result = await getFullAgentState(ctx);
            expect(result.isRunning).toBe(true);
        });

        test('detects error state', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                isRunning: false, turnCount: 1, stepGroupCount: 0,
                thinking: [], toolCalls: [], responses: [],
                notifications: [], fileChanges: [],
                error: 'Agent terminated due to error',
                lastTurnResponseHTML: '',
            });

            const result = await getFullAgentState(ctx);
            expect(result.error).toBe('Agent terminated due to error');
        });

        test('captures MCP tool calls', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                isRunning: false, turnCount: 1, stepGroupCount: 1,
                thinking: [], responses: [], notifications: [],
                error: null, fileChanges: [], lastTurnResponseHTML: '',
                toolCalls: [{
                    id: '5', status: 'MCP Tool', type: 'mcp',
                    mcpToolName: 'query-docs', mcpArgs: '{"query":"test"}',
                    mcpOutput: 'Documentation found',
                    path: 'query-docs', command: null, exitCode: null,
                    hasCancelBtn: false, footerButtons: [],
                    hasTerminal: false, terminalOutput: null,
                }],
            });

            const result = await getFullAgentState(ctx);
            expect(result.toolCalls[0].type).toBe('mcp');
            expect(result.toolCalls[0].mcpToolName).toBe('query-docs');
        });

        test('propagates evaluate errors', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockRejectedValue(new Error('Page crashed'));

            await expect(getFullAgentState(ctx)).rejects.toThrow('Page crashed');
        });
    });
});
