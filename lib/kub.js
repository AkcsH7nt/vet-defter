// KÜB (Kısa Ürün Bilgisi) metninden 4.9 doz ve 4.11 arınma bölümlerini ayırır, 4.11'den sığır arınma sürelerini okur.
// Saf işlevler; girdi `pdftotext -simple -enc UTF-8` (ya da Poppler'da düz `pdftotext`) çıktısıdır.
//
// Metin kelimesi kelimesine korunur: yalnız satır sonu birleştirme ve fazla boşluk temizliği yapılır.
// Arınma okuma TUTUCUDUR (yanlış sayı gıda güvenliği riskidir): tür ya da yol ayrımı belirsizse,
// beklenmedik bir sayı, aralık, kuru dönem / doğum kuralı varsa guven 'dusuk' döner ve ekran sayıyı göstermez.

// --- Bölüm ayırma ---

const BASLIK_49 = /^\s*4\.9(?!\d)/;
const BASLIK_411 = /^\s*4\.11(?!\d)/;
// 5. bölüm: "5. FARMAKOLOJİK…", "5 . FARMAKOLOJİK", "5.FARMAKOLOJİK", "5.1Farmakodinamik" ya da numarasız büyük harfli başlık.
const BOLUM_5 = String.raw`5\s*\.\s*\d|5\s*\.?\s*FARMAKOLOJ`;
const BOLUM_5_NUMARASIZ = /^\s*FARMAKOLOJİK\s+ÖZELLİK/;
const sonDeseni = (dortlu) => {
  const numarali = new RegExp(String.raw`^\s*(${dortlu}|${BOLUM_5})`, 'i');
  return { test: (s) => numarali.test(s) || BOLUM_5_NUMARASIZ.test(s) };
};
const SON_49 = sonDeseni(String.raw`4\.1\d(?!\d)`);
const SON_411 = sonDeseni(String.raw`4\.1[2-9](?!\d)`);
const SAYFA_ALTLIGI = /^\s*sayfa\s*\d+\s*(\/|of)\s*\d+\s*$/i;

/**
 * KÜB metninden 4.9 (doz) ve 4.11 (arınma) bölümlerini ayırır; başlık satırları hariç.
 * Başlık ya da bölüm sonu bulunamazsa, ya da bölüm boşsa o alan null.
 * @param {string} metin
 * @returns {{ doz: string|null, arinma: string|null }}
 */
export function bolumAyir(metin) {
  // sayfa sonu (\f) satırın başına yapışır; silinince sayfa arasında bölünmüş cümle birleşebilir
  const satirlar = String(metin ?? '').replace(/\f/g, '').split(/\r?\n/);
  const i49 = satirlar.findIndex((s) => BASLIK_49.test(s));
  const i411 = satirlar.findIndex((s, i) => i > i49 && BASLIK_411.test(s));
  return {
    doz: i49 < 0 ? null : bolum(satirlar, i49, SON_49),
    arinma: i411 < 0 ? null : bolum(satirlar, i411, SON_411),
  };
}

function bolum(satirlar, bas, son) {
  const bitis = satirlar.findIndex((s, i) => i > bas && son.test(s));
  if (bitis < 0) return null; // sonu belirsiz bölüm: belgenin geri kalanını almaktansa yok say
  return paragraf(satirlar.slice(bas + 1, bitis).filter((s) => !SAYFA_ALTLIGI.test(s)));
}

/**
 * Satır kırılmalarını birleştirir: yalnız kaydırılmış (wrap) satırlar bir öncekine eklenir; tablo satırları,
 * cümle sonundan sonra büyük harfle başlayan satırlar ayrı kalır. Satır içi fazla boşluk tek boşluğa iner.
 */
