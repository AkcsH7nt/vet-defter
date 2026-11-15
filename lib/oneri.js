// Kiloya göre tedavi önerisi (hastalık sayfasının öneri kartı). Saf: tarayıcıda ve Node'da aynı çalışır.
// Protokolün her birinci seçenek etkeni için uygun ruhsatlı sığır ürünlerinden biri seçilir; ürünün KÜB 4.9'undan
// okunmuş tek ve güvenilir ml/kg oranı varsa ml = oran × kilo hesaplanır.
//
// TUTUCU: ekrandaki ml hayvana uygulanacak miktardır, yanlış sayı en kötü sonuçtur. Oran yalnız KÜB'den
// (`kaynak: 'ml_kg'`, `guven: 'yuksek'`), kapsamı hayvana uymuyorsa, kilo yoksa ya da olağan dışıysa sayı yok; satır
// nedenini (`neden`) taşır ve ekran KÜB'e yönlendirir.
import { normalize } from './arama.js';
import { onayliMi } from './onay.js';
import { yolKodlari } from './oran.js';
import { kiloUyarisi } from './hayvan.js';
import { sutTavsiyeEdilmez, sagmaldaKullanilmaz } from './kub.js';

/** Ürün sığır için ruhsatlı mı? Hedef türde "sığır" ya da "buzağı" (büyük-küçük harf ve aksan fark etmez). */
export function sigirMi(urun) {
  return (urun.hedefTurler ?? []).some((t) => normalize(t) === 'sigir' || normalize(t) === 'buzagi');
}

/**
 * Ürün sığır ürün listelerinde (etken, hastalık) gösterilir mi? Bakanlık listesinde sığır / buzağı hedefli ve
 * KÜB 4.1'de hedef tür sığırı kapsıyor (kub.json sigirHedefDegil değil).
 */
export function sigirListesindeMi(urun, veri) {
  return sigirMi(urun) && veri?.kub?.urunler?.[urun.urunId]?.sigirHedefDegil !== true;
}

/** Yalnız buzağı için ruhsatlı (hedef türde sığır yok, buzağı var). */
export function yalnizBuzagiMi(urun) {
  const t = (urun.hedefTurler ?? []).map(normalize);
  return t.includes('buzagi') && !t.includes('sigir');
}

/** Arayüzdeki ikinci savunma hattı: yasak madde ve AMEG A protokolde hiç gösterilmez (dogrula ilk hattır). */
export function gosterilebilirMi(ilac, veri) {
  const yasaklar = veri.yasaklar?.ogeler ?? [];
  const e = veri.etkenler.find((x) => x.id === ilac.etkenId);
  const yasak = yasaklar.some((y) => y.id === ilac.etkenId || (e && normalize(y.ad) === normalize(e.ad)));
  if (yasak || e?.ameg === 'A') {
    console.warn(`Protokol satırı gösterilmedi (${yasak ? 'yasak madde' : 'AMEG A'}): ${ilac.etkenId}`);
    return false;
  }
  return true;
}

/**
 * ml = mlPerKg × kilo. Yuvarlama: ham < 10 ml → en yakın 0,1; ham ≥ 10 → en yakın 0,5. Kayan nokta gürültüsü
 * (1/30 × 450 = 15,000…02) yuvarlamadan önce temizlenir. Hacim yer başına en çok miktarı aşıyorsa yer sayısı.
 * @returns {{ ml: number, ham: number, yerSayisi: number }}
 */
export function mlHesapla(mlPerKg, kilo, yerBasinaMaxMl) {
  const ham = Number((mlPerKg * kilo).toFixed(6));
  const ml = ham < 10 ? Math.round(ham * 10) / 10 : Math.round(ham * 2) / 2;
  const yerSayisi = yerBasinaMaxMl && ham > yerBasinaMaxMl ? Math.ceil(ham / yerBasinaMaxMl) : 1;
  return { ml, ham, yerSayisi };
}

