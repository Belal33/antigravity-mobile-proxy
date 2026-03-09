/**
 * CDP (Chrome DevTools Protocol) connection management.
 * Handles connecting to Antigravity's Electron app via Puppeteer.
 */

const puppeteer = require('puppeteer-core');

const CDP_PORT = parseInt(process.env.CDP_PORT || '9223', 10);

/**
 * Discover all workbench pages in the Electron app.
 */
async function discoverWorkbenches(ctx) {
    if (!ctx.browser || !ctx.browser.isConnected()) {
        ctx.browser = await puppeteer.connect({
            browserURL: `http://localhost:${CDP_PORT}`,
            defaultViewport: null
        });
    }
    const pages = await ctx.browser.pages();

    ctx.allWorkbenches = [];
    for (const p of pages) {
        const url = p.url();
        if (url.includes('workbench.html') && !url.includes('jetski')) {
            const title = await p.title();
            ctx.allWorkbenches.push({ page: p, title, url });
        }
    }
    return ctx.allWorkbenches;
}

/**
 * Connect to the default (or env-specified) workbench window.
 */
async function connectToWorkbench(ctx) {
    await discoverWorkbenches(ctx);

    if (ctx.allWorkbenches.length === 0) {
        throw new Error('No workbench pages found. Is Antigravity running with --remote-debugging-port=9223?');
    }

    console.log(`[CDP] Found ${ctx.allWorkbenches.length} workbench window(s):`);
    for (let i = 0; i < ctx.allWorkbenches.length; i++) {
        console.log(`  [${i}] ${ctx.allWorkbenches[i].title}`);
    }

    const targetIdx = parseInt(process.env.PROXY_PAGE || '0', 10);
    ctx.activeWindowIdx = targetIdx;
    ctx.workbenchPage = ctx.allWorkbenches[targetIdx]?.page || ctx.allWorkbenches[0].page;
    console.log(`[CDP] ✅ Connected to: "${ctx.allWorkbenches[ctx.activeWindowIdx]?.title || 'unknown'}"`);
}

/**
 * Switch to a different workbench window by index.
 */
function selectWindow(ctx, idx) {
    if (idx < 0 || idx >= ctx.allWorkbenches.length) {
        throw new Error(`Invalid window index ${idx}. Available: 0-${ctx.allWorkbenches.length - 1}`);
    }
    ctx.activeWindowIdx = idx;
    ctx.workbenchPage = ctx.allWorkbenches[idx].page;
    console.log(`[CDP] Switched to window [${idx}]: "${ctx.allWorkbenches[idx].title}"`);
    return ctx.allWorkbenches[idx];
}

module.exports = { discoverWorkbenches, connectToWorkbench, selectWindow };
