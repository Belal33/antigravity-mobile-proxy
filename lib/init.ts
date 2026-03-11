/**
 * CDP initialization.
 * Ensures the CDP connection is established before any API route runs.
 * Called lazily on first API request.
 */

import { connectToWorkbench } from './cdp/connection';
import { logger } from './logger';
import ctx from './context';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureCdpConnection(): Promise<void> {
  if (initialized && ctx.workbenchPage) return;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await connectToWorkbench(ctx);
        initialized = true;

        // Auto-reconnect on IDE close/crash
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

      } catch (e: any) {
        logger.error('[CDP Init] Failed to connect:', e.message);
        initPromise = null; // Allow retry
      }
    })();
  }

  await initPromise;
}
