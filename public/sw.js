// Hors-ligne : à l'installation on met tout en cache (liste dans precache.json) ; ensuite réseau d'abord, cache en secours.
const PREFIXE = "echecs-";
let CACHE = PREFIXE + "v0";
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    try {
      const { version, fichiers } = await (await fetch("precache.json", { cache: "no-store" })).json();
      CACHE = PREFIXE + version;
      const c = await caches.open(CACHE);
      await Promise.allSettled(fichiers.map((f) => c.add(f)));
    } catch { /* hors-ligne à l'installation : le cache se remplira à l'usage */ }
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const noms = await caches.keys();
  let courant = CACHE;
  try { courant = PREFIXE + (await (await fetch("precache.json")).json()).version; } catch { /* ignore */ }
  await Promise.all(noms.filter((n) => n.startsWith(PREFIXE) && n !== courant).map((n) => caches.delete(n)));
  CACHE = courant;
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return; // jamais Supabase
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
