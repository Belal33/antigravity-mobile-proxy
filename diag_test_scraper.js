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
  console.log('Testing exact agent-state.ts scraping logic on page:', await p.title());

  const state = await p.evaluate(() => {
    // Basic setup from agent-state.ts
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: 'No panel found' };

    const conversation = panel.querySelector('#conversation') || document.querySelector('#conversation');
    const scrollArea = conversation?.querySelector('.overflow-y-auto');
    const msgList = scrollArea?.querySelector('.mx-auto');
    const allTurns = msgList ? Array.from(msgList.children) : [];
    const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;
    const scopeEl = lastTurn || panel;

    // We'll just mock a few tool calls to attach permissions to, or it will create a new one.
    const toolCalls = [
      {
        id: "mock-1",
        status: "Ran background command",
        type: "command",
        path: "test",
        footerButtons: []
      }
    ];

    const isHitlAction = (t) => {
      const lower = t.toLowerCase();
      const HITL_WORDS = ['run', 'proceed', 'approve', 'allow', 'yes', 'accept', 'cancel', 'deny', 'reject', 'undo', 'revert', 'stop', 'allow once', 'allow this conversation'];
      const NON_HITL_WORDS = ['workspace-chrome', 'open workspace', 'new terminal', 'split terminal', 'copy', 'open', 'ask every time'];
      if (NON_HITL_WORDS.some(w => lower.includes(w))) return false;
      return HITL_WORDS.some(w => lower === w || lower.startsWith(w)) || /^\s*$/.test(lower);
    };

    // --- 4c. Permission dialogs (broad scan) ---
    const PERM_REGEX = /^(allow|deny|allow once|allow this conversation|block)$/i;
    const allScopeButtons = Array.from(scopeEl.querySelectorAll('button'));
    const permButtons = allScopeButtons.filter(btn => {
      const text = (btn.textContent || '').trim();
      return PERM_REGEX.test(text) && !btn.disabled;
    });

    if (permButtons.length > 0) {
      const containerMap = new Map();
      for (const btn of permButtons) {
        let container = btn.parentElement;
        for (let depth = 0; depth < 4; depth++) {
          const parent = container?.parentElement;
          if (!parent || parent === scopeEl) break;
          const siblingsWithPerm = Array.from(parent.querySelectorAll('button')).filter(b =>
            PERM_REGEX.test((b.textContent || '').trim())
          );
          if (siblingsWithPerm.length >= 2) {
            container = parent;
            break;
          }
          container = parent;
        }

        if (!containerMap.has(container)) containerMap.set(container, []);
        containerMap.get(container).push(btn);
      }

      for (const [container, btns] of containerMap) {
        const containerEl = container;
        const permBtnTexts = btns.map(b => (b.textContent || '').trim()).filter(Boolean);
        const actionButtons = permBtnTexts.filter(isHitlAction);
        if (actionButtons.length === 0) continue;

        const containerText = containerEl.textContent || '';
        const pathMatch = containerText.match(/access to\s+(.+?)(?:\?|$)/i) ||
                          containerText.match(/read\s+(.+?)(?:\?|$)/i) ||
                          containerText.match(/open\s+(.+?)(?:\?|$)/i);
        const permPath = pathMatch ? pathMatch[1].trim().substring(0, 120) : '';

        const lastToolWithoutButtons = [...toolCalls]
          .reverse()
          .find(tc => tc.footerButtons.length === 0);

        if (lastToolWithoutButtons) {
          lastToolWithoutButtons.footerButtons = actionButtons;
          lastToolWithoutButtons.hasCancelBtn = actionButtons.some(
            t => t.toLowerCase() === 'deny' || t.toLowerCase() === 'cancel'
          );
          if (!containerEl.dataset.proxyToolId) {
            containerEl.dataset.proxyToolId = lastToolWithoutButtons.id;
          }
        } else {
          if (!containerEl.dataset.proxyToolId) {
            window.__proxyToolCounter = window.__proxyToolCounter || 100;
            containerEl.dataset.proxyToolId = String(window.__proxyToolCounter++);
          }
          toolCalls.push({
            id: containerEl.dataset.proxyToolId,
            status: 'Permission Required',
            type: 'read',
            path: permPath,
            footerButtons: actionButtons
          });
        }
      }
    }

    return { toolCalls, foundPermButtons: permButtons.length };
  });

  console.log('\nButtons found directly by regex:', state.foundPermButtons);
  console.log('Resulting tool calls state:');
  console.log(JSON.stringify(state.toolCalls, null, 2));

  await b.disconnect();
})().catch(console.error);
