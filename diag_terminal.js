// Quick verify: does the production logic return real terminal text?
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
  const pages = await browser.pages();

  let page = null;
  for (const p of pages) {
    const has = await p.evaluate(() => !!document.querySelector('.component-shared-terminal'));
    if (has) { page = p; break; }
  }
  if (!page) { console.log('No terminal page'); await browser.disconnect(); return; }

  const output = await page.evaluate(() => {
    var term = document.querySelector('.component-shared-terminal');
    if (!term) return 'no terminal';

    try {
      var xtermDiv = term.querySelector('.terminal.xterm');
      var wrapper = xtermDiv && xtermDiv.parentElement && xtermDiv.parentElement.parentElement;
      var xtermInst = wrapper && wrapper.xterm;
      if (!xtermInst || !xtermInst.buffer || !xtermInst.buffer.active) return 'no buffer';

      var buf = xtermInst.buffer.active;
      var cols = xtermInst.cols || 80;
      var rawLines = [];
      for (var i = Math.max(0, buf.length - 120); i < buf.length; i++) {
        var line = buf.getLine(i);
        if (line) rawLines.push(line.translateToString(true));
      }

      var joined = [];
      for (var i = 0; i < rawLines.length; i++) {
        var cur = rawLines[i];
        if (joined.length > 0 && rawLines[i-1] && rawLines[i-1].length === cols) {
          joined[joined.length-1] += cur;
        } else {
          joined.push(cur);
        }
      }
      return joined.filter(function(l){ return l.trim(); }).join('\n').substring(0, 2000);
    } catch(e) {
      return 'ERROR: ' + e.message;
    }
  });

  console.log('=== Terminal Output ===');
  console.log(output);
  await browser.disconnect();
  process.exit(0);
})().catch(function(e){ console.error(e.message); process.exit(1); });
