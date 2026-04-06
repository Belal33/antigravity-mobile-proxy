const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
  const pages = await b.pages();

  let p = null;
  for (const pg of pages) {
    const title = await pg.title().catch(() => '');
    if (title.includes('antigravity-chat-proxy')) { p = pg; break; }
  }
  if (!p) { console.log('Page not found'); await b.disconnect(); return; }
  console.log('Using page:', await p.title());

  const result = await p.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'no panel' };

    // Find all buttons matching permission words
    const permWords = ['deny', 'allow', 'allow once', 'allow this conversation', 'block'];
    const allBtns = Array.from(document.querySelectorAll('button'));
    const permBtns = allBtns.filter(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      return permWords.includes(t);
    });

    const found = permBtns.map(btn => {
      // Walk up 8 levels collecting class names
      const ancestors = [];
      let el = btn.parentElement;
      for (let d = 0; d < 8 && el; d++) {
        ancestors.push({ tag: el.tagName, cls: (el.getAttribute('class') || '').substring(0, 120), id: el.getAttribute('id') || '' });
        el = el.parentElement;
      }
      const inPanel = !!btn.closest('.antigravity-agent-side-panel');
      // Get the nearest flex container's full text for context
      const nearestFlex = btn.closest('[class*="flex"]');
      const ctxText = nearestFlex ? (nearestFlex.textContent || '').substring(0, 300) : '';
      return {
        text: btn.textContent?.trim(),
        disabled: btn.disabled,
        inPanel,
        btnClass: btn.getAttribute('class') || '',
        ancestors,
        ctxText: ctxText.trim()
      };
    });

    // All panel button texts for context
    const allPanelBtns = Array.from(panel.querySelectorAll('button'))
      .map(b => (b.textContent || '').trim()).filter(Boolean);

    // Check last turn for any buttons
    const conversation = panel.querySelector('#conversation') || document.querySelector('#conversation');
    const scrollArea = conversation && conversation.querySelector('.overflow-y-auto');
    const msgList = scrollArea && scrollArea.querySelector('.mx-auto');
    const allTurns = msgList ? Array.from(msgList.children) : [];
    const lastTurn = allTurns[allTurns.length - 1];
    const lastTurnBtns = lastTurn
      ? Array.from(lastTurn.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(Boolean)
      : [];

    return { found, allPanelBtns, lastTurnBtns, permCount: permBtns.length };
  });

  console.log('\n=== Permission buttons found:', result.permCount, '===');
  console.log('All panel buttons:', JSON.stringify(result.allPanelBtns));
  console.log('Last turn buttons:', JSON.stringify(result.lastTurnBtns));

  if (result.found && result.found.length > 0) {
    for (const btn of result.found) {
      console.log('\n--- Button:', JSON.stringify(btn.text), '| inPanel:', btn.inPanel, '| disabled:', btn.disabled);
      console.log('  btn class:', btn.btnClass.substring(0, 80));
      console.log('  Context text:', btn.ctxText.substring(0, 200));
      console.log('  Ancestors:');
      for (const a of btn.ancestors) {
        console.log('   ', a.tag + (a.id ? '#'+a.id : ''), '|', a.cls);
      }
    }
  } else {
    console.log('\n❌ No permission buttons found in DOM right now.');
  }

  await b.disconnect();
})().catch(e => console.error('Error:', e.message));
