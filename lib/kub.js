// KÜB (Kısa Ürün Bilgisi) metninden 4.9 doz ve 4.11 arınma bölümlerini ayırır, 4.11'den sığır arınma sürelerini okur.
// Saf işlevler; girdi `pdftotext -simple -enc UTF-8` (ya da Poppler'da düz `pdftotext`) çıktısıdır.
//
// Metin kelimesi kelimesine korunur: yalnız satır sonu birleştirme ve fazla boşluk temizliği yapılır.
// Arınma okuma TUTUCUDUR (yanlış sayı gıda güvenliği riskidir): tür ya da yol ayrımı belirsizse, beklenmedik bir sayı,
// aralık, kuru dönem / doğum kuralı ya da sağmal hayvanda "tavsiye edilmez" uyarısı varsa guven 'dusuk' döner ve
// ekran sayıyı göstermez.
//
// Ayrıca: belge gerçekten bu ürünün KÜB'ü mü (bölüm 1 ad, bölüm 2 bileşim), 4.1 hedef türde sığır var mı, numarasız
// eski prospektüs biçiminde doz / arınma bölümleri.

// --- Satır hazırlama ---

const SAYFA_ALTLIGI = /^\s*sayfa\s*\d+\s*(\/|of)\s*\d+\s*$/i;

/**
 * Metni satırlara böler; sayfa sonu (\f) işaretini kaldırır. gurultu: atılacak satırların indeksleri (Sayfa N / M).
 * @param {string} metin
 * @returns {{ satirlar: string[], gurultu: Set<number> }}
 */
export function satirlariHazirla(metin) {
  const satirlar = String(metin ?? '').replace(/\f/g, '').split(/\r?\n/);
  const gurultu = new Set();
  satirlar.forEach((s, i) => { if (SAYFA_ALTLIGI.test(s)) gurultu.add(i); });
  return { satirlar, gurultu };
}

// --- Bölüm ayırma ---

const BASLIK_49 = /^\s*4\.9(?!\d)/;
const BASLIK_411 = /^\s*4\.11(?!\d)/;
const BASLIK_47 = /^\s*4\s*\.\s*7(?!\d)/;
const BASLIK_41 = /^\s*4\s*\.\s*1(?![\d.]*\d)/; // 4.1 (4.10–4.13 ve 4.1.x değil)
// 5. bölüm: "5. FARMAKOLOJİK…", "5 . FARMAKOLOJİK", "5.FARMAKOLOJİK", "5.1Farmakodinamik" ya da numarasız büyük harfli başlık.
const BOLUM_5 = String.raw`5\s*\.\s*\d|5\s*\.?\s*FARMAKOLOJ`;
const BOLUM_5_NUMARASIZ = /^\s*FARMAKOLOJİK\s+ÖZELLİK/;
const sonDeseni = (dortlu) => {
  const numarali = new RegExp(String.raw`^\s*(${dortlu}|${BOLUM_5})`, 'i');
  return { test: (s) => numarali.test(s) || BOLUM_5_NUMARASIZ.test(s) };
};
const SON_49 = sonDeseni(String.raw`4\.1\d(?!\d)`);
const SON_411 = sonDeseni(String.raw`4\.1[2-9](?!\d)`);
const SON_47 = sonDeseni(String.raw`4\s*\.\s*(?:[89]|1\d)(?!\d)`);
const SON_41 = sonDeseni(String.raw`4\s*\.\s*[2-9](?!\d)`);
const baslikMi = (re) => (s) => re.test(s);

/**
 * KÜB metninden 4.9 (doz) ve 4.11 (arınma) bölümlerini ayırır; başlık satırları hariç.
 * Başlık ya da bölüm sonu bulunamazsa, ya da bölüm boşsa o alan null.
 * @param {string} metin
 * @returns {{ doz: string|null, arinma: string|null }}
 */
export function bolumAyir(metin) {
  const { satirlar, gurultu } = satirlariHazirla(metin);
  const i49 = satirlar.findIndex(baslikMi(BASLIK_49));
  const i411 = satirlar.findIndex((s, i) => i > i49 && baslikMi(BASLIK_411)(s));
  return {
    doz: i49 < 0 ? null : bolum(satirlar, gurultu, i49, SON_49),
    arinma: i411 < 0 ? null : bolum(satirlar, gurultu, i411, SON_411),
  };
}

