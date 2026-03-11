const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html')) || pages[0];
  
  const result = await page.evaluate(async () => {
    const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');
    if (!historyBtn) return { error: "Could not find history button" };
    
    // dispatch full mouse events
    historyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    historyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    
    await new Promise(r => setTimeout(r, 600)); // wait for React to render
    
    // Find the container for conversations.
    // It has a header like "Recent in ide_agent"
    const headers = Array.from(document.querySelectorAll('.text-quickinput-foreground.opacity-50'))
                         .filter(el => el.textContent.startsWith('Recent'));
                         
    if (headers.length === 0) return { error: "Could not find Recent header" };
    
    const container = headers[0].parentElement;
    
    // get conversation rows
    const rows = Array.from(container.querySelectorAll('.cursor-pointer.flex.items-center.justify-between')).map(row => {
        const titleEl = row.querySelector('.truncate span');
        const title = titleEl ? titleEl.textContent : row.textContent.trim();
        // active can be indicated by bg-gray-500/10 class or a circle icon or bg-gray-500/20
        const isActiveStr = row.className.includes('bg-gray-500') || !!row.querySelector('svg.lucide-circle');
        return {
            title,
            active: isActiveStr,
            className: row.className
        };
    });
    
    // Close the menu
    document.body.click();

    return rows;
  });
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
run();
