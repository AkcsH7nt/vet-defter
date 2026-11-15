// Çevrimdışı çalışma: uygulamanın tüm dosyaları ilk açılışta telefona kaydedilir.
// Dosyalardan biri değişince `npm run surum` (içerik özetini yazar, SURUM artar); npm test eski özeti yakalar.
// icerik: a8afee7d9f5cf10d
const SURUM = 'vet-defter-v24';
const DOSYALAR = [
  './', 'index.html', 'style.css', 'app.js',
  'ui/ortak.js', 'ui/tani.js', 'ui/sonuc.js', 'ui/hastalik.js', 'ui/oneri.js', 'ui/etken.js', 'ui/kub.js', 'ui/listeler.js', 'ui/hakkinda.js',
  'manifest.webmanifest', 'ikon.svg', 'ikon-192.png', 'ikon-512.png', 'apple-touch-icon.png',
  'lib/veri.js', 'lib/onay.js', 'lib/arama.js', 'lib/puan.js', 'lib/bayrak.js', 'lib/kub.js', 'lib/oran.js', 'lib/hayvan.js', 'lib/oneri.js',
  'veri/meta.json', 'veri/belirtiler.json', 'veri/etkenler.json', 'veri/bayraklar.json',
  'veri/ihbar.json', 'veri/yasaklar.json', 'veri/urunler.json', 'veri/kub.json',
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
    const eskiler = (await caches.keys()).filter((ad) => ad !== SURUM);
    for (const ad of eskiler) await caches.delete(ad);
    await self.clients.claim();
    // Güncellemede (eski sürüm önbelleği vardıysa) açık pencereleri kendi adreslerine yeniden yükle: yeni ui/*.js
    // modülleri sayfada yüklü kalan eski ortak.js ile bağlanıp "Bu ekran yüklenemedi" vermesin. Girdi sessionStorage'da
    // kalır. activate her sürümde bir kez çalışır ve ilk kurulumda eski önbellek yoktur: döngü olmaz.
    // navigate() beklenmez: yeni sayfanın isteği ancak etkinleşme bitince karşılanır (beklemek kilitlenir).
    if (eskiler.some((ad) => ad.startsWith('vet-defter-'))) {
      for (const c of await self.clients.matchAll({ type: 'window' })) {
        c.navigate(c.url).catch(() => { /* denetlenmeyen ya da kapanmış pencere */ });
      }
    }
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
