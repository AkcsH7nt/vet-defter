// Ekran 3: Hastalık protokolü. Üstte kiloya göre önerilen tedavi kartı (ui/oneri.js); ilaç satırları etken sayfasına bağlanır.
import { el, doldur, bulunamadi, taslakEtiketi, geriDugmesi } from './ortak.js';
import { onayliMi } from '../lib/onay.js';
import { gosterilebilirMi } from '../lib/oneri.js';
import { sigirMi, sigirListesindeMi, yalnizBuzagiMi } from './kub.js';
import { oneriKarti } from './oneri.js';

export { sigirMi, yalnizBuzagiMi };

const KIP = {
  yasak: 'Tedavi yasak', yok: 'Tedavi yok', semptomatik: 'Yalnız semptomatik tedavi', normal: 'Normal tedavi',
};

const madde = (liste) => el('ul', { class: 'madde' }, liste.map((x) => el('li', {}, x)));
function bolum(baslik, icerik) {
  return el('details', { class: 'bolum', open: true }, el('summary', {}, baslik), icerik);
}

export function render(kok, veri, durum, rota) {
  const h = veri.hastaliklar.find((x) => x.id === rota.id);
  if (!h) { bulunamadi(kok, 'Bu hastalık kaydı bulunamadı.'); return; }
  const p = h.protokol ?? {};
  const onayli = onayliMi(h);
  const tedaviYok = h.tedaviKipi === 'yasak' || h.tedaviKipi === 'yok';
  if (tedaviYok && (p.ilaclar ?? []).length) console.warn(`Tedavi kipi '${h.tedaviKipi}' iken ilaç satırları gösterilmedi: ${h.id}`);

  const ilacSatirlari = tedaviYok ? [] : [...(p.ilaclar ?? [])]
    .filter((i) => gosterilebilirMi(i, veri, h.id))
    .sort((a, b) => a.sira - b.sira).map((i) => {
      const e = veri.etkenler.find((x) => x.id === i.etkenId);
      const href = `#/etken/${encodeURIComponent(i.etkenId)}`;
      const urunSayisi = veri.urunler.filter((u) => (u.etkenler ?? []).includes(i.etkenId) && sigirListesindeMi(u, veri)).length;
      return el('li', { class: 'ilac' },
        el('span', { class: 'sira' }, `${i.sira}. seçenek`),
        ' ',
        el('a', { href, class: 'ilac-ad' }, e?.ad ?? i.etkenId),
        el('span', { class: 'soluk' }, ` · ${i.yol}`),
        i.not ? el('p', { class: 'soluk' }, i.not) : null,
        urunSayisi
          ? [el('p', { class: 'doz' }, "Doz: önerilen tedavi kartında ya da ürünün KÜB'ünde"),
            el('a', { class: 'dugme ikincil', href }, `Ruhsatlı ürünler (${urunSayisi}) ▸`)]
          : [el('p', { class: 'doz' }, "Doz: KÜB'e bakın"), el('p', { class: 'soluk' }, 'Listede ruhsatlı sığır ürünü yok.')]);
    });

  const ayirici = (h.ayiriciTani ?? []).map((id) => {
    const d = veri.hastaliklar.find((x) => x.id === id);
    return d ? el('li', {}, el('a', { href: `#/hastalik/${encodeURIComponent(id)}` }, d.ad)) : el('li', {}, id);
  });

  doldur(kok,
    el('h1', {}, h.ad, ' ', onayli ? null : taslakEtiketi()),
    h.ihbari ? el('div', { class: 'bant tehlike', role: 'alert' },
      el('strong', {}, '⛔ İhbarı mecburi — bildirin'), madde(p.ihbarAdimlari ?? [])) : null,
    h.zoonoz ? el('div', { class: 'bant zoonoz' }, el('strong', {}, '⚠ Zoonoz — insana bulaşır; korunmadan temas etmeyin')) : null,
    h.turkiyedeGorulmez ? el('p', { class: 'kip' }, el('strong', {}, 'Türkiye\'de görülmez'), ' (eradike ya da bildirilmemiş); şüphede ihbar edin.') : null,
    (h.uyarilar ?? []).length ? el('div', { class: 'bant uyari-liste', role: 'note' }, el('strong', {}, 'Uyarılar'), madde(h.uyarilar)) : null,
    oneriKarti(h, veri, durum),
    el('p', { class: 'kip' }, el('strong', {}, 'Tedavi kipi: '), KIP[h.tedaviKipi] ?? h.tedaviKipi),
    h.antibiyotikEndikeDegil ? el('p', { class: 'kip' }, el('strong', {}, 'Antibiyotik endike değil')) : null,
    ilacSatirlari.length ? bolum('İlaçlar (1./2. seçenek)', el('ul', { class: 'madde ilaclar' }, ilacSatirlari)) : null,
    (p.destekleyici ?? []).length ? bolum('Destekleyici', madde(p.destekleyici)) : null,
    (p.bakim ?? []).length ? bolum('Bakım / yönetim', madde(p.bakim)) : null,
    (h.sahadaDogrula ?? []).length ? bolum('Sahada doğrula', madde(h.sahadaDogrula)) : null,
    ayirici.length ? bolum('Ayırıcı tanı', el('ul', { class: 'madde ayirici' }, ayirici)) : null,
    onayli ? null : el('p', { class: 'soluk' }, 'Bu kayıt henüz hekim onayından geçmedi; öneri taslaktır.'),
    geriDugmesi(),
  );
}
