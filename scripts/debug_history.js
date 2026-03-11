const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html')) || pages[0];
  
  const history = await page.evaluate(() => {
    const btn = document.querySelector('a[data-past-conversations-toggle="true"]');
    if (btn) btn.click();
    return new Promise(r => {
      setTimeout(() => {
         // get all history item text
         const headers = Array.from(document.querySelectorAll('div')).filter(el => el.textContent === 'Today' || el.textContent === 'Previous');
         const items = [];
         
         const textElements = Array.from(document.querySelectorAll('span, div')).filter(el => el.hasAttribute('title') && el.className.includes('truncate') && el.closest('.monaco-list-row'));
         
         textElements.forEach(el => items.push({ title: el.title, text: el.textContent }));
         
        if (btn) btn.click();
        r(items);
      }, 500);
    });
  });
  console.log(JSON.stringify(history, null, 2));
  process.exit(0);
}
run();
