const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html')) || pages[0];
  
  const result = await page.evaluate(async () => {
        const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');
        if (!historyBtn) return { error: "No history btn" };
        
        const headerContainer = historyBtn.closest('div.flex.items-center, header');
        return {
           headerHtml: headerContainer ? headerContainer.outerHTML : "NotFound",
           allText: document.body.innerText.substring(0, 500)
        };
  });
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
run();