/** KÜB 4.7 (gebelik, laktasyon) metni; yoksa null. */
export function bolum47(metin) {
  const { satirlar, gurultu } = satirlariHazirla(metin);
  const i = satirlar.findIndex(baslikMi(BASLIK_47));
  return i < 0 ? null : bolum(satirlar, gurultu, i, SON_47);
}

// Sığır sayılan hedef tür sözcükleri (kucukHarf ile sadeleşmiş: ı→i, ğ→g …).
const SIGIR_HEDEF = /(?<![a-z])(sigir|inek|buzagi|dana|duve|tosun|boga|buyukbas|ruminant|gevis getiren|tum hayvan)/;

/**
 * KÜB 4.1 (hedef tür) sığırı kapsıyor mu? true / false; 4.1 bulunamazsa null (bilinmiyor).
 * @param {string} metin
 * @returns {boolean|null}
 */
export function sigirHedefMi(metin) {
  const { satirlar } = satirlariHazirla(metin);
  const i = satirlar.findIndex(baslikMi(BASLIK_41));
  if (i < 0) return null;
  let son = satirlar.findIndex((s, j) => j > i && SON_41.test(s));
  if (son < 0 || son - i > 15) son = Math.min(satirlar.length, i + 6);
  return SIGIR_HEDEF.test(kucukHarf(satirlar.slice(i, son).join(' ')));
}

const HARFLER = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };
/** lib/arama.js normalize ile aynı kural (lib/kub.js bağımsız kalsın diye burada da var). */
export function kucukHarf(s) {
  return String(s ?? '').toLocaleLowerCase('tr').replace(/[ışğüöçâîû]/g, (h) => HARFLER[h]).replace(/[^a-z0-9]+/g, ' ').trim();
}

function bolum(satirlar, gurultu, bas, son) {
  const bitis = satirlar.findIndex((s, i) => i > bas && son.test(s));
  if (bitis < 0) return null; // sonu belirsiz bölüm: belgenin geri kalanını almaktansa yok say
  return paragraf(satirlar.slice(bas + 1, bitis).filter((_, j) => !gurultu.has(bas + 1 + j)));
}

// --- Eski prospektüs biçimi (4.9 / 4.11 numarası yok) ---

const ESKI_DOZ = /^\s*(?:kullanı[mş]\s+şekli\s+ve\s+doz\p{L}*|doz\p{L}*\s+ve\s+(?:kullanım|uygulama)\s+(?:şekli|yolu))/u;
const ESKI_ARINMA = /^\s*(?:gıda\p{L}*\s+(?:değeri\s+olan\s+hayvanlarda\s+)?(?:ilaç\s+)?kalıntı\p{L}*\s+(?:hakkında\s+)?uyarı\p{L}*|(?:ilaç\s+)?kalıntı\s+arınma\s+süres\p{L}*|ilacın\s.{0,40}kesimden\s+önce\p{L}*)/u;
const ESKI_SATIR_SINIRI = 80;

