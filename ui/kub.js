// KÜB alıntıları ve arınma etiketleri (spec §15). Metin resmî belgeden aynen alınır: yalnız textContent ile yazılır.
import { el } from './ortak.js';
import { normalize } from '../lib/arama.js';

export const OTOMATIK_NOT = "KÜB'den otomatik okundu — metinle karşılaştırın";

const yalnizBuzagi = (u) => {
  const t = (u.hedefTurler ?? []).map(normalize);
  return t.includes('buzagi') && !t.includes('sigir');
};
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

function kubKutusu(baslik, metin) {
  return el('details', { class: 'kub-kutu' },
    el('summary', {}, baslik),
    el('div', { class: 'kub-metin' }, metin ?? "Bu bölüm KÜB'den okunamadı — KÜB'e bakın."));
}

/**
 * Ürün kartı (li.urun). ek: ürün adının altına eklenecek öğe (ör. kombine bilgisi).
 * Kayıt yoksa ya da metinYok ise "KÜB'e bakın" + bağlantı; aksi hâlde etiket + açılır KÜB: Doz / KÜB: Arınma.
 */
export function urunKarti(u, kayit, { ek = null } = {}) {
  const baglanti = u.kubUrl
    ? [el('a', { href: u.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸'), el('span', { class: 'soluk' }, ' (internet gerekir)')]
    : null;
  const k = (u.kub ?? []).find((x) => x.tur === 'sigir');
  const ayrinti = `${u.firma ?? ''}${u.form ? ` — ${u.form}` : ''}${k?.yol ? `, ${k.yol}` : ''}`;
  const etiket = kayit && !kayit.metinYok ? arinmaEtiketi(kayit.sigir) : [];
  return el('li', { class: 'urun' },
    el('strong', {}, u.ad),
    yalnizBuzagi(u) ? el('span', { class: 'urun-etiket' }, ' (yalnız buzağı)') : null,
    el('span', { class: 'soluk' }, ` — ${ayrinti}`),
    ek,
    etiket.length
      ? el('p', { class: 'arinma-etiket' }, el('strong', {}, etiket.join(' · ')), el('br'), el('small', { class: 'soluk' }, OTOMATIK_NOT))
      : null,
    !kayit || kayit.metinYok
      ? el('p', { class: 'doz' }, "KÜB'e bakın ", baglanti ?? el('span', { class: 'soluk' }, '(KÜB bağlantısı yok — Bakanlık ürün sorgusundan bakın.)'))
      : [
        kubKutusu('KÜB: Doz', kayit.doz),
        kubKutusu('KÜB: Arınma', kayit.arinma),
        el('p', { class: 'doz kub-alinti' }, el('small', { class: 'soluk' }, "KÜB'den alıntı (4.9, 4.11) · metin aynen alındı "), baglanti),
      ]);
}
