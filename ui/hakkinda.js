// Hakkında: kaynaklar, liste tarihleri, katsayıların niteliği, sorumluluk.
import { el, doldur, sorumlulukNotu, tarihYaz } from './ortak.js';

export function render(kok, veri) {
  const m = veri.meta ?? {};
  doldur(kok, 
    el('h1', {}, 'Hakkında'),
    el('h2', {}, 'Kaynaklar'),
    el('ul', { class: 'madde' },
      el('li', {}, 'Dozlar yalnız ürünün kısa ürün bilgisinden (KÜB) alınır; KÜB doğrulanmamış üründe doz gösterilmez.'),
      el('li', {}, `Ruhsatlı ürün listesi tarihi: ${tarihYaz(m.urunListesiTarihi)}`),
      el('li', {}, `İhbarı mecburi hastalıklar: ${veri.ihbar?.kaynak ?? 'kaynak yok'}${veri.ihbar?.kaynakTarihi ? ` (${tarihYaz(veri.ihbar.kaynakTarihi)})` : ''}`),
      el('li', {}, `İçerik sürümü: ${m.icerikSurumu ?? 'bilinmiyor'}`)),
    el('h2', {}, 'Uyum yüzdesi'),
    el('p', {}, 'Uyum yüzdesi, seçilen bulguların hastalığın beklenen belirtileriyle örtüşme oranıdır. Katsayılar uzman tahminidir; kalibre edilmemiştir ve kesin tanı değildir.'),
    el('h2', {}, 'Sorumluluk'),
    sorumlulukNotu(),
  );
}
