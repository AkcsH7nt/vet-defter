// Çevrimdışı çalışma: uygulamanın tüm dosyaları ilk açılışta telefona kaydedilir.
// Dosyalardan biri değişince SURUM artırılmalı.
const SURUM = 'vet-defter-v1';
const DOSYALAR = [
  './', 'index.html', 'style.css', 'app.js', 'ui/ortak.js',
  'manifest.webmanifest', 'ikon.svg', 'ikon-192.png', 'ikon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', (o) => {
  // cache: 'reload' → tarayıcının HTTP önbelleğindeki eski dosyalar yeni sürüme karışmasın.
  o.waitUntil(caches.open(SURUM)
    .then((c) => c.addAll(DOSYALAR.map((d) => new Request(d, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (o) => {
  o.waitUntil((async () => {
    for (const ad of await caches.keys()) if (ad !== SURUM) await caches.delete(ad);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (o) => {
  if (o.request.method !== 'GET') return;
  o.respondWith((async () => {
    const onbellek = await caches.open(SURUM);
    const istek = o.request.mode === 'navigate' ? './' : o.request;
    const kayitli = await onbellek.match(istek, { ignoreSearch: true, ignoreVary: true });
    return kayitli ?? fetch(o.request);
  })());
});
