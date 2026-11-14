// Hastalıklar (A–Z) ve İlaçlar (etken) listeleri; ikisinde de arama kutusu var.
import { el, doldur, taslakEtiketi } from './ortak.js';
import { normalize } from '../lib/arama.js';
import { onayliMi } from '../lib/onay.js';

export function render(kok, veri, durum, rota) {
  const hastalik = rota.ad === 'hastaliklar';
  const kayitlar = hastalik
    ? veri.hastaliklar.map((h) => ({ id: h.id, ad: h.ad, ek: h.agrivetAd, taslak: !onayliMi(h), href: `#/hastalik/${encodeURIComponent(h.id)}` }))
    : veri.etkenler.map((e) => ({ id: e.id, ad: e.ad, ek: e.sinif, taslak: e.onay?.durum !== 'onayli', href: `#/etken/${encodeURIComponent(e.id)}` }));
  kayitlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  const liste = el('ul', { class: 'liste' });
  const ara = el('input', {
    id: 'liste-ara', type: 'search', class: 'alan', autocomplete: 'off',
    placeholder: hastalik ? 'Hastalık ara' : 'Etken madde ara', oninput: () => ciz(),
  });
  function ciz() {
    const s = normalize(ara.value);
    const secilen = kayitlar.filter((k) => !s || normalize(`${k.ad} ${k.ek ?? ''}`).includes(s));
    doldur(liste, ...secilen.map((k) => el('li', {},
      el('a', { class: 'liste-satir', href: k.href }, el('span', {}, k.ad), k.taslak ? taslakEtiketi() : null))));
    if (!secilen.length) {
      doldur(liste, el('li', { class: 'yetersiz' },
        kayitlar.length ? 'Eşleşen kayıt yok.' : (hastalik ? 'Henüz hastalık kaydı yok.' : 'Henüz etken madde kaydı yok.')));
    }
  }
  ciz();
  doldur(kok, el('h1', {}, hastalik ? 'Hastalıklar' : 'İlaçlar'), ara, liste);
}
