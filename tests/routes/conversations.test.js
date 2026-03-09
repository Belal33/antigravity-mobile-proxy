jest.mock('fs');
const fs = require('fs');
const { EventEmitter } = require('events');
const { createMockRes, createMockReq, createMockUrl, createMockCtx } = require('../helpers/mock-http');
const { handleConversations } = require('../../src/routes/conversations');

describe('routes/conversations', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('GET /api/conversations', () => {
        test('returns empty list when brain dir does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const res = createMockRes();

            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations'), createMockCtx());

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ conversations: [] });
        });

        test('returns conversations with titles from task.md', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dirPath, opts) => {
                if (opts?.withFileTypes) {
                    return [{ name: 'conv-123', isDirectory: () => true }];
                }
                return ['task.md', 'plan.md'];
            });
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 512,
                mtime: new Date('2026-03-01'),
            });
            fs.readFileSync.mockReturnValue('# My Task Title\n\n- [x] Done');

            const res = createMockRes();
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations'), createMockCtx());

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.conversations).toHaveLength(1);
            expect(body.conversations[0].id).toBe('conv-123');
            expect(body.conversations[0].title).toBe('My Task Title');
            expect(body.conversations[0].files).toHaveLength(2);
            expect(body.conversations[0].active).toBe(false);
        });

        test('marks active conversation', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dirPath, opts) => {
                if (opts?.withFileTypes) {
                    return [{ name: 'conv-active', isDirectory: () => true }];
                }
                return ['file.md'];
            });
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 100,
                mtime: new Date(),
            });
            fs.readFileSync.mockReturnValue('no heading');

            const ctx = createMockCtx({ activeConversationId: 'conv-active' });
            const res = createMockRes();
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations'), ctx);

            const body = res.json();
            expect(body.conversations[0].active).toBe(true);
        });

        test('filters hidden directories', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dirPath, opts) => {
                if (opts?.withFileTypes) {
                    return [
                        { name: '.secret', isDirectory: () => true },
                        { name: 'visible-456', isDirectory: () => true },
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
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations'), createMockCtx());

            expect(res.json().conversations).toHaveLength(1);
            expect(res.json().conversations[0].id).toBe('visible-456');
        });
    });

    describe('POST /api/conversations/select', () => {
        test('sets active conversation', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['task.md']);
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 256,
                mtime: new Date('2026-03-05'),
            });
            fs.readFileSync.mockReturnValue('# Selected Task');

            const ctx = createMockCtx();
            const req = createMockReq('POST', JSON.stringify({ id: 'conv-999' }));
            const res = createMockRes();

            await handleConversations(req, res, createMockUrl('/api/conversations/select'), ctx);

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.active).toBe(true);
            expect(body.id).toBe('conv-999');
            expect(body.title).toBe('Selected Task');
            expect(ctx.activeConversationId).toBe('conv-999');
        });

        test('returns 400 when id is missing', async () => {
            const req = createMockReq('POST', JSON.stringify({}));
            const res = createMockRes();

            await handleConversations(req, res, createMockUrl('/api/conversations/select'), createMockCtx());

            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('id is required');
        });

        test('returns 404 for non-existent conversation', async () => {
            fs.existsSync.mockReturnValue(false);
            const req = createMockReq('POST', JSON.stringify({ id: 'nonexistent' }));
            const res = createMockRes();

            await handleConversations(req, res, createMockUrl('/api/conversations/select'), createMockCtx());

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/conversations/active', () => {
        test('returns active: false when no conversation selected', () => {
            const res = createMockRes();
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations/active'), createMockCtx());

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ active: false });
        });

        test('returns active conversation data', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['walkthrough.md']);
            fs.statSync.mockReturnValue({
                isFile: () => true,
                size: 800,
                mtime: new Date('2026-03-08'),
            });
            fs.readFileSync.mockReturnValue('# Active Task');

            const ctx = createMockCtx({ activeConversationId: 'conv-active' });
            const res = createMockRes();
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations/active'), ctx);

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.active).toBe(true);
            expect(body.id).toBe('conv-active');
            expect(body.title).toBe('Active Task');
            expect(body.files).toHaveLength(1);
        });

        test('resets when active conversation dir is deleted', () => {
            fs.existsSync.mockReturnValue(false);

            const ctx = createMockCtx({ activeConversationId: 'deleted-conv' });
            const res = createMockRes();
            handleConversations({ method: 'GET' }, res, createMockUrl('/api/conversations/active'), ctx);

            expect(res.json()).toEqual({ active: false });
            expect(ctx.activeConversationId).toBeNull();
        });
    });

    test('returns false for non-matching paths', () => {
        const handled = handleConversations(
            { method: 'GET' },
            createMockRes(),
            createMockUrl('/api/other'),
            createMockCtx()
        );
        expect(handled).toBe(false);
    });
});
