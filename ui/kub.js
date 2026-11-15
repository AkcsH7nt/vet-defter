// KÜB alıntıları ve arınma etiketleri (spec §15). Metin resmî belgeden aynen alınır: yalnız textContent ile yazılır.
import { el } from './ortak.js';
import { sigirMi, sigirListesindeMi, yalnizBuzagiMi } from '../lib/oneri.js';

// Ürün türü yardımcıları lib/oneri.js'te (öneri motoru da kullanır); ekranlar buradan almaya devam eder.
export { sigirMi, sigirListesindeMi, yalnizBuzagiMi };

export const OTOMATIK_NOT = "KÜB'den otomatik okundu — metinle karşılaştırın";

// EMA AMEG sınıfları: A kaçının, B kısıtlayın, C dikkat, D ihtiyat.
export const AMEG = {
  A: 'Gıda hayvanında kullanılmaz',
  B: 'Antibiyogramsız ilk seçenek olmaz',
  C: 'D sınıfında uygun seçenek yoksa kullanılır',
  D: 'İhtiyatlı kullanım; gereksiz kullanılmaz',
};

/**
 * Ürünün bu etken dışındaki etkenleri: "Birlikte: …" satırı ve AMEG A/B / antibiyotik uyarıları. Etken kaydı olmayan
 * KÜB etkin maddeleri (urun.digerEtkenler) de adıyla listelenir.
 */
export function kombineBilgisi(u, e, veri) {
  const digerleri = (u.etkenler ?? []).filter((id) => id !== e.id).map((id) => veri.etkenler.find((x) => x.id === id) ?? { id, ad: id });
  const kayitsiz = (u.digerEtkenler ?? []).filter((ad) => typeof ad === 'string' && ad.trim());
  if (!digerleri.length && !kayitsiz.length) return null;
  const adlar = [...digerleri.map((o) => `${o.ad}${o.ameg ? ` (AMEG ${o.ameg})` : ''}`), ...kayitsiz].join(', ');
  const uyarilar = [];
  for (const sinif of ['A', 'B']) {
    const olan = digerleri.filter((o) => o.ameg === sinif);
    if (olan.length) uyarilar.push(`⚠ AMEG ${sinif} (${olan.map((o) => o.ad).join(', ')}): ${AMEG[sinif]}`);
  }
  if (e.sinif !== 'antimikrobiyal' && digerleri.some((o) => o.sinif === 'antimikrobiyal')) uyarilar.push('⚠ Antibiyotik içerir — sağmal inekte seçmeden önce bileşimi ve süt koşulunu KÜB\'den doğrulayın');
  return el('p', { class: 'kombine' }, el('strong', {}, 'Birlikte: '), adlar, ...uyarilar.map((x) => [el('br'), x]));
}

const gunYaz = (n) => `${n} gün`;

/**
 * Sığır arınma etiketi parçaları; yalnız guven 'yuksek' iken. Yoksa [].
 * et_gun N → "Et N gün"; sut {saat} → 24'e bölünüyorsa "Süt N gün", yoksa "Süt N saat".
 */
export function arinmaEtiketi(sigir) {
  if (!sigir || sigir.guven !== 'yuksek') return [];
  const parcalar = [];
  if (Number.isInteger(sigir.et_gun) && sigir.et_gun >= 0) parcalar.push(`Et ${gunYaz(sigir.et_gun)}`);
  const sut = sigir.sut;
  if (sut && typeof sut === 'object' && typeof sut.saat === 'number') {
    parcalar.push(sut.saat % 24 === 0 ? `Süt ${gunYaz(sut.saat / 24)}` : `Süt ${sut.saat} saat`);
  } else if (sut === 'kullanilmaz') parcalar.push('Süt: sağmal inekte kullanılmaz');
  else if (sut === 'belirtilmemis') parcalar.push("Süt: KÜB'de belirtilmemiş");
  return parcalar;
}

export const TABLO_NOTU = "Bu bölümde tablo var — düzen bozulmuş olabilir, KÜB'ün aslına bakın";
export const ESKI_BICIM_NOTU = 'Eski biçim KÜB — aslına bakın';
export const BELGE_UYUMSUZ_NOTU = "Bakanlık sitesindeki KÜB bu ürünle eşleşmiyor — KÜB'e bakın";

const kubMetni = (metin) => el('div', { class: 'kub-metin' }, metin ?? "Bu bölüm KÜB'den okunamadı — KÜB'e bakın.");

function kubKutusu(baslik, metin) {
  return el('details', { class: 'kub-kutu' }, el('summary', {}, baslik), kubMetni(metin));
}

function tabloKutusu(baslik, metin) {
  return el('details', { class: 'kub-kutu' }, el('summary', {}, baslik), tabloIcerigi(metin));
}

