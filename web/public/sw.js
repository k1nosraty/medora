self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));

self.addEventListener("push", event => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    data = null;
  }
  const medication = typeof data?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.day);
  const options = {
    body: data?.body ?? "اعلان آزمایشی به این دستگاه رسید.",
    tag: data?.tag,
    icon: "/icon-192.png"
  };
  if (medication) options.data = { day: data.day };
  event.waitUntil(self.registration.showNotification(data?.title ?? "آزمایش اعلان مدورا", options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const day = event.notification.data?.day;
    const path = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? `/medication/?day=${day}` : "/pilot/";
    const existing = windows.find(client => new URL(client.url).pathname === path.split("?")[0]);
    if (existing) {
      if (new URL(existing.url).search !== new URL(path, self.location.origin).search) await existing.navigate(path);
      await existing.focus();
    } else await self.clients.openWindow(path);
  })());
});
