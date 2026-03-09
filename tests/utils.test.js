const { sleep } = require('../src/utils');

describe('utils', () => {
    describe('sleep()', () => {
        test('resolves after the specified delay', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40); // Allow minor timing variance
        });

        test('resolves with undefined', async () => {
            const result = await sleep(10);
            expect(result).toBeUndefined();
        });

        test('returns a promise', () => {
            const result = sleep(10);
            expect(result).toBeInstanceOf(Promise);
        });
    });
});
