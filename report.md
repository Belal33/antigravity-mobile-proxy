
## 🐛 Root Cause: Two Issues in [package.json](cci:7://file:///C:/Users/COMPUMARTS/AppData/Roaming/npm/node_modules/antigravity-mobile-proxy/package.json:0:0-0:0)

### Issue 1: `scripts/` is not included in the `files` whitelist

In your [package.json](cci:7://file:///C:/Users/COMPUMARTS/AppData/Roaming/npm/node_modules/antigravity-mobile-proxy/package.json:0:0-0:0) (line 16-22), the `files` field acts as a **whitelist** for what npm publishes:

```json
"files": [
    "bin/",
    ".next/standalone/",
    ".next/static/",
    "public/",
    "package.json"
]
```

The `scripts/` directory is **not listed**, so when you run `npm publish`, npm **excludes** the `scripts/` folder entirely from the published tarball. But on line 25, you have:

```json
"postinstall": "node scripts/patch-next.js"
```

This tries to run `scripts/patch-next.js` on the consumer's machine after install — but the file doesn't exist in the published package, so it throws `MODULE_NOT_FOUND` and the install fails.

### Issue 2: `postinstall` runs for consumers, not just for you

The `postinstall` script runs for **every user who installs the package**, not just during your local development. This means:
- When someone runs `npm install -g antigravity-mobile-proxy`, npm downloads your package, then tries to execute `node scripts/patch-next.js` — which doesn't exist.

---

## ✅ Fix

You have two options depending on what `patch-next.js` does:

### Option A: Include `scripts/` in the published files
If the patch script needs to run on the consumer's machine:

```json
"files": [
    "bin/",
    "scripts/",
    ".next/standalone/",
    ".next/static/",
    "public/",
    "package.json"
]
```

### Option B (Recommended): Run the patch at build time, not install time
If `patch-next.js` patches the Next.js standalone output (which seems likely given your architecture), it should run **before publishing**, not after installing. Change it to:

```json
"scripts": {
    "dev": "next dev -p 5555",
    "build": "next build",
    "postbuild": "node scripts/patch-next.js",
    "start": "next start -p 5555",
    "tunnel": "node bin/cli.js",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "prepublishOnly": "NODE_ENV=production npm run build"
}
```

This way:
1. `npm run build` runs `next build`
2. `postbuild` automatically runs `node scripts/patch-next.js` right after the build
3. `prepublishOnly` triggers `npm run build` → which triggers `postbuild` → so the patch is applied **before** the package is published
4. Consumers never need to run the patch — they get the already-patched standalone output

**Option B is the better approach** because it keeps the published package self-contained and doesn't require consumers to have the patch script at all.
