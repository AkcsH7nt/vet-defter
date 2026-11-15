// KÜB PDF'lerinden 4.9 (doz) ve 4.11 (arınma) bölümlerini çıkarır, sığır arınmasını okur → veri/kub.json.
// Kullanım: node scripts/kub-ayikla.mjs   (npm run kub-ayikla)
//   Girdi: .superpowers/kub-pdf/<urunId>.pdf (scripts/kub-indir.mjs). İndirme sürerken de çalışır: o an var olanları işler.
//   Metin aracı: pdftotext (Poppler ya da Xpdf). PATH'te yoksa bilinen yerler denenir; PDFTOTEXT ortam değişkeniyle
//   tam yol verilebilir.
// Metin kelimesi kelimesine alınır (lib/kub.js yalnız satır birleştirir, boşluk temizler); yapay zekâ yeniden yazımı yok.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bolumAyir, sigirArinmasi } from '../lib/kub.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const PDF_KLASORU = join(KOK, '.superpowers', 'kub-pdf');
const CIKTI = join(KOK, 'veri', 'kub.json');

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
function metinCikar(arac, pdf) {
  const r = spawnSync(arac.yol, [...arac.kip, '-enc', 'UTF-8', '-q', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || (r.status !== 0 && !r.stdout)) return null;
  return r.stdout;
}

/** Tek ürün kaydı: metin (null = çıkarılamadı) → { doz, arinma, sigir, metinYok }. */
export function kubKaydi(metin) {
  const { doz, arinma } = metin && metin.trim() ? bolumAyir(metin) : { doz: null, arinma: null };
  return { doz, arinma, sigir: sigirArinmasi(arinma), metinYok: doz === null && arinma === null };
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
  const urunler = JSON.parse(readFileSync(join(KOK, 'veri', 'urunler.json'), 'utf8').replace(/^﻿/, ''));
  const kimlikler = new Set(urunler.map((u) => u.urunId).filter(Boolean));
  const pdfler = readdirSync(PDF_KLASORU).filter((d) => d.endsWith('.pdf')).sort();

  const kayitlar = {};
  const bilinmeyen = [];
  for (const dosya of pdfler) {
    const id = dosya.slice(0, -4);
    if (!kimlikler.has(id)) { bilinmeyen.push(id); continue; }
    kayitlar[id] = kubKaydi(metinCikar(arac, join(PDF_KLASORU, dosya)));
  }
  const cekilmeTarihi = new Date().toISOString().slice(0, 10);
  writeFileSync(CIKTI, `${JSON.stringify({ cekilmeTarihi, urunler: kayitlar }, null, 2)}\n`);

  const liste = Object.values(kayitlar);
  const say = (f) => liste.filter(f).length;
  console.log(`pdftotext: ${arac.yol} ${arac.kip.join(' ')} (${arac.surum})`);
  console.log(`İşlenen PDF: ${liste.length} / ${kimlikler.size} ürün kimliği → ${CIKTI}`);
  console.log(`  metinYok (metin ya da 4.9 / 4.11 başlığı yok): ${say((k) => k.metinYok)}`);
  console.log(`  yalnız 4.9 eksik: ${say((k) => !k.metinYok && k.doz === null)} · yalnız 4.11 eksik: ${say((k) => !k.metinYok && k.arinma === null)}`);
  console.log(`  sığır arınması guven: yuksek ${say((k) => k.sigir.guven === 'yuksek')} · dusuk ${say((k) => k.sigir.guven === 'dusuk')}`);
  const yuksek = liste.filter((k) => k.sigir.guven === 'yuksek');
  const sutTuru = (s) => (typeof s === 'string' ? s : 'saat');
  const dagilim = {};
  for (const k of yuksek) dagilim[sutTuru(k.sigir.sut)] = (dagilim[sutTuru(k.sigir.sut)] ?? 0) + 1;
  console.log(`  yüksek güvende süt: ${Object.entries(dagilim).map(([a, n]) => `${a} ${n}`).join(' · ') || '-'}`);
  if (bilinmeyen.length) console.log(`  urunler.json'da olmayan PDF (atlandı): ${bilinmeyen.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
