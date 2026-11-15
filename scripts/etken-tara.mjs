// KÜB bölüm 2 (bileşim) ile ürün etken listesi taraması (K8-A8): bileşimin etkin madde kısmında adı geçen, etkenler.json'da
// tanımlı ama ürünün `etkenler` listesinde olmayan etkenler. Ürün etken listesi Bakanlık ürün sorgusundan gelir
// (scripts/urun-cek.mjs); KÜB bileşimi ikinci kaynaktır. Eksik etken, ürünü "tek etkenli, protokole uygun" gösterebilir
// (k8b I6: Vetamplius Mucosol'da bromheksin).
// Kullanım: node scripts/etken-tara.mjs   (npm run etken-tara)
//   Girdi: .superpowers/kub-pdf/<urunId>.pdf, veri/urunler.json, veri/etkenler.json. pdftotext gerekir (kub-ayikla ile aynı).
//   Çıktı: .superpowers/kub-pdf/_etken-tara.json + özet. Veri dosyalarını DEĞİŞTİRMEZ; düzeltme urun-cek.mjs kuralıyla yapılır.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { belgeBilgisi, etkenAnahtarlari, kucukHarf, sesAnahtari } from '../lib/kub.js';
import { metinCikar, pdftotextBul, urunKimligi } from './kub-ayikla.mjs';
import {
  KAPSAYAN, KUB_BILESIM_EK, etkenIndeksi, maddeleriAyir, tabloAyristir, urunEtkenleri,
} from './urun-cek.mjs';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const PDF_KLASORU = join(KOK, '.superpowers', 'kub-pdf');
const RAPOR = join(PDF_KLASORU, '_etken-tara.json');
const HAM = join(KOK, '.superpowers', 'sdd', '2026-11-14-vet-defter', 'urun-ham');

/**
 * Bakanlık listesinde (urun-cek ham HTML) ürünün etkenler.json'da karşılığı olmayan etkin maddeleri: urunId → ad listesi.
 * Bu maddeler ürünün `etkenler` dizisinde görünmez (ör. prednizolon, framisetin); ürün "tek etkenli" sanılabilir.
 * @param {string[]} dosyalar  ham HTML içerikleri
 * @returns {Map<string, string[]>}
 */
export function bakanlikEslesmeyen(dosyalar, etkenler) {
  const idx = etkenIndeksi(etkenler);
  const sonuc = new Map();
  for (const html of dosyalar) {
    for (const s of tabloAyristir(html)) {
      let id = null;
      try { id = new URL(s.kubUrl).searchParams.get('urunId'); } catch { /* KÜB bağlantısı yok */ }
      if (!id) continue;
      const { eslesmeyen } = urunEtkenleri([...maddeleriAyir(s.etkin), ...(KUB_BILESIM_EK[id] ?? [])], s.yol, idx);
      sonuc.set(id, [...new Set([...(sonuc.get(id) ?? []), ...eslesmeyen])]);
    }
  }
  return sonuc;
}

/**
 * Bileşim metninin etkin madde kısmı: "Yardımcı madde(ler)" başlığından (yardımcı maddeler etken değildir) ya da
 * prospektüste sonraki başlıktan ("FARMAKOLOJİK ÖZELLİKLERİ", "ENDİKASYONLARI" …) önce.
 */
export function etkinKisim(bilesim) {
  if (typeof bilesim !== 'string') return null;
  const i = bilesim.search(/yard[ıiIİ]mc[ıiIİ]\s+madde|farmakoloj[iİı]k|end[iİı]kasyon|kullan[ıiIİ]m\s+yer|hedef\s+t[üÜ]r/iu);
  return i < 0 ? bilesim : bilesim.slice(0, i);
}

// Bileşim başlıklarında geçen genel sözcükler ("Aktif madde"): tek başına etken anahtarı olamaz (aktif_komur → "aktif").
const BILESIM_SOZU = new Set(['aktif', 'madde', 'etkin']);
const sozAnahtari = (s) => kucukHarf(String(s).replace(/_/g, ' ')).split(' ').filter(Boolean);

