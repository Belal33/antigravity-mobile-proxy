/**
 * Mimics the exact agent-state.ts broad scan logic to debug why footerButtons are empty.
 */
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
  console.log('Page:', await p.title());

  const result = await p.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'no panel' };

    // ── Replicate the turn/lastTurn logic from agent-state.ts ──
    const conversation = panel.querySelector('#conversation') || document.querySelector('#conversation');
    const scrollArea = conversation?.querySelector('.overflow-y-auto');
    const msgList = scrollArea?.querySelector('.mx-auto');
    const allTurns = msgList ? Array.from(msgList.children) : [];
    const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;
    const scopeEl = lastTurn || panel;

    // ── Test: find all permission buttons in scopeEl ──
    const PERM_REGEX = /^(allow|deny|allow once|allow this conversation|block)$/i;
    const allScopeButtons = Array.from(scopeEl.querySelectorAll('button'));
    const permButtons = allScopeButtons.filter(btn => {
      const text = (btn.textContent || '').trim();
      return PERM_REGEX.test(text) && !btn.disabled;
    });

    // ── Also test from panel directly ──
    const allPanelButtons = Array.from(panel.querySelectorAll('button'));
    const permPanel = allPanelButtons.filter(btn => {
      const text = (btn.textContent || '').trim();
      return PERM_REGEX.test(text) && !btn.disabled;
    });

    // ── Is lastTurn an ancestor of the permission buttons? ──
    const permBtnInDom = allPanelButtons.find(btn => PERM_REGEX.test((btn.textContent || '').trim()));
    let isInLastTurn = false;
    let isInPanel = false;
    if (permBtnInDom) {
      isInLastTurn = !!lastTurn && lastTurn.contains(permBtnInDom);
      isInPanel = panel.contains(permBtnInDom);
    }

    return {
      hasConversation: !!conversation,
      hasScrollArea: !!scrollArea,
      hasMsgList: !!msgList,
      turnCount: allTurns.length,
      hasLastTurn: !!lastTurn,
      scopeIsPanel: scopeEl === panel,
      // How many buttons total
      scopeBtnCount: allScopeButtons.length,
      panelBtnCount: allPanelButtons.length,
      // Permission button counts
      permInScope: permButtons.length,
      permInPanel: permPanel.length,
      permBtnTexts: permPanel.map(b => (b.textContent || '').trim()),
      // Containment check
      isInLastTurn,
      isInPanel,
      // Structural debug
      lastTurnTag: lastTurn ? lastTurn.tagName : null,
      lastTurnClass: lastTurn ? (lastTurn.getAttribute('class') || '').substring(0, 100) : null,
      scrollAreaClass: scrollArea ? (scrollArea.getAttribute('class') || '').substring(0, 100) : null,
      msgListClass: msgList ? (msgList.getAttribute('class') || '').substring(0, 100) : null,
    };
  });

  console.log('\n=== SCOPE ANALYSIS ===');
  console.log('Has #conversation:', result.hasConversation);
  console.log('Has scrollArea:', result.hasScrollArea, '| class:', result.scrollAreaClass);
  console.log('Has msgList (.mx-auto):', result.hasMsgList, '| class:', result.msgListClass);
  console.log('Turn count:', result.turnCount);
  console.log('Has lastTurn:', result.hasLastTurn, '| tag:', result.lastTurnTag, '| class:', result.lastTurnClass);
  console.log('scopeEl is panel (fallback):', result.scopeIsPanel);
  console.log();
  console.log('Total buttons in scope:', result.scopeBtnCount);
  console.log('Total buttons in panel:', result.panelBtnCount);
  console.log();
  console.log('=== PERMISSION BUTTON DETECTION ===');
  console.log('Perm buttons in scopeEl:', result.permInScope);
  console.log('Perm buttons in panel:', result.permInPanel);
  console.log('Perm button texts:', result.permBtnTexts);
  console.log();
  console.log('First perm btn in panel?', result.isInPanel);
  console.log('First perm btn in lastTurn?', result.isInLastTurn);

  await b.disconnect();
})().catch(e => console.error('Error:', e.message));
