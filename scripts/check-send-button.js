/**
 * Diagnostic: Check the send/stop button state in both idle and running states.
 * Run: node scripts/check-send-button.js
 */
const puppeteer = require('puppeteer-core');
const CDP_PORT = process.env.CDP_PORT || '9223';

async function run() {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('workbench.html'));

  if (!page) {
    console.log('No workbench page found.');
    process.exit(1);
  }

  const result = await page.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'No panel' };

    const inputArea = document.querySelector('#antigravity\\.agentSidePanelInputBox') ||
                      panel.querySelector('[id*="InputBox"]');
    if (!inputArea) return { error: 'No input box' };

    const wrapper = inputArea.closest('.flex') || inputArea.parentElement?.parentElement || inputArea.parentElement;
    if (!wrapper) return { error: 'No wrapper' };

    const inputBtns = wrapper.querySelectorAll('button');
    const buttons = [];

    for (const btn of inputBtns) {
      const html = btn.innerHTML || '';
      const ariaLabel = (btn.getAttribute('aria-label') || '');
      const text = (btn.textContent || '').trim();
      const tooltipId = (btn.getAttribute('data-tooltip-id') || '');
      const cls = (btn.className || '');
      
      // Check what icons are present
      const svgClasses = [...btn.querySelectorAll('svg')].map(s => s.getAttribute('class') || '');
      
      buttons.push({
        text,
        ariaLabel,
        tooltipId,
        cls: cls.substring(0, 200),
        svgClasses,
        htmlSnippet: html.substring(0, 300),
      });
    }

    // Also check the spinner state
    const spinners = panel.querySelectorAll('.animate-spin');
    let visibleSpinners = 0;
    for (const s of spinners) {
      let el = s, hidden = false;
      while (el) {
        const c = (el.getAttribute && el.getAttribute('class')) || '';
        if (c.includes('invisible') || c.includes('opacity-0')) { hidden = true; break; }
        el = el.parentElement;
      }
      if (!hidden) visibleSpinners++;
    }

    return {
      totalButtons: inputBtns.length,
      buttons,
      visibleSpinners,
      wrapperTag: wrapper.tagName,
      wrapperCls: (wrapper.className || '').substring(0, 200),
    };
  });

  console.log(JSON.stringify(result, null, 2));

  // Analyze
  if (result.buttons) {
    console.log('\n--- ANALYSIS ---');
    let hasStop = false, hasSend = false;
    for (const btn of result.buttons) {
      const tooltipLower = btn.tooltipId.toLowerCase();
      const ariaLower = btn.ariaLabel.toLowerCase();
      const textLower = btn.text.toLowerCase();
      const html = btn.htmlSnippet.toLowerCase();

      const isStopIcon = html.match(/lucide-square(?:[^a-z0-9-]|$)/i) ||
                         html.includes('lucide-circle-stop') ||
                         html.includes('lucide-octagon');
      
      const isStop = isStopIcon ||
                     ariaLower.includes('stop') ||
                     ariaLower.includes('cancel') ||
                     textLower === 'stop' ||
                     tooltipLower.includes('stop');

      const isSend = html.includes('lucide-send') ||
                     html.includes('lucide-arrow-up') ||
                     html.includes('lucide-arrow-right') ||
                     html.includes('codicon-send') ||
                     html.includes('lucide-corner-down-left') ||
                     ariaLower.includes('send') ||
                     ariaLower.includes('submit') ||
                     textLower === 'send' ||
                     tooltipLower.includes('send');

      if (isStop) hasStop = true;
      if (isSend) hasSend = true;
      
      console.log(`  Button "${btn.text || btn.ariaLabel || btn.tooltipId}": stop=${isStop}, send=${isSend}`);
    }
    
    console.log(`\n  hasStop=${hasStop}, hasSend=${hasSend}`);
    if (hasStop) {
      console.log('  => isRunning = TRUE (stop found)');
    } else if (hasSend) {
      console.log('  => isRunning = FALSE (send found, no stop)');
    } else {
      console.log('  => isRunning = TRUE (no send or stop — send button removed from DOM)');
    }
    console.log(`  Visible spinners: ${result.visibleSpinners}`);
  }

  await browser.disconnect();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
