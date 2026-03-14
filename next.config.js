/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  // Fix 1: puppeteer is on Next.js's default auto-external list, which causes
  // Turbopack to mangle the module name with a content hash in standalone
  // builds, making it unresolvable. transpilePackages forces it to be
  // bundled into the server output instead.
  transpilePackages: ['puppeteer-core'],
  // Fix 2: Next.js 16.1.6 on Node 24 fails to transpose function properties
  // from next.config.ts via SWC. The default generateBuildId becomes undefined,
  // causing "TypeError: generate is not a function" during the build.
  // Using next.config.js (CJS) avoids this TS transpilation path entirely.
  generateBuildId: async () => 'standalone-build',
};

module.exports = nextConfig;