function paragraf(satirlar) {
  const dolu = satirlar.map((s) => s.replace(/\s+$/, '')).filter((s) => s.trim() !== '');
  if (dolu.length === 0) return null;
  const girinti = (s) => s.match(/^\s*/)[0].length;
  const tabanGirinti = Math.min(...dolu.map(girinti));
  const enUzun = Math.max(...dolu.map((s) => s.length));
  const cikti = [];
  let onceki = null; // ham önceki satır
  for (const ham of satirlar.map((s) => s.replace(/\s+$/, ''))) {
    if (ham.trim() === '') { onceki = null; continue; }
    const temiz = ham.trim().replace(/\s+/g, ' ');
    if (onceki !== null && birlesir(onceki, ham, temiz, tabanGirinti, enUzun, girinti)) {
      const son = cikti.length - 1;
      cikti[son] = /\p{L}-$/u.test(cikti[son]) && /^\p{Ll}/u.test(temiz)
        ? cikti[son].slice(0, -1) + temiz // hece bölme tiresi: "du-" + "rumu" → "durumu"
        : /-$/.test(cikti[son]) ? cikti[son] + temiz : `${cikti[son]} ${temiz}`;
    } else {
      cikti.push(temiz);
    }
    onceki = ham;
  }
  return cikti.join('\n');
}

function birlesir(onceki, ham, temiz, tabanGirinti, enUzun, girinti) {
  if (girinti(ham) > tabanGirinti) return false; // girintili satır: tablo hücresi ya da madde
  const oncekiTemiz = onceki.trim();
  if (/:$/.test(oncekiTemiz)) return false;
  if (/-$/.test(oncekiTemiz)) return true;
  if (/^[\p{Ll}\d(%,;]/u.test(temiz)) return true; // küçük harf / sayı / parantezle devam
  // büyük harfle başlayan satır: önceki satır sağ kenara kadar dolu ve cümle bitmemişse kaydırmadır
  return onceki.length >= Math.max(0.6 * enUzun, 50) && !/[.!?)]$/.test(oncekiTemiz);
}

// --- Sığır arınma okuma ---

const SIGIR = String.raw`sığır|inek|buzağı|dana|düve`;
const DIGER = String.raw`koyun|keçi|kuzu|oğlak|tavuk|hindi|piliç|broiler|kanatlı|ördek|kaz(?:lar\p{L}*)?(?!\p{L})|domuz|köpek|kedi|tavşan|deve|manda|balık|tay(?:lar\p{L}*)?(?!\p{L})|at(?:lar\p{L}*|ın|a|ta)?(?!\p{L})`;
const TUR = new RegExp(String.raw`(?<!\p{L})(?:(${SIGIR})\p{L}*|(${DIGER})\p{L}*)`, 'gu');
const YOL = /(?<!\p{L})(kas\s*içi|ven\s*içi|damar\s*içi|deri\s*altı|intramüsküler|intravenöz|subkutan|meme\s*içi|intramammer|ağız\s*yolu|oral|i\.m\.|i\.v\.|s\.c\.|im|iv|sc)(?!\p{L})/gu;
const ET = /(?<!\p{L})(et|eti|etin|ette|etler|etleri)(?!\p{L})|kesim|kesil|sakatat|yenilebilir\s+doku|karkas/u;
const SUT = /süt|sağım|laktasyon|sağmal|sağıl/u;
const OLUMSUZ_KULLANIM = /kullanılma(z|malı)|kullanılamaz|uygulanma(z|malı)|uygulanamaz|uygulamayınız|kullanmayınız/u;
const DOGUM = /doğum|gebe|kuru\s*dönem|kuru\s*periyo|kuruya|buzağılama/u;
// Et ve süt aynı yan cümlede tek sayıyla: yalnız açık ortak ifade ("et ve süt için 0 gün") kabul, bozuk tablo satırı değil.
const ET_VE_SUT = /(?<!\p{L})(et|eti|sakatat)(\s*,\s*|\s+ve\s+)süt|süt(\s*,\s*|\s+ve\s+)(et|sakatat)(?!\p{L})/u;
// Koşula bağlı süre: "yalnızca kulak tabanına derialtı uygulanırsa" gibi.
const KOSUL = /(?<!\p{L})(yalnız|yalnızca|sadece)(?!\p{L})/u;
const MEME_ICI = /^(meme\s*içi|intramammer)$/u;
// Süt arınmasıyla ilgisiz "süt" geçen kalıplar (sütten kesilmiş buzağı, süt emen, süt ikamesi).
const SUT_DISI = /süt(?:ten)?\s+(?:kesil\p{L}*|emen|ikame\p{L}*)|süt(?:le|\s+ile)\s+beslenen/gu;
const YUKLEM = /((?:gönderilme(?:meli|z)|sevk\s+edilme(?:meli|z)|kesilme(?:meli|z)|sunulma(?:malı|z)|kullanılma(?:malı|z)|uygulanma(?:malı|z)|uygulanamaz|kullanılamaz)\p{L}*)\s*[,;]\s*/gu;
const ETIKET = /(?<!\p{L})(et\s+ve\s+sakatat|yenilebilir\s+dokular?|sakatat|et|süt)\s*:/gu;
// Süre: sayı + birim (+ hemen ardından doğrulama parantezi, ör. "10 gün (20 sağım)", "6 gün (144 saat-12 sağım)").
const SURE = String.raw`(\d+(?:[.,]\d+)?)\s*(gün\p{L}*|saat\p{L}*|hafta\p{L}*|ay(?:dan|lık|dır|dir)?(?!\p{L}))(\s*\([^()]*\))?`;
const BELIRTEC = new RegExp(String.raw`${SURE}|(?<!\p{L})(?:(${SIGIR})\p{L}*|(${DIGER})\p{L}*)|(\d+(?:[.,]\d+)?)`, 'gu');
const SINIR = { etGun: 500, sutSaat: 90 * 24 };

