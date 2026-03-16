/**
 * Find exactly where the send button lives relative to the input box.
 */
const puppeteer = require('puppeteer-core');

async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html'));
  if (!page) { console.log('No workbench'); process.exit(1); }

  const result = await page.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'No panel' };

    // Find the send/cancel button by tooltip
    const sendBtn = panel.querySelector('[data-tooltip-id*="send"]') ||
                    panel.querySelector('[data-tooltip-id*="cancel"]');
    
    // Find all buttons with send-like tooltips
    const sendBtns = [...panel.querySelectorAll('[data-tooltip-id]')]
      .filter(el => {
        const tip = el.getAttribute('data-tooltip-id') || '';
        return tip.includes('send') || tip.includes('cancel');
      })
      .map(el => ({
        tag: el.tagName,
        tooltipId: el.getAttribute('data-tooltip-id'),
        innerHTML: el.innerHTML?.substring(0, 300) || '',
        cls: (el.className || '').substring(0, 200),
      }));

    // The input box
    const inputBox = document.querySelector('#antigravity\\.agentSidePanelInputBox');
    if (!inputBox) return { error: 'No input box', sendBtns };

    // Current wrapper that `.closest('.flex')` finds
    const currentWrapper = inputBox.closest('.flex');
    
    // Walk up and list all ancestors with their button counts
    const ancestors = [];
    let el = inputBox;
    for (let i = 0; i < 10 && el; i++) {
      const btns = el.querySelectorAll('button');
      const sendInside = el.querySelector('[data-tooltip-id*="send"]');
      ancestors.push({
        level: i,
        tag: el.tagName,
        id: el.id || '',
        cls: (el.className || '').substring(0, 150),
        buttonCount: btns.length,
        hasSendBtn: !!sendInside,
        isCurrentWrapper: el === currentWrapper,
      });
      el = el.parentElement;
    }

    return { sendBtns, ancestors };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
