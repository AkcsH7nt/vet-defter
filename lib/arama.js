// Belirti arama. Saf: tarayıcıda ve Node'da aynı çalışır.
// Sıralama: (1) ad ya da eş anlamlıda kelime başı eşleşme, (2) yalnız "içerir" eşleşmesi.
// Her kademe içinde: metnin en başından başlayan eşleşme sonraki bir kelimedeki eşleşmeden önce, adda
// eşleşme eş anlamlıdan önce, sonra sahada sık görülen belirti (genelSiklik) önce, en son ada göre alfabetik.

/**
 * @typedef {{ id: string, ad: string, sistem?: string, esAnlamlilar?: string[], genelSiklik?: number,
 *   secilebilir?: boolean }} Belirti
 */

const HARFLER = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

/** Türkçe küçük harf; ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c (ve şapkalı â/î/û) birleşir; boşluklar sadeleşir. */
export function normalize(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöçâîû]/g, (h) => HARFLER[h])
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Bir metnin sorguyla eşleşme derecesi: 0 kelime başı, 1 içerir, null eşleşmez.
 * Kelime başı: sorgunun her kelimesi metindeki bir kelimenin başıyla eşleşir (sıra fark etmez).
 */
function eslesme(metin, sorgu, sorguKelimeleri) {
  const kelimeler = metin.split(' ');
  if (sorguKelimeleri.every((s) => kelimeler.some((k) => k.startsWith(s)))) {
    return { derece: 0, enBasta: metin.startsWith(sorgu) };
  }
  if (metin.includes(sorgu)) return { derece: 1, enBasta: false };
  return null;
}

/**
 * @param {string} sorgu
 * @param {Belirti[]} belirtiler
 * @returns {Belirti[]} eşleşenler, en iyi önce; `secilebilir: false` olanlar hiç dönmez.
 */
export function belirtiAra(sorgu, belirtiler) {
  const s = normalize(sorgu);
  if (!s) return [];
  const sorguKelimeleri = s.split(' ');
  const bulunan = [];
  for (const b of belirtiler ?? []) {
    if (!b || b.secilebilir === false) continue;
    let en = null;
    const adaylar = [[b.ad, 0], ...(b.esAnlamlilar ?? []).map((e) => [e, 1])];
    for (const [metin, alan] of adaylar) {
      const e = eslesme(normalize(metin), s, sorguKelimeleri);
      if (!e) continue;
      const anahtar = [e.derece, e.enBasta ? 0 : 1, alan];
      if (!en || karsilastir(anahtar, en) < 0) en = anahtar;
    }
    if (en) bulunan.push({ b, anahtar: en });
  }
  bulunan.sort((x, y) => karsilastir(x.anahtar, y.anahtar)
    || (y.b.genelSiklik ?? 0) - (x.b.genelSiklik ?? 0)
    || String(x.b.ad).localeCompare(String(y.b.ad), 'tr'));
  return bulunan.map((x) => x.b);
}

function karsilastir(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
