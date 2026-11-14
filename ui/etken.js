// Ekran 4: Etken madde — nasıl çalışır + sığırda ruhsatlı ürünler.
// Bu ekranda hastalık bağlamı yoktur: doz sayısı gösterilmez, yalnız KÜB'e yönlendirilir;
// et / süt bekleme süreleri ürünün KÜB'ü doğrulanmışsa yazılır.
import { el, doldur, bulunamadi, taslakEtiketi, tarihYaz } from './ortak.js';
import { normalize } from '../lib/arama.js';
import { sigirMi, sutYaz } from './hastalik.js';

const AMEG = {
  A: 'Gıda hayvanında kullanılmaz',
  B: 'Antibiyogramsız ilk seçenek olmaz',
};

export function render(kok, veri, durum, rota) {
  const e = veri.etkenler.find((x) => x.id === rota.id);
  if (!e) { bulunamadi(kok, 'Bu etken madde kaydı bulunamadı.'); return; }
  const m = e.mekanizma ?? {};
  const tarih = tarihYaz(veri.meta?.urunListesiTarihi);
  const urunler = veri.urunler.filter((u) => (u.etkenler ?? []).includes(e.id) && sigirMi(u));

  const satir = (ad, deger) => (deger ? el('li', {}, el('strong', {}, `${ad}: `), deger) : null);

  const urunKarti = (u) => {
    const k = (u.kub ?? []).find((x) => normalize(x.tur) === 'sigir');
    const dogru = !!u.kubDogrulandi;
    return el('li', { class: 'urun' },
      el('strong', {}, u.ad),
      el('span', { class: 'soluk' }, ` — ${u.firma}${u.form ? ` — ${u.form}` : ''}${k?.yol ? `, ${k.yol}` : ''}`),
      el('p', { class: 'doz' }, 'KÜB\'e bakın ', u.kubUrl ? el('a', { href: u.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸') : null),
      dogru && k ? el('p', { class: 'soluk' }, `Et ${k.et_gun == null ? 'belirtilmemiş' : `${k.et_gun} g`} · Süt: ${sutYaz(k.sut)}`) : null);
  };

  doldur(kok, 
    el('h1', {}, e.ad, ' ', e.onay?.durum === 'onayli' ? null : taslakEtiketi()),
    e.ameg ? el('p', { class: 'ameg' }, el('strong', {}, `AMEG: ${e.ameg}`), AMEG[e.ameg] ? ` — ${AMEG[e.ameg]}` : null) : null,
    el('h2', {}, 'Nasıl çalışır'),
    el('ul', { class: 'madde' },
      satir('Hedef', m.hedef), satir('Etki', m.etki), satir('Tür', m.tur), satir('Spektrum', m.spektrum),
      satir('Kinetik', m.kinetik), satir('Direnç', m.direnc),
      ...(m.etkilesimler ?? []).map((x) => satir('Etkileşim', x))),
    el('h2', {}, `Ruhsatlı ürünler (liste tarihi: ${tarih})`),
    urunler.length
      ? el('ul', { class: 'madde urunler' }, urunler.map(urunKarti))
      : el('p', { class: 'yetersiz' }, `Bu etken için listede ruhsatlı ürün bulunamadı (liste tarihi ${tarih}).`),
    el('button', { type: 'button', class: 'dugme', onclick: () => history.back() }, '◂ Geri'),
  );
}
