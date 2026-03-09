jest.mock('../../src/scraper', () => ({
    getFullAgentState: jest.fn(),
}));
jest.mock('../../src/actions', () => ({
    sendMessage: jest.fn(),
}));
jest.mock('../../src/legacy', () => ({
    waitForResponse: jest.fn(),
}));
jest.mock('../../src/diff', () => ({
    diffStates: jest.fn(),
}));

const { createMockRes, createMockReq, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleChat } = require('../../src/routes/chat');
const { getFullAgentState } = require('../../src/scraper');
const { sendMessage } = require('../../src/actions');
const { waitForResponse } = require('../../src/legacy');

describe('routes/chat', () => {
    afterEach(() => jest.clearAllMocks());

    describe('GET /api/chat/state', () => {
        test('returns current agent state', async () => {
            const mockState = {
                isRunning: false, turnCount: 2, toolCalls: [],
                responses: ['<p>Hello</p>'], error: null,
            };
            getFullAgentState.mockResolvedValue(mockState);
            const res = createMockRes();

            await handleChat(
                { method: 'GET' },
                res,
                createMockUrl('/api/chat/state'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual(mockState);
        });

        test('returns 503 when not connected', async () => {
            const res = createMockRes();

            await handleChat(
                { method: 'GET' },
                res,
                createMockUrl('/api/chat/state'),
                createMockCtx({ workbenchPage: null })
            );

            expect(res.statusCode).toBe(503);
        });

        test('returns 500 on scraper error', async () => {
            getFullAgentState.mockRejectedValue(new Error('Evaluate timeout'));
            const res = createMockRes();

            await handleChat(
                { method: 'GET' },
                res,
                createMockUrl('/api/chat/state'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(500);
            expect(res.json().error).toContain('timeout');
        });
    });

    describe('GET /api/debug/dom', () => {
        test('returns DOM diagnostic data', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                panelTextLen: 5000,
                turnCount: 3,
                toolContainerCount: 2,
            });
            const res = createMockRes();

            await handleChat(
                { method: 'GET' },
                res,
                createMockUrl('/api/debug/dom'),
                ctx
            );

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.panelTextLen).toBe(5000);
        });

        test('returns 503 when not connected', async () => {
            const res = createMockRes();

            await handleChat(
                { method: 'GET' },
                res,
                createMockUrl('/api/debug/dom'),
                createMockCtx({ workbenchPage: null })
            );

            expect(res.statusCode).toBe(503);
        });
    });

    describe('POST /api/chat (blocking)', () => {
        test('sends message and returns response', async () => {
            sendMessage.mockResolvedValue();
            waitForResponse.mockResolvedValue('Agent response text');

            const req = createMockReq('POST', JSON.stringify({ message: 'Hello' }));
            const res = createMockRes();

            await handleChat(req, res, createMockUrl('/api/chat'), createMockCtx());

            expect(sendMessage).toHaveBeenCalled();
            expect(waitForResponse).toHaveBeenCalled();
            expect(res.statusCode).toBe(200);
            expect(res.json().response).toBe('Agent response text');
        });

        test('returns 400 when message is missing', async () => {
            const req = createMockReq('POST', JSON.stringify({}));
            const res = createMockRes();

            await handleChat(req, res, createMockUrl('/api/chat'), createMockCtx());

            expect(res.statusCode).toBe(400);
            expect(res.json().error).toContain('message is required');
        });

        test('returns 503 when not connected', async () => {
            const req = createMockReq('POST', JSON.stringify({ message: 'Hi' }));
            const res = createMockRes();

            await handleChat(
                req, res, createMockUrl('/api/chat'),
                createMockCtx({ workbenchPage: null })
            );

            expect(res.statusCode).toBe(503);
        });

        test('returns 500 on send error', async () => {
            sendMessage.mockRejectedValue(new Error('Click failed'));

            const req = createMockReq('POST', JSON.stringify({ message: 'Hi' }));
            const res = createMockRes();

            await handleChat(req, res, createMockUrl('/api/chat'), createMockCtx());

            expect(res.statusCode).toBe(500);
            expect(res.json().error).toContain('Click failed');
        });
    });

    test('returns false for non-matching paths', async () => {
        const handled = await handleChat(
            { method: 'GET' },
            createMockRes(),
            createMockUrl('/api/other'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });
});
