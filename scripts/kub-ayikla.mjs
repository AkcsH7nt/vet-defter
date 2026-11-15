// KÜB PDF'lerinden 4.9 (doz) ve 4.11 (arınma) bölümlerini çıkarır, sığır arınmasını okur → veri/kub.json.
// Kullanım: node scripts/kub-ayikla.mjs   (npm run kub-ayikla)
//   Girdi: .superpowers/kub-pdf/<urunId>.pdf (scripts/kub-indir.mjs). İndirme sürerken de çalışır: o an var olanları işler.
//   Metin aracı: pdftotext (Poppler ya da Xpdf). PATH'te yoksa bilinen yerler denenir; PDFTOTEXT ortam değişkeniyle
//   tam yol verilebilir.
//   Ayrıntılı döküm (yanlış belge, okunamaz metin, ad farkı, eski biçim, hedef türü sığır olmayan, tablo, atılan gürültü
//   satırları): .superpowers/kub-pdf/_ayikla-rapor.json
// Metin kelimesi kelimesine alınır (lib/kub.js yalnız satır birleştirir, boşluk temizler); yapay zekâ yeniden yazımı yok.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bolumAyir, bolum47, bolumMetni, eskiBicimAyir, farmasotikSekil, kubUrunleUyumlu, sigirArinmasi, sigirHedefMi,
  sutTavsiyeEdilmez,
} from '../lib/kub.js';
import { dozOrani, sigirYollari } from '../lib/oran.js';
import { TAKMA_ID } from './urun-cek.mjs';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const PDF_KLASORU = join(KOK, '.superpowers', 'kub-pdf');
const CIKTI = join(KOK, 'veri', 'kub.json');
const RAPOR = join(PDF_KLASORU, '_ayikla-rapor.json');

const ADAYLAR = [
  process.env.PDFTOTEXT,
  'pdftotext',
  'C:/Program Files/Git/mingw64/bin/pdftotext.exe',
  'C:/Program Files/poppler/Library/bin/pdftotext.exe',
  'C:/Program Files/poppler/bin/pdftotext.exe',
  'C:/msys64/mingw64/bin/pdftotext.exe',
  '/mingw64/bin/pdftotext',
  '/usr/bin/pdftotext',
  '/usr/local/bin/pdftotext',
  '/opt/homebrew/bin/pdftotext',
].filter(Boolean);

/** Çalışan ilk pdftotext'i ve kip bayraklarını bulur. Xpdf'te varsayılan kip paragrafları tek satıra kattığı için -simple. */
export function pdftotextBul(adaylar = ADAYLAR) {
  for (const yol of adaylar) {
    const r = spawnSync(yol, ['-v'], { encoding: 'utf8' });
    if (r.error) continue; // ENOENT vb.
    const surum = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!/pdftotext/i.test(surum)) continue;
    const poppler = /poppler/i.test(surum);
    const yardim = poppler ? '' : (() => { const h = spawnSync(yol, ['-h'], { encoding: 'utf8' }); return `${h.stdout ?? ''}${h.stderr ?? ''}`; })();
    const kip = !poppler && /-simple\b/.test(yardim) ? ['-simple'] : [];
    return { yol, kip, surum: surum.split(/\r?\n/)[0].trim() };
  }
  return null;
}

