const { createMockCtx } = require('./helpers/mock-http');

// Mock dependencies
jest.mock('../src/utils', () => ({
    sleep: jest.fn().mockResolvedValue(),
}));

const {
    getAgentResponseText,
    getResponseBlockCount,
    isAgentRunning,
    checkForAgentError,
    waitForResponse,
} = require('../src/legacy');

describe('legacy', () => {
    afterEach(() => jest.clearAllMocks());

    describe('getAgentResponseText()', () => {
        test('returns text from the last response block', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue('The final response text');

            const result = await getAgentResponseText(ctx);
            expect(result).toBe('The final response text');
        });

        test('returns empty string when panel is missing', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue('');

            const result = await getAgentResponseText(ctx);
            expect(result).toBe('');
        });
    });

    describe('getResponseBlockCount()', () => {
        test('returns count of response blocks', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(5);

            const result = await getResponseBlockCount(ctx);
            expect(result).toBe(5);
        });

        test('returns 0 when no blocks', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(0);

            const result = await getResponseBlockCount(ctx);
            expect(result).toBe(0);
        });
    });

    describe('isAgentRunning()', () => {
        test('returns true when spinner is visible', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(true);

            const result = await isAgentRunning(ctx);
            expect(result).toBe(true);
        });

        test('returns false when no spinner', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(false);

            const result = await isAgentRunning(ctx);
            expect(result).toBe(false);
        });

        test('passes spinner selector to evaluate', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(false);

            await isAgentRunning(ctx);

            const call = ctx.workbenchPage.evaluate.mock.calls[0];
            expect(call[1]).toContain('animate-spin');
        });
    });

    describe('checkForAgentError()', () => {
        test('returns error message when error detected', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue('Agent terminated due to error');

            const result = await checkForAgentError(ctx);
            expect(result).toBe('Agent terminated due to error');
        });

        test('returns null when no error', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(null);

            const result = await checkForAgentError(ctx);
            expect(result).toBeNull();
        });
    });

    describe('waitForResponse()', () => {
        test('returns quick response when blocks appear before spinner', async () => {
            const ctx = createMockCtx();
            let callCount = 0;

            // Mock sequence: getResponseBlockCount returns 0 first, then 1
            // isAgentRunning always false, getAgentResponseText returns response
            ctx.workbenchPage.evaluate.mockImplementation((fn, ...args) => {
                callCount++;
                // getResponseBlockCount calls (even calls)
                // isAgentRunning calls (odd calls after first)
                // We simulate: first call = blockCount(0), then alternate running(false)/blockCount(1)
                if (callCount === 1) return Promise.resolve(0); // initial block count
                if (callCount === 2) return Promise.resolve(false); // not running
                if (callCount === 3) return Promise.resolve(1); // new block appeared!
                if (callCount === 4) return Promise.resolve(false); // not running (quick check)
                return Promise.resolve('Quick response text'); // getAgentResponseText
            });

            const result = await waitForResponse(ctx, 'test message');
            expect(result).toBe('Quick response text');
        });

        test('returns error message when agent error detected', async () => {
            const ctx = createMockCtx();
            let callCount = 0;

            ctx.workbenchPage.evaluate.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(0); // block count
                if (callCount === 2) return Promise.resolve(true); // isRunning = true (started)
                // Phase 2: error detected
                return Promise.resolve('Agent terminated due to error');
            });

            const result = await waitForResponse(ctx, 'test');
            expect(result).toContain('Agent terminated');
        });

        test('returns fallback when agent never starts', async () => {
            const ctx = createMockCtx();

            // Always return 0 blocks and not running
            ctx.workbenchPage.evaluate.mockImplementation(() => {
                return Promise.resolve(0); // 0 for block count, false-ish for running
            });

            const result = await waitForResponse(ctx, 'test', 1000);
            // Should return something (either empty or fallback message)
            expect(typeof result).toBe('string');
        });
    });
});