/**
 * Etken başına tarama anahtarları: { sozler: tek sözcük anahtarları, ifadeler: çok sözcüklü adların sözcük dizileri }.
 * Tek sözcük anahtarı yalnız etken adından / kimliğinden ve tek sözcüklü takma addan gelir (ayırt edici: ≥ 5 harf,
 * genel tuz/form sözcüğü değil); çok sözcüklü takma ad ("oksitetrasiklin dihidrat") yalnız bütün olarak aranır — içindeki
 * tuz sözcüğü ("dihidrat") tek başına anahtar olmaz. Birden çok etkende ortak olan anahtar ("penisilin") kullanılmaz.
 * @returns {Map<string, { sozler: string[], ifadeler: string[][] }>}
 */
export function taramaAnahtarlari(etkenler) {
  const harita = new Map();
  for (const e of etkenler) {
    const { adlar } = urunKimligi({ ad: '', etkenler: [e.id] }, etkenler).etkenler[0];
    const tumAdlar = [e.id, ...adlar].map(sozAnahtari).filter((s) => s.length);
    const sozKaynagi = [sozAnahtari(e.id), sozAnahtari(e.ad), ...tumAdlar.filter((s) => s.length === 1)];
    const sozler = [...new Set(sozKaynagi.flat().filter((s) => etkenAnahtarlari([s]).length && !BILESIM_SOZU.has(s)).map(sesAnahtari))];
    const ifadeler = tumAdlar.filter((s) => s.length > 1).map((s) => s.map(sesAnahtari));
    harita.set(e.id, { sozler, ifadeler });
  }
  const sayac = new Map();
  const say = (a) => sayac.set(a, (sayac.get(a) ?? 0) + 1);
  for (const { sozler, ifadeler } of harita.values()) new Set([...sozler, ...ifadeler.map((i) => i.join(' '))]).forEach(say);
  for (const [id, a] of harita) {
    harita.set(id, { sozler: a.sozler.filter((s) => sayac.get(s) === 1), ifadeler: a.ifadeler.filter((i) => sayac.get(i.join(' ')) === 1) });
  }
  return harita;
}

// Sözcük eşleşmesi: aynı sözcük ya da Türkçe ekli hâli ("oksitetrasiklinin"); sözcük ortası değil ("dikloksasilin" ≠ kloksasilin).
const sozEsit = (soz, anahtar) => soz === anahtar || (anahtar.length >= 5 && soz.startsWith(anahtar) && soz.length - anahtar.length <= 4);

/**
 * KÜB bileşiminde (etkin kısım) adı geçen ama ürünün etken listesinde olmayan etkenler. Kombinasyon kimliğinin bileşeni
 * (amoksisilin_klavulanat → amoksisilin) sayılmaz; eşleşme sözcük başından ("tetrasiklin" "oksitetrasiklin" içinde değil).
 * @param {string} metin  KÜB metni (pdftotext)
 * @param {{ ad: string, etkenler: string[] }} urun
 * @param {object[]} etkenler  veri/etkenler.json
 * @param {Map} [anahtarlar]  taramaAnahtarlari(etkenler) (çok ürün taranırken bir kez hesaplanır)
 * @returns {{ id: string, ad: string }[]}
 */
