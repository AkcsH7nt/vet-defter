// Veri doğrulayıcı (spec §8). Kullanım: node scripts/dogrula.mjs [kök dizin]   (varsayılan: depo kökü)
// Kök dizinde veri/ klasörü aranır; ör. `node scripts/dogrula.mjs test/ornek`.
// dogrula(veri) saf işlevdir: hata metinlerinin listesini döndürür (boş liste = temiz).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veriYukle } from '../lib/veri.js';
import { icerikOzeti, kubOzeti } from '../lib/onay.js';
import { YOL_KODLARI } from '../lib/oran.js';

// --- Sözlükler (spec §8 + plan eklemeleri) ---
const TURLER = ['sigir'];
const YAS_GRUPLARI = ['buzagi', 'dana', 'duve', 'inek', 'boga'];
const SISTEMLER = ['genel', 'solunum', 'sindirim', 'meme', 'ureme', 'metabolik', 'deri', 'ayak', 'sinir', 'kan', 'goz'];
const GRUPLAR = ['solunum', 'sindirim', 'meme_ureme', 'metabolik', 'deri_ayak', 'kan_parazit', 'ihbar_zehir'];
const YAYGINLIK = ['sik', 'orta', 'nadir'];
const TEDAVI_KIPI = ['yasak', 'yok', 'semptomatik', 'normal'];
const AGIRLIK = ['kardinal', 'tipik', 'olasi'];
const BAGLAM_ANAHTAR = ['dogumSonrasi', 'suru', 'aniOlum'];
const BAGLAM_DEGER = ['zorunlu', 'destekler'];
const SINIF = ['antimikrobiyal', 'antiparaziter', 'nsaii', 'metabolik', 'diger'];
const AMEG = ['A', 'B', 'C', 'D'];
const ONAY_DURUM = ['taslak', 'onayli'];
const GUVEN = ['yuksek', 'dusuk'];
const ORAN_KAPSAM = ['sigir', 'buzagi'];
const YER_YOLU = ['IM', 'SC'];
const KISIT_TURU = ['olumsuz', 'yas', 'kosullu']; // oran.kisitlar[].tur: koşulsuz yasak, yaş kapsamı, koşullu kısıt // oran.yerBasinaYol: yer başına sınırın bağlı olduğu yol
const ORAN_ML_KG_UST = 50; // yuksek oranda mlPerKg üst sınırı (bunun üstü okuma hatasıdır)
const SECILEMEZ = ['ates', 'hipotermi']; // ısıdan türetilir, elle seçilmez
const ISI_ARALIGI = [30, 45];

// Alan listeleri: [zorunlu, isteğe bağlı]. Listede olmayan alan hata verir (yazım hatası yakalanır).
const ALANLAR = {
  belirti: [['id', 'ad', 'sistem', 'esAnlamlilar', 'tur', 'genelSiklik'], ['secilebilir']],
  etken: [['id', 'ad', 'sinif', 'atcvet', 'mekanizma', 'onay'], ['ameg', 'kaynaklar', 'notlar']],
  mekanizma: [['hedef', 'etki', 'tur', 'spektrum', 'etkilesimler', 'kaynak'], ['kinetik', 'direnc']],
  hastalik: [['id', 'ad', 'grup', 'tur', 'yasGruplari', 'baglam', 'yayginlik', 'ihbari', 'zoonoz', 'tedaviKipi',
    'isi', 'belirtiler', 'dislayicilar', 'ayiriciTani', 'sahadaDogrula', 'uyarilar', 'protokol',
    'antibiyotikEndikeDegil', 'agrivetAd', 'onay'], ['mevsim', 'kaynaklar', 'notlar', 'turkiyedeGorulmez']],
  hastalikBelirtisi: [['id', 'agirlik', 'yoklugu_dusurur'], []],
  protokol: [['ilaclar', 'destekleyici', 'bakim', 'ihbarAdimlari'], []],
  ilac: [['etkenId', 'sinif', 'sira', 'yol', 'kaynak'], ['not']],
  ilacKaynagi: [['tur', 'urun', 'bolum'], ['urunId']],
  isi: [['min', 'max'], []],
  onay: [['durum'], ['kim', 'tarih', 'icerikOzeti']],
  bayrak: [['id', 'hastalikId', 'kosul', 'baslik', 'uyarilar', 'onay'], []],
  kosul: [[], ['hepsi', 'herhangi', 'baglam']], // hepsi / herhangi'den en az biri dolu (aşağıda denetlenir)
  urun: [['ad', 'firma', 'form', 'etkenler', 'digerEtkenler', 'hedefTurler', 'kubUrl', 'cekilmeTarihi', 'kub', 'kubDogrulandi'], ['urunId']],
  kub: [['tur', 'yol', 'doz', 'et_gun', 'sut'], []],
  doz: [['miktar', 'birim', 'aralik', 'sure'], []],
  kubDogrulandi: [['kim', 'tarih', 'icerikOzeti'], []],
  kubDosyasi: [['urunler'], ['cekilmeTarihi']], // veri/kub.json (dosya yoksa lib/veri.js { urunler: {} } verir)
  kubKaydi: [['doz', 'arinma', 'sigir', 'metinYok'],
    ['tablo', 'eskiBicim', 'sigirHedefDegil', 'belgeUyumsuz', 'belgeNeden', 'kubAdi', 'oran', 'yollar']],
  kubOran: [['mlPerKg', 'ifade', 'cumle', 'kaynak', 'kapsam', 'guven', 'yerBasinaMaxMl', 'yerBasinaYol', 'kisitlar', 'sabitDoz'], []],
  kubSigir: [['et_gun', 'sut', 'guven'], []],
  kubKisit: [['tur', 'metin'], []], // oran.kisitlar öğesi
  meta: [['semaSurumu', 'icerikSurumu', 'urunListesiTarihi'], []],
  liste: [['kaynak', 'kaynakTarihi', 'ogeler'], ['not']],
  ihbarOgesi: [['id', 'ad', 'emin', 'dogrulandi'], ['not']],
  yasakOgesi: [['id', 'ad', 'aciklama', 'dogrulandi'], []],
};