const sonuc = (et_gun, sut, guven) => ({ et_gun, sut, guven });

/**
 * 4.11 metninden sığır (sığır/inek/buzağı/dana/düve ya da tür belirtmeyen ifade) için et ve süt arınmasını okur.
 * Gün → saat ×24; "sağım" sayısı yalnız doğrulama içindir (1 sağım = 12 saat).
 * @param {string|null} arinma
 * @returns {{ et_gun: number|null, sut: {saat:number}|'kullanilmaz'|'belirtilmemis'|null, guven: 'yuksek'|'dusuk' }}
 */
export function sigirArinmasi(arinma) {
  if (typeof arinma !== 'string' || arinma.trim() === '') return sonuc(null, null, 'dusuk');
  const metin = normallestir(arinma);
  const turler = turlerOf(metin);
  const metinSigir = turler.some((t) => t.sigir);
  const metinDiger = turler.some((t) => !t.sigir);
  const sutGecer = SUT.test(metin.toLocaleLowerCase('tr').replace(SUT_DISI, ' — '));

  let belirsiz = false;
  const etDegerleri = new Set(); // saat
  const sutDegerleri = new Set(); // saat
  let kullanilmaz = false;
  let kapsam = null; // "Sığır, koyun ve at için;" başlığının türleri: sonraki türsüz yan cümleler bunlara aittir

  for (const cumle of cumleler(metin)) {
    const et = ET.test(cumle);
    const sut = SUT.test(cumle);
    const sayiVar = /\d/.test(cumle);
    const cumleTurleri = turlerOf(cumle);
    if (cumleTurleri.length && !et && !sut && !sayiVar && /için\s*[;:]?$/u.test(cumle)) { kapsam = cumleTurleri; continue; }

    // Bu yan cümle sığıra mı ait?
    let ilgili;
    if (cumleTurleri.length) ilgili = cumleTurleri.some((t) => t.sigir);
    else if (kapsam) ilgili = kapsam.some((t) => t.sigir);
    else if (metinSigir && metinDiger) {
      // tür belirtmeyen yan cümle; metinde sığır da başka tür de var → kime ait olduğu belirsiz
      if ((et || sut) && (sayiVar || OLUMSUZ_KULLANIM.test(cumle))) belirsiz = true;
      continue;
    } else ilgili = metinSigir || !metinDiger;
    if (!ilgili) continue;

    // Kuru dönem / gebelik / doğum kuralı tek sayıya indirgenemez.
    if (DOGUM.test(cumle)) { belirsiz = true; continue; }
    if (!et && !sut) continue;
    // Yola ya da koşula bağlı süre (meme içi tek yol hariç) → sayı gösterilmez.
    const yollar = (cumle.match(YOL) ?? []).filter((y) => !MEME_ICI.test(y.replace(/\s+/g, ' ')));
    if (yollar.length || KOSUL.test(cumle)) { belirsiz = true; continue; }

    const okuma = cumleOku(cumle);
    if (!okuma) { belirsiz = true; continue; }
    if (okuma.sureler.length === 0) {
      if (sut && !et && OLUMSUZ_KULLANIM.test(cumle)) kullanilmaz = true;
      continue;
    }
    if (new Set(okuma.sureler).size > 1) { belirsiz = true; continue; }
    if (et && sut && okuma.sayiAdedi === 1 && !ET_VE_SUT.test(cumle)) { belirsiz = true; continue; }
    const saat = okuma.sureler[0];
    if (et) etDegerleri.add(saat);
    if (sut) sutDegerleri.add(saat);
  }

  let et_gun = null;
  if (etDegerleri.size === 1) {
    const saat = [...etDegerleri][0];
    if (Number.isInteger(saat / 24) && saat / 24 <= SINIR.etGun) et_gun = saat / 24;
    else belirsiz = true;
  } else if (etDegerleri.size > 1) belirsiz = true;

  let sut = null;
  if (kullanilmaz && sutDegerleri.size > 0) belirsiz = true;
  else if (kullanilmaz) sut = 'kullanilmaz';
  else if (sutDegerleri.size === 1) {
    const saat = [...sutDegerleri][0];
    if (saat <= SINIR.sutSaat) sut = { saat };
    else belirsiz = true;
  } else if (sutDegerleri.size > 1) belirsiz = true;
  else if (!sutGecer) sut = 'belirtilmemis';

  return sonuc(et_gun, sut, !belirsiz && et_gun !== null && sut !== null ? 'yuksek' : 'dusuk');
}

