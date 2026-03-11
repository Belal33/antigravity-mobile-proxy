const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });

const searchTitle = "Implementing Client Pricing Specs";
let foundId = null;

for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const dirPath = path.join(BRAIN_DIR, entry.name);
        const taskFile = path.join(dirPath, 'task.md');
        if (fs.existsSync(taskFile)) {
            const content = fs.readFileSync(taskFile, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if ( trimmed.startsWith('# ') ) {
                    const convTitle = trimmed.slice(2).trim();
                    if (convTitle === searchTitle || convTitle.includes(searchTitle) || searchTitle.includes(convTitle)) {
                        foundId = entry.name;
                        console.log(`[MATCH] ${entry.name} -> task.md title: ${convTitle}`);
                    }
                    break;
                }
            }
        }
    }
}
if (!foundId) console.log(`No match found for: ${searchTitle}`);
