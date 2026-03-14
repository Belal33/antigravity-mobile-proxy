// Check the current state of standalone window (agent should be idle now)
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
  const pages = await browser.pages();
  let p = null;
  for (const pg of pages) { const t = await pg.title(); if (t.includes('standalone')) { p = pg; break; } }
  if (!p) { console.log('no page'); await browser.disconnect(); return; }
  
  const d = await p.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return {error:'no panel'};
    
    // Spinners
    let spinners = 0;
    for (const s of panel.querySelectorAll('.animate-spin')) {
      let el = s, hidden = false;
      while (el) { const c = el.getAttribute && el.getAttribute('class') || ''; if (c.includes('invisible')||c.includes('opacity-0')) { hidden=true; break; } el=el.parentElement; }
      if (!hidden) spinners++;
    }
    
    // Input area
    const inputArea = document.querySelector('[id="antigravity.agentSidePanelInputBox"]');
    const wrapper = inputArea && (inputArea.closest('.flex') || (inputArea.parentElement && inputArea.parentElement.parentElement));
    const btns = wrapper ? Array.from(wrapper.querySelectorAll('button')) : [];
    
    let hasSend = false;
    for (const b of btns) { if ((b.getAttribute('data-tooltip-id')||'').includes('send')) hasSend = true; }
    
    const summaries = btns.map(b => {
      const svgEls = Array.from(b.querySelectorAll('svg'));
      return { 
        text: (b.textContent||'').trim().substring(0,20), 
        tip: b.getAttribute('data-tooltip-id')||'',
        disabled: b.hasAttribute('disabled'),
        svgs: svgEls.map(s => s.getAttribute('class')||'') 
      };
    });

    // Check if agent has finished - look for thinking blocks or tool calls still executing
    const allPanelBtns = Array.from(panel.querySelectorAll('button'));
    const cancelBtns = allPanelBtns.filter(b => (b.textContent||'').trim() === 'Cancel');
    
    // Check the conversation for any active indicators
    const pulseEls = panel.querySelectorAll('.animate-pulse');
    const typingEls = panel.querySelectorAll('.typing-indicator');
    
    return { 
      spinners, 
      wrapperBtns: btns.length, 
      hasSendButton: hasSend, 
      buttons: summaries,
      cancelBtns: cancelBtns.length,
      pulseElements: pulseEls.length,
      typingIndicators: typingEls.length,
      totalPanelBtns: allPanelBtns.length,
    };
  });
  
  console.log(JSON.stringify(d, null, 2));
  
  // Summary
  console.log('\n--- SUMMARY ---');
  console.log('Send button present:', d.hasSendButton);
  console.log('Wrapper buttons:', d.wrapperBtns);
  console.log('Spinners:', d.spinners);
  console.log('Cancel buttons:', d.cancelBtns);
  console.log('Pulse animations:', d.pulseElements);
  console.log('With fix, isRunning would be:', !d.hasSendButton);
  
  await browser.disconnect();
})().catch(e => console.error(e.message));