function normallestir(s) {
  return s.replace(/[“”‘’"'`´]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cümle ve yan cümlelere böler (küçük harfe çevrilmiş parçalar). */
function cumleler(metin) {
  const parcalar = metin.split(/(?<=[.;)])\s+(?=[\p{Lu}(])/u);
  const sonuc = [];
  for (const p of parcalar) {
    const kucuk = p.toLocaleLowerCase('tr').replace(SUT_DISI, ' — ')
      // "0 (sıfır)", "0 sıfır", "sıfır (0)", "sıfır 0", "sıfır gün" → "0"
      .replace(/(?<![\d,.])0\s*\(?\s*sıfır\s*\)?/gu, '0')
      .replace(/(?<!\p{L})sıfır\s*\(?\s*0\s*\)?(?![\d,.])/gu, '0')
      .replace(/(?<!\p{L})sıfır(?=\s*(gün|saat))/gu, '0')
      // "(0) gündür" → "0 gündür"
      .replace(/\(\s*(\d+)\s*\)\s*(?=(gün|saat))/gu, '$1 ')
      // "4 sağım (48 saat)" → "48 saat (4 sağım)": süre önde, sağım doğrulamada
      .replace(/(\d+)\s*sağım\s*\(\s*(\d+(?:[.,]\d+)?)\s*(saat|gün)\s*\)/gu, '$2 $3 ($1 sağım)');
    const etiketli = kucuk.replace(ETIKET, (m) => `\n${m}`).replace(YUKLEM, (m, y) => `${y}\n`)
      // "et ve sakatat için 2 gün, süt için 0 gündür" / "… 3 gün ve süt için 0 gündür" → iki yan cümle
      // (yalnız süreden sonra: "et ve süt için 0 gün" bölünmez)
      .replace(/(\d\s*(?:gün|saat)\p{L}*)\s*(?:,|ve(?!\p{L}))\s*(?=(?:süt|et\s+ve\s+sakatat|et|sakatat)\s+için)/gu, '$1\n');
    for (const c of etiketli.split('\n')) if (c.trim()) sonuc.push(c.trim());
  }
  return sonuc;
}

function turlerOf(metin) {
  const kucuk = metin.toLocaleLowerCase('tr').replace(SUT_DISI, ' — ');
  return [...kucuk.matchAll(TUR)].map((m) => ({ sigir: Boolean(m[1]) }));
}

/**
 * Yan cümleden sığıra ait süreleri (saat) okur. Dönüş: { sureler: saat[] (boş = sayı yok), sayiAdedi } ya da null (belirsiz).
 * Desen: tek farklı süre → hepsine; birden çok farklı süre → "tür süre, tür süre" ya da "süre tür, süre tür" sırası şart.
 */
function cumleOku(cumle) {
  if (/\d\s*-\s*\d/.test(cumle.replace(/\([^()]*\)/g, ''))) return null; // aralık: "28-35 gün"
  const belirtecler = []; // { tur: 'S', sigir } | { tur: 'N', saat|null, birim|null }
  for (const m of cumle.matchAll(BELIRTEC)) {
    if (m[1] !== undefined) {
      const carpan = birimCarpani(m[2]);
      if (carpan === null) return null;
      const saat = sayi(m[1]) * carpan;
      if (m[3] && !dogrula(saat, m[3])) return null;
      belirtecler.push({ tur: 'N', saat, carpan });
    } else if (m[4] !== undefined || m[5] !== undefined) {
      belirtecler.push({ tur: 'S', sigir: m[4] !== undefined });
    } else {
      // birimsiz sayı: yalnız "sığırlar 14, koyunlar 10 gün" gibi bir sonraki birimi paylaşan dizide
      const ardi = cumle.slice(m.index + m[0].length);
      if (!/^\s*(,|-|ve\s)/u.test(ardi)) return null;
      belirtecler.push({ tur: 'N', saat: null, sayi: sayi(m[6]) });
    }
  }
  // birimsiz sayıya sonraki sürenin birimi
  for (let i = 0; i < belirtecler.length; i += 1) {
    const b = belirtecler[i];
    if (b.tur !== 'N' || b.saat !== null) continue;
    const sonraki = belirtecler.slice(i + 1).find((x) => x.tur === 'N' && x.saat !== null);
    if (!sonraki) return null;
    b.saat = b.sayi * sonraki.carpan;
  }
  const sureler = belirtecler.filter((b) => b.tur === 'N');
  const sayiAdedi = sureler.length;
  if (sayiAdedi === 0) return { sureler: [], sayiAdedi };
  const farkli = new Set(sureler.map((s) => s.saat));
  if (farkli.size === 1) return { sureler: [sureler[0].saat], sayiAdedi };
  // gruplar: ardışık türler tek grup
  const gruplar = [];
  for (const b of belirtecler) {
    const son = gruplar[gruplar.length - 1];
    if (b.tur === 'S' && son?.tur === 'S') son.sigir ||= b.sigir;
    else gruplar.push({ ...b });
  }
  const sira = gruplar.map((g) => g.tur).join('');
  let ciftler;
  if (/^(SN)+$/.test(sira)) ciftler = gruplar.flatMap((g, i) => (i % 2 ? [] : [[g, gruplar[i + 1]]]));
  else if (/^(NS)+$/.test(sira)) ciftler = gruplar.flatMap((g, i) => (i % 2 ? [] : [[gruplar[i + 1], g]]));
  else return null;
  const sigirSureleri = ciftler.filter(([s]) => s.sigir).map(([, n]) => n.saat);
  return new Set(sigirSureleri).size > 1 ? null : { sureler: sigirSureleri, sayiAdedi };
}

const sayi = (s) => Number(s.replace(',', '.'));

function birimCarpani(birim) {
  if (birim.startsWith('gün')) return 24;
  if (birim.startsWith('saat')) return 1;
  if (birim.startsWith('hafta')) return 168;
  return null; // ay: uzunluğu belirsiz
}

/** "(20 sağım)", "(144 saat-12 sağım)" gibi parantez içi sayılar ana süreyle tutmalı. */
function dogrula(saat, parantez) {
  const ic = parantez.replace(/[()]/g, '');
  const sayilar = [...ic.matchAll(/(\d+(?:[.,]\d+)?)\s*(saat|gün|sağım)?/gu)];
  for (const [, d, b] of sayilar) {
    if (!b) return false;
    const carpan = b === 'saat' ? 1 : b === 'gün' ? 24 : 12;
    if (Math.abs(sayi(d) * carpan - saat) > 1e-9) return false;
  }
  return true;
}
