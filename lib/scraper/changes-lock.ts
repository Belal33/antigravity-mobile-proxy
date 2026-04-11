/**
 * Simple async mutex for serialising access to the IDE's bottom-panel area.
 *
 * The Antigravity IDE renders the "Changes Overview" and "Artifacts" panels
 * in the SAME physical position — their toolbar buttons toggle visibility via
 * CSS `grid-template-columns: 0fr | 1fr`.  If the changes scraper and the
 * artifacts scraper run concurrently they fight over which panel is visible,
 * causing the user to see "flashing" as panels rapidly open/close.
 *
 * The accept-all / reject-all actions also toggle the changes panel, so they
 * must acquire the same lock.
 *
 * By acquiring this lock, any caller guarantees exclusive access to BOTH
 * panel toggles while it works.
 */

let _queue: (() => void)[] = [];
let _locked = false;

export async function acquirePanelLock(): Promise<void> {
  if (!_locked) {
    _locked = true;
    return;
  }
  return new Promise<void>((resolve) => {
    _queue.push(resolve);
  });
}

export function releasePanelLock(): void {
  if (_queue.length > 0) {
    const next = _queue.shift()!;
    next();
  } else {
    _locked = false;
  }
}

/**
 * Convenience wrapper: runs `fn` while holding the panel lock, releasing it
 * on return or error.
 */
export async function withPanelLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquirePanelLock();
  try {
    return await fn();
  } finally {
    releasePanelLock();
  }
}

// ── Backward compat aliases ──
// Existing callers import `withChangesLock` — keep it working.
export const acquireChangesLock = acquirePanelLock;
export const releaseChangesLock = releasePanelLock;
export const withChangesLock = withPanelLock;
