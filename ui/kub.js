// KÜB alıntıları ve arınma etiketleri (spec §15). Metin resmî belgeden aynen alınır: yalnız textContent ile yazılır.
import { el } from './ortak.js';
import { normalize } from '../lib/arama.js';

export const OTOMATIK_NOT = "KÜB'den otomatik okundu — metinle karşılaştırın";

/** Ürün sığır için ruhsatlı mı? Hedef türde "sığır" ya da "buzağı" (büyük-küçük harf ve aksan fark etmez). */
export function sigirMi(urun) {
  return (urun.hedefTurler ?? []).some((t) => normalize(t) === 'sigir' || normalize(t) === 'buzagi');
}

/**
 * Ürün sığır ürün listelerinde (etken, hastalık) gösterilir mi? Bakanlık listesinde sığır / buzağı hedefli ve
 * KÜB 4.1'de hedef tür sığırı kapsıyor (kub.json sigirHedefDegil değil).
 */
export function sigirListesindeMi(urun, veri) {
  return sigirMi(urun) && veri?.kub?.urunler?.[urun.urunId]?.sigirHedefDegil !== true;
}

/** Yalnız buzağı için ruhsatlı (hedef türde sığır yok, buzağı var). */
export function yalnizBuzagiMi(urun) {
  const t = (urun.hedefTurler ?? []).map(normalize);
  return t.includes('buzagi') && !t.includes('sigir');
}

// EMA AMEG sınıfları: A kaçının, B kısıtlayın, C dikkat, D ihtiyat.
export const AMEG = {
  A: 'Gıda hayvanında kullanılmaz',
  B: 'Antibiyogramsız ilk seçenek olmaz',
  C: 'D sınıfında uygun seçenek yoksa kullanılır',
  D: 'İhtiyatlı kullanım; gereksiz kullanılmaz',
};

/** Ürünün bu etken dışındaki etkenleri: "Birlikte: …" satırı ve AMEG A/B / antibiyotik uyarıları. */
export function kombineBilgisi(u, e, veri) {
  const digerleri = (u.etkenler ?? []).filter((id) => id !== e.id).map((id) => veri.etkenler.find((x) => x.id === id) ?? { id, ad: id });
  if (!digerleri.length) return null;
  const adlar = digerleri.map((o) => `${o.ad}${o.ameg ? ` (AMEG ${o.ameg})` : ''}`).join(', ');
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

export const ESKI_BICIM_NOTU = 'Eski biçim KÜB — aslına bakın';
export const BELGE_UYUMSUZ_NOTU = "Bakanlık sitesindeki KÜB bu ürünle eşleşmiyor — KÜB'e bakın";

function kubKutusu(baslik, metin) {
  return el('details', { class: 'kub-kutu' },
    el('summary', {}, baslik),
    el('div', { class: 'kub-metin' }, metin ?? "Bu bölüm KÜB'den okunamadı — KÜB'e bakın."));
}

/**
 * Ürün kartı (li.urun). ek: ürün adının altına eklenecek öğe (ör. kombine bilgisi).
 * Kayıt yoksa ya da metinYok ise "KÜB'e bakın" + bağlantı (belge ürünle eşleşmiyorsa bunu söyler); aksi hâlde etiket
 * + açılır KÜB: Doz / KÜB: Arınma, eski biçim ve başka ticari ad notları.
 */
export function urunKarti(u, kayit, { ek = null } = {}) {
  const baglanti = u.kubUrl
    ? [el('a', { href: u.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸'), el('span', { class: 'soluk' }, ' (internet gerekir)')]
    : null;
  const k = (u.kub ?? []).find((x) => x.tur === 'sigir');
  const ayrinti = `${u.firma ?? ''}${u.form ? ` — ${u.form}` : ''}${k?.yol ? `, ${k.yol}` : ''}`;
  const etiket = kayit && !kayit.metinYok && !kayit.belgeUyumsuz ? arinmaEtiketi(kayit.sigir) : [];
  const yok = el('span', { class: 'soluk' }, '(KÜB bağlantısı yok — Bakanlık ürün sorgusundan bakın.)');
  return el('li', { class: 'urun' },
    el('strong', {}, u.ad),
    yalnizBuzagiMi(u) ? el('span', { class: 'urun-etiket' }, ' (yalnız buzağı)') : null,
    el('span', { class: 'soluk' }, ` — ${ayrinti}`),
    ek,
    etiket.length
      ? el('p', { class: 'arinma-etiket' }, el('strong', {}, etiket.join(' · ')), el('br'), el('small', { class: 'soluk' }, OTOMATIK_NOT))
      : null,
    kayit?.belgeUyumsuz
      ? el('p', { class: 'doz kub-uyumsuz' }, `⚠ ${BELGE_UYUMSUZ_NOTU} `, baglanti ?? yok)
      : !kayit || kayit.metinYok
        ? el('p', { class: 'doz' }, "KÜB'e bakın ", baglanti ?? yok)
        : [
          kayit.kubAdi ? el('p', { class: 'kub-not' }, `KÜB başka ticari adla yayımlanmış: ${kayit.kubAdi}`) : null,
          kayit.eskiBicim ? el('p', { class: 'kub-not' }, ESKI_BICIM_NOTU) : null,
          kubKutusu('KÜB: Doz', kayit.doz),
          kubKutusu('KÜB: Arınma', kayit.arinma),
          el('p', { class: 'doz kub-alinti' }, el('small', { class: 'soluk' },
            `KÜB'den alıntı (${kayit.eskiBicim ? 'kullanım şekli ve dozu, kalıntı uyarıları' : '4.9, 4.11'}) · metin aynen alındı `), baglanti),
        ]);
}
