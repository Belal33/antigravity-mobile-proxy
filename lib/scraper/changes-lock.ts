/**
 * Simple async mutex for serialising access to the IDE's Changes Overview panel.
 *
 * Both the changes scraper (polling every few seconds) and the accept/reject
 * actions toggle the changesOverview button in the IDE DOM.  If they run
 * concurrently the panel ends up in an inconsistent state (e.g. one operation
 * opens it, the other closes it mid-way, buttons disappear, etc.).
 *
 * By acquiring this lock, any caller guarantees exclusive access to the
 * changesOverview toggle while it works.
 */

let _queue: (() => void)[] = [];
let _locked = false;

export async function acquireChangesLock(): Promise<void> {
  if (!_locked) {
    _locked = true;
    return;
  }
  return new Promise<void>((resolve) => {
    _queue.push(resolve);
  });
}

export function releaseChangesLock(): void {
  if (_queue.length > 0) {
    const next = _queue.shift()!;
    next();
  } else {
    _locked = false;
  }
}

/**
 * Convenience wrapper: runs `fn` while holding the lock, releasing it
 * on return or error.
 */
export async function withChangesLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireChangesLock();
  try {
    return await fn();
  } finally {
    releaseChangesLock();
  }
}
