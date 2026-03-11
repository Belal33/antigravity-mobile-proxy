const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });

for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const dirPath = path.join(BRAIN_DIR, entry.name);
        const logDir = path.join(dirPath, '.system_generated', 'logs');
        const overviewFile = path.join(logDir, 'overview.txt');
        
        if (fs.existsSync(overviewFile)) {
            const content = fs.readFileSync(overviewFile, 'utf-8');
            const lines = content.split('\n');
            let foundTitle = null;
            for (const line of lines) {
                if (line.startsWith('Conversation Title: ')) {
                    foundTitle = line.replace('Conversation Title: ', '').trim();
                    break;
                }
            }
            if (foundTitle) {
                console.log(`[${entry.name}] OverviewTitle="${foundTitle}"`);
            }
        }
    }
}
