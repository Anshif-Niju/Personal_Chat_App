/* PrivateChat service worker: Web Push notifications only (no offline caching). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Anshif Chat', body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a tab is focused the app shows its own in-app notification.
      if (clients.some((c) => c.focused)) return;
      const d = data.data || {};
      return self.registration.showNotification(data.title || 'Anshif Chat', {
        body: data.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: d.conversationId || d.callId || d.type || 'privatechat',
        renotify: true,
        requireInteraction: d.type === 'incoming_call',
        data: d,
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.conversationId ? `/chat/${d.conversationId}` : d.type === 'friend_request' ? '/friends' : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
