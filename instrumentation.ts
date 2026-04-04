/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * This runs once when the Next.js server starts. We use it to kick off the
 * background network watchdog so CDP auto-recovery fires as soon as network
 * connectivity returns — without waiting for an incoming HTTP request.
 */
export async function register() {
  // Only run on the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNetworkWatchdog, ensureCdpConnection } = await import('./lib/init');
    startNetworkWatchdog();

    // Start CDP connection eagerly so it's ready before the first API request.
    // Fire-and-forget: don't block server startup — auto-recovery handles failures.
    ensureCdpConnection().catch((e) => {
      console.warn(`[Startup] CDP init failed (will retry on first request): ${e.message}`);
    });
  }
}