/** Eski biçim başlığı: satır başında, aralıksız, (":" öncesi) yalnız büyük harf; en az 8 harf. */
function buyukBaslikMi(s) {
  if (/^\s{3,}/.test(s) || /\S {3,}\S/.test(s.trim())) return false;
  const bas = s.trim().split(':')[0];
  const harf = bas.replace(/[^\p{L}]/gu, '');
  return harf.length >= 8 && /^[\p{Lu}\s,./()'’-]+$/u.test(bas);
}

/**
 * Eski prospektüs biçimi: "KULLANIM ŞEKLİ VE DOZU" ve "GIDA DEĞERİ OLAN HAYVANLARDA KALINTI UYARILARI" /
 * "İlaç kalıntı arınma süresi" başlıklı bölümler (ilk geçtiği yer; prospektüs etiket kopyalarıyla tekrar eder).
 * Bölüm, sonraki büyük harfli başlıkta biter; ESKI_SATIR_SINIRI satırda bitmezse null.
 * @param {string} metin
 * @returns {{ doz: string|null, arinma: string|null }}
 */
export function eskiBicimAyir(metin) {
  const { satirlar, gurultu } = satirlariHazirla(metin);
  const kucuk = satirlar.map((s) => s.toLocaleLowerCase('tr'));
  const bul = (re) => kucuk.findIndex((s, i) => re.test(s) && kucuk[i].length === satirlar[i].length);
  const ayir = (bas, re, digerRe) => {
    if (bas < 0) return null;
    const m = kucuk[bas].match(re);
    const ek = kucuk[bas].slice(m[0].length).match(/^\s*(?:\([^)]*\))?\s*:?\s*/);
    const ilk = satirlar[bas].slice(m[0].length + ek[0].length).trim();
    let bitis = -1;
    for (let i = bas + 1; i < Math.min(satirlar.length, bas + ESKI_SATIR_SINIRI); i += 1) {
      // aynı bölümün alt başlığı ("GIDA DEĞERİ … UYARILARI" altında "İlaç kalıntı arınma süresi:") bölümü bitirmez
      if ((buyukBaslikMi(satirlar[i]) && !re.test(kucuk[i])) || digerRe.test(kucuk[i])) { bitis = i; break; }
    }
    if (bitis < 0) return null;
    const govde = satirlar.slice(bas + 1, bitis).filter((_, j) => !gurultu.has(bas + 1 + j));
    if (ilk) govde.unshift(ilk);
    return paragraf(govde);
  };
  return { doz: ayir(bul(ESKI_DOZ), ESKI_DOZ, ESKI_ARINMA), arinma: ayir(bul(ESKI_ARINMA), ESKI_ARINMA, ESKI_DOZ) };
}

// --- Belge kimliği: bu ürünün KÜB'ü mü? ---

// Küçük harfli (tr) satırlarda: "1. VETERİNER TIBBİ ÜRÜNÜN İSMİ" ("1. Veteriner Tıbbi Ürün adı, gücü…"),
// "2. KALİTATİF (KALİTETİF) VE KANTİTATİF BİLEŞİM" ("2. Veteriner Tıbbi Ürün Kalitatif…"), "3. FARMASÖTİK ŞEKİL".
const BOLUM_1 = /^\s*1\s*\.?\s*veteriner\s+tıbb[iı]\s+ürün/u;
const BOLUM_2 = /^\s*2\s*\.?\s*(?:veteriner\s+tıbb[iı]\s+ürün\p{L}*\s+)?kalit/u;
const BOLUM_3 = /^\s*3\s*\.?\s*farmas/u;
const BOLUM_4 = /^\s*4\s*\.?\s*(?:klinik|1(?![\d.]*\d))/u;
const PROSPEKTUS = /prospekt[üu]s|kullanma\s+talimatı/u;
const KUB_ISARETI = /ürün\s+özellikleri\s+özeti|kısa\s+ürün\s+bilgisi/u;

/**
 * Belgenin türü ve kimlik bölgeleri.
 * tur: 'bos' (okunur metin yok), 'kub', 'prospektus', 'diger' (KÜB ya da prospektüs değil: ör. stabilite raporu).
 * ad: ürün adı satırları (KÜB bölüm 1 ya da prospektüsün ilk satırları); bilesim: bileşim bölgesi (KÜB bölüm 2).
 * @param {string} metin
 * @returns {{ tur: 'bos'|'kub'|'prospektus'|'diger', ad: string|null, bilesim: string|null }}
 */
