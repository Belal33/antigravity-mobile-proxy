const puppeteer = require('puppeteer-core');

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223', defaultViewport: null });
  const allPages = await browser.pages();
  const targetPage = allPages.find(p => p.url().includes('workbench.html') && !p.url().includes('jetski') && p.url().includes('antigravity-chat-proxy'));
  
  if (!targetPage) {
    console.log("No targeted page found");
    process.exit(1);
  }
  
  const data = await targetPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: "No panel" };
    
    // Scan ENTIRE panel instead of just the last turn
    const fileToolRows = panel.querySelectorAll('.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)');
    const containerTools = panel.querySelectorAll('.flex.flex-col.gap-2.border.rounded-lg.my-1');
    const scrollArea = panel.querySelector('#conversation .overflow-y-auto');
    const msgList = scrollArea?.querySelector('.mx-auto');
    const turns = msgList ? Array.from(msgList.children) : [];
    
    const turnCount = turns.length;
    
    const tools = Array.from(fileToolRows).map(row => {
      const cls = row.className;
      const text = (row.textContent || '').substring(0, 100).replace(/\s+/g, ' ').trim();
      
      // Determine which turn it belongs to
      let parentTurnIndex = -1;
      let el = row;
      while (el && el !== msgList) {
        if (el.parentElement === msgList) {
          parentTurnIndex = turns.indexOf(el);
          break;
        }
        el = el.parentElement;
      }
      return { type: 'inline', turnIndex: parentTurnIndex, text };
    });
    
    return {
      turnCount,
      totalInlineScanned: fileToolRows.length,
      tools: tools.slice(-10)
    };
  });
  
  console.log(JSON.stringify(data, null, 2));
  await browser.disconnect();
}
main();
