// KÜB 4.9 (doz) metninden sığır ml/kg oranı ve uygulama yolu kodları. Saf işlevler; scripts/kub-ayikla.mjs
// sonucu veri/kub.json'a yazar, lib/oneri.js yolKodlari'ni protokol `yol` metnine de uygular.
//
// Oran okuma TUTUCUDUR: ekran `mlPerKg × kilo` ml'yi hayvana uygulanacak miktar olarak gösterir, yanlış bir `yuksek`
// oran en kötü sonuçtur. Sığıra ait tek ve net bir "X ml/Y kg" (ya da ters yazımla "her Y kg için X ml") oranı yoksa
// (birden çok farklı oran, aralık, tablo, eski biçim, kilo sınıfı / üst sınır, bölünmüş günlük doz, endikasyona göre
// değişen mg/kg dozu) guven 'dusuk', mlPerKg null döner ve ekran KÜB metnini gösterir.
//
// Tür ayrımı cümle düzeyindedir: yalnız sığır dışı tür (koyun, keçi, at, köpek…) geçen cümle sayılmaz; tür sözcüğü
// geçmeyen cümle bir önceki tür belirten cümlenin (ör. tek başına "Koyun" / "Sığır:" başlık satırı) türünü alır.
// Hem sığır hem başka tür geçen cümlede, başka türe ait yan cümle ("…, köpek ve kedilerde deri altı …", "(1 ml/40 kg)
// ve atlarda; … (3 ml/100 kg)") örtülür (sigirKismi); salt tür öbeği ("Sığır, koyun ve keçilerde …") bölünmez.
//
// K8-A ekleri: yer başına sınır KÜB 4.5'ten de okunur ve yola bağlanır (yerBasinaYol); kilo bandı listesi oranı düşürür;
// "Ameliyattan önce" oranı tedavi oranı sayılmaz; 4.1 hedef türü yalnız buzağıysa kapsam buzagi; yaş/kilo kısıtı
// cümleleri (kisitlar) aynen; kiloya bağlı olmayan doz (sabitDoz); sığıra ait yollar (sigirYollari).

const SAYI = String.raw`\d+(?:[.,]\d+)?`;
const ARA = String.raw`\s*(?:-|–|—|ila|ile|veya|ya\s+da)\s*`; // aralık: "1-2", "1–2", "1 ila 2", "1 veya 2"
const sayi = (s) => Number(String(s).replace(',', '.'));
const ayniDeger = (a, b) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)); // %1 tolerans

// "X ml/Y kg", "X ml / Y kg canlı ağırlık|vücut ağırlığı", "X ml ürün/Y kg", "X ml/kg" (Y = 1); ürün adıyla da
// ("1 ml KİNOLOKS/20 kg": ad büyük harfle başlar, en çok 3 sözcük). Gruplar: x, x2 (aralık sonu), ad, y, y2.
// Ek ("canlı ağırlık", "vücut ağırlığı") yalnız tam bu biçimde ifadeye katılır.
const ORAN = new RegExp(String.raw`(?<![\d.,])(?<x>${SAYI})(?:${ARA}(?<x2>${SAYI}))?\s*ml\s*(?:(?<ad>[\p{L}®]+(?:\s+[\p{L}®]+){0,2})\s*)?\/\s*(?:(?<y>${SAYI})(?:${ARA}(?<y2>${SAYI}))?\s*)?kg(?!\p{L})(?:\s*(?:canlı|vücut)\s+ağırlı(?:k|ğı)(?!\p{L}))?`, 'giu');
// "ml" ile "/" arasındaki sözcük: "ürün" ya da büyük harfle başlayan ürün adı ("su", "çözelti" değil).
// "1 ml enjeksiyonluk süspansiyon/10 kg": küçük harfle de olsa ürün biçimi sözcükleri.
const urunSozu = (ad) => ad === undefined || /^\p{Lu}/u.test(ad)
  || /^(?:ürün|ilaç|preparat|enjeksiyonluk|çözelti|süspansiyon|solüsyon)(?!\p{L})/iu.test(ad);
