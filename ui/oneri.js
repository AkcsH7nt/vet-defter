// Hastalık sayfasının "Önerilen tedavi" kartı: lib/oneri.js motorunun çıktısını ekrana çizer. KÜB kaynaklı her
// doz/oran/ml öğesi `data-kub` taşır; KÜB metni yalnız textContent ile yazılır (el() zaten böyle yapar).
import { el, YASLAR } from './ortak.js';
import { tedaviOnerisi } from '../lib/oneri.js';
import { kiloOku } from '../lib/hayvan.js';
import { onayliMi } from '../lib/onay.js';
import { urunKarti, kombineBilgisi } from './kub.js';

const SINIF_AD = {
  antimikrobiyal: 'Antimikrobiyal', nsaii: 'Ağrı-yangı', metabolik: 'Metabolik / sıvı', antiparaziter: 'Antiparaziter', diger: 'Diğer',
};
export const TASLAK_SERIT = 'Taslak öneri — hekim onayından geçmedi';
export const KAPANIS_NOTU = "Doz ürünün KÜB'ünden otomatik hesaplandı — uygulamadan önce ürün etiketi/KÜB ile karşılaştırın.";

const virgul = (n) => String(Number(n.toFixed(3))).replace('.', ',');
const madde = (liste) => el('ul', { class: 'madde' }, liste.map((x) => el('li', {}, x)));

function hesapBlogu(hesap) {
  return el('div', { class: 'ml-blok' },
    el('p', { class: 'ml-satir', 'data-kub': '' },
      el('span', { class: 'ml-buyuk' }, `→ ${virgul(hesap.ml)} ml`),
      hesap.ifade ? el('span', { class: 'ml-ifade' }, ` (${hesap.ifade})`) : null,
      hesap.ham !== hesap.ml ? el('small', { class: 'ml-ham soluk' }, ` ham: ${virgul(hesap.ham)} ml`) : null),
    hesap.yerSayisi > 1 ? el('p', { class: 'ml-yer', 'data-kub': '' }, `${hesap.yerSayisi} ayrı yere bölün`) : null,
    hesap.cumle ? el('p', { class: 'kub-cumle', 'data-kub': '' }, hesap.cumle) : null);
}

function satirCiz(satir, veri, oneri) {
  const { ilac, etken, secim } = satir;
  const href = `#/etken/${encodeURIComponent(etken.id)}`;
  const baslik = el('p', { class: 'oneri-etken' },
    el('a', { href, class: 'ilac-ad' }, etken.ad),
    el('span', { class: 'soluk' }, ` · ${ilac.yol}`),
    ilac.not ? el('span', { class: 'soluk' }, ` · ${ilac.not}`) : null);

  const neden = {
    urun_yok: () => 'Listede ruhsatlı sığır ürünü yok',
    oran_yok: () => "KÜB'de kiloya göre tek oran yok — KÜB metnine bakın",
    kilo_yok: () => 'Kilo girin, ml hesaplansın',
    kilo_gecersiz: () => oneri.kiloUyari?.metin ?? 'Kilo olağan dışı, kontrol edin',
    ayni_urun: () => `Aynı ürün: ${veri.etkenler.find((x) => x.id === satir.ayniUrunIle)?.ad ?? satir.ayniUrunIle} satırındaki ürün bu etkeni de içerir — ayrıca verilmez`,
  }[satir.neden]?.();

  if (satir.neden === 'urun_yok' || satir.neden === 'ayni_urun') {
    return el('li', { class: 'oneri-satir' }, baslik, el('p', { class: 'oneri-neden' }, neden));
  }
  const ek = el('div', { class: 'oneri-ek' },
    satir.hesap ? hesapBlogu(satir.hesap) : el('p', { class: 'oneri-neden' }, neden),
    secim.yolBilinmiyor ? el('p', { class: 'oneri-neden' }, "Uygulama yolu KÜB'den okunamadı — ürünü kontrol edin") : null,
    kombineBilgisi(secim.urun, etken, veri));
  return el('li', { class: 'oneri-satir' },
    baslik,
    el('ul', { class: 'madde urunler' }, urunKarti(secim.urun, secim.kayit, { ek })),
    secim.digerSayisi > 0
      ? el('a', { class: 'dugme ikincil', href }, `${secim.hesaplanabilir ? 'Dozu hesaplanabilen ürün seçildi · d' : 'D'}iğer ürünler (${secim.digerSayisi}) ▸`)
      : null);
}

/** section.oneri-kart. Kart içi #kart-kilo değişince girdi.kilo güncellenir ve kartın içeriği yeniden çizilir. */
export function oneriKarti(h, veri, durum) {
  const girdi = durum.girdi;
  const icerik = el('div', { class: 'oneri-icerik' });
  const ozet = el('p', { class: 'oneri-hayvan' });
  const serit = !onayliMi(h) ? el('div', { class: 'bant taslak-oneri', role: 'note' }, TASLAK_SERIT) : null;

  function ciz() {
    const o = tedaviOnerisi(h, veri, girdi);
    const yasAd = YASLAR.find(([k]) => k === girdi.yas)?.[1] ?? girdi.yas;
    ozet.replaceChildren(`Hayvan: ${yasAd} · ${o.kilo == null ? 'kilo girilmedi' : `${virgul(o.kilo)} kg`}`);
    const parcalar = [];
    if (o.ilacOnerilmez) {
      parcalar.push(el('p', { class: 'oneri-yok' }, el('strong', {}, 'Tedavi önerilmez — ihbar adımlarını izleyin')));
    } else {
      if (o.antibiyotikEndikeDegil) parcalar.push(el('p', { class: 'oneri-yok' }, el('strong', {}, 'Antibiyotik endike değil')));
      if (o.kiloUyari?.tur === 'yumusak') parcalar.push(el('p', { class: 'oneri-uyari', role: 'note' }, o.kiloUyari.metin));
      for (const g of o.gruplar) {
        parcalar.push(el('h3', {}, `${SINIF_AD[g.sinif] ?? g.sinif} — 1. seçenekler`),
          el('ul', { class: 'madde oneri-liste' }, g.satirlar.map((s) => satirCiz(s, veri, o))));
      }
      if (o.destekleyici.length) parcalar.push(el('h3', {}, 'Destekleyici'), madde(o.destekleyici));
      if (o.bakim.length) parcalar.push(el('h3', {}, 'Bakım / yönetim'), madde(o.bakim));
    }
    parcalar.push(el('p', { class: 'oneri-not' }, KAPANIS_NOTU));
    icerik.replaceChildren(...parcalar);
  }

  const sayiMetni = (v) => (v == null ? '' : String(v).replace('.', ','));
  const kiloGirdisi = el('input', {
    id: 'kart-kilo', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'örn. 450', class: 'alan',
    value: durum.kiloMetni ?? sayiMetni(girdi.kilo),
    oninput: (e) => { durum.kiloMetni = e.target.value; girdi.kilo = kiloOku(e.target.value); durum.kaydet?.(); ciz(); },
  });
  ciz();
  return el('section', { class: 'oneri-kart', 'aria-label': 'Önerilen tedavi' },
    el('h2', {}, 'Önerilen tedavi'),
    serit,
    ozet,
    el('div', { class: 'oneri-kilo' }, el('label', { for: 'kart-kilo' }, 'Kilo (kg)'), kiloGirdisi),
    icerik);
}
