/**
 * CDP initialization.
 * Ensures the CDP connection is established before any API route runs.
 * Called lazily on first API request.
 * 
 * Auto-recovery: If Antigravity is running without CDP, or CDP is a "zombie"
 * (reachable but 0 workbench pages), the proxy will automatically kill existing
 * instances and restart Antigravity with --remote-debugging-port enabled.
 */

import { connectToWorkbench } from './cdp/connection';
import { isCdpServerActive, startCdpServer } from './cdp/process-manager';
import { logger } from './logger';
import ctx from './context';

let initialized = false;
let initPromise: Promise<void> | null = null;

/** Maximum number of auto-recovery attempts before giving up */
const MAX_RECOVERY_ATTEMPTS = 2;

export async function ensureCdpConnection(): Promise<void> {
  if (initialized && ctx.workbenchPage) return;

  if (!initPromise) {
    initPromise = (async () => {
      // First, try a normal connection
      try {
        await connectToWorkbench(ctx);
        initialized = true;
        setupDisconnectHandlers();
        return;
      } catch (e: any) {
        logger.warn('[CDP Init] Initial connection failed:', e.message);
        // Don't give up — try auto-recovery below
      }

      // ── Auto-Recovery ────────────────────────────────────────────
      // Detect the state and attempt to fix it automatically.
      logger.info('[CDP Init] Attempting auto-recovery...');

      for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
        logger.info(`[CDP Init] Recovery attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS}`);

        // Check if CDP endpoint is reachable at all
        const status = await isCdpServerActive();

        if (status.active && status.windowCount === 0) {
          // ZOMBIE STATE: CDP server responds but has 0 workbench pages.
          // This happens when Antigravity was launched without --remote-debugging-port
          // and a second instance with CDP merged into it then exited.
          logger.warn('[CDP Init] Zombie CDP detected: server active but 0 workbench pages. Killing and restarting...');
        } else if (!status.active) {
          // CDP not reachable at all — Antigravity not running or launched without CDP.
          logger.warn('[CDP Init] CDP server not reachable. Starting Antigravity with CDP...');
        } else {
          // CDP is active with windows — something else went wrong in connectToWorkbench.
          // Try connecting again.
          logger.info(`[CDP Init] CDP active with ${status.windowCount} window(s). Retrying connection...`);
        }

        // Kill existing instances and restart with CDP
        const result = await startCdpServer('.', true);

        if (!result.success) {
          logger.error(`[CDP Init] Auto-recovery failed: ${result.message}`);
          continue;
        }

        logger.info(`[CDP Init] Antigravity restarted: ${result.message}`);

        // Wait a bit for workbench pages to fully load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Reset browser state for a fresh connection
        if (ctx.browser) {
          try { ctx.browser.disconnect(); } catch {}
          ctx.browser = null;
          ctx.workbenchPage = null;
          ctx.allWorkbenches = [];
        }

        // Try connecting again
        try {
          await connectToWorkbench(ctx);
          initialized = true;
          setupDisconnectHandlers();
          logger.info('[CDP Init] Auto-recovery successful! Connected to workbench.');
          return;
        } catch (retryErr: any) {
          logger.error(`[CDP Init] Recovery attempt ${attempt} connection failed: ${retryErr.message}`);
        }
      }

      // All recovery attempts failed
      logger.error(`[CDP Init] All ${MAX_RECOVERY_ATTEMPTS} recovery attempts failed. Please start Antigravity manually with --remote-debugging-port=9223`);
      initPromise = null; // Allow retry on next request
    })();
  }

  await initPromise;
}

/**
 * Set up handlers for browser disconnect and page close events.
 * This allows auto-reconnect on the next incoming request.
 */
function setupDisconnectHandlers() {
  ctx.browser?.on('disconnected', () => {
    logger.error('[CDP] Browser disconnected. Will reconnect on next request.');
    initialized = false;
    initPromise = null;
    ctx.workbenchPage = null;
    ctx.browser = null;
    ctx.allWorkbenches = [];
  });

  ctx.workbenchPage?.on('close', () => {
    logger.warn('[CDP] Workbench page closed. Will reconnect on next request.');
    initialized = false;
    initPromise = null;
    ctx.workbenchPage = null;
  });
}