export function belgeBilgisi(metin) {
  const { satirlar } = satirlariHazirla(metin);
  const kucuk = satirlar.map((s) => s.toLocaleLowerCase('tr'));
  const harf = kucuk.join(' ').replace(/[^\p{L}]/gu, '').length;
  if (harf < 300) return { tur: 'bos', ad: null, bilesim: null };
  const bul = (re, bas = 0) => kucuk.findIndex((s, i) => i >= bas && re.test(s));
  const i1 = bul(BOLUM_1);
  const i2 = bul(BOLUM_2, Math.max(i1, 0));
  const bas = kucuk.slice(0, 15).join(' ');
  const kub = i1 >= 0 || i2 >= 0 || KUB_ISARETI.test(bas)
    || kucuk.some((s, i) => baslikMi(BASLIK_49)(satirlar[i]) || baslikMi(BASLIK_411)(satirlar[i]));
  const prospektus = !kub && (PROSPEKTUS.test(bas) || kucuk.some((s) => ESKI_DOZ.test(s)));
  if (!kub && !prospektus) return { tur: 'diger', ad: satirlar.find((s) => s.trim())?.trim() ?? null, bilesim: null };
  const dilim = (a, b) => satirlar.slice(a, b).map((s) => s.trim()).filter(Boolean).join('\n') || null;
  if (kub) {
    let ad = null;
    if (i1 >= 0) {
      const son = i2 > i1 ? Math.min(i2, i1 + 5) : i1 + 3;
      const isim = kucuk[i1].match(/^.*?(?:ismi|adı)\s*:?/u);
      const kalan = isim && kucuk[i1].length === satirlar[i1].length ? satirlar[i1].slice(isim[0].length).trim() : '';
      const baslikSonu = /^[\p{L}\d]/u.test(kalan) ? kalan : ''; // ", gücü ve farmasötik şekli" başlığın devamıdır
      ad = [baslikSonu, dilim(i1 + 1, son)].filter(Boolean).join('\n') || null;
    }
    let bilesim;
    if (i2 >= 0) {
      const i3 = bul(BOLUM_3, i2 + 1);
      bilesim = dilim(i2, i3 > i2 && i3 - i2 < 60 ? i3 : i2 + 40);
    } else {
      const i4 = bul(BOLUM_4, Math.max(i1, 0) + 1);
      bilesim = dilim(Math.max(i1, 0), i4 > 0 && i4 - Math.max(i1, 0) < 80 ? i4 : Math.max(i1, 0) + 60);
    }
    return { tur: 'kub', ad, bilesim };
  }
  const iDoz = bul(ESKI_DOZ);
  const ip = bul(PROSPEKTUS);
  const adSatirlari = satirlar.slice(ip >= 0 ? ip + 1 : 0).map((s) => s.trim())
    .filter((s) => s && !/sagligi?nda kullanilir|^zehirli/.test(kucukHarf(s))).slice(0, 2);
  return { tur: 'prospektus', ad: adSatirlari.join('\n') || null, bilesim: dilim(0, iDoz > 0 ? iDoz : 60) };
}

/**
 * Yazım farkını eşitleyen kaba ses anahtarı: Türkçe sadeleştirme (kucukHarf) + Latin/İngilizce yazımlar
 * (ph→f, th→t, qu→k, x→ks, c→s/k, y→i, z→s, w→v), boşluksuz, çift harf teke.
 * "Tylosin" ~ "tilozin", "Cefquinome" ~ "sefkinom", "Dexamethasone" ~ "deksametazon", "Oxytetracycline" ~ "oksitetrasiklin".
 */
export function sesAnahtari(s) {
  return kucukHarf(s).replace(/ /g, '')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/qu/g, 'k').replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/y/g, 'i').replace(/z/g, 's').replace(/w/g, 'v')
    .replace(/(.)\1+/g, '$1');
}

// Etken eşleşmesinde tek başına ayırt edici olmayan sözcükler (tuz, form, genel ad).
const GENEL_SOZ = new Set(['sodyum', 'potasyum', 'kalsiyum', 'magnezyum', 'vitamin', 'vitamini', 'asit', 'asidi', 'tuzlari', 'tuzu',
  'sulfat', 'klorur', 'fosfat', 'asetat', 'laktat', 'glukonat', 'oksit', 'hidroksit', 'agizdan', 'cozelti', 'cozeltileri',
  'damar', 'ici', 'jel', 'bolus', 'oral', 'sivi', 'sivilar', 'tuzlu', 'su', 'cogunlukla', 'ile', 'ayak', 'banyosu', 'olarak',
  'kristalize', 'prokain', 'benzatin', 'potansiyelize', 'propiyonat', 'formiat', 'hidroiyodur', 'dipropiyonat', 'aseturat',
  'meglumin', 'trometamin', 'kombinasyon', 'oksim', 'edetat', 'disodyum', 'yag', 'yagi', 'baz', 'hidroklorur', 'trihidrat']);