/** Öneri kartında tek açılır "KÜB ▸": Doz ve Arınma alt başlıklı, alıntı notu içinde (kart kısa kalsın). */
function birlesikKubKutusu(kayit, alinti) {
  return el('details', { class: 'kub-kutu' },
    el('summary', {}, 'KÜB ▸'),
    el('h4', { class: 'kub-alt' }, 'Doz'),
    kayit.tablo && kayit.doz ? tabloIcerigi(kayit.doz) : kubMetni(kayit.doz),
    el('h4', { class: 'kub-alt' }, 'Arınma'),
    kubMetni(kayit.arinma),
    alinti);
}

export const ARINMA_OKUNAMADI = "Arınma: otomatik okunamadı — KÜB: Arınma'yı açın";

/**
 * Tablolu doz: eş aralıklı, kendi içinde yana kayan blok (sayfa kaymaz). Sütun aralığı olan satırlar boşluklarıyla
 * aynen (white-space: pre), düz metin satırları sarılarak gösterilir.
 */
function tabloIcerigi(metin) {
  return [
    el('p', { class: 'kub-tablo-not' }, `⚠ ${TABLO_NOTU}`, el('br'), el('small', {}, 'Tablo kendi içinde yana kaydırılır ▸')),
    el('div', { class: 'kub-tablo', role: 'region', 'aria-label': 'KÜB doz tablosu (yana kaydırılabilir)', tabindex: '0' },
      metin.split('\n').map((satir) => el('div', { class: /\S {3,}\S/.test(satir) ? 'tablo-satir' : 'duz-satir' }, satir))),
  ];
}

/**
 * Ürün kartı (li.urun). ek: ürün adının altına eklenecek öğe (ör. kombine bilgisi).
 * Kayıt yoksa ya da metinYok ise "KÜB'e bakın" + bağlantı (belge ürünle eşleşmiyorsa bunu söyler); aksi hâlde etiket
 * + açılır KÜB: Doz / KÜB: Arınma (tablolu doz eş aralıklı blokta), eski biçim ve başka ticari ad notları.
 * kompakt (öneri kartı): firma adı yok (ürün adı + form), iki kutu yerine tek "KÜB ▸" (Doz / Arınma alt başlıklı, alıntı
 * notu içinde), arınma güveni düşükse etiket yerine "Arınma: otomatik okunamadı" notu.
 */
export function urunKarti(u, kayit, { ek = null, kompakt = false } = {}) {
  const baglanti = u.kubUrl
    ? [el('a', { href: u.kubUrl, target: '_blank', rel: 'noopener' }, kompakt ? 'KÜB belgesi ▸' : 'KÜB ▸'), el('span', { class: 'soluk' }, ' (internet gerekir)')]
    : null;
  const k = (u.kub ?? []).find((x) => x.tur === 'sigir');
  const ayrinti = kompakt ? (u.form ?? '') : `${u.firma ?? ''}${u.form ? ` — ${u.form}` : ''}${k?.yol ? `, ${k.yol}` : ''}`;
  const metinli = !!kayit && !kayit.metinYok && !kayit.belgeUyumsuz;
  const etiket = metinli ? arinmaEtiketi(kayit.sigir) : [];
  const alinti = metinli
    ? el('p', { class: 'doz kub-alinti' }, el('small', { class: 'soluk' },
      `KÜB'den alıntı (${kayit.eskiBicim ? 'kullanım şekli ve dozu, kalıntı uyarıları' : '4.9, 4.11'}) · metin aynen alındı `), baglanti)
    : null;
  const yok = el('span', { class: 'soluk' }, '(KÜB bağlantısı yok — Bakanlık ürün sorgusundan bakın.)');
  return el('li', { class: 'urun' },
    el('strong', {}, u.ad),
    yalnizBuzagiMi(u) ? el('span', { class: 'urun-etiket' }, ' (yalnız buzağı)') : null,
    ayrinti ? el('span', { class: 'soluk' }, ` — ${ayrinti}`) : null,
    ek,
    etiket.length
      ? el('p', { class: 'arinma-etiket' }, el('strong', {}, etiket.join(' · ')), el('br'), el('small', { class: 'soluk' }, OTOMATIK_NOT))
      : kompakt && metinli ? el('p', { class: 'arinma-yok' }, ARINMA_OKUNAMADI) : null,
    kayit?.belgeUyumsuz
      ? el('p', { class: 'doz kub-uyumsuz' }, `⚠ ${BELGE_UYUMSUZ_NOTU} `, baglanti ?? yok)
      : !kayit || kayit.metinYok
        ? el('p', { class: 'doz' }, "KÜB'e bakın ", baglanti ?? yok)
        : [
          kayit.kubAdi ? el('p', { class: 'kub-not' }, `KÜB başka ticari adla yayımlanmış: ${kayit.kubAdi}`) : null,
          kayit.eskiBicim ? el('p', { class: 'kub-not' }, ESKI_BICIM_NOTU) : null,
          ...(kompakt ? [birlesikKubKutusu(kayit, alinti)] : [
            kayit.tablo && kayit.doz ? tabloKutusu('KÜB: Doz', kayit.doz) : kubKutusu('KÜB: Doz', kayit.doz),
            kubKutusu('KÜB: Arınma', kayit.arinma),
            alinti,
          ]),
        ]);
}
