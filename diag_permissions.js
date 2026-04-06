/**
 * Diagnostic: Find "deny"/"allow once"/"allow this conversation" buttons
 * in the Antigravity IDE panel and report their exact DOM context.
 * 
 * Run with: node diag_permissions.js
 */
const puppeteer = require('puppeteer-core');

(async () => {
  try {
    // Try common CDP ports
    let browser = null;
    for (const port of [9222, 9223, 9224]) {
      try {
        browser = await puppeteer.connect({ browserURL: `http://localhost:${port}` });
        console.log(`Connected on port ${port}`);
        break;
      } catch (_) {}
    }
    if (!browser) { console.error('Could not connect to any CDP port'); return; }

    const pages = await browser.pages();
    let p = null;
    for (const pg of pages) {
      const url = pg.url();
      const title = await pg.title().catch(() => '');
      if (url.includes('workbench') || url.includes('antigravity') || title.toLowerCase().includes('antigravity')) {
        p = pg;
        break;
      }
    }
    if (!p && pages.length > 0) p = pages[0];
    if (!p) { console.log('No page found'); await browser.disconnect(); return; }

    const title = await p.title().catch(() => 'unknown');
    console.log(`Using page: "${title}" at ${p.url()}`);
    console.log();

    const result = await p.evaluate(() => {
      const PERMISSION_WORDS = ['deny', 'allow once', 'allow this conversation', 'allow', 'block'];
      
      // 1. Find all buttons whose text matches permission words
      const allBtns = Array.from(document.querySelectorAll('button'));
      const permBtns = allBtns.filter(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        return PERMISSION_WORDS.some(w => text === w);
      });

      const found = permBtns.map(btn => {
        // Walk up to get context
        const ancestors = [];
        let el = btn.parentElement;
        let depth = 0;
        while (el && depth < 8) {
          const cls = el.getAttribute('class') || '';
          const id = el.getAttribute('id') || '';
          ancestors.push(`[${el.tagName.toLowerCase()}${id ? '#'+id : ''}] class="${cls.substring(0, 80)}"`);
          el = el.parentElement;
          depth++;
        }

        // Get sibling context
        const parent = btn.parentElement;
        const siblings = parent ? Array.from(parent.children).map(s => ({
          tag: s.tagName.toLowerCase(),
          text: (s.textContent || '').trim().substring(0, 40),
          class: (s.getAttribute('class') || '').substring(0, 60)
        })) : [];

        // Get the nearest named container
        const panelEl = btn.closest('.antigravity-agent-side-panel');
        const inPanel = !!panelEl;
        
        // What CSS class chain identifies this button's container?
        const btnParentClass = parent?.getAttribute('class') || '';
        const grandParentClass = parent?.parentElement?.getAttribute('class') || '';
        const ggpClass = parent?.parentElement?.parentElement?.getAttribute('class') || '';

        // Get the outerHTML of the containing row (up to 500 chars)
        const containerDiv = btn.closest('div[class*="flex"]');
        const containerHtml = containerDiv ? containerDiv.outerHTML.substring(0, 800) : 'N/A';

        return {
          buttonText: btn.textContent?.trim(),
          disabled: btn.disabled,
          inPanel,
          btnParentClass: btnParentClass.substring(0, 120),
          grandParentClass: grandParentClass.substring(0, 120),
          ggpClass: ggpClass.substring(0, 120),
          ancestors: ancestors.slice(0, 5),
          siblingTexts: siblings.map(s => s.text),
          containerHtml
        };
      });

      // 2. Also scan the full panel for any text containing "allow" or "deny"
      const panel = document.querySelector('.antigravity-agent-side-panel');
      const panelText = panel ? (panel.textContent || '').substring(0, 2000) : 'NO PANEL';
      const hasPermText = /deny|allow once|allow this conversation/i.test(panelText);

      // 3. Look for any dialog/modal overlays
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="dialog"], [class*="modal"]'))
        .map(d => ({
          tag: d.tagName.toLowerCase(),
          role: d.getAttribute('role') || '',
          class: (d.getAttribute('class') || '').substring(0, 100),
          text: (d.textContent || '').substring(0, 200)
        }));

      // 4. Check for any overlays outside the panel
      const bodyBtns = Array.from(document.querySelectorAll('body > * button')).filter(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        return PERMISSION_WORDS.some(w => text === w);
      }).map(btn => ({
        text: btn.textContent?.trim(),
        parentClass: (btn.parentElement?.getAttribute('class') || '').substring(0, 100),
        inPanel: !!btn.closest('.antigravity-agent-side-panel')
      }));

      return { found, hasPermText, dialogs, bodyBtns, permBtnCount: permBtns.length };
    });

    console.log(`=== Permission buttons found: ${result.permBtnCount} ===`);
    console.log(`Panel contains permission text: ${result.hasPermText}`);
    console.log();

    if (result.found.length === 0) {
      console.log('❌ NO permission buttons present in DOM right now.');
      console.log('  (You need to trigger a permission dialog in the IDE first)');
    } else {
      for (const btn of result.found) {
        console.log(`\n📌 Button: "${btn.buttonText}" | disabled=${btn.disabled} | inPanel=${btn.inPanel}`);
        console.log(`   Parent class:      "${btn.btnParentClass}"`);
        console.log(`   Grandparent class: "${btn.grandParentClass}"`);
        console.log(`   GG-parent class:   "${btn.ggpClass}"`);
        console.log(`   Ancestors:`);
        for (const a of btn.ancestors) console.log(`     ${a}`);
        console.log(`   Sibling button texts: ${JSON.stringify(btn.siblingTexts)}`);
        console.log(`\n   Container HTML (truncated):\n${btn.containerHtml}\n`);
      }
    }

    if (result.dialogs.length > 0) {
      console.log(`\n=== Dialogs/Modals found: ${result.dialogs.length} ===`);
      for (const d of result.dialogs) {
        console.log(`  [${d.tag}] role="${d.role}" class="${d.class}"`);
        console.log(`  text: "${d.text.substring(0, 150)}"`);
      }
    }

    await browser.disconnect();
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