/**
 * Etkenin bileşimde aranacak ses anahtarları (adlar: etken adı, kimliği, takma adları). Ayırt edici sözcükler (≥ 5 harf,
 * GENEL_SOZ dışı) tek tek; çok sözcüklü takma adlar bütün olarak da.
 */
export function etkenAnahtarlari(adlar) {
  const anahtarlar = new Set();
  for (const ad of adlar) {
    const sade = kucukHarf(String(ad).replace(/_/g, ' '));
    if (!sade) continue;
    const sozler = sade.split(' ');
    for (const s of sozler) if (s.length >= 5 && !GENEL_SOZ.has(s) && !/^\d/.test(s)) anahtarlar.add(sesAnahtari(s));
    if (sozler.length > 1 && sade.length >= 6) anahtarlar.add(sesAnahtari(sade));
  }
  return [...anahtarlar].filter((a) => a.length >= 5);
}

/**
 * KÜB bu ürüne mi ait? Bileşimde ürünün her etkeni (ses anahtarlarından biri) geçmeli; geçmeyen varsa uyumsuz.
 * Ad: ürün adının ilk ayırt edici sözcüğü KÜB adında (ya da tersi) geçmiyorsa kubAdi döner (ad farkı; etken uyuyorsa
 * belge kalır, ekranda not).
 * @param {string} metin  KÜB / prospektüs metni
 * @param {{ ad: string, etkenler: { id: string, adlar: string[] }[] }} urun
 * @returns {{ uyumlu: boolean, kubAdi: string|null, eksik: string[], neden: string|null }}
 */
export function kubUrunleUyumlu(metin, urun) {
  const b = belgeBilgisi(metin);
  if (b.tur === 'bos') return { uyumlu: true, kubAdi: null, eksik: [], neden: null };
  if (b.tur === 'diger') return { uyumlu: false, kubAdi: null, eksik: [], neden: `Belge KÜB ya da prospektüs değil ("${(b.ad ?? '').slice(0, 60)}")` };
  const bilesim = sesAnahtari(b.bilesim ?? '');
  const etkenVar = (metinAnahtari) => (e) => etkenAnahtarlari([e.id, ...e.adlar]).some((a) => yaklasikIcerir(metinAnahtari, a));
  const eksik = (urun.etkenler ?? []).filter((e) => !etkenVar(bilesim)(e)).map((e) => e.id);
  const kubAdi = adFarki(urun.ad, b.ad);
  // Bileşim bölümü etken adını yazmamış olabilir ("Aktif madde: 1200 mg/tablet"): ad tutuyorsa belgenin tamamına bakılır.
  const tumu = eksik.length && !kubAdi ? sesAnahtari(String(metin)) : null;
  const gercekEksik = tumu ? eksik.filter((id) => !etkenVar(tumu)(urun.etkenler.find((e) => e.id === id))) : eksik;
  if (gercekEksik.length) {
    return { uyumlu: false, kubAdi, eksik: gercekEksik, neden: `KÜB bileşiminde ürünün etkeni yok: ${gercekEksik.join(', ')}${kubAdi ? ` (KÜB adı: ${kubAdi})` : ''}` };
  }
  return { uyumlu: true, kubAdi, eksik: [], neden: null };
}

/**
 * Yaklaşık alt dizgi: anahtar metinde geçiyor ya da (≥ 8 harfli anahtarda) en çok 2, (5–7 harfte) 1 harf farkla geçiyor
 * (enCok ile daha da sınırlanır).
 * KÜB yazım hataları: "Oksiklazonid" ~ oksiklozanid, "Tilmiskosin" ~ tilmikosin, "Butofosfan" ~ butafosfan.
 */
