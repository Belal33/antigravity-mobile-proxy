// Run this WHILE the "Allow directory access?" dialog is visible
// This shows the exact DOM structure around the "Analyzed" file row 
const puppeteer = require('puppeteer-core');

async function main() {
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9223',
        defaultViewport: null,
    });

    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('localhost') || p.url().includes('workbench'));
    if (!page) page = pages[0];

    const result = await page.evaluate(() => {
        const output = [];
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return 'No panel found';

        // 1. Find ALL direct children of .flex.flex-col.space-y-2 (the file tool container)
        const containers = panel.querySelectorAll('.flex.flex-col.space-y-2');
        output.push(`=== Found ${containers.length} space-y-2 containers ===\n`);

        containers.forEach((container, ci) => {
            const children = Array.from(container.children);
            output.push(`Container #${ci}: ${children.length} children`);
            children.forEach((child, i) => {
                const tag = child.tagName.toLowerCase();
                const cls = (child.className || '').substring(0, 120);
                const text = (child.textContent || '').substring(0, 150).replace(/\n/g, '\\n');
                const buttons = Array.from(child.querySelectorAll('button'));
                const btnTexts = buttons.map(b => b.textContent?.trim()).join(', ');
                output.push(`  [${i}] <${tag} class="${cls}">`);
                output.push(`       text: "${text}"`);
                if (btnTexts) output.push(`       buttons: [${btnTexts}]`);
                output.push('');
            });
        });

        // 2. Now run the EXACT fileToolRows selector and show what matches
        const stepGroups = panel.querySelectorAll('.group.flex.w-full');
        const lastGroup = stepGroups[stepGroups.length - 1];
        const scopeEl = lastGroup || panel;

        const fileToolRows = scopeEl.querySelectorAll('.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)');
        output.push(`\n=== fileToolRows selector matched ${fileToolRows.length} rows ===\n`);

        const statusPattern = /^(Edited|Created|Analyzed|Read|Viewed|Wrote|Replaced|Searching|Deleted|Moved|Renamed|MCP Tool)/i;

        fileToolRows.forEach((row, i) => {
            const rowText = (row.textContent || '').trim().substring(0, 200);
            const match = rowText.match(statusPattern);
            const buttons = Array.from(row.querySelectorAll('button'));
            const btnTexts = buttons.map(b => b.textContent?.trim());

            output.push(`  Row[${i}]:`);
            output.push(`    matched: ${match ? match[1] : 'NO MATCH'}`);
            output.push(`    text: "${rowText.substring(0, 120)}"`);
            output.push(`    buttons found: ${buttons.length} → [${btnTexts.join(', ')}]`);
            output.push(`    classes: "${row.className?.substring(0, 100)}"`);
            output.push('');
        });

        // 3. Also check if the permission dialog is NOT a .flex.flex-row
        //    Look for the "Allow directory access" text anywhere in the panel
        const allElements = panel.querySelectorAll('*');
        for (const el of allElements) {
            if (el.children.length === 0) continue; // skip leaf nodes
            const t = el.textContent || '';
            if (t.includes('Allow directory access') && el.querySelectorAll('button').length > 0) {
                // Check if this element is a .flex.flex-row
                const isFlexRow = el.classList.contains('flex') && el.classList.contains('flex-row');
                const tag = el.tagName.toLowerCase();
                const cls = el.className?.substring(0, 120);
                const parentCls = el.parentElement?.className?.substring(0, 120);
                output.push(`\n=== Permission dialog element ===`);
                output.push(`  tag: ${tag}, isFlexRow: ${isFlexRow}`);
                output.push(`  class: "${cls}"`);
                output.push(`  parent class: "${parentCls}"`);
                output.push(`  matched by fileToolRows? ${Array.from(fileToolRows).includes(el)}`);
                break;
            }
        }

        return output.join('\n');
    });

    console.log(result);
    await browser.disconnect();
}

main().catch(console.error);
