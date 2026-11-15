// Hastalık sayfasının "Önerilen tedavi" kartı: lib/oneri.js motorunun çıktısını ekrana çizer. KÜB kaynaklı her
// doz/oran/ml öğesi `data-kub` taşır; KÜB metni yalnız textContent ile yazılır (el() zaten böyle yapar).
// Renk: sarı uyarı (.oneri-uyari) yalnız kilo / yaş uyarılarında, kırmızı (.oneri-kirmizi) süt ve olumsuz KÜB kısıtında;
// ml çıkmayan satırların nedeni (.oneri-neden) nötr.
import { el, YASLAR, taslakEtiketi, sayiMetni } from './ortak.js';
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

/** Buzağı kapsamlı oran, hayvan buzağı değil: "KÜB oranı buzağı/genç sığır için — dana (besi) için hesaplanmadı". */
export const buzagiDozuMetni = (yas) => `KÜB oranı buzağı/genç sığır için — ${kucukAd(yas)} için hesaplanmadı`;

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
function kisitlar(secim, engel = null) {
  return (secim.kisitlar ?? []).filter((k) => k !== engel).map((k) => el('p', { class: `kisit ${k.tur === 'olumsuz' ? 'olumsuz' : ''}`.trim(), 'data-kub': '' },
    k.tur === 'kosullu' ? `Koşullu kısıt: ${k.metin}` : k.metin));
}

// Kapalı alternatifin özetinde ml yoksa kısa neden.
const KISA_NEDEN = {
  urun_yok: 'ürün yok', hekim_secer: 'ürünü hekim seçer', ayni_urun: 'aynı ürün — ayrıca verilmez', yas_uymuyor: 'yaş uymuyor',
  sabit_doz: 'doz kiloya bağlı değil', oran_yok: "KÜB'de oran yok", kilo_yok: 'kilo girin', kilo_gecersiz: 'kilo olağan dışı',
  kisit: 'KÜB kısıtı', yas_gir: 'yaşı (ay) girin',
};
// Buzağı kapsamlı oranın yetişkinde "oran yok" nedeni yerine yalnız B14 notu gösterilir.
const yalnizBuzagiDozu = (satir) => !!satir.secim?.dozBuzagiIcin && satir.neden === 'oran_yok';

/** "ya da: <etken> · <ürün> → 18 ml" (ml data-kub) ya da kısa neden; süt yasağı ve olumsuz KÜB kısıtı kırmızı. */
function alternatifOzeti(satir, oneri) {
  const { etken, secim, hesap } = satir;
  const kisa = yalnizBuzagiDozu(satir) ? buzagiDozuMetni(oneri.yas) : KISA_NEDEN[satir.neden];
  const kosullu = (secim?.kisitlar ?? []).some((k) => k.tur === 'kosullu' && k !== satir.kisitEngel);
  return el('summary', {},
    'ya da: ', el('strong', {}, etken.ad),
    secim ? ` · ${secim.urun.ad}` : null,
    hesap ? el('span', { class: 'ozet-ml', 'data-kub': '' }, ` → ${virgul(hesap.ml)} ml`) : kisa ? ` · ${kisa}` : null,
    secim?.sutYasak ? el('span', { class: 'oneri-kirmizi' }, SAGMAL_YASAK) : null,
    satir.kisitEngel ? el('span', { class: 'kisit olumsuz kisit-engel', 'data-kub': '' }, satir.kisitEngel.metin) : null,
    (secim?.kisitlar ?? []).filter((k) => k.tur === 'olumsuz' && k !== satir.kisitEngel).map((k) => el('span', { class: 'kisit olumsuz', 'data-kub': '' }, k.metin)),
    // kapalı satırda ml görünse de koşullu kısıt gözden kaçmasın (metni satır açılınca)
    kosullu ? el('span', { class: 'ozet-kosullu' }, '⚠ koşullu KÜB kısıtı') : null);
}

/** Satır (li.oneri-satir). alternatif: "BİRİ" grubunda ilk satırdan sonraki satır, kapalı details içinde. */
function satirCiz(satir, veri, oneri, alternatif = false) {
  const icerik = satirIcerigi(satir, veri, oneri);
  return el('li', { class: 'oneri-satir' },
    alternatif ? el('details', { class: 'alternatif' }, alternatifOzeti(satir, oneri), icerik) : icerik);
}

