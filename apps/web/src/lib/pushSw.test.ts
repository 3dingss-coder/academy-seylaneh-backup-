import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

/** Runs public/push-sw.js against a minimal fake service-worker scope. */
function loadWorker(hasPreviousWorker: boolean) {
  const listeners: Record<string, Listener> = {};
  const navigate = vi.fn(() => Promise.resolve());
  const claim = vi.fn(() => Promise.resolve());
  const sameOrigin = { url: 'https://academy.test/packages', navigate };
  const otherOrigin = { url: 'https://evil.test/', navigate: vi.fn(() => Promise.resolve()) };
  const self = {
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    registration: { active: hasPreviousWorker ? {} : null, showNotification: vi.fn() },
    clients: { claim, matchAll: () => Promise.resolve([sameOrigin, otherOrigin]) },
    location: { origin: 'https://academy.test' },
  };
  runInNewContext(readFileSync('public/push-sw.js', 'utf8'), { self, URL });
  const fire = async (type: string) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]?.({ waitUntil: (p) => (pending = p) });
    await pending;
  };
  return { fire, navigate, claim, otherOrigin };
}

describe('push-sw.js update delivery', () => {
  it('reloads open pages of the same origin when it replaces an older worker', async () => {
    const w = loadWorker(true);
    await w.fire('install');
    await w.fire('activate');
    expect(w.claim).toHaveBeenCalled();
    expect(w.navigate).toHaveBeenCalledWith('https://academy.test/packages');
    expect(w.otherOrigin.navigate).not.toHaveBeenCalled();
  });

  it('does not reload anything on the very first install', async () => {
    const w = loadWorker(false);
    await w.fire('install');
    await w.fire('activate');
    expect(w.navigate).not.toHaveBeenCalled();
  });
});