// KÜB doz metni ürünün buzağıda kullanılmayacağını söylüyor ("Ürün buzağılarda kullanılmamalıdır", Seftio-Taç 4.9).
// Türkçe küçük harfe çevrilmiş metne uygulanır ("BUZAĞILARDA KULLANILMAMALIDIR" da eşleşsin).
const BUZAGIDA_KULLANILMAZ = /buzağı(?:lar)?(?:da|a)\s+(?:kullanılma|uygulanma)(?:z|malıdır|mamalıdır|yınız)/u;
const kucuk = (metin) => String(metin ?? '').toLocaleLowerCase('tr');

/**
 * Kuru dönem (kuruya çıkarma) meme içi ürünü mü? Adında ayrı sözcük olarak "DC" ya da "Dry", ya da "kuru" geçiyor
 * (Rilexine DC 375, Syvamast Dry, Masticure Kuru Dönem) veya KÜB doz metni kuru dönemden / kuruya çıkarmadan
 * söz ediyor. Laktasyon ürünü (Combilac 4 LC) değil.
 */
export function kuruDonemUrunuMu(urun, kayit) {
  const ad = kucuk(urun?.ad);
  return /(?<![\p{L}\d])(?:dc|dry)(?![\p{L}\d])/u.test(ad) || /(?<!\p{L})kuru/u.test(ad)
    || /kuru\s+dönem|kuruya\s+çıkar|kurutma/u.test(kucuk(kayit?.doz));
}

const kesisir = (a, b) => !a.length || !b.length || a.some((x) => b.includes(x));

/** Kayıttaki oran bu hayvanda ml hesabına uygun mu? Yalnız KÜB'den ml/kg, yüksek güven, kapsam uyumlu. */
function hesaplanabilirMi(kayit, yas) {
  const o = kayit && !kayit.metinYok && !kayit.belgeUyumsuz ? kayit.oran : null;
  return !!o && o.guven === 'yuksek' && o.kaynak === 'ml_kg'
    && Number.isFinite(o.mlPerKg) && o.mlPerKg > 0
    && (o.kapsam === 'sigir' || (o.kapsam === 'buzagi' && yas === 'buzagi'));
}

/** KÜB metni (4.9 / 4.11) var mı? Kayıt yoksa ya da metinYok ise yok. */
const kubMetniVar = (kayit) => !!kayit && !kayit.metinYok;

/**
 * Sağmal hayvanda kullanılmaz: 4.11'den sut 'kullanilmaz' okundu, 4.11 sığır / türsüz süt cümlesinde "tavsiye
 * edilmez / önerilmez" var ya da 4.11 ürünün süt hayvanında kullanımını yasaklıyor (sagmaldaKullanilmaz). Arınma
 * güveninden bağımsız (güven düşük olsa da).
 */
export function sutteKullanilmazMi(kayit) {
  const arinma = kayit?.arinma ?? null;
  return kayit?.sigir?.sut === 'kullanilmaz' || sutTavsiyeEdilmez(arinma) || sagmaldaKullanilmaz(arinma);
}

const SAGMAL_YAS = new Set(['inek', 'duve']);
const AMEG_AB = new Set(['A', 'B']);
const KEDI_KOPEK = new Set(['kedi', 'kopek']);
const ENJEKSIYON_YER = new Set(['IM', 'SC']);
const BUYUK_HACIM_ML = 20;

// Koşullu KÜB kısıtında kilo sınırı (Türkçe küçük harfe çevrilmiş metin): üst "80 kg’dan daha ağır / fazla / büyük",
// "120 kg'ın üzerinde"; alt "1,25 kg'ın altında", "200 kg'dan az / hafif / düşük / küçük". Kısıt olumsuz olmalı.
const KG = String.raw`(?<![\d.,])(\d+(?:[.,]\d+)?)\s*kg\s*['’]?\s*`;
const KILO_UST = new RegExp(String.raw`${KG}(?:(?:dan|den|tan|ten)\s+(?:daha\s+)?(?:ağır|fazla|büyük)|(?:ın|in|un|ün|ı|i)?\s*üzer)`, 'u');
const KILO_ALT = new RegExp(String.raw`${KG}(?:(?:dan|den|tan|ten)\s+(?:daha\s+)?(?:az|hafif|düşük|küçük)|(?:ın|in|un|ün|ı|i)?\s*alt)`, 'u');
const KISIT_OLUMSUZ = /kullanılma|uygulanma|kullanmayınız|uygulamayınız|verilme/u;
const sayi = (s) => Number(s.replace(',', '.'));

