const puppeteer = require('puppeteer-core');

async function check() {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
    const pages = await browser.pages();
    
    let page = null;
    for (const p of pages) {
      if (p.url().includes('workbench.html')) {
        page = p;
        break;
      }
    }

    if (!page) {
      console.error('No workbench page');
      browser.disconnect();
      return;
    }

    const data = await page.evaluate(async () => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { error: 'No panel' };

      const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
      if (btn && btn.getAttribute('data-state') !== 'open') {
        btn.click();
      }

      await new Promise(r => setTimeout(r, 1000));

      const headers = [];
      for (const el of panel.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if (t.startsWith('Artifacts (') && t.includes('Files') && el.children.length <= 3) {
          
          let section = el;
          for (let i = 0; i < 8; i++) {
            if (!section.parentElement) break;
            section = section.parentElement;
            const text = section.textContent || '';
            if (text.includes('Artifact Name') && text.includes('Last Updated')) {
              break;
            }
          }
          
          const rawTexts = [];
          const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const txt = walker.currentNode.textContent.trim();
            if (txt) rawTexts.push(txt);
          }

          headers.push({
            headerText: t,
            containerClasses: section.className,
            containerInnerHtml: section.innerHTML,
            allTextsInContainer: rawTexts
          });
        }
      }
      return headers;
    });

    console.log(JSON.stringify(data, null, 2));
    browser.disconnect();
  } catch (e) {
    console.error(e);
  }
}

check();
