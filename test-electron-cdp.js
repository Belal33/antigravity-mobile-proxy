const puppeteer = require('puppeteer-core');
async function run() {
    try {
        const browser = await puppeteer.connect({ browserURL: 'http://localhost:9223' });
        const pages = await browser.pages();

        let workbench = null;
        for (const p of pages) {
            const url = p.url();
            if (url.includes('workbench.html') && !url.includes('jetski')) {
                workbench = p;
                break;
            }
        }

        if (!workbench) {
            console.log('Workbench page not found');
            browser.disconnect();
            return;
        }

        console.log('Connected. Examining #conversation structure...\n');

        const convDump = await workbench.evaluate(() => {
            const conv = document.getElementById('conversation');
            if (!conv) return { error: 'No #conversation element' };

            const results = {
                id: conv.id,
                childCount: conv.children.length,
                children: []
            };

            // Examine direct children of #conversation
            for (let i = 0; i < conv.children.length; i++) {
                const child = conv.children[i];
                const childInfo = {
                    index: i,
                    tag: child.tagName,
                    className: (child.className || '').substring(0, 200),
                    childCount: child.children.length,
                    textLength: child.textContent?.length || 0,
                    scrollHeight: child.scrollHeight,
                    textPreview: child.textContent?.substring(0, 300) || ''
                };

                // Go one level deeper for the messages area
                if (child.textContent?.length > 1000) {
                    childInfo.innerChildren = [];
                    for (let j = 0; j < Math.min(child.children.length, 5); j++) {
                        const inner = child.children[j];
                        childInfo.innerChildren.push({
                            index: j,
                            tag: inner.tagName,
                            className: (inner.className || '').substring(0, 200),
                            childCount: inner.children.length,
                            textLength: inner.textContent?.length || 0,
                        });

                        // Go even deeper to find message blocks  
                        if (inner.children.length > 0) {
                            childInfo.innerChildren[j].deepChildren = [];
                            for (let k = 0; k < Math.min(inner.children.length, 10); k++) {
                                const deep = inner.children[k];
                                childInfo.innerChildren[j].deepChildren.push({
                                    index: k,
                                    tag: deep.tagName,
                                    className: (deep.className || '').substring(0, 200),
                                    childCount: deep.children.length,
                                    textLength: deep.textContent?.length || 0,
                                    textPreview: deep.textContent?.substring(0, 200) || ''
                                });
                            }
                        }
                    }
                }

                results.children.push(childInfo);
            }

            return results;
        });

        console.log(JSON.stringify(convDump, null, 2));

        browser.disconnect();
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
