/**
 * Reusable mock HTTP request/response/url factories for testing route handlers.
 */

const { EventEmitter } = require('events');

/**
 * Create a mock HTTP response object.
 */
function createMockRes() {
    const res = {
        statusCode: null,
        headers: {},
        body: '',
        ended: false,
        writeHead(code, headers = {}) {
            res.statusCode = code;
            Object.assign(res.headers, headers);
        },
        setHeader(name, value) {
            res.headers[name] = value;
        },
        write(chunk) {
            res.body += chunk;
        },
        end(data) {
            if (data) res.body += data;
            res.ended = true;
        },
        // Helper to parse JSON body
        json() {
            try {
                return JSON.parse(res.body);
            } catch {
                return null;
            }
        },
    };
    return res;
}

/**
 * Create a mock HTTP request object.
 * @param {string} method - HTTP method
 * @param {string} body - Request body (JSON string)
 */
function createMockReq(method = 'GET', body = '') {
    const req = new EventEmitter();
    req.method = method;

    // Simulate body streaming if body provided
    if (body && method === 'POST') {
        process.nextTick(() => {
            req.emit('data', body);
            req.emit('end');
        });
    }

    return req;
}

/**
 * Create a URL object for route matching.
 */
function createMockUrl(pathname, port = 3457) {
    return new URL(`http://localhost:${port}${pathname}`);
}

/**
 * Create a shared context object with a mock workbenchPage.
 */
function createMockCtx(overrides = {}) {
    return {
        workbenchPage: {
            evaluate: jest.fn().mockResolvedValue({}),
            click: jest.fn().mockResolvedValue(),
            keyboard: { press: jest.fn().mockResolvedValue() },
        },
        browser: { isConnected: jest.fn().mockReturnValue(true), pages: jest.fn().mockResolvedValue([]) },
        allWorkbenches: [],
        activeWindowIdx: 0,
        lastActionTimestamp: 0,
        ...overrides,
    };
}

module.exports = { createMockRes, createMockReq, createMockUrl, createMockCtx };
