const { SELECTORS } = require('../src/selectors');

describe('selectors', () => {
    test('exports a SELECTORS object', () => {
        expect(SELECTORS).toBeDefined();
        expect(typeof SELECTORS).toBe('object');
    });

    test('contains all required selector keys', () => {
        const requiredKeys = ['chatInput', 'messageList', 'conversation', 'spinner'];
        for (const key of requiredKeys) {
            expect(SELECTORS).toHaveProperty(key);
            expect(typeof SELECTORS[key]).toBe('string');
            expect(SELECTORS[key].length).toBeGreaterThan(0);
        }
    });

    test('chatInput targets a contenteditable textbox', () => {
        expect(SELECTORS.chatInput).toContain('contenteditable');
        expect(SELECTORS.chatInput).toContain('textbox');
    });

    test('spinner targets animate-spin class', () => {
        expect(SELECTORS.spinner).toContain('animate-spin');
    });
});
