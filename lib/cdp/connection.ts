/**
 * CDP (Chrome DevTools Protocol) connection management.
 * Handles connecting to Antigravity's Electron app via Puppeteer.
 */

import puppeteer, { Browser } from 'puppeteer-core';
import { logger } from '../logger';
import type { ProxyContext } from '../types';

const CDP_PORT_RAW = process.env.CDP_PORT || '9223';
const CDP_PORT = parseInt(CDP_PORT_RAW, 10);

/**
 * Discover all workbench pages in the Electron app.
 */
export async function discoverWorkbenches(ctx: ProxyContext) {
  if (isNaN(CDP_PORT) || CDP_PORT <= 0 || CDP_PORT > 65535) {
    throw new Error(`[CDP] Invalid CDP_PORT configured: "${CDP_PORT_RAW}". Please check your .env.local file.`);
  }

  if (!ctx.browser || !ctx.browser.isConnected()) {
    logger.info(`[CDP] Initializing connection on port ${CDP_PORT}...`);
    try {
      ctx.browser = await puppeteer.connect({
        browserURL: `http://localhost:${CDP_PORT}`,
        defaultViewport: null,
      });
      ctx.browser.on('disconnected', () => {
        logger.info('[CDP] Browser disconnected. Resetting context...');
        ctx.browser = null;
        ctx.workbenchPage = null;
        ctx.allWorkbenches = [];
      });
    } catch (err) {
      logger.error(`[CDP] Failed to connect on port ${CDP_PORT}. Ensure IDE is running with --remote-debugging-port=${CDP_PORT}`);
      throw err;
    }
  }
  const pages = await ctx.browser.pages();

  ctx.allWorkbenches = [];
  for (const p of pages) {
    const url = p.url();
    if (url.includes('workbench.html') && !url.includes('jetski')) {
      const title = await p.title();
      ctx.allWorkbenches.push({ page: p, title, url });
    }
  }
  return ctx.allWorkbenches;
}

/**
 * Connect to the default (or env-specified) workbench window.
 */
export async function connectToWorkbench(ctx: ProxyContext) {
  await discoverWorkbenches(ctx);

  if (ctx.allWorkbenches.length === 0) {
    throw new Error(
      'No workbench pages found. Is Antigravity running with --remote-debugging-port=9223?'
    );
  }

  logger.info(`[CDP] Found ${ctx.allWorkbenches.length} Antigravity window(s).`);
  for (let i = 0; i < ctx.allWorkbenches.length; i++) {
    logger.info(`  [${i}] ${ctx.allWorkbenches[i].title}`);
  }

  const targetIdx = parseInt(process.env.PROXY_PAGE || '0', 10);
  ctx.activeWindowIdx = targetIdx;
  ctx.workbenchPage =
    ctx.allWorkbenches[targetIdx]?.page || ctx.allWorkbenches[0].page;
  
  ctx.workbenchPage.on('close', () => {
    logger.info('[CDP] Workbench page closed. Resetting context...');
    ctx.workbenchPage = null;
  });

  logger.info(`[CDP] Active window index set to ${ctx.activeWindowIdx}. Connected to: "${ctx.allWorkbenches[ctx.activeWindowIdx]?.title || 'unknown'}"`);
}

/**
 * Switch to a different workbench window by index.
 */
export function selectWindow(ctx: ProxyContext, idx: number) {
  if (idx < 0 || idx >= ctx.allWorkbenches.length) {
    throw new Error(
      `Invalid window index ${idx}. Available: 0-${ctx.allWorkbenches.length - 1}`
    );
  }
  ctx.activeWindowIdx = idx;
  ctx.workbenchPage = ctx.allWorkbenches[idx].page;
  logger.info(`[CDP] Switched to window [${idx}] ${ctx.allWorkbenches[idx].title}`);
  return ctx.allWorkbenches[idx];
}
