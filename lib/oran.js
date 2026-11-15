// KÜB 4.9 (doz) metninden sığır ml/kg oranı ve uygulama yolu kodları. Saf işlevler; scripts/kub-ayikla.mjs
// sonucu veri/kub.json'a yazar, lib/oneri.js yolKodlari'ni protokol `yol` metnine de uygular.
//
// Oran okuma TUTUCUDUR: ekran `mlPerKg × kilo` ml'yi hayvana uygulanacak miktar olarak gösterir, yanlış bir `yuksek`
// oran en kötü sonuçtur. Sığıra ait tek ve net bir "X ml/Y kg" oranı yoksa (birden çok farklı oran, aralık, tablo,
// eski biçim, kilo sınıfı / üst sınır, endikasyona göre değişen mg/kg dozu, ters yazılı farklı oran) guven 'dusuk',
// mlPerKg null döner ve ekran KÜB metnini gösterir.
//
// Tür ayrımı cümle düzeyindedir: yalnız sığır dışı tür (koyun, keçi, at, köpek…) geçen cümle sayılmaz; tür sözcüğü
// geçmeyen cümle bir önceki tür belirten cümlenin (ör. tek başına "Koyun" / "Sığır:" başlık satırı) türünü alır.

const SAYI = String.raw`\d+(?:[.,]\d+)?`;
const ARA = String.raw`\s*(?:-|–|—|ila|ile|veya|ya\s+da)\s*`; // aralık: "1-2", "1–2", "1 ila 2", "1 veya 2"
const sayi = (s) => Number(String(s).replace(',', '.'));
const ayniDeger = (a, b) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)); // %1 tolerans

