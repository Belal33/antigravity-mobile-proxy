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
    const obj = {};
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { error: "No panel" };
    
    const stepGroups = panel.querySelectorAll('.relative.flex.flex-col.gap-y-3 > div');
    obj.count = stepGroups.length;
    obj.htmlStr = [];
    
    // Dump HTML of step groups 1 and 2 where we suspect the tools live
    if (stepGroups.length > 1) {
       let el1 = stepGroups[1].cloneNode(true);
       el1.querySelectorAll('svg, path').forEach(n => n.remove());
       obj.htmlStr.push(el1.outerHTML);
    }
    if (stepGroups.length > 2) {
       let el2 = stepGroups[2].cloneNode(true);
       el2.querySelectorAll('svg, path').forEach(n => n.remove());
       obj.htmlStr.push(el2.outerHTML);
    }
    
    return obj;
  });
  
  console.log(data);
  await browser.disconnect();
}
main();
