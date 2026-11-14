// Hakkında: kaynaklar, liste tarihleri, katsayıların niteliği, sorumluluk.
import { el, doldur, sorumlulukNotu, tarihYaz, SIRALAMA_ACIKLAMASI } from './ortak.js';

/** Liste kaynağının kısa adı (ilk " — " öncesi) ve doğrulanma durumu; iç çalışma notları ekrana gelmez. */
function listeSatiri(liste) {
  if (!liste) return 'kaynak yok';
  const kisa = String(liste.kaynak ?? 'kaynak yok').split(' — ')[0];
  const tarih = liste.kaynakTarihi ? ` (${tarihYaz(liste.kaynakTarihi)})` : '';
  const dogrulanmamis = (liste.ogeler ?? []).some((o) => o.dogrulandi !== true);
  return `${kisa}${tarih}${dogrulanmamis ? ' — liste henüz resmî metinle karşılaştırılmadı' : ''}`;
}

export function render(kok, veri) {
  const m = veri.meta ?? {};
  doldur(kok,
    el('h1', {}, 'Hakkında'),
    el('h2', {}, 'Kaynaklar'),
    el('ul', { class: 'madde' },
      el('li', {}, 'Dozlar yalnız ürünün kısa ürün bilgisinden (KÜB) alınır; KÜB doğrulanmamış üründe doz gösterilmez.'),
      el('li', {}, 'KÜB bağlantıları Bakanlık sitesine gider ve internet gerektirir.'),
      el('li', {}, `Ruhsatlı ürün listesi tarihi: ${tarihYaz(m.urunListesiTarihi)}`),
      el('li', {}, `İhbarı mecburi hastalıklar: ${listeSatiri(veri.ihbar)}`),
      el('li', {}, `Gıda hayvanında yasak maddeler: ${listeSatiri(veri.yasaklar)}`),
      el('li', {}, `İçerik sürümü: ${m.icerikSurumu ?? 'bilinmiyor'}`)),
    el('h2', {}, 'Uyum yüzdesi ve sıralama'),
    el('p', {}, SIRALAMA_ACIKLAMASI),
    el('p', {}, 'Bu yüzden yüzdesi daha yüksek bir hastalık listede daha aşağıda olabilir. Uyum yüzdesi, seçilen bulguların hastalığın beklenen belirtileriyle örtüşme oranıdır. Katsayılar uzman tahminidir; kalibre edilmemiştir ve kesin tanı değildir.'),
    el('p', {}, 'Kırmızı bantlar puandan bağımsızdır: ihbar ya da zoonoz şüphesi listede kaç sırada olursa olsun en üstte gösterilir. Türkiye\'de görülmeyen hastalıklar ilk 5\'e alınmaz, ayrı bölümde durur; kendi kırmızı bandı çıkarsa normal sıralamaya girer.'),
    el('h2', {}, 'Sorumluluk'),
    sorumlulukNotu(),
  );
}