/** Kiloya göre bu hayvanı dışlayan ilk koşullu KÜB kısıtı (yoksa null). Kilo yoksa denetim yok. */
export function kiloKisiti(kisitlar, kilo) {
  if (kilo == null) return null;
  return (kisitlar ?? []).find((k) => {
    if (k?.tur !== 'kosullu') return false;
    const m = kucuk(k.metin);
    if (!KISIT_OLUMSUZ.test(m)) return false;
    const ust = m.match(KILO_UST);
    const alt = m.match(KILO_ALT);
    return (ust && kilo > sayi(ust[1])) || (alt && kilo < sayi(alt[1]));
  }) ?? null;
}

/** Ürünün hedef türlerinde kedi ya da köpek var (küçük hayvan derişimli ürün: ör. %0,5 meloksikam). */
const kediKopekMi = (urun) => (urun.hedefTurler ?? []).some((t) => KEDI_KOPEK.has(normalize(t)));

/** Buzağıda ürünü eleyen KÜB kısıtı: tür 'olumsuz' ve metninde buzağı geçiyor ('kosullu' ve 'yas' elemez). */
const buzagiKisitiVar = (kayit) => (kayit?.oran?.kisitlar ?? [])
  .some((k) => k?.tur === 'olumsuz' && kucuk(k.metin).includes('buzağı'));

/**
 * Protokol satırına uygun ürünler (sıralanmamış). Uygun: etkeni içerir, sığır listesinde, KÜB belgesi ürünle uyumlu,
 * yaş buzağı değilse yalnız-buzağı ürünü değil, buzağıda KÜB "buzağıda kullanılmaz" demiyor (4.9 metni ya da tür
 * 'olumsuz' kısıt), uygulama yolu protokolle kesişiyor (iki taraftan biri bilinmiyorsa elenmez), meme içi satırda
 * kuru dönem / laktasyon ayrımı uyuyor. Her aday seçimde ekranın kullandığı işaretleri taşır.
 * @returns {Aday[]}
 */
export function urunAdaylari(ilac, veri, yas) {
  const protokolYollari = yolKodlari(ilac.yol ?? '');
  const kuruDonemSatiri = /kuru\s+dönem/u.test(kucuk(ilac.yol));
  const kayitOf = (u) => veri.kub?.urunler?.[u.urunId];
  const amegOf = (id) => veri.etkenler?.find((e) => e.id === id)?.ameg ?? null;
  const satirAmegAB = AMEG_AB.has(amegOf(ilac.etkenId));
  return veri.urunler.filter((u) => {
    const kayit = kayitOf(u);
    if (!(u.etkenler ?? []).includes(ilac.etkenId) || !sigirListesindeMi(u, veri) || kayit?.belgeUyumsuz) return false;
    if (yas !== 'buzagi' && yalnizBuzagiMi(u)) return false;
    if (yas === 'buzagi' && (BUZAGIDA_KULLANILMAZ.test(kucuk(kayit?.doz)) || buzagiKisitiVar(kayit))) return false;
    // Meme içi: kuru dönem satırına yalnız kuru dönem ürünü, laktasyon (diğer meme içi) satırına kuru dönem ürünü değil.
    if (kuruDonemSatiri && !kuruDonemUrunuMu(u, kayit)) return false;
    if (!kuruDonemSatiri && protokolYollari.includes('IMM') && kuruDonemUrunuMu(u, kayit)) return false;
    return kesisir(protokolYollari, kayit?.yollar ?? []);
  }).map((urun) => {
    const kayit = kayitOf(urun);
    const urunYollari = kayit?.yollar ?? [];
    const o = kubMetniVar(kayit) ? kayit.oran : null;
    return {
      urun,
      kayit,
      hesaplanabilir: hesaplanabilirMi(kayit, yas),
      yolBilinmiyor: protokolYollari.length > 0 && !urunYollari.length,
      urunYollari,
      yolGenis: protokolYollari.length > 0 && urunYollari.length > 0 && protokolYollari.some((k) => !urunYollari.includes(k)),
      // kuru dönem satırı zaten kuruya çıkarılan inek içindir: "sağmalda kullanılmaz" ürünün doğası, uyarı değil
      sutYasak: SAGMAL_YAS.has(yas) && !kuruDonemSatiri && sutteKullanilmazMi(kayit),
      kediKopek: kediKopekMi(urun),
      dozBuzagiIcin: !!o && o.guven === 'yuksek' && o.kapsam === 'buzagi' && yas !== 'buzagi',
      arinmaOkunamadi: kubMetniVar(kayit) && kayit.sigir?.guven !== 'yuksek',
      kisitlar: o?.kisitlar ?? [],
      // satırın etkeni AMEG A/B değilken üründe AMEG A/B eşlikçi etken (Multibio: ampisilin + kolistin) var
      amegEslik: !satirAmegAB && (urun.etkenler ?? []).some((id) => id !== ilac.etkenId && AMEG_AB.has(amegOf(id))),
    };
  });
}

