/* Tourny intentionally keeps application and API requests network-authoritative. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

/* Web push: show the alert the server sent, and open the right page when it is tapped. */
self.addEventListener('push', (event) => {
  let message = { title: 'Tourny', body: '', data: {} };
  try { message = { ...message, ...event.data.json() }; } catch { /* an empty or plain-text push still shows a notification */ }
  const data = message.data || {};
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    data,
    icon: '/icons/apple-touch-icon.png',
    tag: data.matchId ? 'match-' + data.matchId : undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const query = new URLSearchParams();
  for (const key of ['kind', 'matchId', 'teamId', 'tournamentId']) if (d[key]) query.set(key, d[key]);
  const target = '/notify?' + query.toString();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const w of windows) { if ('focus' in w) { w.navigate(target); return w.focus(); } }
    return self.clients.openWindow(target);
  }));
});
