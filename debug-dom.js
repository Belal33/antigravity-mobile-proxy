const p = require('puppeteer-core');

(async () => {
    const b = await p.connect({ browserURL: 'http://localhost:9223' });
    const pages = await b.pages();

    let wb;
    for (const pg of pages) {
        if (pg.url().includes('workbench.html') && !pg.url().includes('jetski')) {
            const t = await pg.title();
            if (t.includes('hivemind')) { wb = pg; break; }
        }
    }
    if (!wb) { console.log('No window'); b.disconnect(); process.exit(0); return; }

    const result = await wb.evaluate(() => {
        // Check the exact selector the proxy uses
        const proxySelector = '.antigravity-agent-side-panel .animate-spin';
        const spinnerEl = document.querySelector(proxySelector);

        // Check ALL .animate-spin elements on the page
        const allAnimateSpin = document.querySelectorAll('.animate-spin');
        const spinnerDetails = Array.from(allAnimateSpin).map(s => ({
            tag: s.tagName,
            classes: s.className.substring(0, 100),
            visible: !!(s.offsetParent !== null),
            rect: s.getBoundingClientRect(),
            parentTag: s.parentElement?.tagName,
            parentClasses: s.parentElement?.className?.substring(0, 80),
            inPanel: !!s.closest('.antigravity-agent-side-panel')
        }));

        return {
            proxySpinnerFound: !!spinnerEl,
            proxySpinnerVisible: !!(spinnerEl && spinnerEl.offsetParent !== null),
            allAnimateSpinCount: allAnimateSpin.length,
            spinnerDetails
        };
    });

    console.log(JSON.stringify(result, null, 2));
    b.disconnect();
    process.exit(0);
})();