function satirIcerigi(satir, veri, oneri) {
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
    ayni_urun: () => {
      const ad = veri.etkenler.find((x) => x.id === satir.ayniUrunIle)?.ad ?? satir.ayniUrunIle;
      return notr(satir.ayniYon === 'bu_icerir'
        ? `Çift doz: ${secim.urun.ad} ${ad} de içerir — ${ad} satırındaki ürünle birlikte verilmez`
        : `Aynı ürün: ${ad} satırındaki ürün bu etkeni de içerir — ayrıca verilmez`);
    },
    yas_uymuyor: () => sari('Yaş grubu bu hastalığa uymuyor — ml hesaplanmadı'),
    sabit_doz: () => notr('Doz kiloya bağlı değil (hayvan / meme lobu başına) — KÜB: Doz'),
    oran_yok: () => notr("KÜB'de kiloya göre tek oran yok — KÜB metnine bakın"),
    // kilo yoksa KÜB oranı gösterilir, ml yok
    kilo_yok: () => el('div', {}, sari('Kilo girin, ml hesaplansın'),
      secim?.kayit?.oran?.ifade ? el('p', { class: 'ml-ifade-yalniz', 'data-kub': '' }, `KÜB oranı: ${secim.kayit.oran.ifade}`) : null),
    kilo_gecersiz: () => sari(oneri.kiloUyari?.metin ?? 'Kilo olağan dışı, kontrol edin'),
    // kilo, KÜB'ün koşullu kısıtına giriyor (ör. "80 kg’dan daha ağır buzağılarda kullanılmaz"): kısıt aynen, kırmızı
    kisit: () => el('p', { class: 'oneri-kirmizi kisit-engel', 'data-kub': '' }, satir.kisitEngel.metin),
    // buzağıda KÜB yaş alt sınırı var, yaş (ay) girilmedi
    yas_gir: () => el('p', { class: 'oneri-neden oneri-uyari' }, 'Yaşı (ay) girin — KÜB kısıtı: ',
      el('span', { class: 'kisit-engel', 'data-kub': '' }, satir.kisitEngel.metin)),
  }[yalnizBuzagiDozu(satir) ? null : satir.neden]?.() ?? null;

  if (!secim || satir.neden === 'ayni_urun') return [baslik, neden];

  const yollar = secim.urunYollari ?? [];
  const ek = el('div', { class: 'oneri-ek' },
    satir.hesap ? hesapBlogu(satir.hesap, secim) : [neden, secim.sutYasak ? el('p', { class: 'oneri-kirmizi' }, SAGMAL_YASAK) : null],
    yollar.length ? el('p', { class: 'urun-yol' }, `Bu ürün: ${yollar.map((k) => YOL_AD[k] ?? k).join(' / ')}`) : null,
    secim.yolBilinmiyor ? notr("Uygulama yolu KÜB'den okunamadı — ürünü kontrol edin") : null,
    secim.dozBuzagiIcin ? notr(buzagiDozuMetni(oneri.yas)) : null,
    kisitlar(secim, satir.kisitEngel),
    kombineBilgisi(secim.urun, etken, veri));
  return [
    baslik,
    el('ul', { class: 'madde urunler' }, urunKarti(secim.urun, secim.kayit, { ek, kompakt: true })),
    secim.digerSayisi > 0
      ? el('a', { class: 'dugme ikincil', href }, `${secim.hesaplanabilir ? 'Dozu hesaplanabilen ürün seçildi · d' : 'D'}iğer ürünler (${secim.digerSayisi}) ▸`)
      : null,
  ];
}

// "BİRİ" grubunda ilk satır açık, sonrakiler kapalı "ya da: …" (kart kısa kalsın; birlikte verilmeyecekleri belli olsun).
function grupCiz(g, veri, o) {
  return [
    el('h3', { class: 'grup-baslik' }, `${SINIF_AD[g.sinif] ?? g.sinif} — ${grupEki(g.sinif)}`, o.taslak ? [' ', taslakEtiketi()] : null),
    el('ul', { class: 'madde oneri-liste' }, g.satirlar.map((s, i) => satirCiz(s, veri, o, i > 0 && BIRI.has(g.sinif)))),
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
      // kapanış doz notu yalnız en az bir satır ml gösteriyorsa
      if (o.gruplar.some((g) => g.satirlar.some((s) => s.hesap))) parcalar.push(el('p', { class: 'oneri-not' }, KAPANIS_NOTU));
    }
    icerik.replaceChildren(...parcalar);
  }

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
