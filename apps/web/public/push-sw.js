/* Web Push handler, imported into the Workbox service worker (vite.config.ts → importScripts).
 * FCM delivers `{ notification: {title, body}, data: {link, notificationId, type}, fcmOptions }`. */
self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (_) {
    p = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const n = p.notification || {};
  const data = p.data || {};
  const link = (p.fcmOptions && p.fcmOptions.link) || data.link || '/notifications';
  event.waitUntil(
    self.registration.showNotification(n.title || 'آکادمی سیلانه', {
      body: n.body || '',
      ...(n.image || data.imageUrl ? { image: n.image || data.imageUrl } : {}),
      icon: '/push-icons/push-icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'fa',
      tag: data.notificationId || undefined,
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(raw, self.location.origin);
  // Only navigate inside our own origin.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* Update delivery. Pages opened from an OLD cached build have no code to reload themselves, so the
 * new worker does it: it takes over (skipWaiting + clientsClaim in the Workbox config) and then
 * navigates every open window to its own URL, which loads the fresh build. `registration.active`
 * is only set while installing when a previous worker exists, i.e. this is an update — the very
 * first install never reloads the page. */
let isUpdate = false;
self.addEventListener('install', () => {
  isUpdate = !!self.registration.active;
});
self.addEventListener('activate', (event) => {
  if (!isUpdate) return;
  event.waitUntil(
    self.clients
      .claim()
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((wins) =>
        Promise.all(
          wins.map((w) =>
            'navigate' in w && new URL(w.url).origin === self.location.origin
              ? w.navigate(w.url).catch(() => undefined)
              : undefined,
          ),
        ),
      ),
  );
});
