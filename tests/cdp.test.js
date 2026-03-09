jest.mock('puppeteer-core', () => ({
    connect: jest.fn(),
}));

const puppeteer = require('puppeteer-core');
const { discoverWorkbenches, connectToWorkbench, selectWindow } = require('../src/cdp');

function createMockCtx() {
    return {
        browser: null,
        workbenchPage: null,
        allWorkbenches: [],
        activeWindowIdx: 0,
    };
}

describe('cdp', () => {
    afterEach(() => jest.clearAllMocks());

    describe('discoverWorkbenches()', () => {
        test('connects to browser and discovers workbench pages', async () => {
            const mockPage1 = {
                url: () => 'https://workbench.html/main',
                title: jest.fn().mockResolvedValue('Project - Antigravity'),
            };
            const mockPage2 = {
                url: () => 'https://other-page.html',
                title: jest.fn(),
            };
            const mockPage3 = {
                url: () => 'https://workbench.html/jetski',
                title: jest.fn(),
            };
            const mockBrowser = {
                isConnected: jest.fn().mockReturnValue(false),
                pages: jest.fn().mockResolvedValue([mockPage1, mockPage2, mockPage3]),
            };
            puppeteer.connect.mockResolvedValue(mockBrowser);

            const ctx = createMockCtx();
            const result = await discoverWorkbenches(ctx);

            expect(puppeteer.connect).toHaveBeenCalled();
            expect(result).toHaveLength(1); // Only workbench, not jetski
            expect(result[0].title).toBe('Project - Antigravity');
            expect(ctx.browser).toBe(mockBrowser);
        });

        test('reuses existing connected browser', async () => {
            const mockBrowser = {
                isConnected: jest.fn().mockReturnValue(true),
                pages: jest.fn().mockResolvedValue([]),
            };

            const ctx = createMockCtx();
            ctx.browser = mockBrowser;
            await discoverWorkbenches(ctx);

            expect(puppeteer.connect).not.toHaveBeenCalled();
            expect(mockBrowser.pages).toHaveBeenCalled();
        });

        test('filters out jetski pages', async () => {
            const mockPages = [
                { url: () => 'https://workbench.html/main', title: jest.fn().mockResolvedValue('Main') },
                { url: () => 'https://workbench.html/jetski', title: jest.fn().mockResolvedValue('Jetski') },
            ];
            const mockBrowser = {
                isConnected: jest.fn().mockReturnValue(true),
                pages: jest.fn().mockResolvedValue(mockPages),
            };

            const ctx = { ...createMockCtx(), browser: mockBrowser };
            const result = await discoverWorkbenches(ctx);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Main');
        });
    });

    describe('connectToWorkbench()', () => {
        test('throws when no workbench pages found', async () => {
            const mockBrowser = {
                isConnected: jest.fn().mockReturnValue(true),
                pages: jest.fn().mockResolvedValue([]),
            };

            const ctx = { ...createMockCtx(), browser: mockBrowser };
            await expect(connectToWorkbench(ctx)).rejects.toThrow('No workbench pages found');
        });

        test('sets workbenchPage to first workbench by default', async () => {
            const mockPage = {
                url: () => 'https://workbench.html/main',
                title: jest.fn().mockResolvedValue('Test Window'),
            };
            const mockBrowser = {
                isConnected: jest.fn().mockReturnValue(true),
                pages: jest.fn().mockResolvedValue([mockPage]),
            };

            const ctx = { ...createMockCtx(), browser: mockBrowser };
            await connectToWorkbench(ctx);

            expect(ctx.workbenchPage).toBe(mockPage);
            expect(ctx.activeWindowIdx).toBe(0);
        });
    });

    describe('selectWindow()', () => {
        test('switches to the specified window index', () => {
            const page1 = { page: 'page1' };
            const page2 = { page: 'page2', title: 'Second Window' };
            const ctx = {
                ...createMockCtx(),
                allWorkbenches: [page1, page2],
            };

            const result = selectWindow(ctx, 1);

            expect(ctx.activeWindowIdx).toBe(1);
            expect(ctx.workbenchPage).toBe('page2');
            expect(result).toBe(page2);
        });

        test('throws on invalid index (too high)', () => {
            const ctx = {
                ...createMockCtx(),
                allWorkbenches: [{ title: 'Only' }],
            };

            expect(() => selectWindow(ctx, 5)).toThrow('Invalid window index');
        });

        test('throws on negative index', () => {
            const ctx = {
                ...createMockCtx(),
                allWorkbenches: [{ title: 'Only' }],
            };

            expect(() => selectWindow(ctx, -1)).toThrow('Invalid window index');
        });
    });
});
