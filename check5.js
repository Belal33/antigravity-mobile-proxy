const puppeteer = require('puppeteer-core');

async function run() {
  try {
    const res = await fetch('http://localhost:9222/json');
    const targets = await res.json();
    const target = targets.find(t => (t.url && t.url.includes('antigravity/workbench')) || t.title.includes('Antigravity') || t.title === 'Antigravity');
    
    if (!target) {
      console.log("Could not find Antigravity target.");
      return;
    }

    const browser = await puppeteer.connect({ browserWSEndpoint: target.webSocketDebuggerUrl });
    const pages = await browser.pages();
    const page = pages[0];

    const html = await page.evaluate(() => {
        // try finding the side panel input box explicitly
        const box = document.querySelector('#antigravity\\.agentSidePanelInputBox') || document.querySelector('[id*="InputBox"]');
        if (box) return box.outerHTML;
        
        // try finding any button with stop or send
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendBtn = buttons.find(b => {
           const label = (b.getAttribute('aria-label') || '').toLowerCase();
           return label.includes('send') || label.includes('stop');
        });
        if (sendBtn) return sendBtn.parentElement?.outerHTML;
        
        return "Not found";
    });

    console.log(html);
    await browser.disconnect();
  } catch (err) {
    console.error(err);
  }
}

run();
