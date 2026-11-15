// Hastalık sayfasının "Önerilen tedavi" kartı: lib/oneri.js motorunun çıktısını ekrana çizer. KÜB kaynaklı her
// doz/oran/ml öğesi `data-kub` taşır; KÜB metni yalnız textContent ile yazılır (el() zaten böyle yapar).
// Renk: sarı uyarı (.oneri-uyari) yalnız kilo / yaş uyarılarında, kırmızı (.oneri-kirmizi) süt ve olumsuz KÜB kısıtında;
// ml çıkmayan satırların nedeni (.oneri-neden) nötr.
import { el, YASLAR, taslakEtiketi } from './ortak.js';
import { tedaviOnerisi } from '../lib/oneri.js';
import { kiloOku } from '../lib/hayvan.js';
import { onayliMi } from '../lib/onay.js';
import { urunKarti, kombineBilgisi } from './kub.js';

const SINIF_AD = {
  antimikrobiyal: 'Antimikrobiyal', nsaii: 'Ağrı-yangı', metabolik: 'Metabolik / sıvı', antiparaziter: 'Antiparaziter', diger: 'Diğer',
};
// Grup başlığının eki: aynı amaçlı alternatifler (birini seçin) / birlikte verilebilenler / diğer seçenekler.
const BIRI = new Set(['antimikrobiyal', 'nsaii', 'antiparaziter']);
const grupEki = (sinif) => (BIRI.has(sinif) ? 'aşağıdakilerden BİRİ' : sinif === 'metabolik' ? 'gerektiğinde birlikte' : 'seçenekler');

/** KÜB yol kodlarının Türkçe adı ("Bu ürün: kas içi"). */
export const YOL_AD = {
  IM: 'kas içi', IV: 'damar içi', SC: 'deri altı', ORAL: 'ağızdan', IMM: 'meme içi', IU: 'rahim içi', TOPIKAL: 'deri üzerine (lokal)',
};
const buyukHarfle = (s) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

export const TASLAK_SERIT = 'Taslak öneri — hekim onayından geçmedi';
export const KAPANIS_NOTU = "Doz ürünün KÜB'ünden otomatik hesaplandı — uygulamadan önce ürün etiketi/KÜB ile karşılaştırın.";
export const IHBAR_ONCE = 'İhbarı mecburi — önce bildirin';
export const SATIR_YOK = 'Birinci seçenek ilaç tanımlı değil — aşağıdaki protokole bakın';
export const SAGMAL_YASAK = 'Sağmal inekte kullanılmaz';
export const BUZAGI_DOZU = 'Bu doz yalnız buzağı/genç sığır için';
export const BUYUK_HACIM = 'Büyük hacim — KÜB sınır vermiyor; bölmeyi değerlendirin';
export const TEKRAR_SURE = 'Tekrar ve süre: KÜB: Doz';

const virgul = (n) => String(Number(n.toFixed(3))).replace('.', ',');
const madde = (liste) => el('ul', { class: 'madde' }, liste.map((x) => el('li', {}, x)));
const yasAdi = (k) => YASLAR.find(([y]) => y === k)?.[1] ?? k;
const kucukAd = (k) => String(yasAdi(k) ?? '').toLocaleLowerCase('tr');

/** "Bu hastalık buzağı/dana (besi) hastalığı — seçili hayvan: inek. Hayvanı düzeltin." */
export function yasUyarisi(yasGruplari, yas) {
  return `Bu hastalık ${yasGruplari.map(kucukAd).join('/')} hastalığı — seçili hayvan: ${kucukAd(yas)}. Hayvanı düzeltin.`;
}

function yerMetni(hesap) {
  const sinir = `(yer başına en çok ${virgul(hesap.yerBasinaMaxMl)} ml)`;
  const bol = `${hesap.yerSayisi} ayrı yere bölün ${sinir}`;
  const yol = hesap.yerBasinaYol && YOL_AD[hesap.yerBasinaYol];
  return yol ? `${buyukHarfle(yol)} verilirse ${bol}` : bol;
}

