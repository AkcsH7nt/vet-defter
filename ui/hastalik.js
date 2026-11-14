// Ekran 3: Hastalık protokolü. Doz yalnız onaylı hastalık + KÜB'ü doğrulanmış üründe gösterilir.
import { el, doldur, bulunamadi, taslakEtiketi } from './ortak.js';
import { onayliMi } from '../lib/onay.js';
import { normalize } from '../lib/arama.js';

const KIP = {
  yasak: 'Tedavi yasak', yok: 'Tedavi yok', semptomatik: 'Yalnız semptomatik tedavi', normal: 'Normal tedavi',
};

/** Ürün sığırı hedef türler arasında sayıyor mu? ("Sığır" / "sigir", büyük-küçük harf ve aksan fark etmez) */
export function sigirMi(urun) {
  return (urun.hedefTurler ?? []).some((t) => normalize(t) === 'sigir');
}

export function sutYaz(sut) {
  if (sut && typeof sut === 'object' && sut.saat != null) return `${sut.saat} saat`;
  if (sut === 'kullanilmaz') return 'sağmal inekte kullanılmaz';
  return 'belirtilmemiş';
}

/** Doz satırı: yalnız hastalık onaylı VE ürünün KÜB'ü doğrulanmışsa sayı yazılır. */
function dozOgesi(h, urun, kaynak) {
  const kubBaglantisi = urun?.kubUrl
    ? el('a', { href: urun.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸') : null;
  const kubeBakin = el('p', { class: 'doz' }, 'KÜB\'e bakın ', kubBaglantisi);
  if (!(onayliMi(h) && urun?.kubDogrulandi)) return kubeBakin;
  const k = (urun.kub ?? []).find((x) => normalize(x.tur) === 'sigir');
  if (!k?.doz) return kubeBakin;
  const d = k.doz;
  const parca = [`${d.miktar} ${d.birim}`, d.aralik, d.sure].filter(Boolean).join(' · ');
  return el('p', { class: 'doz' },
    el('strong', {}, `KÜB dozu: ${parca}`),
    el('br'),
    `Et ${k.et_gun == null ? 'belirtilmemiş' : `${k.et_gun} g`} · Süt: ${sutYaz(k.sut)} `,
    kubBaglantisi,
    kaynak?.bolum ? ` (bölüm ${kaynak.bolum})` : null);
}

const madde = (liste) => el('ul', { class: 'madde' }, liste.map((x) => el('li', {}, x)));
function bolum(baslik, icerik) {
  return el('details', { class: 'bolum', open: true }, el('summary', {}, baslik), icerik);
}

export function render(kok, veri, durum, rota) {
  const h = veri.hastaliklar.find((x) => x.id === rota.id);
  if (!h) { bulunamadi(kok, 'Bu hastalık kaydı bulunamadı.'); return; }
  const p = h.protokol ?? {};
  const onayli = onayliMi(h);

  const ilacSatirlari = [...(p.ilaclar ?? [])].sort((a, b) => a.sira - b.sira).map((i) => {
    const e = veri.etkenler.find((x) => x.id === i.etkenId);
    const urun = i.kaynak?.urun ? veri.urunler.find((u) => u.ad === i.kaynak.urun) : null;
    return el('li', { class: 'ilac' },
      el('span', { class: 'sira' }, `${i.sira}. seçenek`),
      ' ',
      el('a', { href: `#/etken/${encodeURIComponent(i.etkenId)}`, class: 'ilac-ad' }, e?.ad ?? i.etkenId),
      el('span', { class: 'soluk' }, ` · ${i.yol}`),
      i.not ? el('p', { class: 'soluk' }, i.not) : null,
      dozOgesi(h, urun, i.kaynak));
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
    (h.uyarilar ?? []).length ? el('div', { class: 'bant uyari-liste', role: 'note' }, el('strong', {}, 'Uyarılar'), madde(h.uyarilar)) : null,
    el('p', { class: 'kip' }, el('strong', {}, 'Tedavi kipi: '), KIP[h.tedaviKipi] ?? h.tedaviKipi),
    h.antibiyotikEndikeDegil ? el('p', { class: 'kip' }, el('strong', {}, 'Antibiyotik endike değil')) : null,
    ilacSatirlari.length ? bolum('İlaçlar (1./2. seçenek)', el('ul', { class: 'madde ilaclar' }, ilacSatirlari)) : null,
    (p.destekleyici ?? []).length ? bolum('Destekleyici', madde(p.destekleyici)) : null,
    (p.bakim ?? []).length ? bolum('Bakım / yönetim', madde(p.bakim)) : null,
    (h.sahadaDogrula ?? []).length ? bolum('Sahada doğrula', madde(h.sahadaDogrula)) : null,
    ayirici.length ? bolum('Ayırıcı tanı', el('ul', { class: 'madde' }, ayirici)) : null,
    onayli ? null : el('p', { class: 'soluk' }, 'Bu kayıt henüz hekim onayından geçmedi; doz için KÜB\'e bakın.'),
    el('button', { type: 'button', class: 'dugme', onclick: () => history.back() }, '◂ Geri'),
  );
}
