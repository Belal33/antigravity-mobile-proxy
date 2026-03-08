// Run this WHILE the "Allow directory access?" dialog is visible in Antigravity
// Usage: node scan-permission.js
const puppeteer = require('puppeteer-core');

async function main() {
    // Connect to the existing Chrome instance (reuse same port as proxy)
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9223',
        defaultViewport: null,
    });

    const pages = await browser.pages();
    // Find the Antigravity workbench
    let page = pages.find(p => p.url().includes('localhost') || p.url().includes('workbench'));
    if (!page) page = pages[0];

    const result = await page.evaluate(() => {
        const output = [];

        // Find any button with "Allow" or "Deny" text
        const allBtns = Array.from(document.querySelectorAll('button'));
        const permBtns = allBtns.filter(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'allow' || t === 'deny' || t.includes('allow') || t.includes('directory');
        });

        output.push(`=== Found ${permBtns.length} permission-related buttons ===`);

        for (const btn of permBtns) {
            output.push(`\nButton text: "${btn.textContent?.trim()}"`);
            output.push(`Button class: "${btn.className}"`);

            // Walk up the DOM and capture 5 ancestor levels
            let el = btn.parentElement;
            let depth = 0;
            while (el && depth < 8) {
                const tag = el.tagName.toLowerCase();
                const cls = el.className?.substring(0, 100) || '';
                const id = el.id || '';
                output.push(`  L${depth}: <${tag}${id ? ` id="${id}"` : ''}${cls ? ` class="${cls}"` : ''}>`);
                el = el.parentElement;
                depth++;
            }

            // Capture the HTML of 3 levels up
            const ancestor = btn.parentElement?.parentElement?.parentElement;
            if (ancestor) {
                output.push(`\n  === Ancestor HTML (3 levels up) ===`);
                output.push(ancestor.outerHTML.substring(0, 2000));
            }
        }

        // Also capture ALL buttons in the agent panel
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (panel) {
            const panelBtns = Array.from(panel.querySelectorAll('button'));
            output.push(`\n\n=== All button texts in panel ===`);
            panelBtns.forEach(b => output.push(`  - "${b.textContent?.trim()}"`));
        }

        return output.join('\n');
    });

    console.log(result);
    await browser.disconnect();
}

main().catch(console.error);