export function yaklasikIcerir(metin, anahtar, enCok = Infinity) {
  if (metin.includes(anahtar)) return true;
  const n = anahtar.length;
  const hata = Math.min(enCok, n >= 8 ? 2 : n >= 5 ? 1 : 0);
  if (!hata) return false;
  for (let i = 0; i + n - hata <= metin.length; i += 1) {
    for (let boy = n - hata; boy <= n + hata; boy += 1) {
      if (i + boy <= metin.length && uzaklik(metin.slice(i, i + boy), anahtar, hata) <= hata) return true;
    }
  }
  return false;
}

/** Levenshtein uzaklığı; sinir aşılınca erken döner. */
function uzaklik(a, b, sinir) {
  let onceki = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const simdiki = [i];
    let enAz = i;
    for (let j = 1; j <= b.length; j += 1) {
      simdiki[j] = Math.min(onceki[j] + 1, simdiki[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      enAz = Math.min(enAz, simdiki[j]);
    }
    if (enAz > sinir) return sinir + 1;
    onceki = simdiki;
  }
  return onceki[b.length];
}

/** Ürün adı KÜB adıyla uyuşmuyorsa KÜB'deki ad (ilk satır), uyuşuyorsa null. Yazım farkı ("Oksiprimavet" ~ "Oksipirimavet") uyuşur. */
function adFarki(urunAdi, kubAdSatirlari) {
  if (!kubAdSatirlari) return null;
  const kubAd = kubAdSatirlari.split('\n')[0].replace(/\s+/g, ' ').replace(/^ad[ıiI]\s*:\s*/iu, '').trim();
  const kubAnahtar = sesAnahtari(kubAdSatirlari);
  const sozler = kucukHarf(urunAdi).split(' ').filter((s) => /\p{L}/u.test(s) && s.length >= 3);
  if (!sozler.length) return null;
  const urunIlk = sesAnahtari(sozler[0]);
  if (urunIlk.length >= 8 ? yaklasikIcerir(kubAnahtar, urunIlk, 1) : kubAnahtar.includes(urunIlk)) return null;
  // tersi: KÜB adının ilk sözcüğü ürün adında ("VMD Oxterol-LA" ~ "OXTEROL-LA"; tam sözcük: "Neovital" ≠ "NEOVIT")
  const kubIlk = kucukHarf(kubAd).split(' ').find((s) => /\p{L}/u.test(s) && s.length >= 3);
  if (kubIlk && kucukHarf(urunAdi).split(' ').some((s) => sesAnahtari(s) === sesAnahtari(kubIlk))) return null;
  return kubAd || null;
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

  // "süt veren ineklerde uygulanması tavsiye edilmez": sayı doğru olsa da çıplak "Süt N gün" etiketi yanıltır.
  let belirsiz = sutTavsiyeEdilmez(arinma);
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

// Sağmal hayvanda kullanımı öğütle kısıtlayan ifade ("tavsiye edilmez", "önerilmez"); "tavsiye edilmediği takdirde" değil.
const TAVSIYE_EDILMEZ = /(?:tavsiye\s+(?:edil|olun)|öneril)(?:mez|memekte\p{L}*|memeli\p{L}*)/u;
const SUT_HAYVANI = /süt|sağmal|sağıl|sağım|laktasyon/u;

/**
 * Metinde sığıra (ya da tür belirtmeden) ait, süt / sağmal / laktasyon geçen bir cümlede "tavsiye edilmez / önerilmez"
 * var mı? 4.11'de ve 4.7'de (laktasyonda kullanım) aranır; varsa arınma etiketi gösterilmez.
 * @param {string|null} metin
 * @returns {boolean}
 */
export function sutTavsiyeEdilmez(metin) {
  if (typeof metin !== 'string') return false;
  const kucuk = normallestir(metin).toLocaleLowerCase('tr').replace(SUT_DISI, ' — ');
  for (const c of kucuk.split(/(?<=[.;])\s+/)) {
    if (!TAVSIYE_EDILMEZ.test(c) || !SUT_HAYVANI.test(c)) continue;
    const t = turlerOf(c);
    if (t.length === 0 || t.some((x) => x.sigir)) return true;
  }
  return false;
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
