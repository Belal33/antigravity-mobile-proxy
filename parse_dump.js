const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('dom_dump.json', 'utf8'));

// The dump contains outerHTML of the task boundaries.
const html = raw[0];

// Let's print out snippets that contain 'animate'
const matches = [...html.matchAll(/(class="[^"]*animate[^"]*")/g)];
console.log("Classes with 'animate':");
matches.forEach(m => console.log(m[0]));

// Let's print out snippets that contain 'svg' and 'spin'
const svgMatches = [...html.matchAll(/(<svg[^>]*>.*?<\/svg>|<div[^>]*animate-spin[^>]*>)/g)];
console.log("\nSVGs and spinners:");
svgMatches.forEach(m => {
    if (m[0].includes('spin') || m[0].includes('lucide')) {
        console.log(m[0].substring(0, 150) + '...');
    }
});
