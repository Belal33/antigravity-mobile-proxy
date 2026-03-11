const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });

for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const dirPath = path.join(BRAIN_DIR, entry.name);
        const taskFile = path.join(dirPath, 'task.md');
        if (fs.existsSync(taskFile)) {
            const content = fs.readFileSync(taskFile, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if ( trimmed.startsWith('# ') ) {
                    const title = trimmed.slice(2).trim();
                    console.log(`[${entry.name}] Title="${title}"`);
                    break;
                }
            }
        }
    }
}
