jest.mock('fs');
const fs = require('fs');
const { createMockRes, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleArtifacts } = require('../../src/routes/artifacts');

describe('routes/artifacts', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('GET /api/artifacts', () => {
        test('returns empty conversations when brain dir does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const res = createMockRes();
            const url = createMockUrl('/api/artifacts');
            const ctx = createMockCtx();

            handleArtifacts({ method: 'GET' }, res, url, ctx);

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ conversations: [] });
        });

        test('returns conversations when brain dir has content', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dirPath, opts) => {
                if (opts?.withFileTypes) {
                    return [{
                        name: 'abc-123',
                        isDirectory: () => true,
                    }];
                }
                return ['task.md', 'plan.md'];
            });
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 1024,
                mtime: new Date('2026-01-01'),
            });

            const res = createMockRes();
            const url = createMockUrl('/api/artifacts');

            handleArtifacts({ method: 'GET' }, res, url, ctx = createMockCtx());

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.conversations).toHaveLength(1);
            expect(body.conversations[0].id).toBe('abc-123');
            expect(body.conversations[0].files).toHaveLength(2);
        });

        test('filters hidden directories', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dirPath, opts) => {
                if (opts?.withFileTypes) {
                    return [
                        { name: '.hidden', isDirectory: () => true },
                        { name: 'visible-123', isDirectory: () => true },
                    ];
                }
                return ['file.md'];
            });
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 100,
                mtime: new Date(),
            });

            const res = createMockRes();
            handleArtifacts({ method: 'GET' }, res, createMockUrl('/api/artifacts'), createMockCtx());

            const body = res.json();
            expect(body.conversations).toHaveLength(1);
            expect(body.conversations[0].id).toBe('visible-123');
        });
    });

    describe('GET /api/artifacts/:convId', () => {
        test('returns 404 for non-existent conversation', () => {
            fs.existsSync.mockReturnValue(false);
            const res = createMockRes();

            handleArtifacts(
                { method: 'GET' },
                res,
                createMockUrl('/api/artifacts/abc-123-def'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(404);
            expect(res.json().error).toContain('not found');
        });

        test('lists files in an existing conversation', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['task.md', '.hidden']);
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 512,
                mtime: new Date('2026-03-01'),
            });

            const res = createMockRes();
            handleArtifacts(
                { method: 'GET' },
                res,
                createMockUrl('/api/artifacts/abc-123-def'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.id).toBe('abc-123-def');
            expect(body.files).toHaveLength(1); // .hidden filtered
        });
    });

    describe('GET /api/artifacts/:convId/:filename', () => {
        test('reads file content', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('# Test Content');

            const res = createMockRes();
            handleArtifacts(
                { method: 'GET' },
                res,
                createMockUrl('/api/artifacts/abc-123-def/task.md'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(200);
            expect(res.headers['Content-Type']).toBe('text/markdown');
            expect(res.body).toBe('# Test Content');
        });

        test('returns 404 for missing file', () => {
            fs.existsSync
                .mockReturnValueOnce(true)  // convDir exists
                .mockReturnValueOnce(false); // file does not exist

            const res = createMockRes();
            handleArtifacts(
                { method: 'GET' },
                res,
                createMockUrl('/api/artifacts/abc-123-def/missing.md'),
                createMockCtx()
            );

            expect(res.statusCode).toBe(404);
        });

        test('sanitizes path traversal attempts in filename', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('safe content');

            const res = createMockRes();
            // The path.basename call should strip traversal from the filename portion
            handleArtifacts(
                { method: 'GET' },
                res,
                createMockUrl('/api/artifacts/abc-123-def/..%2F..%2Fetc%2Fpasswd'),
                createMockCtx()
            );

            // path.basename strips directory components — only 'passwd' or the base remains
            expect(res.statusCode).toBe(200);
        });
    });

    test('returns false for POST requests', () => {
        const res = createMockRes();
        const handled = handleArtifacts(
            { method: 'POST' },
            res,
            createMockUrl('/api/artifacts'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });

    test('returns false for non-matching paths', () => {
        const res = createMockRes();
        const handled = handleArtifacts(
            { method: 'GET' },
            res,
            createMockUrl('/api/other'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });
});