/**
 * Adaylardan birini seçer (yoksa null). KÜB metni olan ürün varken metinYok / kayıtsız ürün seçilmez; hepsi metinsizse
 * null (ürünü hekim seçer). Satırın etkeni AMEG A/B değilken AMEG A/B eşlikçi etkenli ürün (amegEslik) seçilmez.
 * Protokol dışı etken içeren ürün (protokolEtkenleri dışında etken ya da etken kaydı olmayan digerEtkenler: Vetamplius
 * Mucosol'daki bromheksin, meme içi tüplerdeki kloksasilin, Novacoc'taki metamizol) hiç seçilmez; geriye aday
 * kalmazsa null (hekim seçer). yalnizHesaplanabilir (metabolik satır): yalnız hesaplanabilir ürün; yoksa null.
 * Sıra: yolu KÜB'den bilinen ürün önce → (inek / düve) sağmal hayvanda kullanılmayan ürün sona → hedef türünde kedi /
 * köpek olan ürün sona → hesaplanabilir → arınma güveni yüksek → daha az etken → ad.
 * @param {{ protokolEtkenleri?: Set<string>, yalnizHesaplanabilir?: boolean }} [secenek]
 */
export function adaySec(adaylar, { protokolEtkenleri, yalnizHesaplanabilir = false } = {}) {
  const arinmaDusuk = (a) => (a.kayit?.sigir?.guven === 'yuksek' ? 0 : 1);
  const disEtkenli = (a) => (a.urun.digerEtkenler ?? []).length > 0
    || (!!protokolEtkenleri && !(a.urun.etkenler ?? []).every((id) => protokolEtkenleri.has(id)));
  // KÜB metinsiz, AMEG A/B eşlikçili ya da protokol dışı etkenli ürün önerilmez (hekim seçer).
  let havuz = adaylar.filter((a) => kubMetniVar(a.kayit) && !a.amegEslik && !disEtkenli(a));
  if (yalnizHesaplanabilir) havuz = havuz.filter((a) => a.hesaplanabilir);
  if (!havuz.length) return null;
  const sirali = [...havuz].sort((a, b) => (a.yolBilinmiyor - b.yolBilinmiyor)
    || (a.sutYasak - b.sutYasak)
    || (a.kediKopek - b.kediKopek)
    || (b.hesaplanabilir - a.hesaplanabilir)
    || (arinmaDusuk(a) - arinmaDusuk(b))
    || ((a.urun.etkenler?.length ?? 0) - (b.urun.etkenler?.length ?? 0))
    || String(a.urun.ad ?? '').localeCompare(String(b.urun.ad ?? ''), 'tr'));
  return { ...sirali[0], digerSayisi: adaylar.length - 1 };
}

