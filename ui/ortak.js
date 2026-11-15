// Ekranların ortak yardımcıları.
import { kiloOku, yasAyOku } from '../lib/hayvan.js';

/** el('div', {class: 'x', onclick: fn}, 'metin', baskaOge) → HTMLElement */
export function el(tag, attrs = {}, ...cocuklar) {
  const oge = document.createElement(tag);
  for (const [ad, deger] of Object.entries(attrs ?? {})) {
    if (deger == null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') oge.addEventListener(ad.slice(2), deger);
    else if (ad === 'class') oge.className = deger;
    else oge.setAttribute(ad, deger === true ? '' : deger);
  }
  for (const c of cocuklar.flat()) {
    if (c == null || c === false) continue;
    oge.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return oge;
}

/** Bilinmeyen rota ya da kimlik için sayfa. */
export function bulunamadi(kok, mesaj = 'Aradığınız sayfa bulunamadı.') {
  kok.replaceChildren(
    el('h1', {}, 'Bulunamadı'),
    el('p', { class: 'bulunamadi', role: 'alert' }, mesaj),
    el('a', { href: '#/tani' }, 'Tanı ekranına dön'),
  );
}

/** Sonuç ve hakkında ekranlarındaki sabit not. */
export function sorumlulukNotu() {
  return el('p', { class: 'sorumluluk' }, 'Hekim kararının yerine geçmez');
}

/** Sayı → giriş kutusu metni (ondalık virgülle; null → boş). */
export const sayiMetni = (v) => (v == null ? '' : String(v).replace('.', ','));

export const YASLAR = [
  ['buzagi', 'Buzağı'], ['dana', 'Dana (besi)'], ['duve', 'Düve'], ['inek', 'İnek'], ['boga', 'Boğa'],
];
export const SISTEMLER = {
  genel: 'Genel', solunum: 'Solunum', sindirim: 'Sindirim', meme: 'Meme', ureme: 'Üreme',
  metabolik: 'Metabolik', deri: 'Deri', ayak: 'Ayak', sinir: 'Sinir', kan: 'Kan', goz: 'Göz',
};

/** Boş / bozuk depolanmış girdiyi tam Girdi şekline getirir. */
export function girdiNormalize(g, isiOku) {
  const o = g && typeof g === 'object' ? g : {};
  const b = o.baglam && typeof o.baglam === 'object' ? o.baglam : {};
  return {
    tur: 'sigir',
    yas: YASLAR.some(([k]) => k === o.yas) ? o.yas : 'inek',
    baglam: { dogumSonrasi: b.dogumSonrasi === true, suru: b.suru === true, aniOlum: b.aniOlum === true },
    isi: isiOku(o.isi),
    kilo: kiloOku(o.kilo),
    yasAy: yasAyOku(o.yasAy),
    belirtiler: Array.isArray(o.belirtiler) ? [...new Set(o.belirtiler.filter((x) => typeof x === 'string'))] : [],
  };
}

/** Yalnız bilinen ve elle seçilebilir belirti kimlikleriyle girdi kopyası (puan motoruna gider). */
export function bilinenGirdi(girdi, veri) {
  const bilinen = new Set((veri?.belirtiler ?? []).filter((b) => b.secilebilir !== false).map((b) => b.id));
  return { ...girdi, belirtiler: girdi.belirtiler.filter((id) => bilinen.has(id)) };
}

/** 2026-11-01 → 01.11.2026 */
export function tarihYaz(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (t ?? 'bilinmiyor');
}

export function taslakEtiketi() {
  return el('span', { class: 'etiket' }, 'taslak');
}

export const belirtiAdi = (veri, id) => veri.belirtiler.find((b) => b.id === id)?.ad ?? id;

/** replaceChildren, ama null / false çocukları atlar ("null" metni yazılmasın). */
export function doldur(kap, ...cocuklar) {
  kap.replaceChildren(...cocuklar.flat().filter((c) => c != null && c !== false));
}

/** Sonuç ve Hakkında ekranlarında: sıralama ile uyum yüzdesinin farkı (K6 Ö-1). */
export const SIRALAMA_ACIKLAMASI = 'Sıralama hastalığın sıklığını da hesaba katar; yüzde, o hastalıkta beklenen bulguların ne kadarının görüldüğüdür.';

// Uygulama içi rota değişimi sayısı (app.js hashchange'te artırır).
let icGecis = 0;
export function icGecisEkle() { icGecis += 1; }

/** "◂ Geri": uygulama içinde gelinmediyse (paylaşılan bağlantıyla doğrudan açıldıysa) Tanı ekranına gider (final-review M7). */
export function geriDugmesi() {
  return el('button', {
    type: 'button', class: 'dugme', id: 'geri',
    onclick: () => { if (icGecis > 0) history.back(); else location.hash = '#/tani'; },
  }, '◂ Geri');
}
