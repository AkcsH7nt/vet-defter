// Çevrimdışı çalışma: uygulamanın tüm dosyaları ilk açılışta telefona kaydedilir.
// Dosyalardan biri değişince SURUM artırılmalı.
const SURUM = 'vet-defter-v5';
const DOSYALAR = [
  './', 'index.html', 'style.css', 'app.js',
  'ui/ortak.js', 'ui/tani.js', 'ui/sonuc.js', 'ui/hastalik.js', 'ui/etken.js', 'ui/listeler.js', 'ui/hakkinda.js',
  'manifest.webmanifest', 'ikon.svg', 'ikon-192.png', 'ikon-512.png', 'apple-touch-icon.png',
  'lib/veri.js', 'lib/onay.js', 'lib/arama.js', 'lib/puan.js', 'lib/bayrak.js',
  'veri/meta.json', 'veri/belirtiler.json', 'veri/etkenler.json', 'veri/bayraklar.json',
  'veri/ihbar.json', 'veri/yasaklar.json', 'veri/urunler.json',
  'veri/hastaliklar/index.json', 'veri/hastaliklar/solunum.json', 'veri/hastaliklar/sindirim.json',
  'veri/hastaliklar/meme_ureme.json', 'veri/hastaliklar/metabolik.json', 'veri/hastaliklar/deri_ayak.json',
  'veri/hastaliklar/kan_parazit.json', 'veri/hastaliklar/ihbar_zehir.json',
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
    if (kayitli) return kayitli;
    try {
      return await fetch(o.request);
    } catch {
      // Önbellekte yok ve ağ yok: yakalanmamış hata yerine düzgün yanıt.
      if (o.request.mode === 'navigate') {
        const kabuk = await onbellek.match('./', { ignoreSearch: true, ignoreVary: true });
        if (kabuk) return kabuk;
      }
      return new Response('Çevrimdışı', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
