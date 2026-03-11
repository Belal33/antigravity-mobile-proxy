const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html')) || pages[0];
  
  const headerContent = await page.evaluate(() => {
    // Find the agent side panel header
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return "No panel found";
    
    // There's usually a header section
    const header = panel.querySelector('.header') || panel.firstElementChild;
    if (!header) return "No header found";

    // Let's get all the action buttons in the header
    const buttons = Array.from(header.querySelectorAll('a.action-label, [role="button"], button')).map(btn => {
      return {
        className: btn.className,
        title: btn.getAttribute('title') || btn.getAttribute('aria-label'),
        action: btn.getAttribute('data-action-id') || btn.getAttribute('href'),
        text: btn.textContent,
        html: btn.outerHTML
      };
    });
    
    return buttons;
  });
  console.log(JSON.stringify(headerContent, null, 2));
  process.exit(0);
}
run();
