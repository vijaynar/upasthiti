// Service worker for the web-push (VAPID) notification channel
// (packages/platform/src/notify/channels/push.ts, Phase 10). Registered
// from /me/notifications — its only job is to turn a `push` event into a
// visible OS notification; there's no offline-caching story here (Doc 08
// §12's true offline sync is a known, separate, unbuilt gap).

self.addEventListener('push', (event) => {
  let payload = { title: 'Abhyas', body: '' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Abhyas', { body: payload.body }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
