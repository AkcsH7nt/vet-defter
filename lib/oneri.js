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

/**
 * Protokol satırı için bir ürün seçer. Uygun: etkeni içerir, sığır listesinde, KÜB belgesi ürünle uyumlu, yaş
 * buzağı değilse yalnız-buzağı ürünü değil, buzağıda KÜB "buzağıda kullanılmaz" demiyor, uygulama yolu protokolle
 * kesişiyor (iki taraftan biri bilinmiyorsa elenmez), meme içi satırda kuru dönem / laktasyon ayrımı uyuyor.
 * Sıra: (protokolEtkenleri verildiyse) tüm etkenleri hastalığın protokolünde olan ürün önce — protokol dışı etken
 * içeren kombine ürün (ör. süt hummasında metamizollü Novacoc) sona → yolu KÜB'den bilinen ve satırla kesişen ürün,
 * yolu bilinmeyenden önce → hesaplanabilir → arınma güveni yüksek → daha
 * az etken → KÜB metni olmayan sona → ad.
 * @param {{ protokolEtkenleri?: Set<string> }} [secenek] hastalık protokolündeki tüm etkenId'ler (her sıra)
 * @returns {{ urun, kayit, hesaplanabilir: boolean, yolBilinmiyor: boolean, digerSayisi: number } | null}
 *   yolBilinmiyor: satırın yolu var ama seçilen ürünün yolu KÜB'den okunamadı (ekran uyarır).
 */
export function urunSec(ilac, veri, yas, { protokolEtkenleri } = {}) {
  const protokolYollari = yolKodlari(ilac.yol ?? '');
  const kuruDonemSatiri = /kuru\s+dönem/u.test(kucuk(ilac.yol));
  const kayitOf = (u) => veri.kub?.urunler?.[u.urunId];
  const uygun = veri.urunler.filter((u) => {
    const kayit = kayitOf(u);
    if (!(u.etkenler ?? []).includes(ilac.etkenId) || !sigirListesindeMi(u, veri) || kayit?.belgeUyumsuz) return false;
    if (yas !== 'buzagi' && yalnizBuzagiMi(u)) return false;
    if (yas === 'buzagi' && BUZAGIDA_KULLANILMAZ.test(kucuk(kayit?.doz))) return false;
    // Meme içi: kuru dönem satırına yalnız kuru dönem ürünü, laktasyon (diğer meme içi) satırına kuru dönem ürünü değil.
    if (kuruDonemSatiri && !kuruDonemUrunuMu(u, kayit)) return false;
    if (!kuruDonemSatiri && protokolYollari.includes('IMM') && kuruDonemUrunuMu(u, kayit)) return false;
    return kesisir(protokolYollari, kayit?.yollar ?? []);
  }).map((urun) => {
    const kayit = kayitOf(urun);
    const yolBilinmiyor = protokolYollari.length > 0 && !(kayit?.yollar ?? []).length;
    return { urun, kayit, hesaplanabilir: hesaplanabilirMi(kayit, yas), yolBilinmiyor };
  });
  if (!uygun.length) return null;
  const metinsiz = (a) => (!a.kayit || a.kayit.metinYok ? 1 : 0);
  const arinmaDusuk = (a) => (a.kayit?.sigir?.guven === 'yuksek' ? 0 : 1);
  const disEtkenli = (a) => (protokolEtkenleri && !(a.urun.etkenler ?? []).every((id) => protokolEtkenleri.has(id)) ? 1 : 0);
  uygun.sort((a, b) => (disEtkenli(a) - disEtkenli(b))
    || (a.yolBilinmiyor - b.yolBilinmiyor)
    || (b.hesaplanabilir - a.hesaplanabilir)
    || (arinmaDusuk(a) - arinmaDusuk(b))
    || ((a.urun.etkenler?.length ?? 0) - (b.urun.etkenler?.length ?? 0))
    || (metinsiz(a) - metinsiz(b))
    || String(a.urun.ad ?? '').localeCompare(String(b.urun.ad ?? ''), 'tr'));
  return { ...uygun[0], digerSayisi: uygun.length - 1 };
}

