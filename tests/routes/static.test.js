jest.mock('fs');
const fs = require('fs');
const { createMockRes, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleStatic } = require('../../src/routes/static');

describe('routes/static', () => {
    beforeEach(() => jest.clearAllMocks());

    test('serves index.html for root path', () => {
        const htmlContent = Buffer.from('<!DOCTYPE html><html>test</html>');
        fs.readFile.mockImplementation((filepath, callback) => {
            callback(null, htmlContent);
        });

        const res = createMockRes();
        const handled = handleStatic(
            { method: 'GET' },
            res,
            createMockUrl('/'),
            createMockCtx()
        );

        expect(handled).toBe(true);
        expect(fs.readFile).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBe('text/html');
    });

    test('serves CSS files with correct content type', () => {
        fs.readFile.mockImplementation((filepath, callback) => {
            callback(null, Buffer.from('body { color: red; }'));
        });

        const res = createMockRes();
        handleStatic({ method: 'GET' }, res, createMockUrl('/style.css'), createMockCtx());

        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBe('text/css');
    });

    test('serves JS files with correct content type', () => {
        fs.readFile.mockImplementation((filepath, callback) => {
            callback(null, Buffer.from('console.log("hello")'));
        });

        const res = createMockRes();
        handleStatic({ method: 'GET' }, res, createMockUrl('/app.js'), createMockCtx());

        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBe('application/javascript');
    });

    test('falls back to index.html for missing files (SPA)', () => {
        const indexContent = Buffer.from('<html>SPA</html>');
        let callCount = 0;
        fs.readFile.mockImplementation((filepath, callback) => {
            callCount++;
            if (callCount === 1) {
                callback(new Error('ENOENT'));
            } else {
                callback(null, indexContent);
            }
        });

        const res = createMockRes();
        handleStatic({ method: 'GET' }, res, createMockUrl('/nonexistent'), createMockCtx());

        // First call: file not found, second call: index.html fallback
        expect(fs.readFile).toHaveBeenCalledTimes(2);
        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBe('text/html');
    });

    test('returns 404 when both file and index.html are missing', () => {
        fs.readFile.mockImplementation((filepath, callback) => {
            callback(new Error('ENOENT'));
        });

        const res = createMockRes();
        handleStatic({ method: 'GET' }, res, createMockUrl('/missing'), createMockCtx());

        expect(res.statusCode).toBe(404);
    });

    test('always returns true (catch-all handler)', () => {
        fs.readFile.mockImplementation((filepath, callback) => {
            callback(null, Buffer.from('content'));
        });

        const handled = handleStatic(
            { method: 'GET' },
            createMockRes(),
            createMockUrl('/anything'),
            createMockCtx()
        );

        expect(handled).toBe(true);
    });
});
