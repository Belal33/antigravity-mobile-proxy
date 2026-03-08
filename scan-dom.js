const puppeteer = require('puppeteer-core');
const CDP_PORT = 9223;

async function run() {
    try {
        const browser = await puppeteer.connect({ browserURL: `http://localhost:${CDP_PORT}` });
        const pages = await browser.pages();
        let targetPage = null;
        for (const p of pages) {
            if (p.url().includes('workbench.html') && !p.url().includes('jetski')) {
                targetPage = p;
                break;
            }
        }
        if (!targetPage) {
            console.log("Could not find Antigravity workbench page");
            process.exit(1);
        }

        const data = await targetPage.evaluate(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            if (!panel) return "No panel found";

            const taskBoundaries = Array.from(panel.querySelectorAll('.isolate.mb-2.overflow-hidden.rounded-lg.border.border-gray-500\\/20'));

            return taskBoundaries.map(tb => tb.outerHTML);
        });

        console.log(JSON.stringify(data, null, 2));
        browser.disconnect();
    } catch (e) {
        console.error(e);
    }
}
run();
