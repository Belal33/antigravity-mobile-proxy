/**
 * Diagnostic: Inspect the agent/model selector DOM in Antigravity.
 * Run: node scripts/inspect-agent-selector.js
 * 
 * Requires a workbench page to be open (not just the landing page).
 */
const puppeteer = require('puppeteer-core');
const CDP_PORT = process.env.CDP_PORT || '9223';

async function run() {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
  const pages = await browser.pages();
  console.log(`Found ${pages.length} pages on port ${CDP_PORT}:`);

  let target = null;
  for (const p of pages) {
    const title = await p.title();
    const url = p.url();
    const hasPanel = await p.evaluate(() => !!document.querySelector('.antigravity-agent-side-panel')).catch(() => false);
    console.log(`  - "${title}" hasPanel=${hasPanel} url=${url.substring(0, 80)}`);
    if (hasPanel && !target) target = p;
    if (!target && url.includes('workbench.html')) target = p;
  }

  if (!target) {
    console.log('\nNo workbench page with agent panel found. Open a project in Antigravity first.');
    await browser.disconnect();
    process.exit(0);
  }

  console.log(`\nUsing page: "${await target.title()}"`);

  const result = await target.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'No agent panel' };

    const inputBox = document.querySelector('#antigravity\\.agentSidePanelInputBox') ||
                     panel.querySelector('[id*="InputBox"]');

    // Get ALL buttons in the bottom area (near input)
    const panelRect = panel.getBoundingClientRect();
    const allBtns = [...panel.querySelectorAll('button')];
    const bottomBtns = allBtns.filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.top > panelRect.bottom - 150;
    });

    const btns = bottomBtns.map(b => ({
      text: (b.textContent || '').trim().substring(0, 200),
      ariaLabel: b.getAttribute('aria-label') || '',
      tooltipId: b.getAttribute('data-tooltip-id') || '',
      cls: (b.className || '').substring(0, 300),
      innerHTML: b.innerHTML.substring(0, 500),
    }));

    // Specifically look for model/agent related text
    const allText = panel.textContent || '';
    const modelPatterns = ['claude', 'gemini', 'gpt', 'sonnet', 'opus', 'haiku', 'flash', 'pro', 'deepseek'];
    const foundModels = modelPatterns.filter(p => allText.toLowerCase().includes(p));

    // span.text-xs elements
    const textXsSpans = [...panel.querySelectorAll('span.text-xs')].map(s => ({
      text: (s.textContent || '').trim(),
      cls: s.className || '',
      parentTag: s.parentElement?.tagName || '',
      parentCls: (s.parentElement?.className || '').substring(0, 100),
    }));

    // all data-tooltip-id
    const tooltips = [...panel.querySelectorAll('[data-tooltip-id]')].map(el => ({
      tag: el.tagName,
      tooltipId: el.getAttribute('data-tooltip-id'),
      text: (el.textContent || '').trim().substring(0, 80),
    }));

    // input wrapper HTML
    let wrapperHTML = '';
    if (inputBox) {
      const wrapper = inputBox.closest('.flex') || inputBox.parentElement?.parentElement;
      wrapperHTML = (wrapper?.outerHTML || '').substring(0, 3000);
    }

    return { inputBoxFound: !!inputBox, btns, foundModels, textXsSpans, tooltips, wrapperHTML };
  });

  console.log('\n=== BOTTOM BUTTONS ===');
  console.log(JSON.stringify(result.btns, null, 2));
  console.log('\n=== MODEL NAMES FOUND ===');
  console.log(result.foundModels);
  console.log('\n=== SPANS text-xs ===');
  console.log(JSON.stringify(result.textXsSpans, null, 2));
  console.log('\n=== TOOLTIPS ===');
  console.log(JSON.stringify(result.tooltips, null, 2));
  console.log('\n=== INPUT WRAPPER HTML ===');
  console.log(result.wrapperHTML);

  await browser.disconnect();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
