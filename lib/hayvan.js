// Hayvanın kilosu ve yaşı (ay): metinden sayıya okuma ve olağan dışı değer uyarıları.
// Puanlama bu değerleri kullanmaz; yalnız doz hesabı ve ekran özeti.

const SAYI = /^\d+(?:\.\d+)?$/;

function sayiOku(metin) {
  if (typeof metin === 'number') return Number.isFinite(metin) ? metin : null;
  if (typeof metin !== 'string') return null;
  const s = metin.trim().toLocaleLowerCase('tr').replace(/\s*kg$/, '').trim().replace(',', '.');
  return SAYI.test(s) ? Number(s) : null;
}

/** "450", "450,5", " 450 kg " → sayı; boş / geçersiz / ≤ 0 → null. */
export function kiloOku(metin) {
  const n = sayiOku(metin);
  return n != null && n > 0 ? n : null;
}

/** 0–360 ay (tam ya da ondalık); dışı → null. */
export function yasAyOku(metin) {
  const n = sayiOku(metin);
  return n != null && n >= 0 && n <= 360 ? n : null;
}

const KILO_MIN = 15;
const KILO_MAX = 1200;

/** @returns {{ tur: 'gecersiz'|'yumusak', metin: string } | null} */
export function kiloUyarisi(kilo, yas) {
  if (kilo == null) return null;
  if (kilo < KILO_MIN || kilo > KILO_MAX) return { tur: 'gecersiz', metin: 'Kilo olağan dışı, kontrol edin' };
  if ((yas === 'buzagi' && kilo > 250) || ((yas === 'inek' || yas === 'boga') && kilo < 150)) {
    return { tur: 'yumusak', metin: 'Kilo yaş grubuyla uyumsuz görünüyor, kontrol edin' };
  }
  return null;
}