/**
 * Protokol satırı için bir ürün seçer (urunAdaylari + adaySec).
 * @returns {{ urun, kayit, hesaplanabilir, yolBilinmiyor, urunYollari: string[], yolGenis, sutYasak, kediKopek,
 *   dozBuzagiIcin, arinmaOkunamadi, kisitlar: {tur, metin}[], digerSayisi: number } | null}
 *   yolBilinmiyor: satırın yolu var ama seçilen ürünün yolu KÜB'den okunamadı (ekran uyarır). yolGenis: satırın
 *   yolları ürünün KÜB yollarından geniş (ör. satır "IV / IM", ürün yalnız IM). sutYasak: inek / düvede sağmal
 *   hayvanda kullanılmaz. dozBuzagiIcin: oran yalnız buzağı / genç sığır için, hayvan buzağı değil.
 */
export function urunSec(ilac, veri, yas, secenek = {}) {
  return adaySec(urunAdaylari(ilac, veri, yas), secenek);
}

/**
 * Hastalık sayfasının öneri kartı verisi.
 * @param h hastalık kaydı
 * @param girdi { yas: 'buzagi'|'dana'|'duve'|'inek'|'boga', kilo: number|null, yasAy: number|null }
 * @returns {{ taslak: boolean, ilacOnerilmez: boolean, antibiyotikEndikeDegil: boolean, ihbarOnce: boolean,
 *   yasUymuyor: boolean, yasGruplari: string[], kilo: number|null, kiloUyari: {tur, metin}|null,
 *   gruplar: { sinif: string, satirlar: Satir[] }[], destekleyici: string[], bakim: string[] }}
 * Satir = { ilac, etken, secim, urunSayisi, hesap: { ml, ham, yerSayisi, ifade, cumle, yerBasinaMaxMl, yerBasinaYol,
 *   buyukHacim }|null, neden: null|'urun_yok'|'hekim_secer'|'ayni_urun'|'yas_uymuyor'|'sabit_doz'|'oran_yok'|'kilo_yok'
 *   |'kilo_gecersiz'|'kisit', ayniUrunIle: etkenId|null, kisitEngel: {tur, metin}|null }
 * - yasUymuyor: hayvanın yaşı hastalığın yaş gruplarında yok → hiçbir satırda ml yok (neden 'yas_uymuyor'), ürün
 *   seçimi yine gösterilir.
 * - Metabolik satırda yalnız hesaplanabilir ürün seçilir; yoksa ya da satırın tüm ürünleri KÜB metinsizse secim null,
 *   neden 'hekim_secer' (urunSayisi: uygun ruhsatlı ürün sayısı).
 * - Çift doz koruması: kartta (ekran sırasıyla) önceki bir satırın seçtiği ürün bu satırın etkenini zaten içeriyorsa
 *   (aynı ürün yeniden seçildi ya da başka ürün seçildi ama önceki kombine ürün bu etkeni de veriyor) satır ml göstermez
 *   (neden 'ayni_urun', ayniUrunIle önceki satırın etkenId'si).
 * - Oran yoksa ve KÜB dozu kiloya bağlı değilse (oran.sabitDoz) neden 'sabit_doz', değilse 'oran_yok'.
 * - Koşullu KÜB kısıtının kilo sınırı bu hayvanı dışlıyorsa (80 kg'dan ağır buzağıda toltrazuril) neden 'kisit',
 *   kisitEngel o kısıt; ml yok.
 * - hesap.buyukHacim: ürün kas içi / deri altı verilebiliyor, ml > 20 ve KÜB yer başına sınır vermiyor.
 */
