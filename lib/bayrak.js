// Kırmızı bayrak katmanı (spec §9, §4). Saf: DOM yok, tarayıcıda ve Node'da çalışır.
// Puandan bağımsızdır: hastalık sıralamasına, yaş / tür süzgecine ve "yetersiz girdi" eşiğine
// bakmaz — ihbar / zoonoz şüphesi sıralamada kaybolmasın diye sonuçların üstünde gösterilir.
//
// Kural: { id, hastalikId, kosul: { hepsi?, herhangi?, baglam? }, baslik, uyarilar }
//   hepsi    — dolu ise listedeki bulguların hepsi olmalı
//   herhangi — dolu ise listedeki bulgulardan en az biri olmalı
//   ikisi de doluysa ikisi de tutmalı; ikisi de boşsa kural hiç tutmaz
//   baglam   — true işaretli her anahtar (aniOlum, suru, dogumSonrasi) girdi.baglam'da da true olmalı
// Bulgular puan.js'teki bulgular(girdi) ile alınır: ateş / hipotermi yalnız ısıdan türetilir.
import { bulgular } from './puan.js';

const nesneMi = (d) => d !== null && typeof d === 'object' && !Array.isArray(d);

/** Dizi değilse null (bozuk), boşsa boş dizi (koşulsuz). */
function liste(d) {
  if (d === undefined) return [];
  return Array.isArray(d) ? d : null;
}

function tutarMi(kosul, bulguKumesi, baglam) {
  if (!nesneMi(kosul)) return false;
  const hepsi = liste(kosul.hepsi);
  const herhangi = liste(kosul.herhangi);
  if (hepsi === null || herhangi === null) return false;
  if (hepsi.length === 0 && herhangi.length === 0) return false;
  if (!hepsi.every((id) => bulguKumesi.has(id))) return false;
  if (herhangi.length > 0 && !herhangi.some((id) => bulguKumesi.has(id))) return false;
  if (kosul.baglam !== undefined) {
    if (!nesneMi(kosul.baglam)) return false;
    for (const [anahtar, deger] of Object.entries(kosul.baglam)) {
      if (deger === true && baglam?.[anahtar] !== true) return false;
    }
  }
  return true;
}

/**
 * Tutan kırmızı bayrakları veri sırasıyla, kural kimliğine göre tekrarsız döndürür.
 * Boş / bozuk veride ve eksik girdide boş dizi döner, atmaz. Bilinmeyen kimlikler hiçbir kuralı tutturmaz.
 * @param {{ yas?, baglam?, isi?, belirtiler? }} girdi
 * @param {{ bayraklar?: any[] }} veri
 * @returns {{ id: string, hastalikId: string, baslik: string, uyarilar: string[] }[]}
 */
export function bayraklar(girdi, veri) {
  const kurallar = Array.isArray(veri?.bayraklar) ? veri.bayraklar : [];
  if (kurallar.length === 0) return [];
  const g = nesneMi(girdi) ? girdi : {};
  const bulguKumesi = new Set(bulgular({ ...g, belirtiler: Array.isArray(g.belirtiler) ? g.belirtiler : [] }));

  const sonuc = [];
  const gorulen = new Set();
  for (const k of kurallar) {
    if (!nesneMi(k) || gorulen.has(k.id)) continue;
    if (!tutarMi(k.kosul, bulguKumesi, g.baglam)) continue;
    gorulen.add(k.id);
    sonuc.push({
      id: k.id,
      hastalikId: k.hastalikId,
      baslik: k.baslik,
      uyarilar: Array.isArray(k.uyarilar) ? [...k.uyarilar] : [],
    });
  }
  return sonuc;
}
