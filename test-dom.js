const puppeteer = require('puppeteer-core');
async function run() {
    const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
    const targets = await browser.targets();
    let page = null;
    for (const t of targets) {
        if (t.url().includes('localhost:3456') || t.url().includes('index.html')) {
            page = await t.page();
            if (page) break;
        }
    }
    if (!page) { console.log('no page'); return; }
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log(html);
    browser.disconnect();
}
run();
