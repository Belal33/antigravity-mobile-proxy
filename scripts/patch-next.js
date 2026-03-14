#!/usr/bin/env node
/**
 * Patches Next.js 16.1.6's generate-build-id.js to gracefully handle the
 * case where config.generateBuildId is undefined (a known bug in this version
 * when the config is loaded via ESM import() on Node 24).
 */
const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'next',
  'dist',
  'build',
  'generate-build-id.js'
);

if (!fs.existsSync(targetFile)) {
  console.log('[patch-next] generate-build-id.js not found, skipping patch.');
  process.exit(0);
}

const original = fs.readFileSync(targetFile, 'utf8');
const patched = `"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "generateBuildId", {
    enumerable: true,
    get: function() {
        return generateBuildId;
    }
});
async function generateBuildId(generate, fallback) {
    // Patch: guard against undefined generate (Next.js 16.1.6 bug on Node 24)
    if (typeof generate !== 'function') {
        generate = () => null;
    }
    let buildId = await generate();
    // If there's no buildId defined we'll fall back
    if (buildId === null) {
        // We also create a new buildId if it contains the word \`ad\` to avoid false
        // positives with ad blockers
        while(!buildId || /ad/i.test(buildId)){
            buildId = fallback();
        }
    }
    if (typeof buildId !== 'string') {
        throw Object.defineProperty(new Error('generateBuildId did not return a string. https://nextjs.org/docs/messages/generatebuildid-not-a-string'), "__NEXT_ERROR_CODE", {
            value: "E455",
            enumerable: false,
            configurable: true
        });
    }
    return buildId.trim();
}

//# sourceMappingURL=generate-build-id.js.map
`;

if (original.includes('typeof generate !==')) {
  console.log('[patch-next] Already patched, skipping.');
  process.exit(0);
}

fs.writeFileSync(targetFile, patched);
console.log('[patch-next] Patched Next.js generate-build-id.js successfully.');
