const puppeteer = require('puppeteer-core');
async function run() {
    const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
    const targets = await browser.targets();
    for (const t of targets) {
        try {
            console.log(`Target: ${t.type()} | ${t.url()} | ${t.title() || 'No title'}`);
        } catch (e) {
            console.log(`Target: ${t.type()} | ${t.url()}`);
        }
    }
    browser.disconnect();
}
run();
