// Unvia service worker: shows push notifications and handles taps on them. It deliberately does not cache anything,
// so a deploy is always picked up immediately.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // no-op: lets the browser treat this as an installable app without intercepting requests

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { /* empty or non-JSON push */ }
  e.waitUntil((async () => {
    // If Unvia is open and in front, the in-app badge is enough; don't interrupt.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(d.title || 'Unvia', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch { /* same-document hash change is fine */ } } return; }
    }
    await self.clients.openWindow(url);
  })());
});