// Payda vücut ağırlığı değil: "1 ml/10 kg yem".
const YEM = /^\s*(?:yem|süt(?!\p{L})|mama|rasyon|karma)/iu;
// Cümlede ml aralığı ("1-2 ml", "1 ila 2 ml").
const ML_ARALIK = new RegExp(String.raw`(?<![\d.,])${SAYI}${ARA}${SAYI}\s*ml(?!\p{L})`, 'iu');
// Ters yazım, geniş: "Y kg … X ml" (40 karakter içinde, arada rakam yok). Her eşleşme oran çelişkisi için sayılır.
const TERS = new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*kg(?!\p{L})[^\d]{0,40}?(?<![\d.,])(${SAYI})(?:${ARA}(${SAYI}))?\s*ml(?!\p{L})`, 'giu');
// Ters yazım, dar (oran kaynağı olabilir): geniş eşleşmenin tamamı bu biçimdeyse. "30 kg vücut ağırlığı için 1 ml",
// "40 kg canlı ağırlığa 1 ml", "30 kg'a 1 ml", "100 kg vücut ağırlığı için günde 3 ml", "50 kg vücut ağırlığına – 5,60 ml".
// Önündeki "her" ifadeye katılır. "300 kg'dan ağır … 15 ml", "450 kg'lık bir inek için 15 ml" gibi biçimler dar değildir.
const TERS_KAYNAK = new RegExp(String.raw`^${SAYI}\s*kg\s*['’]?\s*(?:a|e|ya|ye)?(?:\s+(?:canlı|vücut)\s+ağırlı\p{L}*)?(?:\s+c\.\s?a\.?)?(?:\s+(?:için|başına))?\s*(?:[–-]\s*)?(?:(?:günde|günlük)\s+)?${SAYI}\s*ml$`, 'iu');
// Ters eşleşmenin kilo sayısından hemen önce aralık: "100-200 kg", "150 – 200 kg", "10 ila 20 kg" (kilo bandı).
const KG_ARALIK_ONCESI = new RegExp(String.raw`${SAYI}${ARA}$`, 'iu');
// Doz tablo / çizelge ile veriliyor: tablodan okunan oran tek oran sayılmaz.
const TABLO_SOZU = /tablo\s+(?:olarak|halinde|şeklinde)|aşağıdaki\s+tablo|tabloda|çizelge/iu;
// mg/kg (ve µg, IU, mEq …) dozu: "5 mg/kg", "0,5 mg meloksikam/kg", "16-24 mg toplam aktif madde/kg".
const MG_KG = new RegExp(String.raw`(?<![\d.,])(${SAYI})(?:\s*(?:-|–|ila)\s*(${SAYI}))?\s*(mg|µg|μg|mcg|g|iu|ıu|ie|ü|ünite|meq|mmol)(?:\s+[\p{L}-]+){0,3}?\s*\/\s*kg(?!\p{L})`, 'giu');
// Oranı sınırlayan / kilo sınıfına bağlayan ifade (yanında ayrıca bir ml miktarı varsa oran tek başına yetmez).
const SINIR = /en\s+fazla|en\s+çok|maksimum|maks\.|azami|üzerindeki|üstündeki|geçmeyecek|geçmemeli|aşmayacak|aşmamalı|hayvan\s+başına|\d\s*kg\s*['’]?\s*\p{L}*\s+(?:daha\s+)?(?:kadar|üzer\p{L}*|üst\p{L}*|ağır(?!l)\p{L}*|fazla|aşan|alt[ıi]\p{L}*|hafif\p{L}*)(?!\p{L})/iu;
const SERBEST_ML = /(?<![\d.,])\d+(?:[.,]\d+)?\s*ml(?!\p{L})/iu;
// Günlük doz birden çok uygulamaya bölünüyor ("günlük doz ikiye bölünerek"): ml × kilo bir uygulamanın miktarı değil.
const BOLUNMUS_DOZ = /(?:ikiye|üçe|iki\s+eşit\s+\p{L}*|eşit\s+iki\s+\p{L}*|iki\s+doza|iki\s+uygulamaya)\s*(?:bölün|ayrıl)|günlük\s+doz\p{L}*\s+[^.]{0,40}?bölün|(?:\/\s*gün|günlük)[^.]{0,80}?günde\s+(?:iki|2|üç|3)\s+(?:kez|defa|kere|sefer)|günde\s+(?:iki|2|üç|3)\s+(?:kez|defa|kere|sefer)[^.]{0,80}?(?:\/\s*gün|günlük)/iu;
// Yalnız erişkin hayvana ait oran ("Erişkin Sığır: 100 kg vücut ağırlığına 5 ml"): buzağıda geçerli olduğu bilinmiyor.
const ERISKIN = /(?<!\p{L})(?:erişkin|yetişkin)/iu;

// --- Enjeksiyon yeri başına en çok hacim ---
const YER_IPUCU = /(?:enjeksiyon|uygulama)\s+(?:yer|bölge|nokta)\p{L}*|(?:bir|aynı|her|tek|farklı|ayrı|iki)\s+(?:\p{L}+\s+)?(?:yer|bölge|nokta)\p{L}*|bölün\p{L}*|bölerek/iu;
const YER_DEGER = [
  // 20 ml'den fazla; "20 ml’den büyük dozlar en az iki farklı bölgeye"
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s*['’]?\s*(?:den|dan)?\s*(?:daha\s+)?(?:fazla|çok|büyük)`, 'giu'),
  new RegExp(String.raw`en\s+(?:fazla|çok)\s+(${SAYI})\s*ml(?!\p{L})`, 'giu'), // en fazla 15 ml
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s*['’]?\s*(?:yi|yı|i)?\s+(?:aş|geç)`, 'giu'), // 10 ml'yi aşmamalı
  new RegExp(String.raw`(?<![\d.,])(${SAYI})\s*ml\s+aşıl`, 'giu'), // 50 ml aşılmamalı
  new RegExp(String.raw`maksimum\s+(${SAYI})\s*ml(?!\p{L})`, 'giu'),
];
// Türe göre sınır ("sığırda 20, keçi ve koyunda 5 ml'den fazla"): sığırın sayısı.
const YER_SIGIR = new RegExp(String.raw`(?:s[ıi][ğg][ıi]r|inek)\p{L}*\s+(?:için\s+)?(?:(?:en\s+fazla|maksimum)\s+)?(${SAYI})(?!\s*(?:kg|gün|saat|%|mg))`, 'iu');
const YER_SINIR_SOZU = /fazla|çok|aş|geç|maksimum|büyük/iu;
// Kilo bandı: "35–45 kg", "45-60 kg", "35 kg < buzağı ≤ 45 kg" (yanında ml miktarı varsa bant dozu listesidir).
const KILO_BANDI = new RegExp(String.raw`(?<![\d.,])${SAYI}\s*(?:kg\s*)?${ARA}${SAYI}\s*kg(?!\p{L})|${SAYI}\s*kg\s*[<≤]\s*\p{L}+\s*[<≤]\s*${SAYI}\s*kg`, 'iu');
// Ameliyat öncesi (operatif) doz: tedavi oranı değildir (meloksikam KÜB'ü: "Ameliyattan önce 0,4 mg/kg … tek kas içi").
// SEZGİSEL: Türkçe meloksikam KÜB'lerinde bu satır "Sığır:" başlığı altında durur; AB KÜB'ünde aynı doz domuza aittir
// (domuz başlığı Türkçe metne taşınmamış). Kural bu taşınma hatasını tolere eder; sığır için bir ameliyat dozu yazan
// KÜB'de de o cümle oran/yol olarak okunmaz (tek ameliyat oranı varsa sonuç dusuk).
const OPERATIF = /ameliyat(?:tan)?\s+önce|ameliyat\s+öncesi|operasyon(?:dan)?\s+önce|operasyon\s+öncesi/u; // kat() metninde

// --- Tür sözcükleri (kat() ile küçültülmüş metinde: ı → i) ---
const YETISKIN = /(?<!\p{L})(?:si[ğg]ir|inek|düve|duve|tosun|boğa(?!z))/u;
const BUZAGI = /(?<!\p{L})(?:buza[ğg]i|dana)/u;
const DIGER = /(?<!\p{L})(?:koyun|keçi|kuzu|oğlak|tavuk|hindi|piliç|broiler|kanatli|ördek|domuz|köpek|kedi|tavşan|deve|manda|balik|kisrak|aygir|tek\s+tirnak|egzotik|sürüngen|kemirgen|küçük\s+memeli|kaz(?:lar\p{L}*)?(?!\p{L})|tay(?:lar\p{L}*)?(?!\p{L})|kuş(?:lar\p{L}*)?(?!\p{L})|at(?:lar\p{L}*|in|a|ta)?(?!\p{L}))/u;
const kat = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i');

// "Diğer (hedef) türlerde / hayvanlarda", "tüm hayvanlarda": sığırı da kapsar ("Atlarda ven içi, diğer hedef türlerde kas içi").
const HERKES = /(?<!\p{L})(?:diğer|tüm|bütün)\s+(?:hedef\s+)?(?:hayvan|tür)/u;

/** Cümlede geçen türler; tür sözcüğü yoksa null. */
function turler(cumle) {
  const k = kat(cumle).replace(/(?<!\p{L})\p{L}+\s+(?:hariç|dişinda)(?!\p{L})/gu, ' '); // "(atlar hariç)"
  const t = {
    yetiskin: YETISKIN.test(k) || HERKES.test(k), buzagi: BUZAGI.test(k), diger: DIGER.test(k), eriskin: ERISKIN.test(cumle),
  };
  return t.yetiskin || t.buzagi || t.diger ? t : null;
}

const dozSatiri = (s) => /\d\s*ml(?!\p{L})/iu.test(s ?? '');

/**
 * Metni cümlelere böler: her satır ayrı; satır içinde nokta / ! / ? + boşluk + büyük harf ya da rakam. "i.m. veya",
 * "2. uygulama", "2.5 mg" bölünmez. Her cümleye kendi türü (tur) ve önceki cümlelerden gelen türü (baglam) eklenir.
 */
function cumleler(metin) {
  const sonuc = [];
  let baglam = null;
  let baglamBaslik = false; // bağlamı veren cümle doz içermeyen tür başlığı mı ("At", "Köpek ve kedilerde")
  let oncekiSatir = '';
  for (const [satirNo, satir] of String(metin ?? '').split('\n').entries()) {
    // nokta sonrası boşluksuz yeni cümle ("uygulanır.300 kg’dan"): önünde en az iki küçük harf (kısaltma değil)
    for (const parca of satir.trim().split(/(?<=[.!?])\s+(?=[\p{Lu}\d])|(?<=\p{Ll}{2}[.!?])(?=[\p{Lu}\d])/u)) {
      const metni = parca.trim();
      if (!metni) continue;
      const tur = turler(metni);
      // satırında doz yoksa tür başlığı; ama doz tablosu satırının ("Koyun, (25-50 kg …) 15-25 ml") hemen altındaki
      // tek başına tür satırı ("Keçi") bir tablo hücresinin devamıdır, başlık değil
      if (tur) { baglam = tur; baglamBaslik = !/\d/.test(satir) && !(dozSatiri(oncekiSatir) && turler(oncekiSatir)); }
      const sigirIcin = !baglam || baglam.yetiskin || baglam.buzagi;
      sonuc.push({
        metin: metni, tur, sigirIcin, kapsam: !baglam || baglam.yetiskin ? 'sigir' : 'buzagi', eriskin: Boolean(baglam?.eriskin),
        satirNo, satirUzunlugu: satir.trim().length, baglamBaslik,
      });
    }
    if (satir.trim()) oncekiSatir = satir.trim();
  }
  return sonuc;
}

// --- Karışık türlü cümlede sığır kısmı ---

const TUR_SOZU = new RegExp(String.raw`(?:${YETISKIN.source}|${BUZAGI.source}|${DIGER.source})\p{L}*`, 'gu');
const BAGLAC = /(?<!\p{L})(?:ve|veya|ile|ya|da|de|için)(?!\p{L})/gu;
const birlesik = (a, b) => (a && b ? {
  yetiskin: a.yetiskin || b.yetiskin, buzagi: a.buzagi || b.buzagi, diger: a.diger || b.diger, eriskin: a.eriskin || b.eriskin,
} : a ?? b);

/**
 * Cümlenin sığıra ait kısmı: hem sığır hem başka tür geçen cümlede başka türe ait yan cümleler aynı uzunlukta boşlukla
 * örtülür (dizinler korunur; ifade asıl cümleden aynen alınır). Yan cümle sınırı: "," ";" ve önünde doz/yol yazılmışsa
 * türden önceki "ve / veya / ya da". Salt tür öbeği ("Sığır,", "sığırda;") sonraki yan cümlenin türüne katılır; ilk tür
 * sözcüğünden önceki yan cümle (ortak giriş) sayılır. Tek türlü cümle olduğu gibi döner.
 */
function sigirKismi(c) {
  const { metin } = c;
  if (!c.tur || !c.tur.diger || !(c.tur.yetiskin || c.tur.buzagi)) return metin;
  const k = kat(metin);
  if (k.length !== metin.length) return metin;
  const sinirlar = [0];
  const TUR_ONU = new RegExp(String.raw`\s(?:ve|veya|ya\s+da)\s+(?=(?:${YETISKIN.source}|${BUZAGI.source}|${DIGER.source}))`, 'gu');
  for (let i = 0; i < k.length; i += 1) if (/[;,]/.test(k[i])) sinirlar.push(i + 1);
  for (const m of k.matchAll(TUR_ONU)) {
    const onceki = Math.max(...sinirlar.filter((s) => s <= m.index));
    const ara = k.slice(onceki, m.index);
    if (/\d/.test(ara) || Object.values(YOL_KALIPLARI).some((re) => re.test(ara))) sinirlar.push(m.index);
  }
  const noktalar = [...new Set(sinirlar)].sort((a, b) => a - b);
  let sonuc = '';
  let bekleyen = null;
  let aktif = null; // null: henüz tür sözcüğü yok (ortak giriş)
  noktalar.forEach((bas, i) => {
    const parca = metin.slice(bas, noktalar[i + 1] ?? metin.length);
    const t = turler(parca.replace(/\([^()]*\)/g, ' ')); // "(Kanatlılar için–içme suyuna katılarak)" yan cümlenin türü değil
    const salt = t && kat(parca).replace(TUR_SOZU, '').replace(BAGLAC, '').replace(/[^\p{L}\d]/gu, '') === '';
    if (salt) bekleyen = birlesik(bekleyen, t);
    else if (t) { aktif = birlesik(bekleyen, t); bekleyen = null; } else if (bekleyen) { aktif = bekleyen; bekleyen = null; }
    const uygun = salt || aktif === null || aktif.yetiskin || aktif.buzagi;
    sonuc += uygun ? parca : ' '.repeat(parca.length);
  });
  return sonuc;
}

// --- Yer başına sınır okuma ---

/** Metinde geçen yol kodları (olumsuz yan cümle dahil; yer sınırı cümlesinin yolu için). */
function hamYollar(metin) {
  const k = kat(metin);
  return new Set(Object.entries(YOL_KALIPLARI).filter(([, re]) => re.test(k)).map(([kod]) => kod));
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
 * Sığır yer sınırları: [{ deger, yol }] (yol: cümlenin IM/SC/IV kodları). Sığır cümleleri sayılır. Ayrıca tür sözcüğü
 * olmayan ama sığır dışı tür bağlamında kalan sınır cümlesi, yolu sığır cümlelerinde geçiyor, sığır dışı hiçbir cümlede
 * geçmiyor ve içinde kaldığı tür bölümü açıkça başka bir yola sınırlıysa (ör. at yalnız ven içi, "Kas içi uygulamalarda
 * bir bölgeye 5 ml") sığırındır.
 */
function yerSinirlari(liste, sigirYol, digerYol) {
  const sonuc = [];
  liste.forEach((c, sira) => {
    const yol = new Set([...hamYollar(c.metin)].filter((y) => ['IM', 'SC', 'IV'].includes(y)));
    let uygun = c.sigirIcin;
    if (!uygun && !c.tur && yol.size) {
      // Cümlenin içinde kaldığı sığır dışı tür bölümü (bağlamı veren tür cümlesinden bu cümleye) açıkça başka bir yola
      // sınırlı olmalı ("At / Ven içi yolla …"): bölümde yol yazılmamışsa ("Koyun: / 1 ml/10 kg") sınır onun olabilir.
      const bolumYol = new Set();
      for (let j = sira - 1; j >= 0 && !liste[j].sigirIcin; j -= 1) {
        for (const y of hamYollar(liste[j].metin)) bolumYol.add(y);
        if (liste[j].tur) break;
      }
      const digerde = digerYol.filter((x) => x.c !== c).flatMap((x) => [...x.yol]);
      uygun = bolumYol.size > 0 && [...yol].every((y) => sigirYol.has(y) && !digerde.includes(y) && !bolumYol.has(y));
    }
    if (!uygun) return;
    const deger = yerSiniri(c);
    if (deger !== null && deger > 0) sonuc.push({ deger, yol });
  });
  return sonuc;
}

/**
 * Enjeksiyon yeri başına en çok hacim (4.9 ve verilirse 4.5 cümleleri): tek değer → { yerBasinaMaxMl, yerBasinaYol };
 * yoksa ya da farklı değerler varsa null. yerBasinaYol: sınırı veren her cümle aynı tek yolu (IM ya da SC) söylüyorsa.
 */
function yerBasinaMax(liste, ozelListe) {
  const sigirYol = new Set();
  const digerYol = [];
  for (const c of liste) {
    if (YER_IPUCU.test(c.metin)) {
      if (!c.sigirIcin) digerYol.push({ c, yol: hamYollar(c.metin) });
      continue;
    }
    if (c.sigirIcin) for (const y of hamYollar(sigirKismi(c))) sigirYol.add(y);
    else digerYol.push({ c, yol: hamYollar(c.metin) });
  }
  const ozelDiger = ozelListe.filter((c) => !c.sigirIcin).map((c) => ({ c, yol: hamYollar(c.metin) }));
  const sinirlar = [...yerSinirlari(liste, sigirYol, digerYol), ...yerSinirlari(ozelListe, sigirYol, [...digerYol, ...ozelDiger])];
  const tekil = sinirlar.filter((s, i) => sinirlar.findIndex((x) => ayniDeger(x.deger, s.deger)) === i);
  if (tekil.length !== 1) return { yerBasinaMaxMl: null, yerBasinaYol: null };
  const yollar = sinirlar.map((s) => [...s.yol].filter((y) => y === 'IM' || y === 'SC'));
  const yol = yollar.every((y) => y.length === 1 && y[0] === yollar[0][0]) ? yollar[0][0] : null;
  return { yerBasinaMaxMl: tekil[0].deger, yerBasinaYol: yol };
}

// --- 4.1 hedef tür, yaş/kilo kısıtları, sabit doz ---

/**
 * KÜB 4.1 hedef tür metninden sığır kapsamı: erişkin sığır (sığır, inek, düve, büyükbaş, ruminant…) varsa 'sigir',
 * yalnız buzağı ("Sığır (buzağı)", "Buzağı, kuzu") ise 'buzagi', sığır yoksa ya da metin yoksa null.
 * @param {string|null} metin
 * @returns {'sigir'|'buzagi'|null}
 */
export function hedefKapsami(metin) {
  if (typeof metin !== 'string' || !metin.trim()) return null;
  // "Sığır (buzağı)", "Sığır (sütten kesilmemiş buzağılar)": parantez içi yalnız buzağıysa sığır sözcüğü buzağı demektir
  // "genç sığır", "genç hayvan" erişkin değildir: "Sığır (buzağı ve genç sığır), köpek, kedi" yalnız buzağı/genç
  const k = kat(metin).replace(/(?<!\p{L})genç\s+(?:si[ğg]ir|hayvan)\p{L}*/gu, ' buzaği ')
    .replace(/(?<!\p{L})si[ğg]ir\p{L}*\s*\(([^()]*)\)/gu, (tam, ic) => (BUZAGI.test(ic) && !YETISKIN.test(ic) ? ` ${ic} ` : tam));
  if (YETISKIN.test(k) || /(?<!\p{L})(?:büyükbaş|ruminant|geviş\s+getiren)/u.test(k)) return 'sigir';
  return BUZAGI.test(k) ? 'buzagi' : null;
}

// Sayı rakamla ya da sözle ("bir haftadan küçük", "Altı haftalıktan küçük"); kat() metninde (ı → i).
const SAYI_SOZ = String.raw`(?:(?<![\d.,])\d+|(?<!\p{L})(?:bir|iki|üç|dört|beş|alti|yedi|sekiz|dokuz|on))`;
const KISIT_YAS = new RegExp(String.raw`${SAYI_SOZ}\s*(?:ay|hafta|gün)\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:yaş\p{L}*|küçük\p{L}*|büyük\p{L}*|üzer\p{L}*|alt\p{L}*|üst\p{L}*)(?!\p{L})|${SAYI_SOZ}\s*yaş\p{L}*`, 'u');
const KISIT_KILO = /(?<![\d.,])\d+(?:[.,]\d+)?\s*kg\s*['’]?\s*\p{L}{0,5}\s+(?:daha\s+)?(?:ağir|hafif|fazla|az|büyük|küçük|kadar|üzer\p{L}*|üst\p{L}*|alt\p{L}*)(?!\p{L})/u;
// Rumen gelişimine bağlı buzağı kısıtı ("Rumen faaliyeti başlamış", "Ruminasyona başlamamış").
const KISIT_RUMEN = /(?<!\p{L})(?:rumen|ruminasyon)\p{L}*/u;
const KISIT_BUZAGI = /buza[ğg]i\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:kullanil|uygulan)(?:ma(?:z|mali\p{L}*|yiniz)|amaz)/u;
const YALNIZ = /(?<!\p{L})(?:yalniz|sadece)\p{L}*/u;
const YALNIZ_BUZAGI = /(?<!\p{L})(?:yalniz|sadece)\p{L}*\s+(?:\p{L}+\s+){0,2}?buza[ğg]i/u;
const HAYVAN_SOZU = /(?<!\p{L})(?:hayvan|si[ğg]ir|inek|düve|tosun|boğa|buza[ğg]i|dana)/u;
// Olumsuz kullanım biçimi (kullanılmaz / kullanılmamalı / uygulanmamalı / kullanmayınız …).
const KISIT_OLUMSUZ = /kullanilma(?:z|mali)|uygulanma(?:z|mali)|kullanmayiniz|uygulamayiniz|önerilmez|tavsiye\s+edilmez|endike\s+değil|verilmeme/u;
// Büyük harfli başlık öneki: "ÇEVRE SAĞLIĞI AÇISINDAN; 80 kg’dan …" → başlık atılır.
const BASLIK_ONEKI = /^[\p{Lu}\s,'’()-]{4,}[;:]\s+(?=\S)/u;

/**
 * Kısıt parçası yeterli mi: "-" / ";" ile bitmiyor, tümü büyük harfli başlık değil, ≥ 5 sözcük ya da noktayla biten tam
 * cümle ("Ürün buzağılarda kullanılmamalıdır." 4 sözcük ama tam cümledir).
 */
function tamCumleMi(parca) {
  if (/[-;–]\s*$/u.test(parca)) return false;
  if ((parca.match(/[\p{L}\d]+/gu) ?? []).length < 5 && !/[.!]$/u.test(parca)) return false;
  return /\p{Ll}/u.test(parca);
}

/**
 * Sığıra ait yaş / kilo kısıtı cümleleri: { tur, metin } (metin aynen; yalnız büyük harfli başlık öneki atılır).
 * tur: 'kosullu' — olumsuz ve koşullu (yaş, kilo, rumen gelişimi: "80 kg’dan daha ağır buzağılarda kullanılmaz",
 * "Rumen faaliyeti başlamış buzağılarda kullanılmamalıdır", "bir haftadan küçük hayvanlarda kullanmayınız");
 * 'olumsuz' — koşulsuz yasak ("Ürün buzağılarda kullanılmamalıdır"); 'yas' — yaş kapsamı / yalnız buzağı bildirimi
 * ("6 aylık ve daha büyük sığırlarda kullanılır", "sadece buzağılarda … uygundur").
 * kip 'doz' (4.9) ve 'kullanim' (4.2): yalnız olumsuz ya da "yalnız/sadece" ifadeli cümle; 'diger' (4.1 / 4.3): yaş/kilo
 * niteleyicisi de yeter. Yer sınırı ve ml miktarı içeren cümle (doz bölme) ve parça cümle kısıt değildir.
 */
function kisitCumleleri(liste, kip) {
  const sonuc = [];
  for (const c of liste) {
    if (!c.sigirIcin) continue;
    const kisim = sigirKismi(c);
    // madde imli liste ("- E. coli … tedavisi, - 2 yaşın altındaki sığırlarda …") tek cümleye birleşmiş olabilir: maddeler ayrı
    const sinirlar = [0, ...[...kisim.matchAll(/(?<=\s)[-•]\s*(?=\p{L})/gu)].map((m) => m.index)];
    sinirlar.forEach((bas, i) => {
      let parca = c.metin.slice(bas, sinirlar[i + 1] ?? c.metin.length).replace(/^[-•]\s*/u, '').trim();
      parca = parca.replace(BASLIK_ONEKI, '');
      const k = kat(kisim.slice(bas, sinirlar[i + 1] ?? kisim.length));
      if (!parca || !tamCumleMi(parca) || YER_IPUCU.test(k) || SERBEST_ML.test(k)) return;
      const olumsuz = KISIT_OLUMSUZ.test(k);
      const yalniz = YALNIZ.test(k);
      if (kip !== 'diger' && !olumsuz && !yalniz) return;
      // yaş / kilo niteleyicisi bir hayvana bağlı olmalı ("8 haftanın üzerindeki ergin ve genç [Fasciola]" değil)
      const nitelik = [KISIT_YAS, KISIT_KILO].map((re) => k.match(re)).find((m) => m
        && HAYVAN_SOZU.test(k.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)));
      const rumen = KISIT_RUMEN.test(k) && /buza[ğg]i/u.test(k);
      let tur = null;
      if (olumsuz && (nitelik || rumen)) tur = 'kosullu';
      else if (olumsuz && KISIT_BUZAGI.test(k)) tur = 'olumsuz';
      else if (!olumsuz && (nitelik || YALNIZ_BUZAGI.test(k))) tur = 'yas';
      if (tur) sonuc.push({ tur, metin: parca });
    });
  }
  return sonuc;
}

// Kiloya bağlı olmayan doz ifadesi (kat() metninde): hayvan / baş / meme lobu / çeyrek başına, tüp, enjektör, şırınga.
const SABIT = /hayvan\s+başina|baş\s+başina|inek\s+başina|\/\s*(?:hayvan|sigir|inek|baş)(?!\p{L})|(?<!\p{L})(?:lob\p{L}*|çeyre[ğk]\p{L}*|meme\s+başi)(?!\p{L})|(?<!\p{L})tüp\p{L}*|enjektör\p{L}*|şiringa\p{L}*/u;
const KG_SOZU = /(?<!\p{L})kg(?!\p{L})/u;

const bosluk = (s) => s.replace(/\d/g, '#').replace(/ml/gi, '##'); // eşleşmeyi rakamsız, "ml"siz yer tutucuyla örter

/**
 * KÜB 4.9 metninden sığır ml/kg oranı.
 * @param {string|null} doz  KÜB 4.9 metni (veri/kub.json `doz`)
 * @param {{ tablo?: boolean, eskiBicim?: boolean, ozelOnlem?: string|null, hedefTur?: string|null,
 *   kisitMetinleri?: (string|null)[], kullanimAlani?: string|null }} [secenek]  ozelOnlem: KÜB 4.5 (yer sınırı da buradan
 *   okunur); hedefTur: KÜB 4.1 (yalnız buzağıysa kapsam buzagi); kisitMetinleri: KÜB 4.1 / 4.3 (yaş/kilo kısıtı
 *   cümleleri); kullanimAlani: KÜB 4.2 (yalnız olumsuz ya da "yalnız/sadece" ifadeli cümleler). Bu metinler sonuca
 *   yazılmaz; yalnız sonuçlar.
 * @returns {{ mlPerKg: number|null, ifade: string|null, cumle: string|null, kaynak: 'ml_kg'|null,
 *   kapsam: 'sigir'|'buzagi'|null, guven: 'yuksek'|'dusuk', yerBasinaMaxMl: number|null, yerBasinaYol: 'IM'|'SC'|null,
 *   kisitlar: { tur: 'olumsuz'|'yas'|'kosullu', metin: string }[], sabitDoz: boolean }}
 */
export function dozOrani(doz, {
  tablo = false, eskiBicim = false, ozelOnlem = null, hedefTur = null, kisitMetinleri = [], kullanimAlani = null,
} = {}) {
  const liste = cumleler(doz);
  const { yerBasinaMaxMl, yerBasinaYol } = yerBasinaMax(liste, cumleler(ozelOnlem));
  const kisitlar = [
    ...kisitMetinleri.flatMap((m) => kisitCumleleri(cumleler(m), 'diger')),
    ...kisitCumleleri(cumleler(kullanimAlani), 'kullanim'), ...kisitCumleleri(liste, 'doz'),
  ].filter((x, i, d) => d.findIndex((y) => y.metin === x.metin) === i);
  // Sabit doz: sığır kısmında "hayvan başına / meme lobuna / tüp …" var ve sığıra uygulanabilir hiçbir cümlede (örtülmemiş
  // hâliyle: "sığırlarda deri altı ve koyunlarda kas içi … 1 ml/50 kg" ortak dozu) kilo geçmiyor.
  const sigirCumleleri = liste.filter((c) => c.sigirIcin);
  const sabitDoz = sigirCumleleri.some((c) => SABIT.test(kat(sigirKismi(c)))) && !sigirCumleleri.some((c) => KG_SOZU.test(kat(c.metin)));
  const dusuk = {
    mlPerKg: null, ifade: null, cumle: null, kaynak: null, kapsam: null, guven: 'dusuk', yerBasinaMaxMl, yerBasinaYol, kisitlar, sabitDoz,
  };
  if (!liste.length || tablo || eskiBicim || TABLO_SOZU.test(doz)) return dusuk;

  const oranlar = []; // { deger, secilebilir (oran kaynağı olabilir), ters, ifade, cumle, kapsam }
  const tersKaynaklar = []; // { satirNo, kg, satirSatiri (eşleşme satırın neredeyse tamamı) } — kilo tablosu denetimi
  const mgOranli = new Set();
  const mgDiger = new Set();
  for (const c of liste) {
    if (!c.sigirIcin) continue;
    if (OPERATIF.test(kat(c.metin))) continue; // ameliyat öncesi doz: tedavi oranı değil
    const metin = sigirKismi(c); // karışık türlü cümlede başka türün yan cümlesi örtülü
    let ortulu = metin;
    let oranli = false;
    const ortak = { cumle: c.metin, kapsam: c.kapsam, eriskin: c.eriskin };
    for (const m of metin.matchAll(ORAN)) {
      const g = m.groups;
      if (!urunSozu(g.ad) || YEM.test(metin.slice(m.index + m[0].length))) continue;
      if (g.x2 !== undefined || g.y2 !== undefined) return dusuk; // aralık
      const y = g.y === undefined ? 1 : sayi(g.y);
      if (!(y > 0) || !(sayi(g.x) > 0)) return dusuk;
      const ifade = c.metin.slice(m.index, m.index + m[0].length).trim();
      oranlar.push({ deger: sayi(g.x) / y, secilebilir: true, ters: false, ifade, ...ortak });
      ortulu = ortulu.slice(0, m.index) + bosluk(m[0]) + ortulu.slice(m.index + m[0].length);
      oranli = true;
    }
    if (ML_ARALIK.test(ortulu)) return dusuk; // "1-2 ml" (hayvan başı ya da başka yazımla aralık)
    if (BOLUNMUS_DOZ.test(metin)) return dusuk;
    const yerCumlesi = YER_IPUCU.test(metin);
    if (!yerCumlesi) {
      const tersler = [];
      let sinirMetni = ortulu;
      for (const m of ortulu.matchAll(TERS)) {
        if (m[3] !== undefined) return dusuk; // "100 kg için 2,5-5 ml"
        if (KG_ARALIK_ONCESI.test(metin.slice(0, m.index))) return dusuk; // "100-200 kg canlı ağırlığa 10 ml"
        const kg = sayi(m[1]);
        if (!(kg > 0) || !(sayi(m[2]) > 0)) continue;
        const kaynak = TERS_KAYNAK.test(m[0]);
        if (kaynak) {
          tersKaynaklar.push({ satirNo: c.satirNo, kg, satirSatiri: m[0].length >= 0.7 * c.satirUzunlugu });
        }
        const her = kaynak ? c.metin.slice(0, m.index).match(/(?<!\p{L})her\s+$/iu) : null;
        const bas = m.index - (her ? her[0].length : 0);
        tersler.push({ deger: sayi(m[2]) / kg, kaynak, ifade: kaynak ? c.metin.slice(bas, m.index + m[0].length) : null });
        if (kaynak) sinirMetni = sinirMetni.slice(0, m.index) + bosluk(m[0]) + sinirMetni.slice(m.index + m[0].length);
      }
      // üst sınır / kilo sınıfı / hayvan başı miktar + ayrıca ml → oran tek başına geçerli değil
      if (SINIR.test(sinirMetni) && SERBEST_ML.test(sinirMetni)) return dusuk;
      // kilo bandı listesi ("35 kg < buzağı ≤ 45 kg : … 8 ml", "45-60 kg: 12 ml") → bant dozu, oran tek başına değil
      if (KILO_BANDI.test(sinirMetni) && SERBEST_ML.test(sinirMetni)) return dusuk;
      for (const t of tersler) {
        oranlar.push({ deger: t.deger, secilebilir: t.kaynak, ters: true, ifade: t.ifade, ...ortak });
        if (t.kaynak) oranli = true;
      }
    }
    for (const m of metin.matchAll(MG_KG)) {
      const anahtar = `${sayi(m[1])}${m[2] ? `-${sayi(m[2])}` : ''} ${m[3].toLocaleLowerCase('tr')}`;
      (oranli ? mgOranli : mgDiger).add(anahtar);
    }
  }

  const ileri = oranlar.filter((o) => o.secilebilir);
  if (!ileri.length) return dusuk;
  if (ileri.some((o) => o.eriskin)) return dusuk; // yalnız erişkin hayvanın oranı
  // Kilo tablosu: aynı satırda farklı kilolu iki ters oran, ya da ardışık iki satırın her biri yalnız bir kilo satırı.
  for (const a of tersKaynaklar) {
    for (const b of tersKaynaklar) {
      if (a.kg === b.kg) continue;
      if (a.satirNo === b.satirNo || (a.satirSatiri && b.satirSatiri && b.satirNo === a.satirNo + 1)) return dusuk;
    }
  }
  const tekil = oranlar.filter((o, i) => oranlar.findIndex((x) => ayniDeger(x.deger, o.deger)) === i);
  if (tekil.length !== 1) return dusuk;
  // Endikasyona göre değişen doz: oranlı cümlelerde olmayan bir mg/kg dozu başka sığır cümlesinde geçiyorsa
  // (oranlı cümlede mg/kg yoksa: başka cümlelerde birden çok farklı mg/kg dozu).
  if (mgOranli.size ? [...mgDiger].some((a) => !mgOranli.has(a)) : mgDiger.size > 1) return dusuk;

  // Kapsam yalnız oranı veren (kaynak) eşleşmelerden: buzağı oranı çelişki denetimindeki sığır örneğiyle genişlemez.
  // 4.1 hedef türü yalnız buzağıysa (erişkin sığır yok) kapsam buzagi.
  const kapsam = ileri.some((o) => o.kapsam === 'sigir') && hedefKapsami(hedefTur) !== 'buzagi' ? 'sigir' : 'buzagi';
  // ileri yazım ("1 ml/10 kg") öncelikli; yoksa ters yazım ("her 10 kg için 1 ml")
  const secilen = ileri.find((o) => o.kapsam === kapsam && !o.ters) ?? ileri.find((o) => o.kapsam === kapsam) ?? ileri.find((o) => !o.ters) ?? ileri[0];
  return {
    mlPerKg: secilen.deger, ifade: secilen.ifade, cumle: secilen.cumle, kaynak: 'ml_kg', kapsam, guven: 'yuksek',
    yerBasinaMaxMl, yerBasinaYol, kisitlar, sabitDoz: false,
  };
}

// --- Uygulama yolu kodları ---

/** Kod sırası (yolKodlari bu sırayla döner). */
export const YOL_KODLARI = ['IM', 'IV', 'SC', 'ORAL', 'IMM', 'IU', 'TOPIKAL'];

// kat() ile küçültülmüş metinde (ı → i): "deri altı" → "deri alti", "IV" → "iv".
const YOL_KALIPLARI = {
  IM: /kas[\s-]*içi|adale[\s-]*içi|intram[uü]sk[uü]ler|(?<![\p{L}.])i\.\s?m(?:\.|(?!\p{L}))|(?<![\p{L}.])im(?![\p{L}.])/u,
  IV: /damar[\s-]*içi|ven[\s-]*içi|intraven[öo]z|intravenous|(?<![\p{L}.])i\.\s?v(?:\.|(?!\p{L}))|(?<![\p{L}.])iv(?![\p{L}.])/u,
  SC: /deri[\s-]*alti|(?<!\p{L})der\s+alti(?!\p{L})|subk[uü]tan|sübk[uü]tan|(?<![\p{L}.])s\.\s?c(?:\.|(?!\p{L}))|(?<![\p{L}.])sc(?![\p{L}.])/u,
  ORAL: /(?<!\p{L})ağiz(?!\s+ve\s+tirnak)|(?<!\p{L})oral(?!\s+rehidrasyon)|içme\s+su|süt\s+ikame|(?<!\p{L})sonda(?:\s+ile|yla|si|\s+yolu)|mide\s+sonda|(?<!\p{L})rumen/u,
  IMM: /meme[\s-]*içi|intramam+er|meme\s+kanal|meme\s+lob|meme\s*başi\s+kanal/u,
  IU: /uterus[\s-]*içi|intra[\s-]?uterin|rahim[\s-]*içi/u,
  TOPIKAL: /dökme|dökerek|dökül|pour[\s-]?on|sprey|(?<!\p{L})banyo|püskürt|deri\s+üzer|deri\s+yüzey|(?<!\p{L})lokal|topikal/u,
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

// Farmasötik şekil (KÜB bölüm 3) ağızdan verilen biçimse: "Oral Süspansiyon", "Oral çözelti", "İçme suyuna katılacak toz".
const ORAL_SEKIL = /(?<!\p{L})oral(?!\p{L})|ağizdan|içme\s+su/u;

/**
 * KÜB 4.9'dan SIĞIRA ait uygulama yolları: sığır dışı türün cümlesi (tür taşıma kuralıyla) ve karışık türlü cümlede
 * başka türün yan cümlesi ("…, köpek ve kedilerde deri altı …") sayılmaz; olumsuz yan cümledeki yol ("Deri altı
 * uygulanmaz") ve "Ameliyattan önce" doz cümlesinin yolu (oranda da sayılmaz) düşer. Karışık türlü cümlenin sığır
 * kısmında yol yoksa cümlenin yolu ortaktır; sığır cümlelerinde hiç yol yoksa tür belirtmeyen genel cümleler (bağlamı
 * tür başlığından gelmeyen) okunur. 4.9'da sığır için yol yoksa ve farmasötik şekil (bölüm 3) ağızdan verilen biçimse ['ORAL'].
 * @param {string|null} doz  KÜB 4.9 metni
 * @param {{ sekil?: string|null }} [secenek]  sekil: KÜB bölüm 3 farmasötik şekil metni
 * @returns {string[]}
 */
export function sigirYollari(doz, { sekil = null } = {}) {
  // ameliyat öncesi doz cümlesinin yolu tedavi yolu değil (oranda da sayılmaz)
  const liste = cumleler(doz).filter((c) => !OPERATIF.test(kat(c.metin)));
  const topla = (metinler) => {
    const kume = new Set();
    for (const m of metinler) {
      for (const yan of kat(m).split(/[,;]/)) {
        if (OLUMSUZ.test(yan)) continue;
        for (const [kod, re] of Object.entries(YOL_KALIPLARI)) if (re.test(yan)) kume.add(kod);
      }
    }
    return kume;
  };
  // Karışık türlü cümlenin sığır kısmında yol yoksa yol ortaktır ("sığırlarda boyun bölgesine, koyunlarda omuzun ön
  // kısmına deri altı yol ile uygulanır").
  let bulunan = topla(liste.filter((c) => c.sigirIcin).map((c) => {
    const kisim = sigirKismi(c);
    return kisim !== c.metin && !topla([kisim]).size ? c.metin : kisim;
  }));
  // Sığır cümlelerinde hiç yol yoksa tür belirtmeyen genel cümle ("Belirtilen dozların tamamı yavaş damar içi …"):
  // bağlamı doz satırından ("Koyun-Keçi … 10-15 ml") gelen; tür başlığı ("At", "Köpek ve kedilerde") altındaki değil.
  if (!bulunan.size) bulunan = topla(liste.filter((c) => !c.sigirIcin && c.tur === null && !c.baglamBaslik).map((c) => c.metin));
  if (!bulunan.size && typeof sekil === 'string' && ORAL_SEKIL.test(kat(sekil))) bulunan.add('ORAL');
  return YOL_KODLARI.filter((k) => bulunan.has(k));
}
