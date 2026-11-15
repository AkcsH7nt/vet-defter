// Ekran 4: Etken madde — nasıl çalışır + sığırda (buzağı dahil) ruhsatlı ürünler.
// KÜB 4.9 / 4.11 alıntıları resmî metin olarak ("KÜB'den alıntı") ürün onayı olmadan gösterilir (spec §15);
// hastalık bağlamı olmadığından burada doz sayısı yazılmaz.
import { el, doldur, bulunamadi, taslakEtiketi, tarihYaz, geriDugmesi } from './ortak.js';
import { onayliMi } from '../lib/onay.js';
import { urunKarti, kombineBilgisi, sigirMi, AMEG } from './kub.js';

// Süt / sağmal inek kısıtı içeren notlar en üstte.
const sutNotuMu = (x) => /süt|sağmal|laktasyon/i.test(x);

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

  const kartlar = (u) => urunKarti(u, veri.kub?.urunler?.[u.urunId], { ek: kombineBilgisi(u, e, veri) });

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
        tekli.length ? el('ul', { class: 'madde urunler' }, tekli.map(kartlar)) : null,
        kombine.length ? el('h2', {}, `Kombine ürünler (başka etken de içerir: ${kombine.length})`) : null,
        kombine.length ? el('ul', { class: 'madde urunler kombine-liste' }, kombine.map(kartlar)) : null,
      ]
      : el('p', { class: 'yetersiz' }, `Bu etken için listede ruhsatlı ürün bulunamadı (liste tarihi ${tarih}). Yem katkısı, dezenfektan ya da beşerî ürün olabilir; veteriner tıbbi ürün olarak ruhsatlı olmayabilir.`),
    geriDugmesi(),
  );
}
