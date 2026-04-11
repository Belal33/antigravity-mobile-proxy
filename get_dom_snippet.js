const puppeteer = require('puppeteer-core');
const http = require('http');

async function getWsEndpoint() {
    return new Promise((resolve) => {
        http.get('http://127.0.0.1:9222/json/version', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data).webSocketDebuggerUrl));
        });
    });
}

async function run() {
    const wsUrl = await getWsEndpoint();
    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
    const pages = await browser.pages();
    // Assuming ide_agent is window 0, which is the last page usually or first
    let targetPage;
    for (const p of pages) {
        const title = await p.title();
        if (title.includes('ide_agent')) targetPage = p;
    }
    if (!targetPage) targetPage = pages[0]; // fallback
    
    const data = await targetPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return "No panel";
        
        let header = null;
        const gap = panel.querySelector('.flex.grow.flex-col.justify-start.gap-8');
        if (gap) {
            for (const el of gap.querySelectorAll('*')) {
                if (el.textContent && el.textContent.trim().startsWith('Artifacts (') && 
                    el.children.length <= 3 && el.tagName !== 'CODE') {
                    header = el; break;
                }
            }
        }
        if (!header) return "No header - make sure panel is toggled";
        
        let section = header;
        for (let i = 0; i < 8; i++) {
            if (!section.parentElement) break;
            section = section.parentElement;
            if (section.textContent.includes('Artifact Name')) break;
        }
        return section.innerHTML.substring(0, 2000);
    });
    console.log(data);
    process.exit(0);
}
run();
