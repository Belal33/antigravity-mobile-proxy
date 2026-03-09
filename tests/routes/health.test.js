const { createMockRes, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleHealth } = require('../../src/routes/health');

describe('routes/health', () => {
    test('returns 200 with connected=true when workbenchPage exists', () => {
        const res = createMockRes();
        const url = createMockUrl('/api/health');
        const ctx = createMockCtx();

        const handled = handleHealth({}, res, url, ctx);

        expect(handled).toBe(true);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok', connected: true });
    });

    test('returns connected=false when workbenchPage is null', () => {
        const res = createMockRes();
        const url = createMockUrl('/api/health');
        const ctx = createMockCtx({ workbenchPage: null });

        handleHealth({}, res, url, ctx);

        expect(res.json().connected).toBe(false);
    });

    test('returns false for non-matching paths', () => {
        const res = createMockRes();
        const url = createMockUrl('/api/other');
        const ctx = createMockCtx();

        const handled = handleHealth({}, res, url, ctx);

        expect(handled).toBe(false);
        expect(res.ended).toBe(false);
    });
});