/**
 * Hastalık sayfasının öneri kartı verisi.
 * @param h hastalık kaydı
 * @param girdi { yas: 'buzagi'|'dana'|'duve'|'inek'|'boga', kilo: number|null, yasAy: number|null }
 * @returns {{ taslak: boolean, ilacOnerilmez: boolean, antibiyotikEndikeDegil: boolean, kilo: number|null,
 *   kiloUyari: {tur, metin}|null, gruplar: { sinif: string, satirlar: Satir[] }[], destekleyici: string[], bakim: string[] }}
 * Satir = { ilac, etken, secim, hesap: { ml, ham, yerSayisi, ifade, cumle, yerBasinaMaxMl }|null,
 *   neden: null|'urun_yok'|'oran_yok'|'kilo_yok'|'kilo_gecersiz'|'ayni_urun', ayniUrunIle: etkenId|null }
 * Çift doz koruması: kartta (ekran sırasıyla) önceki bir satırın seçtiği ürün bu satırın etkenini zaten içeriyorsa
 * (aynı ürün yeniden seçildi ya da başka ürün seçildi ama önceki kombine ürün bu etkeni de veriyor) satır ml göstermez
 * (neden 'ayni_urun', ayniUrunIle önceki satırın etkenId'si).
 */
export function tedaviOnerisi(h, veri, girdi) {
  const p = h.protokol ?? {};
  const yas = girdi?.yas ?? null;
  const kilo = typeof girdi?.kilo === 'number' && Number.isFinite(girdi.kilo) ? girdi.kilo : null;
  const kiloUyari = kiloUyarisi(kilo, yas);
  const antibiyotikEndikeDegil = !!h.antibiyotikEndikeDegil;
  const ilacOnerilmez = h.tedaviKipi === 'yasak' || h.tedaviKipi === 'yok';

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
      grup.satirlar.push({ ilac, etken, secim: urunSec(ilac, veri, yas, { protokolEtkenleri }), hesap: null, neden: null, ayniUrunIle: null });
    }
    const am = gruplar.findIndex((g) => g.sinif === 'antimikrobiyal');
    if (am > 0) gruplar.unshift(...gruplar.splice(am, 1));

    // Ekran sırasıyla: bu etken önceki satırın ürünüyle zaten veriliyorsa ml yok; aksi hâlde oran ve kilo denetimi.
    const onceki = []; // { etkenId, etkenler } — önceki satırların seçtiği ürünler
    for (const satir of gruplar.flatMap((g) => g.satirlar)) {
      const { secim } = satir;
      if (!secim) { satir.neden = 'urun_yok'; continue; }
      const once = onceki.find((o) => o.etkenler.includes(satir.ilac.etkenId));
      if (once) { satir.neden = 'ayni_urun'; satir.ayniUrunIle = once.etkenId; continue; }
      onceki.push({ etkenId: satir.ilac.etkenId, etkenler: secim.urun.etkenler ?? [] });
      if (!secim.hesaplanabilir) satir.neden = 'oran_yok';
      else if (kilo == null) satir.neden = 'kilo_yok';
      else if (kiloUyari?.tur === 'gecersiz') satir.neden = 'kilo_gecersiz';
      else {
        const o = secim.kayit.oran;
        satir.hesap = { ...mlHesapla(o.mlPerKg, kilo, o.yerBasinaMaxMl ?? null), ifade: o.ifade, cumle: o.cumle, yerBasinaMaxMl: o.yerBasinaMaxMl ?? null };
      }
    }
  }

  return {
    taslak: !onayliMi(h),
    ilacOnerilmez,
    antibiyotikEndikeDegil,
    kilo,
    kiloUyari,
    gruplar,
    destekleyici: p.destekleyici ?? [],
    bakim: p.bakim ?? [],
  };
}
