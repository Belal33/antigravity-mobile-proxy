jest.mock('../../src/actions', () => ({
    clickApproveButton: jest.fn(),
    clickRejectButton: jest.fn(),
}));

const { createMockRes, createMockReq, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleHITL } = require('../../src/routes/hitl');
const { clickApproveButton, clickRejectButton } = require('../../src/actions');

describe('routes/hitl', () => {
    afterEach(() => jest.clearAllMocks());

    describe('POST /api/chat/approve', () => {
        test('clicks approve and returns result', async () => {
            clickApproveButton.mockResolvedValue({ success: true, clicked: 'Allow' });
            const ctx = createMockCtx();
            const res = createMockRes();

            const handled = await handleHITL(
                { method: 'POST' },
                res,
                createMockUrl('/api/chat/approve'),
                ctx
            );

            expect(handled).toBe(true);
            expect(res.statusCode).toBe(200);
            expect(res.json().success).toBe(true);
            expect(ctx.lastActionTimestamp).toBeGreaterThan(0);
        });

        test('returns 503 when not connected', async () => {
            const ctx = createMockCtx({ workbenchPage: null });
            const res = createMockRes();

            await handleHITL(
                { method: 'POST' },
                res,
                createMockUrl('/api/chat/approve'),
                ctx
            );

            expect(res.statusCode).toBe(503);
        });

        test('returns 404 when no approve button found', async () => {
            clickApproveButton.mockResolvedValue({ success: false, error: 'No approve button found' });
            const res = createMockRes();

            await handleHITL(
                { method: 'POST' },
                res,
                createMockUrl('/api/chat/approve'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /api/chat/reject', () => {
        test('clicks reject and returns result', async () => {
            clickRejectButton.mockResolvedValue({ success: true, clicked: 'Deny' });
            const ctx = createMockCtx();
            const res = createMockRes();

            await handleHITL(
                { method: 'POST' },
                res,
                createMockUrl('/api/chat/reject'),
                ctx
            );

            expect(res.statusCode).toBe(200);
            expect(res.json().clicked).toBe('Deny');
            expect(ctx.lastActionTimestamp).toBeGreaterThan(0);
        });

        test('returns 503 when not connected', async () => {
            const ctx = createMockCtx({ workbenchPage: null });
            const res = createMockRes();

            await handleHITL(
                { method: 'POST' },
                res,
                createMockUrl('/api/chat/reject'),
                ctx
            );

            expect(res.statusCode).toBe(503);
        });
    });

    describe('POST /api/chat/action', () => {
        test('clicks specific button by text', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({ success: true, clicked: 'Allow Once' });

            const req = createMockReq('POST', JSON.stringify({ toolId: '5', buttonText: 'Allow Once' }));
            const res = createMockRes();

            await handleHITL(req, res, createMockUrl('/api/chat/action'), ctx);

            expect(res.statusCode).toBe(200);
            expect(res.json().clicked).toBe('Allow Once');
            expect(ctx.lastActionTimestamp).toBeGreaterThan(0);
        });

        test('returns 400 when buttonText missing', async () => {
            const req = createMockReq('POST', JSON.stringify({ toolId: '5' }));
            const res = createMockRes();

            await handleHITL(req, res, createMockUrl('/api/chat/action'), createMockCtx());

            expect(res.statusCode).toBe(400);
            expect(res.json().error).toContain('buttonText is required');
        });

        test('returns 503 when not connected', async () => {
            const ctx = createMockCtx({ workbenchPage: null });
            const req = createMockReq('POST', JSON.stringify({ buttonText: 'Allow' }));
            const res = createMockRes();

            await handleHITL(req, res, createMockUrl('/api/chat/action'), ctx);

            expect(res.statusCode).toBe(503);
        });

        test('returns 404 when button not found', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({ success: false, error: 'Button not found' });

            const req = createMockReq('POST', JSON.stringify({ buttonText: 'NonExistent' }));
            const res = createMockRes();

            await handleHITL(req, res, createMockUrl('/api/chat/action'), ctx);

            expect(res.statusCode).toBe(404);
        });
    });

    test('returns false for GET requests', async () => {
        const handled = await handleHITL(
            { method: 'GET' },
            createMockRes(),
            createMockUrl('/api/chat/approve'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });

    test('returns false for non-matching POST paths', async () => {
        const handled = await handleHITL(
            { method: 'POST' },
            createMockRes(),
            createMockUrl('/api/other'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });
});