// "X ml/Y kg", "X ml / Y kg canlı ağırlık|vücut ağırlığı", "X ml ürün/Y kg", "X ml/kg" (Y = 1); ürün adıyla da
// ("1 ml KİNOLOKS/20 kg": ad büyük harfle başlar, en çok 3 sözcük). Gruplar: x, x2 (aralık sonu), ad, y, y2.
// Ek ("canlı ağırlık", "vücut ağırlığı") yalnız tam bu biçimde ifadeye katılır.
const ORAN = new RegExp(String.raw`(?<![\d.,])(?<x>${SAYI})(?:${ARA}(?<x2>${SAYI}))?\s*ml\s*(?:(?<ad>[\p{L}®]+(?:\s+[\p{L}®]+){0,2})\s*)?\/\s*(?:(?<y>${SAYI})(?:${ARA}(?<y2>${SAYI}))?\s*)?kg(?!\p{L})(?:\s*(?:canlı|vücut)\s+ağırlı(?:k|ğı)(?!\p{L}))?`, 'giu');
// "ml" ile "/" arasındaki sözcük: "ürün" ya da büyük harfle başlayan ürün adı ("su", "çözelti" değil).
const urunSozu = (ad) => ad === undefined || /^ürün$/iu.test(ad) || /^\p{Lu}/u.test(ad);
// Payda vücut ağırlığı değil: "1 ml/10 kg yem".
const YEM = /^\s*(?:yem|süt(?!\p{L})|mama|rasyon|karma)/iu;
// Cümlede ml aralığı ("1-2 ml", "1 ila 2 ml").
const ML_ARALIK = new RegExp(String.raw`(?<![\d.,])${SAYI}${ARA}${SAYI}\s*ml(?!\p{L})`, 'iu');
// Ters yazım: "50 kg vücut ağırlığı için 1 ml" (bu planda oran kaynağı değil; yalnız ileri orana uyup uymadığı denetlenir).
const TERS = new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*kg(?!\p{L})[^\d]{0,40}?(?<![\d.,])(${SAYI})(?:${ARA}(${SAYI}))?\s*ml(?!\p{L})`, 'giu');
// mg/kg (ve µg, IU, mEq …) dozu: "5 mg/kg", "0,5 mg meloksikam/kg", "16-24 mg toplam aktif madde/kg".
const MG_KG = new RegExp(String.raw`(?<![\d.,])(${SAYI})(?:\s*(?:-|–|ila)\s*(${SAYI}))?\s*(mg|µg|μg|mcg|g|iu|ıu|ie|ü|ünite|meq|mmol)(?:\s+[\p{L}-]+){0,3}?\s*\/\s*kg(?!\p{L})`, 'giu');
// Oranı sınırlayan / kilo sınıfına bağlayan ifade (yanında ayrıca bir ml miktarı varsa oran tek başına yetmez).
const SINIR = /en\s+fazla|en\s+çok|maksimum|maks\.|azami|üzerindeki|üstündeki|geçmeyecek|geçmemeli|aşmayacak|aşmamalı|hayvan\s+başına|\d\s*kg\s*['’]?\s*\p{L}*\s+(?:daha\s+)?(?:kadar|üzer\p{L}*|üst\p{L}*|ağır(?!l)\p{L}*|fazla|aşan|alt[ıi]\p{L}*|hafif\p{L}*)(?!\p{L})/iu;
const SERBEST_ML = /(?<![\d.,])\d+(?:[.,]\d+)?\s*ml(?!\p{L})/iu;
// Günlük doz birden çok uygulamaya bölünüyor ("günlük doz ikiye bölünerek"): ml × kilo bir uygulamanın miktarı değil.
const BOLUNMUS_DOZ = /(?:ikiye|üçe|iki\s+eşit\s+\p{L}*|eşit\s+iki\s+\p{L}*|iki\s+doza|iki\s+uygulamaya)\s*(?:bölün|ayrıl)|günlük\s+doz\p{L}*\s+[^.]{0,40}?bölün/iu;

// --- Enjeksiyon yeri başına en çok hacim ---
const YER_IPUCU = /(?:enjeksiyon|uygulama)\s+(?:yer|bölge|nokta)\p{L}*|(?:bir|aynı|her|tek|farklı|ayrı|iki)\s+(?:\p{L}+\s+)?(?:yer|bölge|nokta)\p{L}*|bölün\p{L}*|bölerek/iu;
const YER_DEGER = [
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s*['’]?\s*(?:den|dan)?\s*(?:daha\s+)?(?:fazla|çok)`, 'giu'), // 20 ml'den fazla
  new RegExp(String.raw`en\s+(?:fazla|çok)\s+(${SAYI})\s*ml(?!\p{L})`, 'giu'), // en fazla 15 ml
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s*['’]?\s*(?:yi|yı|i)?\s+(?:aş|geç)`, 'giu'), // 10 ml'yi aşmamalı
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s+aşıl`, 'giu'), // 50 ml aşılmamalı
  new RegExp(String.raw`maksimum\s+(${SAYI})\s*ml(?!\p{L})`, 'giu'),
];
// Türe göre sınır ("sığırda 20, keçi ve koyunda 5 ml'den fazla"): sığırın sayısı.
const YER_SIGIR = new RegExp(String.raw`(?:s[ıi][ğg][ıi]r|inek)\p{L}*\s+(?:için\s+)?(?:(?:en\s+fazla|maksimum)\s+)?(${SAYI})(?!\s*(?:kg|gün|saat|%|mg))`, 'iu');
const YER_SINIR_SOZU = /fazla|çok|aş|geç|maksimum/iu;

// --- Tür sözcükleri (kat() ile küçültülmüş metinde: ı → i) ---
const YETISKIN = /(?<!\p{L})(?:si[ğg]ir|inek|düve|duve|tosun|boğa(?!z))/u;
const BUZAGI = /(?<!\p{L})(?:buza[ğg]i|dana)/u;
const DIGER = /(?<!\p{L})(?:koyun|keçi|kuzu|oğlak|tavuk|hindi|piliç|broiler|kanatli|ördek|domuz|köpek|kedi|tavşan|deve|manda|balik|kisrak|aygir|tek\s+tirnak|kaz(?:lar\p{L}*)?(?!\p{L})|tay(?:lar\p{L}*)?(?!\p{L})|kuş(?:lar\p{L}*)?(?!\p{L})|at(?:lar\p{L}*|in|a|ta)?(?!\p{L}))/u;
const kat = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i');

/** Cümlede geçen türler; tür sözcüğü yoksa null. */
function turler(cumle) {
  const k = kat(cumle).replace(/(?<!\p{L})\p{L}+\s+(?:hariç|dişinda)(?!\p{L})/gu, ' '); // "(atlar hariç)"
  const t = { yetiskin: YETISKIN.test(k), buzagi: BUZAGI.test(k), diger: DIGER.test(k) };
  return t.yetiskin || t.buzagi || t.diger ? t : null;
}

/**
 * Metni cümlelere böler: her satır ayrı; satır içinde nokta / ! / ? + boşluk + büyük harf ya da rakam. "i.m. veya",
 * "2. uygulama", "2.5 mg" bölünmez. Her cümleye kendi türü (tur) ve önceki cümlelerden gelen türü (baglam) eklenir.
 */
function cumleler(metin) {
  const sonuc = [];
  let baglam = null;
  for (const satir of String(metin ?? '').split('\n')) {
    // nokta sonrası boşluksuz yeni cümle ("uygulanır.300 kg’dan"): önünde en az iki küçük harf (kısaltma değil)
    for (const parca of satir.trim().split(/(?<=[.!?])\s+(?=[\p{Lu}\d])|(?<=\p{Ll}{2}[.!?])(?=[\p{Lu}\d])/u)) {
      const metni = parca.trim();
      if (!metni) continue;
      const tur = turler(metni);
      if (tur) baglam = tur;
      const sigirIcin = !baglam || baglam.yetiskin || baglam.buzagi;
      sonuc.push({ metin: metni, tur, sigirIcin, kapsam: !baglam || baglam.yetiskin ? 'sigir' : 'buzagi' });
    }
  }
  return sonuc;
}

/** Cümlenin enjeksiyon yeri başına sınırı (ml); yoksa ya da sığırınki ayrılamıyorsa null. */
function yerSiniri(c) {
  if (!YER_IPUCU.test(c.metin)) return null;
  if (c.tur && c.tur.diger) {
    // türe göre ayrı sınırlar: yalnız sığırın sayısı ("sığırlarda 6, koyunlarda 3 ml")
    if (!(c.tur.yetiskin || c.tur.buzagi) || !YER_SINIR_SOZU.test(c.metin)) return null;
    const m = c.metin.match(YER_SIGIR);
    return m ? sayi(m[1]) : null;
  }
  const degerler = [];
  for (const re of YER_DEGER) for (const m of c.metin.matchAll(re)) degerler.push(sayi(m[1]));
  const tekil = degerler.filter((d, i) => degerler.findIndex((x) => ayniDeger(x, d)) === i);
  return tekil.length === 1 ? tekil[0] : null;
}

/**
 * Enjeksiyon yeri başına en çok hacim: sığır cümlelerindeki "(bir) enjeksiyon yerine/bölgesine … X ml'den fazla" (ve
 * "en fazla X ml", "X ml'yi aşmamalı", "X ml'den fazla dozlar bölünerek") sınırları; tek değer → X, yoksa ya da
 * farklı değerler varsa null.
 */
function yerBasinaMax(liste) {
  const degerler = liste.filter((c) => c.sigirIcin).map(yerSiniri).filter((d) => d !== null && d > 0);
  const tekil = degerler.filter((d, i) => degerler.findIndex((x) => ayniDeger(x, d)) === i);
  return tekil.length === 1 ? tekil[0] : null;
}

const bosluk = (s) => s.replace(/\d/g, '#').replace(/ml/gi, '##'); // eşleşmeyi rakamsız, "ml"siz yer tutucuyla örter

/**
 * KÜB 4.9 metninden sığır ml/kg oranı.
 * @param {string|null} doz  KÜB 4.9 metni (veri/kub.json `doz`)
 * @param {{ tablo?: boolean, eskiBicim?: boolean }} [secenek]
 * @returns {{ mlPerKg: number|null, ifade: string|null, cumle: string|null, kaynak: 'ml_kg'|null,
 *   kapsam: 'sigir'|'buzagi'|null, guven: 'yuksek'|'dusuk', yerBasinaMaxMl: number|null }}
 */
export function dozOrani(doz, { tablo = false, eskiBicim = false } = {}) {
  const liste = cumleler(doz);
  const yerBasinaMaxMl = yerBasinaMax(liste);
  const dusuk = { mlPerKg: null, ifade: null, cumle: null, kaynak: null, kapsam: null, guven: 'dusuk', yerBasinaMaxMl };
  if (!liste.length || tablo || eskiBicim) return dusuk;

  const oranlar = []; // { deger, ileri, ifade, cumle, kapsam }
  const mgOranli = new Set();
  const mgDiger = new Set();
  for (const c of liste) {
    if (!c.sigirIcin) continue;
    let ortulu = c.metin;
    let oranli = false;
    for (const m of c.metin.matchAll(ORAN)) {
      const g = m.groups;
      if (!urunSozu(g.ad) || YEM.test(c.metin.slice(m.index + m[0].length))) continue;
      if (g.x2 !== undefined || g.y2 !== undefined) return dusuk; // aralık
      const y = g.y === undefined ? 1 : sayi(g.y);
      if (!(y > 0) || !(sayi(g.x) > 0)) return dusuk;
      oranlar.push({ deger: sayi(g.x) / y, ileri: true, ifade: m[0].trim(), cumle: c.metin, kapsam: c.kapsam });
      ortulu = ortulu.slice(0, m.index) + bosluk(m[0]) + ortulu.slice(m.index + m[0].length);
      oranli = true;
    }
    if (ML_ARALIK.test(ortulu)) return dusuk; // "1-2 ml" (hayvan başı ya da başka yazımla aralık)
    if (BOLUNMUS_DOZ.test(c.metin)) return dusuk;
    const yerCumlesi = YER_IPUCU.test(c.metin);
    if (!yerCumlesi) {
      // üst sınır / kilo sınıfı / hayvan başı miktar + ayrıca ml → oran tek başına geçerli değil
      if (SINIR.test(ortulu) && SERBEST_ML.test(ortulu)) return dusuk;
      for (const m of ortulu.matchAll(TERS)) {
        if (m[3] !== undefined) return dusuk;
        const kg = sayi(m[1]);
        if (kg > 0) oranlar.push({ deger: sayi(m[2]) / kg, ileri: false, ifade: null, cumle: c.metin, kapsam: c.kapsam });
      }
    }
    for (const m of c.metin.matchAll(MG_KG)) {
      const anahtar = `${sayi(m[1])}${m[2] ? `-${sayi(m[2])}` : ''} ${m[3].toLocaleLowerCase('tr')}`;
      (oranli ? mgOranli : mgDiger).add(anahtar);
    }
  }

  const ileri = oranlar.filter((o) => o.ileri);
  if (!ileri.length) return dusuk;
  const tekil = oranlar.filter((o, i) => oranlar.findIndex((x) => ayniDeger(x.deger, o.deger)) === i);
  if (tekil.length !== 1) return dusuk;
  // Endikasyona göre değişen doz: oranlı cümlelerde olmayan bir mg/kg dozu başka sığır cümlesinde geçiyorsa
  // (oranlı cümlede mg/kg yoksa: başka cümlelerde birden çok farklı mg/kg dozu).
  if (mgOranli.size ? [...mgDiger].some((a) => !mgOranli.has(a)) : mgDiger.size > 1) return dusuk;

  const kapsam = oranlar.some((o) => o.kapsam === 'sigir') ? 'sigir' : 'buzagi';
  const secilen = ileri.find((o) => o.kapsam === kapsam) ?? ileri[0];
  return {
    mlPerKg: secilen.deger, ifade: secilen.ifade, cumle: secilen.cumle, kaynak: 'ml_kg', kapsam, guven: 'yuksek', yerBasinaMaxMl,
  };
}

// --- Uygulama yolu kodları ---

/** Kod sırası (yolKodlari bu sırayla döner). */
export const YOL_KODLARI = ['IM', 'IV', 'SC', 'ORAL', 'IMM', 'IU', 'TOPIKAL'];

// kat() ile küçültülmüş metinde (ı → i): "deri altı" → "deri alti", "IV" → "iv".
const YOL_KALIPLARI = {
  IM: /kas[\s-]*içi|intram[uü]sk[uü]ler|(?<![\p{L}.])i\.\s?m(?:\.|(?!\p{L}))|(?<![\p{L}.])im(?![\p{L}.])/u,
  IV: /damar[\s-]*içi|ven[\s-]*içi|intraven[öo]z|intravenous|(?<![\p{L}.])i\.\s?v(?:\.|(?!\p{L}))|(?<![\p{L}.])iv(?![\p{L}.])/u,
  SC: /deri[\s-]*alti|subk[uü]tan|sübk[uü]tan|(?<![\p{L}.])s\.\s?c(?:\.|(?!\p{L}))|(?<![\p{L}.])sc(?![\p{L}.])/u,
  ORAL: /(?<!\p{L})ağiz(?!\s+ve\s+tirnak)|(?<!\p{L})oral|içme\s+su|süt\s+ikame|(?<!\p{L})sonda(?:\s+ile|yla|si|\s+yolu)|mide\s+sonda|(?<!\p{L})rumen/u,
  IMM: /meme[\s-]*içi|intramam+er|meme\s+kanal|meme\s+lob|meme\s*başi\s+kanal/u,
  IU: /uterus[\s-]*içi|intra[\s-]?uterin|rahim[\s-]*içi/u,
  TOPIKAL: /dökme|pour[\s-]?on|sprey|(?<!\p{L})banyo|püskürt|deri\s+üzer|deri\s+yüzey|(?<!\p{L})lokal|topikal/u,
};
// Olumsuz yan cümle ("damar içi yolla uygulanmamalıdır"): içindeki yol sayılmaz.
const OLUMSUZ = /uygulanma(?:mali|z|yiniz|yin)|uygulamayiniz|kullanilma(?:mali|z)|yapilma(?:mali|z)|verilme(?:meli|z)|edilme(?:meli|z)|kaçinil/u;

/**
 * Metindeki uygulama yollarının kodları (YOL_KODLARI sırasıyla, tekrarsız). KÜB 4.9 metnine ve protokol `yol` metnine
 * uygulanır. Olumsuz yan cümledeki ("…uygulanmamalıdır") yol sayılmaz.
 * @param {string|null} metin
 * @returns {string[]}
 */
export function yolKodlari(metin) {
  const bulunan = new Set();
  for (const c of cumleler(metin)) {
    for (const yan of kat(c.metin).split(/[,;]/)) {
      if (OLUMSUZ.test(yan)) continue;
      for (const [kod, re] of Object.entries(YOL_KALIPLARI)) if (re.test(yan)) bulunan.add(kod);
    }
  }
  return YOL_KODLARI.filter((k) => bulunan.has(k));
}
