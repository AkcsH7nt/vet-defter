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
// KÜB alıntıları (scripts/kub-ayikla.mjs üretir). İsteğe bağlı: dosya yoksa ya da okunamazsa (ör. eski önbellek,
// çevrimdışı) boş küme; uygulama KÜB alıntısı olmadan çalışmaya devam eder. Bozuk JSON'u dogrula yakalar.
const KUB = 'veri/kub.json';
const BOS_KUB = () => ({ urunler: {} });

/**
 * @param {(yol: string) => Promise<any> | any} oku JSON döndüren okuma işlevi
 * @returns {Promise<{ meta, belirtiler, etkenler, hastaliklar, bayraklar, ihbar, yasaklar, urunler, kub }>}
 */
export async function veriYukle(oku = (yol) => fetch(yol).then((r) => {
  if (!r.ok) throw new Error(`${yol} yüklenemedi (${r.status})`);
  return r.json();
})) {
  const adlar = Object.keys(TEKIL);
  const [tekiller, hastaliklar, kub] = await Promise.all([
    Promise.all(adlar.map((ad) => oku(TEKIL[ad]))),
    hastaliklariYukle(oku),
    kubYukle(oku),
  ]);
  const veri = { hastaliklar, kub };
  adlar.forEach((ad, i) => { veri[ad] = tekiller[i]; });
  return veri;
}

async function kubYukle(oku) {
  try {
    const kub = await oku(KUB);
    const nesne = (x) => x && typeof x === 'object' && !Array.isArray(x);
    return nesne(kub) && nesne(kub.urunler) ? kub : BOS_KUB();
  } catch {
    return BOS_KUB();
  }
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