export function eksikEtkenler(metin, urun, etkenler, anahtarlar = taramaAnahtarlari(etkenler)) {
  const b = belgeBilgisi(metin);
  if (b.tur !== 'kub' && b.tur !== 'prospektus') return [];
  const kisim = etkinKisim(b.bilesim);
  if (!kisim) return [];
  const sozler = kucukHarf(kisim).split(' ').filter(Boolean).map(sesAnahtari);
  const kapsanan = new Set([...(urun.etkenler ?? []), ...(urun.etkenler ?? []).flatMap((id) => KAPSAYAN[id] ?? [])]);
  const bulunan = new Set();
  for (const [id, a] of anahtarlar) {
    const var1 = a.sozler.some((k) => sozler.some((s) => sozEsit(s, k)))
      || a.ifadeler.some((ifade) => sozler.some((_, i) => ifade.every((k, j) => (j === ifade.length - 1 ? sozEsit(sozler[i + j] ?? '', k) : sozler[i + j] === k))));
    if (var1) bulunan.add(id);
  }
  for (const id of bulunan) for (const k of KAPSAYAN[id] ?? []) kapsanan.add(k); // bileşimde amoksisilin + klavulanik asit
  return etkenler.filter((e) => bulunan.has(e.id) && !kapsanan.has(e.id)).map((e) => ({ id: e.id, ad: e.ad }));
}

function main() {
  const arac = pdftotextBul();
  if (!arac || !existsSync(PDF_KLASORU)) {
    console.error('pdftotext ya da PDF klasörü yok (npm run kub-indir; pdftotext için scripts/kub-ayikla.mjs açıklamasına bakın).');
    process.exit(1);
  }
  const oku = (d) => JSON.parse(readFileSync(join(KOK, 'veri', d), 'utf8').replace(/^﻿/, ''));
  const urunler = oku('urunler.json');
  const etkenler = oku('etkenler.json');
  const urunOf = new Map(urunler.filter((u) => u.urunId).map((u) => [u.urunId, u]));
  const sonuc = [];
  let taranan = 0;
  const anahtarlar = taramaAnahtarlari(etkenler);
  for (const dosya of readdirSync(PDF_KLASORU).filter((d) => d.endsWith('.pdf')).sort()) {
    const u = urunOf.get(dosya.slice(0, -4));
    const metin = u ? metinCikar(arac, join(PDF_KLASORU, dosya)) : null;
    if (!metin) continue;
    taranan += 1;
    const eksik = eksikEtkenler(metin, u, etkenler, anahtarlar);
    if (eksik.length) sonuc.push({ urunId: u.urunId, ad: u.ad, etkenler: u.etkenler, kubBilesimindeEksik: eksik.map((e) => e.id) });
  }
  // Bakanlık listesinde etkenler.json karşılığı olmayan etkin maddeler (yalnız urunler.json'daki ürünler)
  const ham = existsSync(HAM)
    ? bakanlikEslesmeyen(readdirSync(HAM).filter((f) => f.endsWith('.html') && !f.startsWith('00-')).map((f) => readFileSync(join(HAM, f), 'utf8')), etkenler)
    : new Map();
  const tanimsiz = urunler.filter((u) => (ham.get(u.urunId) ?? []).length)
    .map((u) => ({ urunId: u.urunId, ad: u.ad, etkenler: u.etkenler, tanimsizMaddeler: ham.get(u.urunId) }));
  writeFileSync(RAPOR, `${JSON.stringify({ taranan, eksikli: sonuc.length, urunler: sonuc, tanimsizMaddeliUrun: tanimsiz.length, tanimsiz }, null, 2)}\n`);
  console.log(`Taranan KÜB: ${taranan} · bileşimde olup etken listesinde olmayan etkeni olan ürün: ${sonuc.length} → ${RAPOR}`);
  for (const s of sonuc) console.log(`  ${s.ad} (${s.urunId.slice(0, 8)}) [${s.etkenler.join(', ')}] — KÜB bileşiminde ayrıca: ${s.kubBilesimindeEksik.join(', ')}`);
  const madde = new Map();
  for (const t of tanimsiz) for (const m of t.tanimsizMaddeler) madde.set(m, (madde.get(m) ?? 0) + 1);
  console.log(`Bakanlık listesinde etkenler.json karşılığı olmayan etkin maddesi olan ürün: ${tanimsiz.length} (farklı madde: ${madde.size}; `
    + `en sık: ${[...madde].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, n]) => `${m} ${n}`).join(', ')}) → ${RAPOR} (tanimsiz)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