function hesapBlogu(hesap, secim) {
  return [
    el('p', { class: 'ml-satir', 'data-kub': '' },
      el('span', { class: 'ml-buyuk' }, `→ ${virgul(hesap.ml)} ml`),
      el('span', { class: 'ml-uygulama' }, ' (bir uygulama)'),
      hesap.ifade ? el('span', { class: 'ml-ifade' }, ` (${hesap.ifade})`) : null,
      hesap.ham !== hesap.ml ? el('small', { class: 'ml-ham soluk' }, ` tam hesap ${virgul(hesap.ham)} ml`) : null),
    secim.sutYasak ? el('p', { class: 'oneri-kirmizi' }, SAGMAL_YASAK) : null,
    hesap.yerSayisi > 1 ? el('p', { class: 'ml-yer', 'data-kub': '' }, yerMetni(hesap)) : null,
    hesap.buyukHacim ? el('p', { class: 'ml-buyuk-hacim' }, BUYUK_HACIM) : null,
    hesap.cumle ? el('p', { class: 'kub-cumle', 'data-kub': '' }, hesap.cumle) : null,
    el('p', { class: 'oneri-tekrar soluk' }, TEKRAR_SURE),
  ];
}

/** Seçilen ürünün KÜB kısıtları aynen (data-kub); koşullu olana önek, olumsuz olan kırmızı. */
function kisitlar(secim) {
  return (secim.kisitlar ?? []).map((k) => el('p', { class: `kisit ${k.tur === 'olumsuz' ? 'olumsuz' : ''}`.trim(), 'data-kub': '' },
    k.tur === 'kosullu' ? `Koşullu kısıt: ${k.metin}` : k.metin));
}

function satirCiz(satir, veri, oneri) {
  const { ilac, etken, secim } = satir;
  const href = `#/etken/${encodeURIComponent(etken.id)}`;
  const baslik = el('p', { class: 'oneri-etken' },
    el('a', { href, class: 'ilac-ad' }, etken.ad),
    // protokol yolu ürünün KÜB yolundan genişse (ör. "IV / IM", ürün yalnız kas içi) soluk: geçerli olan ürünün yolu
    el('span', { class: `protokol-yol${secim?.yolGenis ? ' soluk' : ''}` }, ` · ${ilac.yol}`),
    ilac.not ? el('span', { class: 'soluk' }, ` · ${ilac.not}`) : null);

  const notr = (metin) => el('p', { class: 'oneri-neden' }, metin);
  const sari = (metin) => el('p', { class: 'oneri-neden oneri-uyari' }, metin);
  const neden = {
    urun_yok: () => notr('Listede ruhsatlı sığır ürünü yok'),
    hekim_secer: () => el('p', { class: 'oneri-neden' }, 'Ürün hekim seçer (derişim/hacim ürüne göre değişir) — ',
      el('a', { href }, `ruhsatlı ürünler (${satir.urunSayisi}) ▸`)),
    ayni_urun: () => notr(`Aynı ürün: ${veri.etkenler.find((x) => x.id === satir.ayniUrunIle)?.ad ?? satir.ayniUrunIle} satırındaki ürün bu etkeni de içerir — ayrıca verilmez`),
    yas_uymuyor: () => sari('Yaş grubu bu hastalığa uymuyor — ml hesaplanmadı'),
    sabit_doz: () => notr('Doz kiloya bağlı değil (hayvan / meme lobu başına) — KÜB: Doz'),
    oran_yok: () => notr("KÜB'de kiloya göre tek oran yok — KÜB metnine bakın"),
    kilo_yok: () => sari('Kilo girin, ml hesaplansın'),
    kilo_gecersiz: () => sari(oneri.kiloUyari?.metin ?? 'Kilo olağan dışı, kontrol edin'),
  }[satir.neden]?.() ?? null;

  if (!secim || satir.neden === 'ayni_urun') return el('li', { class: 'oneri-satir' }, baslik, neden);

  const yollar = secim.urunYollari ?? [];
  const ek = el('div', { class: 'oneri-ek' },
    satir.hesap ? hesapBlogu(satir.hesap, secim) : [neden, secim.sutYasak ? el('p', { class: 'oneri-kirmizi' }, SAGMAL_YASAK) : null],
    yollar.length ? el('p', { class: 'urun-yol' }, `Bu ürün: ${yollar.map((k) => YOL_AD[k] ?? k).join(' / ')}`) : null,
    secim.yolBilinmiyor ? notr("Uygulama yolu KÜB'den okunamadı — ürünü kontrol edin") : null,
    secim.dozBuzagiIcin ? notr(BUZAGI_DOZU) : null,
    kisitlar(secim),
    kombineBilgisi(secim.urun, etken, veri));
  return el('li', { class: 'oneri-satir' },
    baslik,
    el('ul', { class: 'madde urunler' }, urunKarti(secim.urun, secim.kayit, { ek, kompakt: true })),
    secim.digerSayisi > 0
      ? el('a', { class: 'dugme ikincil', href }, `${secim.hesaplanabilir ? 'Dozu hesaplanabilen ürün seçildi · d' : 'D'}iğer ürünler (${secim.digerSayisi}) ▸`)
      : null);
}