export function tedaviOnerisi(h, veri, girdi) {
  const p = h.protokol ?? {};
  const yas = girdi?.yas ?? null;
  const kilo = typeof girdi?.kilo === 'number' && Number.isFinite(girdi.kilo) ? girdi.kilo : null;
  const kiloUyari = kiloUyarisi(kilo, yas);
  const antibiyotikEndikeDegil = !!h.antibiyotikEndikeDegil;
  const ilacOnerilmez = h.tedaviKipi === 'yasak' || h.tedaviKipi === 'yok';
  const yasGruplari = Array.isArray(h.yasGruplari) ? h.yasGruplari : [];
  const yasUymuyor = yas != null && yasGruplari.length > 0 && !yasGruplari.includes(yas);

  const gruplar = [];
  if (!ilacOnerilmez) {
    const protokolEtkenleri = new Set((p.ilaclar ?? []).map((i) => i.etkenId));
    for (const ilac of p.ilaclar ?? []) {
      if (ilac.sira !== 1 || !gosterilebilirMi(ilac, veri)) continue;
      const etken = veri.etkenler.find((x) => x.id === ilac.etkenId) ?? { id: ilac.etkenId, ad: ilac.etkenId };
      const sinif = ilac.sinif ?? etken.sinif ?? 'diger';
      if (antibiyotikEndikeDegil && sinif === 'antimikrobiyal') continue;
      let grup = gruplar.find((g) => g.sinif === sinif);
      if (!grup) gruplar.push(grup = { sinif, satirlar: [] });
      const adaylar = urunAdaylari(ilac, veri, yas);
      const secim = adaySec(adaylar, { protokolEtkenleri, yalnizHesaplanabilir: sinif === 'metabolik' });
      grup.satirlar.push({ ilac, etken, secim, urunSayisi: adaylar.length, hesap: null, neden: null, ayniUrunIle: null, kisitEngel: null });
    }
    const am = gruplar.findIndex((g) => g.sinif === 'antimikrobiyal');
    if (am > 0) gruplar.unshift(...gruplar.splice(am, 1));

    // Ekran sırasıyla: bu etken önceki satırın ürünüyle zaten veriliyorsa ml yok; aksi hâlde yaş, oran ve kilo denetimi.
    const onceki = []; // { etkenId, etkenler } — önceki satırların seçtiği ürünler
    for (const satir of gruplar.flatMap((g) => g.satirlar)) {
      const { secim } = satir;
      if (!secim) { satir.neden = satir.urunSayisi ? 'hekim_secer' : 'urun_yok'; continue; }
      const once = onceki.find((o) => o.etkenler.includes(satir.ilac.etkenId));
      if (once) { satir.neden = 'ayni_urun'; satir.ayniUrunIle = once.etkenId; continue; }
      onceki.push({ etkenId: satir.ilac.etkenId, etkenler: secim.urun.etkenler ?? [] });
      if (yasUymuyor) satir.neden = 'yas_uymuyor';
      else if (!secim.hesaplanabilir) satir.neden = secim.kayit?.oran?.sabitDoz ? 'sabit_doz' : 'oran_yok';
      else if (kilo == null) satir.neden = 'kilo_yok';
      else if (kiloUyari?.tur === 'gecersiz') satir.neden = 'kilo_gecersiz';
      else if ((satir.kisitEngel = kiloKisiti(secim.kisitlar, kilo))) satir.neden = 'kisit';
      else {
        const o = secim.kayit.oran;
        const yerBasinaMaxMl = o.yerBasinaMaxMl ?? null;
        const hesap = mlHesapla(o.mlPerKg, kilo, yerBasinaMaxMl);
        satir.hesap = {
          ...hesap, ifade: o.ifade, cumle: o.cumle, yerBasinaMaxMl, yerBasinaYol: o.yerBasinaYol ?? null,
          buyukHacim: !yerBasinaMaxMl && hesap.ml > BUYUK_HACIM_ML && secim.urunYollari.some((k) => ENJEKSIYON_YER.has(k)),
        };
      }
    }
  }

  return {
    taslak: !onayliMi(h),
    ilacOnerilmez,
    antibiyotikEndikeDegil,
    ihbarOnce: !!h.ihbari && h.tedaviKipi === 'semptomatik',
    yasUymuyor,
    yasGruplari,
    kilo,
    kiloUyari,
    gruplar,
    destekleyici: p.destekleyici ?? [],
    bakim: p.bakim ?? [],
  };
}
