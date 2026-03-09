jest.mock('../../src/cdp', () => ({
    discoverWorkbenches: jest.fn(),
    selectWindow: jest.fn(),
}));

const { createMockRes, createMockReq, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleWindows } = require('../../src/routes/windows');
const { discoverWorkbenches, selectWindow } = require('../../src/cdp');

describe('routes/windows', () => {
    afterEach(() => jest.clearAllMocks());

    describe('GET /api/windows', () => {
        test('lists discovered workbench windows', async () => {
            const ctx = createMockCtx();
            ctx.allWorkbenches = [
                { title: 'Window 1' },
                { title: 'Window 2' },
            ];
            ctx.activeWindowIdx = 0;
            discoverWorkbenches.mockResolvedValue(ctx.allWorkbenches);

            const res = createMockRes();
            const handled = await handleWindows(
                { method: 'GET' },
                res,
                createMockUrl('/api/windows'),
                ctx
            );

            expect(handled).toBe(true);
            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.windows).toHaveLength(2);
            expect(body.windows[0].active).toBe(true);
            expect(body.windows[1].active).toBe(false);
        });

        test('returns error when discovery fails', async () => {
            discoverWorkbenches.mockRejectedValue(new Error('CDP failed'));

            const res = createMockRes();
            await handleWindows(
                { method: 'GET' },
                res,
                createMockUrl('/api/windows'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(500);
            expect(res.json().error).toContain('CDP failed');
        });
    });

    describe('POST /api/windows/select', () => {
        test('switches to specified window', async () => {
            const ctx = createMockCtx();
            discoverWorkbenches.mockResolvedValue([]);
            selectWindow.mockReturnValue({ title: 'Selected Window' });

            const req = createMockReq('POST', JSON.stringify({ index: 1 }));
            const res = createMockRes();

            const handled = await handleWindows(
                req,
                res,
                createMockUrl('/api/windows/select'),
                ctx
            );

            expect(handled).toBe(true);
            expect(res.statusCode).toBe(200);
            expect(res.json().selected.title).toBe('Selected Window');
        });

        test('returns 400 when index is missing', async () => {
            const req = createMockReq('POST', JSON.stringify({}));
            const res = createMockRes();

            await handleWindows(
                req,
                res,
                createMockUrl('/api/windows/select'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(400);
            expect(res.json().error).toContain('index is required');
        });

        test('returns 400 on invalid index', async () => {
            discoverWorkbenches.mockResolvedValue([]);
            selectWindow.mockImplementation(() => { throw new Error('Invalid window index'); });

            const req = createMockReq('POST', JSON.stringify({ index: 99 }));
            const res = createMockRes();

            await handleWindows(
                req,
                res,
                createMockUrl('/api/windows/select'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(400);
        });
    });

    test('returns false for non-matching paths', async () => {
        const handled = await handleWindows(
            { method: 'GET' },
            createMockRes(),
            createMockUrl('/api/other'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });
});