function grupCiz(g, veri, o) {
  const satirlar = [];
  g.satirlar.forEach((s, i) => {
    if (i > 0 && BIRI.has(g.sinif)) satirlar.push(el('li', { class: 'ya-da' }, 'ya da'));
    satirlar.push(satirCiz(s, veri, o));
  });
  return [
    el('h3', { class: 'grup-baslik' }, `${SINIF_AD[g.sinif] ?? g.sinif} — ${grupEki(g.sinif)}`, o.taslak ? [' ', taslakEtiketi()] : null),
    el('ul', { class: 'madde oneri-liste' }, satirlar),
  ];
}

/** section.oneri-kart. Kart içi #kart-kilo değişince girdi.kilo güncellenir ve kartın içeriği yeniden çizilir. */
export function oneriKarti(h, veri, durum) {
  const girdi = durum.girdi;
  const icerik = el('div', { class: 'oneri-icerik' });
  const ust = el('div', { class: 'oneri-ust' });
  const ozet = el('p', { class: 'oneri-hayvan' });
  const serit = !onayliMi(h) ? el('div', { class: 'bant taslak-oneri', role: 'note' }, TASLAK_SERIT) : null;

  function ciz() {
    const o = tedaviOnerisi(h, veri, girdi);
    ozet.replaceChildren(`Hayvan: ${yasAdi(girdi.yas)} · ${o.kilo == null ? 'kilo girilmedi' : `${virgul(o.kilo)} kg`}`);
    ust.replaceChildren(...[
      o.ihbarOnce ? el('p', { class: 'oneri-ihbar', role: 'alert' }, el('strong', {}, IHBAR_ONCE)) : null,
      o.yasUymuyor ? el('p', { class: 'oneri-uyari', role: 'alert' }, yasUyarisi(o.yasGruplari, girdi.yas)) : null,
    ].filter(Boolean));
    const parcalar = [];
    if (o.ilacOnerilmez) {
      parcalar.push(el('p', { class: 'oneri-yok' }, el('strong', {}, 'Tedavi önerilmez — ihbar adımlarını izleyin')));
    } else {
      if (o.antibiyotikEndikeDegil) parcalar.push(el('p', { class: 'oneri-yok' }, el('strong', {}, 'Antibiyotik endike değil')));
      if (o.kiloUyari?.tur === 'yumusak') parcalar.push(el('p', { class: 'oneri-uyari', role: 'note' }, o.kiloUyari.metin));
      if (!o.gruplar.length) parcalar.push(el('p', { class: 'oneri-neden' }, SATIR_YOK));
      for (const g of o.gruplar) parcalar.push(...grupCiz(g, veri, o));
      if (o.destekleyici.length) parcalar.push(el('h3', {}, 'Destekleyici'), madde(o.destekleyici));
      if (o.bakim.length) parcalar.push(el('h3', {}, 'Bakım / yönetim'), madde(o.bakim));
      parcalar.push(el('p', { class: 'oneri-not' }, KAPANIS_NOTU));
    }
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
    ust,
    ozet,
    el('div', { class: 'oneri-kilo' }, el('label', { for: 'kart-kilo' }, 'Kilo (kg)'), kiloGirdisi),
    icerik);
}
