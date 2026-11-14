// Ekran 2: Sonuçlar. Kırmızı bayraklar en üstte, ardından ilk 5 uyum sonucu.
import { el, doldur, bilinenGirdi, belirtiAdi } from './ortak.js';
import { puanla, yetersizMi } from '../lib/puan.js';
import { bayraklar } from '../lib/bayrak.js';

const BANT = { guclu: 'Güçlü', orta: 'Orta', zayif: 'Zayıf' };

/** Aynı hastalığın birden çok kuralı tutarsa tek bant: ilk kuralın başlığı, uyarılar sırayla ve tekrarsız. */
export function bayraklariBirlestir(liste) {
  const gruplar = new Map();
  for (const b of liste) {
    const anahtar = b.hastalikId ?? b.id;
    const g = gruplar.get(anahtar);
    if (!g) { gruplar.set(anahtar, { ...b, uyarilar: [...new Set(b.uyarilar ?? [])] }); continue; }
    for (const u of b.uyarilar ?? []) if (!g.uyarilar.includes(u)) g.uyarilar.push(u);
  }
  return [...gruplar.values()];
}

export function render(kok, veri, durum) {
  const girdi = bilinenGirdi(durum.girdi, veri);
  const varMi = (id) => veri.hastaliklar.some((h) => h.id === id);
  const adlar = (ids) => ids.map((id) => belirtiAdi(veri, id)).join(', ');

  const bayrakBolumu = bayraklariBirlestir(bayraklar(girdi, veri)).map((b) => {
    const icerik = [
      el('strong', { class: 'bayrak-baslik' }, `⛔ ${b.baslik}`),
      el('ul', {}, (b.uyarilar ?? []).map((u) => el('li', {}, u))),
    ];
    return varMi(b.hastalikId)
      ? el('a', { class: 'bayrak', href: `#/hastalik/${encodeURIComponent(b.hastalikId)}` }, ...icerik, el('span', { class: 'bayrak-git' }, 'Ayrıntı ▸'))
      : el('div', { class: 'bayrak' }, ...icerik);
  });

  let govde;
  if (yetersizMi(girdi)) {
    govde = el('p', { class: 'yetersiz', role: 'status' }, 'Yetersiz girdi — belirti ekleyin');
  } else {
    const sonuclar = puanla(girdi, veri).slice(0, 5);
    govde = sonuclar.length
      ? el('ol', { class: 'sonuc-liste' }, sonuclar.map((s) => el('li', {},
        el('a', { class: `sonuc ${s.bant}`, href: `#/hastalik/${encodeURIComponent(s.id)}` },
          el('span', { class: 'sonuc-ust' },
            el('strong', {}, s.ad),
            el('span', { class: 'uyum' }, `${BANT[s.bant]} · uyum ${s.uyum}%`)),
          s.eslesen.length ? el('span', { class: 'sonuc-alt' }, `eşleşen: ${adlar(s.eslesen)}`) : null,
          s.eksik.length ? el('span', { class: 'sonuc-alt' }, `eksik: ${adlar(s.eksik)}`) : null,
          s.celisen.length ? el('span', { class: 'sonuc-alt' }, `çelişen: ${adlar(s.celisen)}`) : null)),
      ))
      : el('p', { class: 'yetersiz' }, 'Bu girdiye uyan hastalık kaydı yok.');
  }

  doldur(kok, 
    el('h1', {}, 'Sonuçlar'),
    bayrakBolumu.length ? el('section', { class: 'bayraklar', 'aria-label': 'Kırmızı bayraklar' }, bayrakBolumu) : null,
    govde,
    el('a', { class: 'dugme', href: '#/tani' }, '◂ Girdiyi düzenle'),
  );
}