/** PDF'ten metin (UTF-8, stdout'a). Hata → null. */
export function metinCikar(arac, pdf) {
  const r = spawnSync(arac.yol, [...arac.kip, '-enc', 'UTF-8', '-q', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || (r.status !== 0 && !r.stdout)) return null;
  return r.stdout;
}

/**
 * PDF yazı tipi "i" harfini düşürmüş mü ("Doks s kl n", "çme suyuna")? Türkçe metinde harflerin ~%8'i i/İ;
 * %3'ün altı okunamaz metindir (Weldox %50: %1,5; 854 KÜB'ün geri kalanı ≥ %7,4).
 */
export function harfDusmus(metin) {
  const harfler = String(metin ?? '').replace(/[^\p{L}]/gu, '');
  if (harfler.length < 500) return false;
  return (harfler.match(/[iİ]/g) ?? []).length / harfler.length < 0.03;
}

/**
 * Tek ürün kaydı. metin: pdftotext çıktısı (null = çıkarılamadı). urun: { ad, etkenler: [{ id, adlar }] } verilirse
 * belgenin bu ürüne ait olduğu denetlenir. rapor: verilirse { atilan: string[] } doldurulur, okunamaz metinde neden yazılır.
 * Dönüş: { doz, arinma, sigir, metinYok } + yalnız doğruyken tablo, eskiBicim, sigirHedefDegil, belgeUyumsuz
 * (+ belgeNeden); ad farkında kubAdi; metin varken (metinYok değil) 4.9'dan oran (lib/oran.js dozOrani; hedef türde
 * sığır yoksa her zaman dusuk) ve sığır yolları (sigirYollari). Orana 4.5 (yer sınırı), 4.1 (hedef tür → kapsam) ve
 * 4.1/4.3 ve 4.2 (yaş/kilo kısıtları) metinleri, yollara bölüm 3 (farmasötik şekil) verilir; bu metinler kayda yazılmaz.
 */
export function kubKaydi(metin, urun = null, rapor = null) {
  const bos = () => ({ doz: null, arinma: null, sigir: sigirArinmasi(null), metinYok: true });
  if (!metin || !metin.trim()) return bos();
  if (harfDusmus(metin)) {
    if (rapor) rapor.neden = 'PDF metninde "i" harfi düşmüş (okunamaz)';
    return bos();
  }
  let kubAdi = null;
  if (urun) {
    const u = kubUrunleUyumlu(metin, urun);
    if (!u.uyumlu) return { ...bos(), belgeUyumsuz: true, belgeNeden: u.neden };
    kubAdi = u.kubAdi;
  }
  let { doz, arinma, tablo } = bolumAyir(metin, { atilan: rapor?.atilan ?? null });
  let eskiBicim = false;
  if (doz === null && arinma === null) {
    const e = eskiBicimAyir(metin);
    if (e.doz !== null || e.arinma !== null) {
      ({ doz, arinma } = e);
      eskiBicim = true;
      tablo = false;
    }
  }
  let sigir = sigirArinmasi(arinma);
  // Eski biçim her zaman düşük güven; 4.7'de sağmal / laktasyonda "tavsiye edilmez" varsa da etiket yok.
  if (sigir.guven === 'yuksek' && (eskiBicim || sutTavsiyeEdilmez(bolum47(metin)))) sigir = { ...sigir, guven: 'dusuk' };
  const kayit = { doz, arinma, sigir, metinYok: doz === null && arinma === null };
  if (tablo) kayit.tablo = true;
  if (eskiBicim) kayit.eskiBicim = true;
  if (sigirHedefMi(metin) === false) kayit.sigirHedefDegil = true;
  if (kubAdi && !kayit.metinYok) kayit.kubAdi = kubAdi;
  if (!kayit.metinYok) {
    const oran = dozOrani(doz, {
      tablo,
      eskiBicim,
      ozelOnlem: bolumMetni(metin, '4.5'),
      hedefTur: bolumMetni(metin, '4.1'),
      kisitMetinleri: ['4.1', '4.3'].map((b) => bolumMetni(metin, b)),
      kullanimAlani: bolumMetni(metin, '4.2'),
    });
    // 4.1 hedef türlerinde sığır yoksa metindeki oran sığırın değildir.
    kayit.oran = kayit.sigirHedefDegil
      ? { ...oran, mlPerKg: null, ifade: null, cumle: null, kaynak: null, kapsam: null, guven: 'dusuk', sabitDoz: false }
      : oran;
    kayit.yollar = sigirYollari(doz, { sekil: farmasotikSekil(metin) });
  }
  return kayit;
}

// KÜB bileşiminde etkenin geçebileceği ek adlar (urun-cek.mjs takma adlarına ek). Kalsiyum boroglukonat çözeltisi
// bileşimde "kalsiyum glukonat + borik asit" olarak yazılır (urun-cek.mjs ikisini birlikte boroglukonata eşler).
const EK_ADLAR = {
  kalsiyum_boroglukonat: ['borik asit', 'kalsiyum glukonat'],
};

/** Ürünün etkenleri için ad listeleri: etkenler.json adı + urun-cek.mjs takma adları + EK_ADLAR. */
export function urunKimligi(urun, etkenler) {
  return {
    ad: urun.ad,
    etkenler: (urun.etkenler ?? []).map((id) => {
      const e = etkenler.find((x) => x.id === id);
      return { id, adlar: [...(e ? [e.ad] : []), ...(TAKMA_ID[id] ?? []), ...(EK_ADLAR[id] ?? [])] };
    }),
  };
}

function main() {
  const arac = pdftotextBul();
  if (!arac) {
    console.error('pdftotext bulunamadı. Poppler ya da Xpdf kurun (Windows: Git for Windows ile gelir, '
      + '"C:/Program Files/Git/mingw64/bin/pdftotext.exe") ya da PDFTOTEXT ortam değişkeniyle tam yolu verin.');
    process.exit(1);
  }
  if (!existsSync(PDF_KLASORU)) {
    console.error(`PDF klasörü yok: ${PDF_KLASORU} — önce npm run kub-indir`);
    process.exit(1);
  }
  const oku = (d) => JSON.parse(readFileSync(join(KOK, 'veri', d), 'utf8').replace(/^﻿/, ''));
  const urunler = oku('urunler.json');
  const etkenler = oku('etkenler.json');
  const urunOf = new Map(urunler.filter((u) => u.urunId).map((u) => [u.urunId, u]));
  const pdfler = readdirSync(PDF_KLASORU).filter((d) => d.endsWith('.pdf')).sort();

  const kayitlar = {};
  const bilinmeyen = [];
  const dokum = {
    belgeUyumsuz: [], okunamaz: [], kubAdi: [], eskiBicim: [], sigirHedefDegil: [], tablo: [], atilanGurultu: [], oranYuksek: [],
  };
  for (const dosya of pdfler) {
    const id = dosya.slice(0, -4);
    const u = urunOf.get(id);
    if (!u) { bilinmeyen.push(id); continue; }
    const rapor = { atilan: [] };
    const k = kubKaydi(metinCikar(arac, join(PDF_KLASORU, dosya)), urunKimligi(u, etkenler), rapor);
    kayitlar[id] = k;
    const ozet = { urunId: id, ad: u.ad };
    if (k.belgeUyumsuz) dokum.belgeUyumsuz.push({ ...ozet, neden: k.belgeNeden });
    if (rapor.neden) dokum.okunamaz.push({ ...ozet, neden: rapor.neden });
    if (k.kubAdi) dokum.kubAdi.push({ ...ozet, kubAdi: k.kubAdi });
    if (k.eskiBicim) dokum.eskiBicim.push(ozet);
    if (k.sigirHedefDegil) dokum.sigirHedefDegil.push(ozet);
    if (k.tablo) dokum.tablo.push(ozet);
    if (rapor.atilan.length) dokum.atilanGurultu.push({ ...ozet, satirlar: rapor.atilan });
    if (k.oran?.guven === 'yuksek') {
      const { mlPerKg, kapsam, ifade, cumle, yerBasinaMaxMl, yerBasinaYol, kisitlar } = k.oran;
      dokum.oranYuksek.push({ ...ozet, mlPerKg, kapsam, ifade, yerBasinaMaxMl, yerBasinaYol, kisitlar, yollar: k.yollar, cumle });
    }
  }
  const cekilmeTarihi = new Date().toISOString().slice(0, 10);
  writeFileSync(CIKTI, `${JSON.stringify({ cekilmeTarihi, urunler: kayitlar }, null, 2)}\n`);
  writeFileSync(RAPOR, `${JSON.stringify(dokum, null, 2)}\n`);

  const liste = Object.values(kayitlar);
  const say = (f) => liste.filter(f).length;
  console.log(`pdftotext: ${arac.yol} ${arac.kip.join(' ')} (${arac.surum})`);
  console.log(`İşlenen PDF: ${liste.length} / ${urunOf.size} ürün kimliği → ${CIKTI}`);
  console.log(`  metinYok: ${say((k) => k.metinYok)} (belgeUyumsuz ${dokum.belgeUyumsuz.length}, okunamaz ${dokum.okunamaz.length})`);
  console.log(`  yalnız 4.9 eksik: ${say((k) => !k.metinYok && k.doz === null)} · yalnız 4.11 eksik: ${say((k) => !k.metinYok && k.arinma === null)}`);
  console.log(`  eskiBicim ${dokum.eskiBicim.length} · tablo ${dokum.tablo.length} · sigirHedefDegil ${dokum.sigirHedefDegil.length} · kubAdi ${dokum.kubAdi.length}`);
  console.log(`  sığır arınması guven: yuksek ${say((k) => k.sigir.guven === 'yuksek')} · dusuk ${say((k) => k.sigir.guven === 'dusuk')}`);
  const sutTuru = (s) => (typeof s === 'string' ? s : 'saat');
  const dagilim = {};
  for (const k of liste.filter((x) => x.sigir.guven === 'yuksek')) dagilim[sutTuru(k.sigir.sut)] = (dagilim[sutTuru(k.sigir.sut)] ?? 0) + 1;
  console.log(`  yüksek güvende süt: ${Object.entries(dagilim).map(([a, n]) => `${a} ${n}`).join(' · ') || '-'}`);
  const oranli = liste.filter((x) => x.oran);
  const yuksekOran = oranli.filter((x) => x.oran.guven === 'yuksek');
  console.log(`  oran (sığır ml/kg): yuksek ${yuksekOran.length} (kapsam buzagi ${yuksekOran.filter((x) => x.oran.kapsam === 'buzagi').length})`
    + ` · dusuk ${oranli.length - yuksekOran.length} · yerBasinaMaxMl ${oranli.filter((x) => x.oran.yerBasinaMaxMl !== null).length}`
    + ` · yolsuz ${oranli.filter((x) => !x.yollar.length).length} → denetim listesi: ${RAPOR} (oranYuksek)`);
  console.log(`  yerBasinaYol ${oranli.filter((x) => x.oran.yerBasinaYol).length} · sabitDoz ${oranli.filter((x) => x.oran.sabitDoz).length}`
    + ` · kısıtlı (yaş/kilo) ${oranli.filter((x) => x.oran.kisitlar.length).length}`);
  for (const b of dokum.belgeUyumsuz) console.log(`  belgeUyumsuz: ${b.ad} (${b.urunId.slice(0, 8)}) — ${b.neden}`);
  for (const b of dokum.okunamaz) console.log(`  okunamaz: ${b.ad} (${b.urunId.slice(0, 8)}) — ${b.neden}`);
  const atilanSay = dokum.atilanGurultu.reduce((n, x) => n + x.satirlar.length, 0);
  console.log(`  atılan gürültü satırı (4.9 / 4.11 içinde): ${atilanSay} satır, ${dokum.atilanGurultu.length} ürün → ${RAPOR}`);
  if (bilinmeyen.length) console.log(`  urunler.json'da olmayan PDF (atlandı): ${bilinmeyen.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
