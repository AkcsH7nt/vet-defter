// Ekran 4: Etken madde — nasıl çalışır + sığırda (buzağı dahil) ruhsatlı ürünler.
// Bu ekranda hastalık bağlamı yoktur: doz sayısı gösterilmez, yalnız KÜB'e yönlendirilir;
// et / süt bekleme süreleri ürünün KÜB'ü doğrulanmış (ve sonra değişmemiş) ise yazılır.
import { el, doldur, bulunamadi, taslakEtiketi, tarihYaz, geriDugmesi } from './ortak.js';
import { normalize } from '../lib/arama.js';
import { onayliMi, kubDogruMu } from '../lib/onay.js';
import { sigirMi, yalnizBuzagiMi, sutYaz } from './hastalik.js';

// EMA AMEG sınıfları: A kaçının, B kısıtlayın, C dikkat, D ihtiyat.
const AMEG = {
  A: 'Gıda hayvanında kullanılmaz',
  B: 'Antibiyogramsız ilk seçenek olmaz',
  C: 'D sınıfında uygun seçenek yoksa kullanılır',
  D: 'İhtiyatlı kullanım; gereksiz kullanılmaz',
};

// Süt / sağmal inek kısıtı içeren notlar en üstte.
const sutNotuMu = (x) => /süt|sağmal|laktasyon/i.test(x);

/** Ürünün bu etken dışındaki etkenleri: "Birlikte: …" satırı ve AMEG A/B / antibiyotik uyarıları. */
function kombineBilgisi(u, e, veri) {
  const digerleri = (u.etkenler ?? []).filter((id) => id !== e.id).map((id) => veri.etkenler.find((x) => x.id === id) ?? { id, ad: id });
  if (!digerleri.length) return null;
  const adlar = digerleri.map((o) => `${o.ad}${o.ameg ? ` (AMEG ${o.ameg})` : ''}`).join(', ');
  const uyarilar = [];
  for (const sinif of ['A', 'B']) {
    const olan = digerleri.filter((o) => o.ameg === sinif);
    if (olan.length) uyarilar.push(`⚠ AMEG ${sinif} (${olan.map((o) => o.ad).join(', ')}): ${AMEG[sinif]}`);
  }
  if (e.sinif !== 'antimikrobiyal' && digerleri.some((o) => o.sinif === 'antimikrobiyal')) uyarilar.push('⚠ Antibiyotik içerir');
  return el('p', { class: 'kombine' }, el('strong', {}, 'Birlikte: '), adlar, ...uyarilar.map((x) => [el('br'), x]));
}

export function render(kok, veri, durum, rota) {
  const e = veri.etkenler.find((x) => x.id === rota.id);
  if (!e) { bulunamadi(kok, 'Bu etken madde kaydı bulunamadı.'); return; }
  const m = e.mekanizma ?? {};
  const tarih = tarihYaz(veri.meta?.urunListesiTarihi);
  const urunler = veri.urunler.filter((u) => (u.etkenler ?? []).includes(e.id) && sigirMi(u));
  const tekli = urunler.filter((u) => (u.etkenler ?? []).length === 1);
  const kombine = urunler.filter((u) => (u.etkenler ?? []).length > 1);

  const satir = (ad, deger) => (deger ? el('li', {}, el('strong', {}, `${ad}: `), deger) : null);
  const dikkatler = [...(m.etkilesimler ?? [])].sort((a, b) => Number(sutNotuMu(b)) - Number(sutNotuMu(a)));

  const urunKarti = (u) => {
    const k = (u.kub ?? []).find((x) => normalize(x.tur) === 'sigir');
    const dogru = kubDogruMu(u);
    return el('li', { class: 'urun' },
      el('strong', {}, u.ad),
      yalnizBuzagiMi(u) ? el('span', { class: 'urun-etiket' }, ' (yalnız buzağı)') : null,
      el('span', { class: 'soluk' }, ` — ${u.firma}${u.form ? ` — ${u.form}` : ''}${k?.yol ? `, ${k.yol}` : ''}`),
      kombineBilgisi(u, e, veri),
      u.kubUrl
        ? el('p', { class: 'doz' }, 'KÜB\'e bakın ', el('a', { href: u.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸'), el('span', { class: 'soluk' }, ' (internet gerekir)'))
        : el('p', { class: 'doz soluk' }, 'KÜB bağlantısı yok — Bakanlık ürün sorgusundan bakın.'),
      dogru && k ? el('p', { class: 'soluk' }, `Et ${k.et_gun == null ? 'belirtilmemiş' : `${k.et_gun} g`} · Süt: ${sutYaz(k.sut)}`) : null);
  };

  doldur(kok,
    el('h1', {}, e.ad, ' ', onayliMi(e) ? null : taslakEtiketi()),
    e.ameg ? el('p', { class: 'ameg' }, el('strong', {}, `AMEG: ${e.ameg}`), AMEG[e.ameg] ? ` — ${AMEG[e.ameg]}` : null) : null,
    el('h2', {}, 'Nasıl çalışır'),
    el('ul', { class: 'madde' },
      satir('Hedef', m.hedef), satir('Etki', m.etki), satir('Tür', m.tur), satir('Spektrum', m.spektrum),
      satir('Kinetik', m.kinetik), satir('Direnç', m.direnc),
      ...dikkatler.map((x) => satir('Dikkat', x))),
    el('h2', {}, `Ruhsatlı ürünler (liste tarihi: ${tarih})`),
    urunler.length
      ? [
        tekli.length ? el('ul', { class: 'madde urunler' }, tekli.map(urunKarti)) : null,
        kombine.length ? el('h2', {}, `Kombine ürünler (başka etken de içerir: ${kombine.length})`) : null,
        kombine.length ? el('ul', { class: 'madde urunler kombine-liste' }, kombine.map(urunKarti)) : null,
      ]
      : el('p', { class: 'yetersiz' }, `Bu etken için listede ruhsatlı ürün bulunamadı (liste tarihi ${tarih}). Yem katkısı, dezenfektan ya da beşerî ürün olabilir; veteriner tıbbi ürün olarak ruhsatlı olmayabilir.`),
    geriDugmesi(),
  );
}
