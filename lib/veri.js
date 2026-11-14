// Veri yükleyici. Saf: okuma işlevi dışarıdan verilir (tarayıcıda fetch, Node'da fs).
// Yollar uygulama köküne göre görelidir: 'veri/meta.json' gibi.

const TEKIL = {
  meta: 'veri/meta.json',
  belirtiler: 'veri/belirtiler.json',
  etkenler: 'veri/etkenler.json',
  bayraklar: 'veri/bayraklar.json',
  ihbar: 'veri/ihbar.json',
  yasaklar: 'veri/yasaklar.json',
  urunler: 'veri/urunler.json',
};
const HASTALIK_DIZINI = 'veri/hastaliklar/';

/**
 * @param {(yol: string) => Promise<any> | any} oku JSON döndüren okuma işlevi
 * @returns {Promise<{ meta, belirtiler, etkenler, hastaliklar, bayraklar, ihbar, yasaklar, urunler }>}
 */
export async function veriYukle(oku = (yol) => fetch(yol).then((r) => {
  if (!r.ok) throw new Error(`${yol} yüklenemedi (${r.status})`);
  return r.json();
})) {
  const adlar = Object.keys(TEKIL);
  const [tekiller, hastaliklar] = await Promise.all([
    Promise.all(adlar.map((ad) => oku(TEKIL[ad]))),
    hastaliklariYukle(oku),
  ]);
  const veri = { hastaliklar };
  adlar.forEach((ad, i) => { veri[ad] = tekiller[i]; });
  return veri;
}

async function hastaliklariYukle(oku) {
  const dizin = await oku(`${HASTALIK_DIZINI}index.json`);
  if (!Array.isArray(dizin) || !dizin.every((d) => typeof d === 'string' && /^[a-z0-9_]+\.json$/.test(d))) {
    throw new Error(`${HASTALIK_DIZINI}index.json grup dosya adlarının dizisi olmalı`);
  }
  const gruplar = await Promise.all(dizin.map((dosya) => oku(HASTALIK_DIZINI + dosya)));
  gruplar.forEach((g, i) => {
    if (!Array.isArray(g)) throw new Error(`${HASTALIK_DIZINI}${dizin[i]} bir dizi olmalı`);
  });
  return gruplar.flat();
}
