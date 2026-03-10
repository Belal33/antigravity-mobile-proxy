const puppeteer = require('puppeteer-core');

async function checkButtons() {
    try {
        const res = await fetch('http://127.0.0.1:9223/json/version');
        const data = await res.json();
        const browser = await puppeteer.connect({ browserWSEndpoint: data.webSocketDebuggerUrl });
        const pages = await browser.pages();

        for (const page of pages) {
            const title = await page.title();
            if (title.includes('Antigravity') && title.includes('ide_agent')) {
                console.log(`\n=== Window: ${title} ===`);
                const btns = await page.evaluate(() => {
                    const p = document.querySelector('.antigravity-agent-side-panel');
                    if (!p) return null;
                    return Array.from(p.querySelectorAll('button')).map(b => ({
                        text: b.textContent.trim() || b.innerHTML.replace(/<[^>]+>/g, '').trim(),
                        aria: b.getAttribute('aria-label'),
                        title: b.getAttribute('title'),
                        class: b.className
                    }));
                });
                if (btns) {
                    btns.forEach(b => console.log(`BTN: text="${b.text}" aria="${b.aria}" title="${b.title}"`));
                } else {
                    console.log('No panel found');
                }
            }
        }
        await browser.disconnect();
    } catch (e) {
        console.error(e);
    }
}
checkButtons();
