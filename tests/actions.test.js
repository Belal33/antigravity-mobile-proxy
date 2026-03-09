const { createMockCtx } = require('./helpers/mock-http');
const { sendMessage, clickApproveButton, clickRejectButton } = require('../src/actions');

// Speed up tests by mocking sleep
jest.mock('../src/utils', () => ({
    sleep: jest.fn().mockResolvedValue(),
}));

describe('actions', () => {
    afterEach(() => jest.clearAllMocks());

    describe('sendMessage()', () => {
        test('clicks input, types message, and presses Enter', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(undefined);

            await sendMessage(ctx, 'Hello world');

            // Should click the chat input
            expect(ctx.workbenchPage.click).toHaveBeenCalledTimes(1);
            expect(ctx.workbenchPage.click).toHaveBeenCalledWith(
                expect.stringContaining('contenteditable')
            );

            // Should call evaluate to insert text
            expect(ctx.workbenchPage.evaluate).toHaveBeenCalledTimes(1);

            // Should press Enter
            expect(ctx.workbenchPage.keyboard.press).toHaveBeenCalledWith('Enter');
        });

        test('handles long messages (logs truncated)', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue(undefined);
            const longMsg = 'a'.repeat(200);

            await sendMessage(ctx, longMsg);

            // Should still work — no errors thrown
            expect(ctx.workbenchPage.keyboard.press).toHaveBeenCalledWith('Enter');
        });
    });

    describe('clickApproveButton()', () => {
        test('returns success result when button found', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                success: true, clicked: 'Allow',
            });

            const result = await clickApproveButton(ctx);

            expect(result.success).toBe(true);
            expect(result.clicked).toBe('Allow');
        });

        test('returns failure when no button found', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                success: false, error: 'No approve button found',
            });

            const result = await clickApproveButton(ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No approve button');
        });

        test('returns failure when panel is missing', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                success: false, error: 'No panel found',
            });

            const result = await clickApproveButton(ctx);

            expect(result.success).toBe(false);
        });
    });

    describe('clickRejectButton()', () => {
        test('returns success when reject/cancel button clicked', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                success: true, clicked: 'Deny',
            });

            const result = await clickRejectButton(ctx);

            expect(result.success).toBe(true);
            expect(result.clicked).toBe('Deny');
        });

        test('returns failure when no reject button found', async () => {
            const ctx = createMockCtx();
            ctx.workbenchPage.evaluate.mockResolvedValue({
                success: false, error: 'No reject/cancel button found',
            });

            const result = await clickRejectButton(ctx);

            expect(result.success).toBe(false);
        });
    });
});
