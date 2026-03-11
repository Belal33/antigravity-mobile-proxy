const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html')) || pages[0];
  
  const result = await page.evaluate(async () => {
    // try to find the button
    const headers = document.querySelectorAll('.pane-header');
    let agentHeader;
    for (const header of headers) {
        if (header.textContent.toLowerCase().includes('antigravity')) {
            agentHeader = header;
            break;
        }
    }
    
    if (!agentHeader) return "No agent header found";
    
    const actions = agentHeader.querySelectorAll('.action-item a');
    const buttons = Array.from(actions).map(a => {
        return {
            title: a.getAttribute('title'),
            ariaLabel: a.getAttribute('aria-label'),
            className: a.className,
            html: a.outerHTML
        }
    });
    
    return buttons;
  });
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
run();
