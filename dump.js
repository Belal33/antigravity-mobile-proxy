const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function check() {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
    const pages = await browser.pages();
    
    let wIdx = 1;
    for (const p of pages) {
      if (p.url().includes('workbench.html')) {
        const title = await p.title();
        console.log(`Found window: ${title}`);
        
        const html = await p.evaluate(async () => {
          const panel = document.querySelector('.antigravity-agent-side-panel');
          if (!panel) return null;

          const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
          if (btn && btn.getAttribute('data-state') !== 'open') {
            btn.click();
            await new Promise(r => setTimeout(r, 1000));
          }

          return panel.innerHTML;
        });

        if (html) {
          fs.writeFileSync(`panel_dump_${wIdx}.html`, html);
          console.log(`Dumped window to panel_dump_${wIdx}.html`);
          wIdx++;
        }
      }
    }

    browser.disconnect();
  } catch (e) {
    console.error(e);
  }
}

check();