// --- Küçük yardımcılar ---
const nesneMi = (d) => d !== null && typeof d === 'object' && !Array.isArray(d);
const metinMi = (d) => typeof d === 'string' && d.trim() !== '';
const kimlikMi = (d) => typeof d === 'string' && /^[a-z0-9]+(_[a-z0-9]+)*$/.test(d);
const tarihMi = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(d)
  && !Number.isNaN(Date.parse(d));
const metinDizisiMi = (d) => Array.isArray(d) && d.every(metinMi);

/** Türkçe harfleri sadeleştirip küçük harfe çevirir; ad karşılaştırması için. */
function sade(s) {
  return String(s).toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

/** Bir veri kümesini doğrular; hata metinleri listesi döner. */
export function dogrula(veri) {
  const hatalar = [];
  const hata = (yer, mesaj) => hatalar.push(`${yer}: ${mesaj}`);

  function alanlar(yer, nesne, tur) {
    if (!nesneMi(nesne)) { hata(yer, `nesne olmalı (${tur})`); return false; }
    const [zorunlu, istege] = ALANLAR[tur];
    for (const a of zorunlu) if (!(a in nesne)) hata(yer, `eksik alan: ${a}`);
    for (const a of Object.keys(nesne)) {
      if (!zorunlu.includes(a) && !istege.includes(a)) hata(yer, `bilinmeyen alan: ${a}`);
    }
    return true;
  }
  const enumDenetle = (yer, alan, deger, liste) => {
    if (!liste.includes(deger)) hata(yer, `${alan} geçersiz: ${JSON.stringify(deger)} (izinli: ${liste.join(', ')})`);
  };
  const altKume = (yer, alan, deger, liste, bosOlabilir = false) => {
    if (!Array.isArray(deger) || (!bosOlabilir && deger.length === 0)) { hata(yer, `${alan} boş olmayan dizi olmalı`); return; }
    for (const d of deger) if (!liste.includes(d)) hata(yer, `${alan} geçersiz değer: ${JSON.stringify(d)}`);
    if (new Set(deger).size !== deger.length) hata(yer, `${alan} tekrarlayan değer içeriyor`);
  };
  const metinDizisi = (yer, alan, deger) => {
    if (!metinDizisiMi(deger)) hata(yer, `${alan} metin dizisi olmalı`);
  };
  function onayDenetle(yer, kayit) {
    const onay = kayit.onay;
    if (!alanlar(`${yer}.onay`, onay, 'onay')) return;
    enumDenetle(yer, 'onay.durum', onay.durum, ONAY_DURUM);
    if (onay.durum !== 'onayli') return;
    if (!metinMi(onay.kim)) hata(yer, 'onay.kim onaylı kayıtta zorunlu');
    if (!tarihMi(onay.tarih)) hata(yer, 'onay.tarih onaylı kayıtta YYYY-AA-GG olmalı');
    if (onay.icerikOzeti !== icerikOzeti(kayit)) {
      hata(yer, `onaylı ama içerik özeti tutmuyor (kayıt onaydan sonra değişmiş; özet ${icerikOzeti(kayit)}) → yeniden onay gerekir`);
    }
  }
  /** Tekrarsız kimlik kümesi kurar. */
  function kimlikler(ad, liste) {
    const kume = new Map();
    if (!Array.isArray(liste)) return kume;
    for (const k of liste) {
      const id = k?.id;
      if (!kimlikMi(id)) { hata(`${ad}[${JSON.stringify(id)}]`, 'id küçük harf ASCII snake_case olmalı'); continue; }
      if (kume.has(id)) hata(`${ad}[${id}]`, 'kimlik tekrar ediyor');
      else kume.set(id, k);
    }
    return kume;
  }

  // --- Üst düzey biçim ---
  if (!nesneMi(veri)) return ['veri: nesne olmalı'];
  for (const ad of ['belirtiler', 'etkenler', 'hastaliklar', 'bayraklar', 'urunler']) {
    if (!Array.isArray(veri[ad])) hata(ad, 'dizi olmalı');
  }

  // meta
  if (alanlar('meta', veri.meta, 'meta')) {
    const m = veri.meta;
    if (!Number.isInteger(m.semaSurumu) || m.semaSurumu < 1) hata('meta', 'semaSurumu pozitif tam sayı olmalı');
    if (!metinMi(m.icerikSurumu)) hata('meta', 'icerikSurumu metin olmalı');
    if (m.urunListesiTarihi !== null && !tarihMi(m.urunListesiTarihi)) hata('meta', 'urunListesiTarihi tarih ya da null olmalı');
  }

  // ihbar / yasak listeleri
  function listeDenetle(ad, liste, ogeTuru) {
    if (!alanlar(ad, liste, 'liste')) return new Map();
    if (!metinMi(liste.kaynak)) hata(ad, 'kaynak metin olmalı');
    if (liste.kaynakTarihi !== null && !tarihMi(liste.kaynakTarihi)) hata(ad, 'kaynakTarihi tarih ya da null olmalı');
    if ('not' in liste && !metinMi(liste.not)) hata(ad, 'not metin olmalı');
    if (!Array.isArray(liste.ogeler)) { hata(ad, 'ogeler dizi olmalı'); return new Map(); }
    const kume = kimlikler(ad, liste.ogeler);
    for (const [id, o] of kume) {
      const yer = `${ad}[${id}]`;
      alanlar(yer, o, ogeTuru);
      if (!metinMi(o.ad)) hata(yer, 'ad metin olmalı');
      if (typeof o.dogrulandi !== 'boolean') hata(yer, 'dogrulandi true/false olmalı');
      if (ogeTuru === 'ihbarOgesi' && typeof o.emin !== 'boolean') hata(yer, 'emin true/false olmalı');
      if (ogeTuru === 'yasakOgesi' && !metinMi(o.aciklama)) hata(yer, 'aciklama metin olmalı');
    }
    return kume;
  }
  const ihbarListesi = listeDenetle('ihbar', veri.ihbar, 'ihbarOgesi');
  const yasakListesi = listeDenetle('yasaklar', veri.yasaklar, 'yasakOgesi');
  const ihbarListesiGecerli = nesneMi(veri.ihbar) && Array.isArray(veri.ihbar.ogeler);
  const yasakAdlari = new Map([...yasakListesi.values()].filter((o) => metinMi(o.ad)).map((o) => [sade(o.ad), o]));

  const belirtiler = kimlikler('belirti', veri.belirtiler);
  const etkenler = kimlikler('etken', veri.etkenler);
  const hastaliklar = kimlikler('hastalik', veri.hastaliklar);

  // --- Belirtiler ---
  for (const [id, b] of belirtiler) {
    const yer = `belirti[${id}]`;
    if (!alanlar(yer, b, 'belirti')) continue;
    if (!metinMi(b.ad)) hata(yer, 'ad metin olmalı');
    enumDenetle(yer, 'sistem', b.sistem, SISTEMLER);
    metinDizisi(yer, 'esAnlamlilar', b.esAnlamlilar);
    altKume(yer, 'tur', b.tur, TURLER);
    if (typeof b.genelSiklik !== 'number' || !(b.genelSiklik > 0 && b.genelSiklik < 1)) {
      hata(yer, 'genelSiklik 0 ile 1 arasında (uçlar hariç) sayı olmalı');
    }
    if ('secilebilir' in b && typeof b.secilebilir !== 'boolean') hata(yer, 'secilebilir true/false olmalı');
    if (SECILEMEZ.includes(id) && b.secilebilir !== false) hata(yer, 'ısıdan türetilir: secilebilir: false olmalı');
  }

  // --- Etkenler ---
  for (const [id, e] of etkenler) {
    const yer = `etken[${id}]`;
    if (!alanlar(yer, e, 'etken')) continue;
    if (!metinMi(e.ad)) hata(yer, 'ad metin olmalı');
    enumDenetle(yer, 'sinif', e.sinif, SINIF);
    if (e.atcvet !== null && !metinMi(e.atcvet)) hata(yer, 'atcvet metin ya da null olmalı');
    if (e.sinif === 'antimikrobiyal') enumDenetle(yer, 'ameg (antimikrobiyalde zorunlu)', e.ameg, AMEG);
    else if (e.ameg != null) hata(yer, 'ameg yalnız antimikrobiyalde dolu olur');
    if (alanlar(`${yer}.mekanizma`, e.mekanizma, 'mekanizma')) {
      const m = e.mekanizma;
      for (const a of ['hedef', 'etki', 'tur']) if (!metinMi(m[a])) hata(yer, `mekanizma.${a} metin olmalı`);
      if (m.spektrum !== null && !metinMi(m.spektrum)) hata(yer, 'mekanizma.spektrum metin ya da null olmalı');
      for (const a of ['kinetik', 'direnc']) if (a in m && !metinMi(m[a])) hata(yer, `mekanizma.${a} metin olmalı`);
      metinDizisi(yer, 'mekanizma.etkilesimler', m.etkilesimler);
    }
    if ('kaynaklar' in e && !Array.isArray(e.kaynaklar)) hata(yer, 'kaynaklar dizi olmalı');
    // Yasak madde etken listesinde de durmaz: ürünleri "Ruhsatlı ürünler" altında görünmesin (final-review M12).
    const yasakEtken = yasakListesi.get(id) ?? (metinMi(e.ad) ? yasakAdlari.get(sade(e.ad)) : undefined);
    if (yasakEtken) hata(yer, `gıda hayvanında yasak madde etken listesinde: ${yasakEtken.ad}`);
    onayDenetle(yer, e);
  }

  // --- Hastalıklar ---
  for (const [id, h] of hastaliklar) {
    const yer = `hastalik[${id}]`;
    if (!alanlar(yer, h, 'hastalik')) continue;
    if (!metinMi(h.ad)) hata(yer, 'ad metin olmalı');
    enumDenetle(yer, 'grup', h.grup, GRUPLAR);
    altKume(yer, 'tur', h.tur, TURLER);
    altKume(yer, 'yasGruplari', h.yasGruplari, YAS_GRUPLARI);
    if (!nesneMi(h.baglam)) hata(yer, 'baglam nesne olmalı');
    else {
      for (const [a, d] of Object.entries(h.baglam)) {
        if (!BAGLAM_ANAHTAR.includes(a)) hata(yer, `baglam bilinmeyen anahtar: ${a}`);
        else if (!BAGLAM_DEGER.includes(d)) hata(yer, `baglam.${a} 'zorunlu' ya da 'destekler' olmalı`);
      }
    }
    enumDenetle(yer, 'yayginlik', h.yayginlik, YAYGINLIK);
    if ('mevsim' in h) {
      if (!Array.isArray(h.mevsim) || h.mevsim.length === 0
        || !h.mevsim.every((ay) => Number.isInteger(ay) && ay >= 1 && ay <= 12)
        || new Set(h.mevsim).size !== h.mevsim.length) {
        hata(yer, 'mevsim 1–12 arası tekrarsız ay dizisi olmalı');
      }
    }
    for (const a of ['ihbari', 'zoonoz', 'antibiyotikEndikeDegil']) {
      if (typeof h[a] !== 'boolean') hata(yer, `${a} true/false olmalı`);
    }
    if ('turkiyedeGorulmez' in h && typeof h.turkiyedeGorulmez !== 'boolean') hata(yer, 'turkiyedeGorulmez true/false olmalı');
    enumDenetle(yer, 'tedaviKipi', h.tedaviKipi, TEDAVI_KIPI);
    if (h.isi !== null && alanlar(`${yer}.isi`, h.isi, 'isi')) {
      const { min, max } = h.isi;
      const [alt, ust] = ISI_ARALIGI;
      if (typeof min !== 'number' || typeof max !== 'number' || min > max || min < alt || max > ust) {
        hata(yer, `isi { min ≤ max } ${alt}–${ust} °C arasında olmalı ya da null`);
      }
    }

    // beklenen belirtiler
    const beklenen = new Set();
    if (!Array.isArray(h.belirtiler) || h.belirtiler.length === 0) hata(yer, 'belirtiler boş olmayan dizi olmalı');
    else {
      h.belirtiler.forEach((hb, i) => {
        const y = `${yer}.belirtiler[${i}]`;
        if (!alanlar(y, hb, 'hastalikBelirtisi')) return;
        if (!belirtiler.has(hb.id)) hata(yer, `bilinmeyen belirti: ${hb.id}`);
        if (beklenen.has(hb.id)) hata(yer, `belirti iki kez listelenmiş: ${hb.id}`);
        beklenen.add(hb.id);
        if (!AGIRLIK.includes(hb.agirlik)) hata(yer, `${hb.id} agirlik geçersiz: ${JSON.stringify(hb.agirlik)}`);
        if (typeof hb.yoklugu_dusurur !== 'boolean') hata(yer, `${hb.id} yoklugu_dusurur true/false olmalı`);
      });
    }
    if (!Array.isArray(h.dislayicilar)) hata(yer, 'dislayicilar dizi olmalı');
    else {
      for (const d of h.dislayicilar) {
        if (!belirtiler.has(d)) hata(yer, `bilinmeyen dışlayıcı belirti: ${d}`);
        if (beklenen.has(d)) hata(yer, `${d} hem beklenen belirti hem dışlayıcı`);
      }
    }
    if (!Array.isArray(h.ayiriciTani)) hata(yer, 'ayiriciTani dizi olmalı');
    else {
      for (const d of h.ayiriciTani) {
        if (d === id) hata(yer, 'ayiriciTani kendini içeriyor');
        else if (!hastaliklar.has(d)) hata(yer, `ayiriciTani bilinmeyen hastalık: ${d}`);
      }
    }
    metinDizisi(yer, 'sahadaDogrula', h.sahadaDogrula);
    metinDizisi(yer, 'uyarilar', h.uyarilar);
    if (!metinMi(h.agrivetAd)) hata(yer, 'agrivetAd metin olmalı');
    if ('kaynaklar' in h && !Array.isArray(h.kaynaklar)) hata(yer, 'kaynaklar dizi olmalı');
    if ('notlar' in h && !metinMi(h.notlar) && !metinDizisiMi(h.notlar)) hata(yer, 'notlar metin ya da metin dizisi olmalı');

    // protokol
    const p = h.protokol;
    if (alanlar(`${yer}.protokol`, p, 'protokol')) {
      for (const a of ['destekleyici', 'bakim', 'ihbarAdimlari']) metinDizisi(yer, `protokol.${a}`, p[a]);
      const ilaclar = Array.isArray(p.ilaclar) ? p.ilaclar : [];
      if (!Array.isArray(p.ilaclar)) hata(yer, 'protokol.ilaclar dizi olmalı');

      if (h.ihbari === true && !(Array.isArray(p.ihbarAdimlari) && p.ihbarAdimlari.length > 0)) {
        hata(yer, 'ihbarı mecburi hastalıkta protokol.ihbarAdimlari boş olamaz');
      }
      if ((h.tedaviKipi === 'yasak' || h.tedaviKipi === 'yok') && ilaclar.length > 0) {
        hata(yer, `tedaviKipi '${h.tedaviKipi}' iken protokol.ilaclar boş olmalı (${ilaclar.length} satır var)`);
      }

      ilaclar.forEach((ilac, i) => {
        const y = `${yer}.protokol.ilaclar[${i}]`;
        if (!nesneMi(ilac)) { hata(y, 'nesne olmalı'); return; }
        if (!nesneMi(ilac.kaynak) || ilac.kaynak.tur !== 'KUB') {
          hata(yer, `ilaç satırı ${i} (${ilac.etkenId}) kaynaksız: kaynak { tur: 'KUB', urun, bolum } zorunlu`);
        } else {
          alanlar(`${y}.kaynak`, ilac.kaynak, 'ilacKaynagi');
          for (const a of ['urun', 'bolum']) {
            if (ilac.kaynak[a] !== null && !metinMi(ilac.kaynak[a])) hata(yer, `ilaç satırı ${i} kaynak.${a} metin ya da null olmalı`);
          }
          if ('urunId' in ilac.kaynak && ilac.kaynak.urunId !== null && !metinMi(ilac.kaynak.urunId)) {
            hata(yer, `ilaç satırı ${i} kaynak.urunId metin ya da null olmalı`);
          }
        }
        alanlar(y, ilac, 'ilac');

        // yasak madde: kimlikle ya da etken adıyla eşleşme
        const etken = etkenler.get(ilac.etkenId);
        const yasak = yasakListesi.get(ilac.etkenId) ?? (etken && metinMi(etken.ad) ? yasakAdlari.get(sade(etken.ad)) : undefined);
        if (yasak) {
          hata(yer, `protokolde gıda hayvanında yasak madde: ${yasak.ad}${etken ? ` (etken ${etken.ad})` : ''} [${ilac.etkenId}]`);
        } else if (!etken) {
          hata(yer, `ilaç satırı ${i} bilinmeyen etken: ${ilac.etkenId}`);
        }
        if (etken?.sinif === 'antimikrobiyal' && etken.ameg === 'A') {
          hata(yer, `protokolde AMEG A etken (gıda hayvanında kullanılmaz): ${etken.ad}`);
        }
        enumDenetle(yer, `ilaç satırı ${i} sinif`, ilac.sinif, SINIF);
        if (etken && SINIF.includes(ilac.sinif) && etken.sinif !== ilac.sinif) {
          hata(yer, `ilaç satırı ${i} sinif '${ilac.sinif}' etkenin sınıfı '${etken.sinif}' ile uyuşmuyor`);
        }
        if (h.antibiyotikEndikeDegil === true && (ilac.sinif === 'antimikrobiyal' || etken?.sinif === 'antimikrobiyal')) {
          hata(yer, `antibiyotikEndikeDegil: true iken protokolde antimikrobiyal var: ${etken?.ad ?? ilac.etkenId}`);
        }
        if (ilac.sira !== 1 && ilac.sira !== 2) hata(yer, `ilaç satırı ${i} sira 1 ya da 2 olmalı`);
        if (!metinMi(ilac.yol)) hata(yer, `ilaç satırı ${i} yol metin olmalı`);
        if ('not' in ilac && ilac.not !== null && typeof ilac.not !== 'string') hata(yer, `ilaç satırı ${i} not metin ya da null olmalı`);
      });
    }

    // ihbar listesiyle tutarlılık
    if (ihbarListesiGecerli) {
      if (h.ihbari === true && !ihbarListesi.has(id)) hata(yer, 'ihbari: true ama ihbar listesinde yok (veri/ihbar.json)');
      if (h.ihbari === false && ihbarListesi.has(id)) hata(yer, 'ihbar listesinde var ama ihbari: false');
    }
    onayDenetle(yer, h);
  }

  // --- Bayraklar ---
  const bayraklar = kimlikler('bayrak', veri.bayraklar);
  for (const [id, b] of bayraklar) {
    const yer = `bayrak[${id}]`;
    if (!alanlar(yer, b, 'bayrak')) continue;
    if (!hastaliklar.has(b.hastalikId)) hata(yer, `bilinmeyen hastalık: ${b.hastalikId}`);
    if (!metinMi(b.baslik)) hata(yer, 'baslik metin olmalı');
    metinDizisi(yer, 'uyarilar', b.uyarilar);
    if (alanlar(`${yer}.kosul`, b.kosul, 'kosul')) {
      const k = b.kosul;
      let dolu = false;
      for (const a of ['hepsi', 'herhangi']) {
        if (!(a in k)) continue;
        if (!Array.isArray(k[a])) { hata(yer, `kosul.${a} dizi olmalı`); continue; }
        if (k[a].length) dolu = true;
        for (const bid of k[a]) if (!belirtiler.has(bid)) hata(yer, `kosul.${a} bilinmeyen belirti: ${bid}`);
      }
      if (!dolu) hata(yer, 'kosul en az bir belirti içermeli (hepsi ya da herhangi)');
      if ('baglam' in k) {
        if (!nesneMi(k.baglam)) hata(yer, 'kosul.baglam nesne olmalı');
        else for (const [a, d] of Object.entries(k.baglam)) {
          if (!BAGLAM_ANAHTAR.includes(a) || d !== true) hata(yer, `kosul.baglam.${a} geçersiz (izinli anahtarlar ${BAGLAM_ANAHTAR.join(', ')}, değer true)`);
        }
      }
    }
    onayDenetle(yer, b);
  }
  // İhbar şüphesi sıralamaya bırakılmaz (spec §4): her ihbari hastalığın en az bir kırmızı bayrak kuralı olmalı.
  const bayrakliHastaliklar = new Set([...bayraklar.values()].map((b) => b?.hastalikId));
  for (const [id, h] of hastaliklar) {
    if (h?.ihbari === true && !bayrakliHastaliklar.has(id)) {
      hata(`hastalik[${id}]`, 'ihbari: true ama kırmızı bayrak kuralı yok (veri/bayraklar.json) — ihbar şüphesi sıralamada kaybolabilir');
    }
  }

  // --- Ürünler ---
  (Array.isArray(veri.urunler) ? veri.urunler : []).forEach((u, i) => {
    const yer = `urun[${metinMi(u?.ad) ? u.ad : i}]`;
    if (!alanlar(yer, u, 'urun')) return;
    for (const a of ['ad', 'firma', 'form']) if (!metinMi(u[a])) hata(yer, `${a} metin olmalı`);
    if (!Array.isArray(u.etkenler) || u.etkenler.length === 0) hata(yer, 'etkenler boş olmayan dizi olmalı');
    else for (const e of u.etkenler) if (!etkenler.has(e)) hata(yer, `bilinmeyen etken: ${e}`);
    // etken kaydı olmayan etkin maddeler (KÜB §2 yazımı; scripts/etken-tara.mjs --yaz): dolu metin dizisi, tekrarsız
    if (!metinDizisiMi(u.digerEtkenler)) hata(yer, 'digerEtkenler dolu metin dizisi olmalı ([] olabilir)');
    else if (new Set(u.digerEtkenler).size !== u.digerEtkenler.length) hata(yer, 'digerEtkenler tekrarsız olmalı');
    if (!Array.isArray(u.hedefTurler) || u.hedefTurler.length === 0 || !u.hedefTurler.every(kimlikMi)) {
      hata(yer, 'hedefTurler boş olmayan tür kimliği dizisi olmalı (ör. sigir)');
    }
    if (u.kubUrl !== null && !(typeof u.kubUrl === 'string' && /^https?:\/\//.test(u.kubUrl))) hata(yer, 'kubUrl http(s) adresi ya da null olmalı');
    if (!tarihMi(u.cekilmeTarihi)) hata(yer, 'cekilmeTarihi ISO tarih olmalı');
    if (!Array.isArray(u.kub)) hata(yer, 'kub dizi olmalı');
    else u.kub.forEach((k, j) => {
      const y = `${yer}.kub[${j}]`;
      if (!alanlar(y, k, 'kub')) return;
      if (!kimlikMi(k.tur)) hata(yer, `kub[${j}].tur tür kimliği olmalı`);
      if (!metinMi(k.yol)) hata(yer, `kub[${j}].yol metin olmalı`);
      if (k.doz !== null && alanlar(`${y}.doz`, k.doz, 'doz')) {
        if (typeof k.doz.miktar !== 'number' || !(k.doz.miktar > 0)) hata(yer, `kub[${j}].doz.miktar pozitif sayı olmalı`);
        if (!metinMi(k.doz.birim)) hata(yer, `kub[${j}].doz.birim metin olmalı`);
        for (const a of ['aralik', 'sure']) if (k.doz[a] !== null && !metinMi(k.doz[a])) hata(yer, `kub[${j}].doz.${a} metin ya da null olmalı`);
      }
      if (k.et_gun !== null && !(Number.isInteger(k.et_gun) && k.et_gun >= 0)) hata(yer, `kub[${j}].et_gun 0 ya da pozitif tam sayı, bilinmiyorsa null olmalı`);
      const sut = k.sut;
      const sutGecerli = sut === 'kullanilmaz' || sut === 'belirtilmemis'
        || (nesneMi(sut) && Object.keys(sut).length === 1 && typeof sut.saat === 'number' && sut.saat >= 0);
      if (!sutGecerli) hata(yer, `kub[${j}].sut { saat } | 'kullanilmaz' | 'belirtilmemis' olmalı`);
    });
    if (u.kubDogrulandi !== null) {
      if (!nesneMi(u.kubDogrulandi)) hata(yer, 'kubDogrulandi { kim, tarih, icerikOzeti } ya da null olmalı');
      else if (alanlar(`${yer}.kubDogrulandi`, u.kubDogrulandi, 'kubDogrulandi')) {
        if (!metinMi(u.kubDogrulandi.kim) || !tarihMi(u.kubDogrulandi.tarih)) hata(yer, 'kubDogrulandi { kim, tarih } dolu olmalı');
        if (u.kubDogrulandi.icerikOzeti !== kubOzeti(u)) {
          hata(yer, `kubDogrulandi özeti tutmuyor (kub[] doğrulamadan sonra değişmiş; özet ${kubOzeti(u)}) → yeniden doğrulama gerekir`);
        }
      }
    }
    if ('urunId' in u && u.urunId !== null && !metinMi(u.urunId)) hata(yer, 'urunId metin ya da null olmalı');
  });
  const urunKimlikleri = new Map();
  for (const u of Array.isArray(veri.urunler) ? veri.urunler : []) {
    if (!metinMi(u?.urunId)) continue;
    if (urunKimlikleri.has(u.urunId)) hata(`urun[${u.ad}]`, `urunId tekrar ediyor: ${u.urunId}`);
    urunKimlikleri.set(u.urunId, u);
  }

  // --- KÜB alıntıları (veri/kub.json; spec §15) ---
  if ('kub' in veri && alanlar('kub', veri.kub, 'kubDosyasi')) {
    const kub = veri.kub;
    if ('cekilmeTarihi' in kub && !tarihMi(kub.cekilmeTarihi)) hata('kub', 'cekilmeTarihi tarih olmalı');
    if (!nesneMi(kub.urunler)) hata('kub', 'urunler nesne olmalı ({ [urunId]: kayıt })');
    else for (const [id, k] of Object.entries(kub.urunler)) {
      const yer = `kub[${id}]`;
      if (!urunKimlikleri.has(id)) hata(yer, "urunId urunler.json'da yok");
      if (!alanlar(yer, k, 'kubKaydi')) continue;
      for (const a of ['doz', 'arinma']) if (k[a] !== null && !metinMi(k[a])) hata(yer, `${a} metin ya da null olmalı`);
      if (typeof k.metinYok !== 'boolean') hata(yer, 'metinYok true/false olmalı');
      else if (k.metinYok && (k.doz !== null || k.arinma !== null)) hata(yer, 'metinYok iken doz ve arinma null olmalı');
      else if (!k.metinYok && k.doz === null && k.arinma === null) hata(yer, 'doz ve arinma boşken metinYok true olmalı');
      const s = k.sigir;
      if (!alanlar(`${yer}.sigir`, s, 'kubSigir')) continue;
      if (s.et_gun !== null && !(Number.isInteger(s.et_gun) && s.et_gun >= 0)) hata(yer, 'sigir.et_gun 0 ya da pozitif tam sayı, okunamadıysa null olmalı');
      const sut = s.sut;
      const sutGecerli = sut === null || sut === 'kullanilmaz' || sut === 'belirtilmemis'
        || (nesneMi(sut) && Object.keys(sut).length === 1 && typeof sut.saat === 'number' && sut.saat >= 0);
      if (!sutGecerli) hata(yer, "sigir.sut { saat } | 'kullanilmaz' | 'belirtilmemis' | null olmalı");
      enumDenetle(yer, 'sigir.guven', s.guven, GUVEN);
      // Ekran sayıyı yalnız yuksek güvende gösterir: yuksek ise ikisi de okunmuş olmalı.
      if (s.guven === 'yuksek' && (s.et_gun === null || sut === null)) hata(yer, 'sigir.guven yuksek iken et_gun ve sut dolu olmalı');
      if (s.guven === 'yuksek' && k.arinma === null) hata(yer, 'arinma metni yokken sigir.guven yuksek olamaz');
      // K7 alanları: bayraklar yalnız true iken yazılır; yanlış belgede alıntı ve etiket olamaz; eski biçimde etiket olamaz.
      for (const a of ['tablo', 'eskiBicim', 'sigirHedefDegil', 'belgeUyumsuz']) if (a in k && k[a] !== true) hata(yer, `${a} yalnız true olarak yazılır`);
      for (const a of ['belgeNeden', 'kubAdi']) if (a in k && !metinMi(k[a])) hata(yer, `${a} dolu metin olmalı`);
      if (k.belgeUyumsuz === true) {
        if (!k.metinYok) hata(yer, 'belgeUyumsuz iken metinYok true olmalı (alıntı gösterilmez)');
        if (s.guven !== 'dusuk') hata(yer, 'belgeUyumsuz iken sigir.guven dusuk olmalı');
        if (!metinMi(k.belgeNeden)) hata(yer, 'belgeUyumsuz iken belgeNeden yazılmalı');
      } else if ('belgeNeden' in k) hata(yer, 'belgeNeden yalnız belgeUyumsuz ile yazılır');
      if (k.eskiBicim === true && s.guven !== 'dusuk') hata(yer, 'eskiBicim iken sigir.guven dusuk olmalı');
      if (k.tablo === true && k.doz === null) hata(yer, 'tablo iken doz metni olmalı');
      // Tedavi önerisi: 4.9'dan sığır ml/kg oranı (lib/oran.js). Ekran yalnız yuksek iken ml hesaplar.
      if ('oran' in k && alanlar(`${yer}.oran`, k.oran, 'kubOran')) {
        const o = k.oran;
        enumDenetle(yer, 'oran.guven', o.guven, GUVEN);
        if (o.mlPerKg !== null && typeof o.mlPerKg !== 'number') hata(yer, 'oran.mlPerKg sayı ya da null olmalı');
        for (const a of ['ifade', 'cumle']) if (o[a] !== null && !metinMi(o[a])) hata(yer, `oran.${a} metin ya da null olmalı`);
        if (o.kaynak !== null && o.kaynak !== 'ml_kg') hata(yer, "oran.kaynak 'ml_kg' ya da null olmalı");
        if (o.kapsam !== null && !ORAN_KAPSAM.includes(o.kapsam)) hata(yer, `oran.kapsam ${ORAN_KAPSAM.join(' | ')} ya da null olmalı`);
        if (o.yerBasinaMaxMl !== null && !(typeof o.yerBasinaMaxMl === 'number' && o.yerBasinaMaxMl > 0)) {
          hata(yer, 'oran.yerBasinaMaxMl pozitif sayı ya da null olmalı');
        }
        // K8-A: yer sınırının yolu, KÜB'deki yaş/kilo kısıtı cümleleri (aynen), kiloya bağlı olmayan doz.
        if (o.yerBasinaYol !== null && !YER_YOLU.includes(o.yerBasinaYol)) hata(yer, `oran.yerBasinaYol ${YER_YOLU.join(' | ')} ya da null olmalı`);
        if (o.yerBasinaYol !== null && o.yerBasinaMaxMl === null) hata(yer, 'oran.yerBasinaYol yalnız yerBasinaMaxMl ile yazılır');
        if (!Array.isArray(o.kisitlar)) hata(yer, 'oran.kisitlar { tur, metin } dizisi olmalı');
        else {
          o.kisitlar.forEach((x, j) => {
            if (!alanlar(`${yer}.oran.kisitlar[${j}]`, x, 'kubKisit')) return;
            enumDenetle(yer, `oran.kisitlar[${j}].tur`, x.tur, KISIT_TURU);
            if (!metinMi(x.metin)) hata(yer, `oran.kisitlar[${j}].metin dolu metin olmalı`);
          });
          const metinler = o.kisitlar.map((x) => x?.metin);
          if (new Set(metinler).size !== metinler.length) hata(yer, 'oran.kisitlar tekrarsız olmalı');
        }
        if (typeof o.sabitDoz !== 'boolean') hata(yer, 'oran.sabitDoz true ya da false olmalı');
        else if (o.sabitDoz && o.guven !== 'dusuk') hata(yer, 'oran.sabitDoz iken oran.guven dusuk olmalı (kilo oranı yok)');
        if (o.guven === 'yuksek') {
          if (!(typeof o.mlPerKg === 'number' && o.mlPerKg > 0 && o.mlPerKg <= ORAN_ML_KG_UST)) {
            hata(yer, `oran.guven yuksek iken mlPerKg 0 < x ≤ ${ORAN_ML_KG_UST} olmalı (${o.mlPerKg})`);
          }
          if (!metinMi(o.ifade) || !metinMi(o.cumle)) hata(yer, 'oran.guven yuksek iken ifade ve cumle dolu olmalı');
          else {
            // KÜB metni kelimesi kelimesine: cümle 4.9 metninde, ifade cümlede aynen geçer.
            if (!(k.doz ?? '').includes(o.cumle)) hata(yer, 'oran.cumle 4.9 (doz) metninde aynen geçmiyor');
            if (!o.cumle.includes(o.ifade)) hata(yer, 'oran.ifade cumle içinde aynen geçmiyor');
          }
          if (o.kaynak !== 'ml_kg' || !ORAN_KAPSAM.includes(o.kapsam)) hata(yer, "oran.guven yuksek iken kaynak 'ml_kg' ve kapsam dolu olmalı");
          for (const a of ['tablo', 'eskiBicim', 'sigirHedefDegil', 'belgeUyumsuz']) {
            if (k[a] === true) hata(yer, `${a} iken oran.guven dusuk olmalı`);
          }
        } else if (o.mlPerKg !== null) hata(yer, 'oran.guven dusuk iken mlPerKg null olmalı (sayı gösterilmez)');
      }
      if ('yollar' in k) {
        if (!Array.isArray(k.yollar)) hata(yer, 'yollar dizi olmalı');
        else {
          for (const y of k.yollar) if (!YOL_KODLARI.includes(y)) hata(yer, `yollar bilinmeyen kod: ${y} (${YOL_KODLARI.join(', ')})`);
          if (new Set(k.yollar).size !== k.yollar.length) hata(yer, 'yollar tekrarsız olmalı');
        }
      }
    }
  }

  // --- Ekranda görünen metinlerde "olasılık" / "ihtimal" geçmez (Global Constraints; final-review M1) ---
  const YASAK_SOZ = /olasılı|olasili|ihtimal/;
  function metinTara(yer, deger, atla = []) {
    if (typeof deger === 'string') {
      if (YASAK_SOZ.test(deger.toLocaleLowerCase('tr'))) hata(yer, `ekranda görünen metinde "olasılık / ihtimal" geçiyor: ${JSON.stringify(deger.slice(0, 80))}`);
    } else if (Array.isArray(deger)) deger.forEach((d, i) => metinTara(`${yer}[${i}]`, d, atla));
    else if (nesneMi(deger)) for (const [a, d] of Object.entries(deger)) if (!atla.includes(a)) metinTara(`${yer}.${a}`, d, atla);
  }
  for (const [id, h] of hastaliklar) metinTara(`hastalik[${id}]`, h, ['notlar', 'kaynaklar', 'onay']);
  for (const [id, e] of etkenler) metinTara(`etken[${id}]`, { ad: e?.ad, mekanizma: e?.mekanizma }, ['kaynak']);
  for (const [id, b] of bayraklar) metinTara(`bayrak[${id}]`, { baslik: b?.baslik, uyarilar: b?.uyarilar });
  for (const [id, b] of belirtiler) metinTara(`belirti[${id}]`, b?.ad);

  // --- Protokol → ürün bağları: kaynak ürün belirtilmişse var olmalı (onay ürün şartı aramaz; spec §15) ---
  const urunler = (Array.isArray(veri.urunler) ? veri.urunler : []).filter(nesneMi);
  const sigirUrunuMu = (u) => Array.isArray(u.hedefTurler) && u.hedefTurler.some((t) => t === 'sigir' || t === 'buzagi');
  for (const [id, h] of hastaliklar) {
    const ilaclar = Array.isArray(h?.protokol?.ilaclar) ? h.protokol.ilaclar : [];
    const yer = `hastalik[${id}]`;
    ilaclar.forEach((ilac, i) => {
      const k = nesneMi(ilac?.kaynak) ? ilac.kaynak : null;
      if (!k) return;
      const urunId = metinMi(k.urunId) ? k.urunId : null;
      const ad = metinMi(k.urun) ? k.urun : null;
      if (!urunId && !ad) return; // ürün belirtilmemiş: onaylı hastalıkta da serbest (spec §15)
      const adaylar = urunler.filter((u) => (urunId ? u.urunId === urunId : u.ad === ad));
      if (adaylar.length === 0) { hata(yer, `ilaç satırı ${i} kaynak ürünü listede yok: ${urunId ?? ad}`); return; }
      if (adaylar.length > 1) { hata(yer, `ilaç satırı ${i} kaynak ürün adı birden çok ürüne uyuyor: ${ad} — kaynak.urunId kullanın`); return; }
      const u = adaylar[0];
      if (!(u.etkenler ?? []).includes(ilac.etkenId)) hata(yer, `ilaç satırı ${i} kaynak ürünü ${u.ad} etken ${ilac.etkenId} içermiyor`);
      if (!sigirUrunuMu(u)) hata(yer, `ilaç satırı ${i} kaynak ürünü ${u.ad} sığır / buzağı için ruhsatlı değil`);
    });
  }

  return hatalar;
}

/** Node için okuma işlevi: kök dizine göre görece yoldan JSON okur. */
export function dizindenOku(kok) {
  return (yol) => {
    const tam = join(kok, yol);
    let metin;
    try { metin = readFileSync(tam, 'utf8'); } catch (e) { throw new Error(`${yol} okunamadı: ${e.code ?? e.message}`); }
    try { return JSON.parse(metin.replace(/^﻿/, '')); } catch (e) { throw new Error(`${yol} geçerli JSON değil: ${e.message}`); }
  };
}

async function cli() {
  const kok = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  let veri;
  try {
    veri = await veriYukle(dizindenOku(kok));
    // veriYukle eksik / okunamayan kub.json'u sessizce boş sayar; dosya varsa burada sıkı okunur (bozuk JSON → hata).
    if (existsSync(join(kok, 'veri', 'kub.json'))) veri.kub = dizindenOku(kok)('veri/kub.json');
  } catch (e) {
    console.error(`Veri yüklenemedi: ${e.message}`);
    process.exit(1);
  }
  const hatalar = dogrula(veri);
  if (hatalar.length) {
    console.log(`Veri doğrulaması: ${hatalar.length} hata`);
    for (const h of hatalar) console.log(`  - ${h}`);
    process.exit(1);
  }
  console.log('Veri doğrulaması: temiz');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
