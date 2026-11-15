// KÜB bölüm 2 (bileşim) ile ürün etken listesi taraması (K8-A8): bileşimin etkin madde kısmında adı geçen, etkenler.json'da
// tanımlı ama ürünün `etkenler` listesinde olmayan etkenler. Ürün etken listesi Bakanlık ürün sorgusundan gelir
// (scripts/urun-cek.mjs); KÜB bileşimi ikinci kaynaktır. Eksik etken, ürünü "tek etkenli, protokole uygun" gösterebilir
// (k8b I6: Vetamplius Mucosol'da bromheksin).
// Kullanım: node scripts/etken-tara.mjs   (npm run etken-tara)
//   Girdi: .superpowers/kub-pdf/<urunId>.pdf, veri/urunler.json, veri/etkenler.json. pdftotext gerekir (kub-ayikla ile aynı).
//   Çıktı: .superpowers/kub-pdf/_etken-tara.json + özet. Düzeltme urun-cek.mjs kuralıyla yapılır.
//   --yaz: veri/urunler.json her ürüne `digerEtkenler` yazar (etken kaydı olmayan etkin maddelerin KÜB §2 aynen yazımı).
//   Yeniden üretim sırası: npm run urun-cek -- --ham <klasör> → npm run etken-tara -- --yaz (urun-cek önceki
//   digerEtkenler'i urunId ile taşır; tarama günceller) → npm run kub-ayikla.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  belgeBilgisi, etkenAnahtarlari, kucukHarf, sesAnahtari, yaklasikIcerir,
} from '../lib/kub.js';
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
 * tuz sözcüğü ("dihidrat") tek başına anahtar olmaz. Birden çok etkende ortak olan anahtar ("penisilin") kullanılmaz
 * (tekil: false → ortak anahtarlar da kalır; "bu ad herhangi bir etkenin adı mı" sorusu için).
 * @returns {Map<string, { sozler: string[], ifadeler: string[][] }>}
 */
export function taramaAnahtarlari(etkenler, { tekil = true } = {}) {
  const harita = new Map();
  for (const e of etkenler) {
    const { adlar } = urunKimligi({ ad: '', etkenler: [e.id] }, etkenler).etkenler[0];
    const tumAdlar = [e.id, ...adlar].map(sozAnahtari).filter((s) => s.length);
    const sozKaynagi = [sozAnahtari(e.id), sozAnahtari(e.ad.replace(/\([^)]*\)/g, ' ')) /* parantez içi açıklama anahtar değil */, ...tumAdlar.filter((s) => s.length === 1)];
    const sozler = [...new Set(sozKaynagi.flat().filter((s) => etkenAnahtarlari([s]).length && !BILESIM_SOZU.has(s)).map(sesAnahtari))];
    const ifadeler = tumAdlar.filter((s) => s.length > 1).map((s) => s.map(sesAnahtari));
    harita.set(e.id, { sozler, ifadeler });
  }
  if (!tekil) return harita;
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

// Bakanlık adındaki ayırt edici olmayan sözcükler (tuz, form): KÜB'de aranmaz.
const TUZ_SOZU = new Set(['sulfat', 'sodyum', 'potasyum', 'hidroklorur', 'hidroklorid', 'hcl', 'monohidrat', 'dihidrat', 'trihidrat',
  'tetrahidrat', 'anhidrat', 'anhidr', 'asetat', 'bromur', 'bromid', 'vitamin', 'olarak', 'baz', 'tuzu', 'hidrat',
  'kalsiyum', 'magnezyum']); // katyon adı tek başına ayırt etmez ("kalsiyum glukoheptonat" ≠ "Kalsiyum glukonat")
// Bileşim satırında adı ayıran işaretler: miktar ifadesi, nokta dizisi / "…", ":" ve tablo sütun boşluğu (8+ boşluk).
const MIKTAR = /(?<![\p{L}\d])\d+(?:[.,]\s?\d+)*\s*(?:mg|g|gr|µg|μg|mcg|iu|ıu|i\.u\.|ie|ml|%|ü|ünite)(?!\p{L})|[.·]{2,}|…+|:|\s{8,}/giu;
const ESDEGER = /eşdeğer|eşdeger/iu;

const tokenle = (s) => [...String(s).matchAll(/[\p{L}\d]+/gu)].map((m) => ({ bas: m.index, son: m.index + m[0].length, k: sesAnahtari(kucukHarf(m[0])) }));
// Sözcük eşleşmesi: aynı, Türkçe ekli ("…in", "…e"), ya da ≥ 7 harfte bir harf farkı ("Arginin" ~ "arjinin").
const tokenEsit = (t, k) => t === k || (k.length >= 5 && t.startsWith(k) && t.length - k.length <= 4)
  || (k.length >= 7 && Math.abs(t.length - k.length) <= 1 && yaklasikIcerir(t, k, 1));

/**
 * "Bu ad bir etkenin adı mı" için anahtarlar: tek sözcükte yalnız ayırt edici olanlar ("penisilin" değil — "Benetamin
 * penisilin" tanımlı bir etken değildir), çok sözcüklü adların hepsi ("Kalsiyum glukonat" iki etkende ortak olsa da).
 */
export function bilinenAnahtarlar(etkenler) {
  const tekil = taramaAnahtarlari(etkenler);
  const tum = taramaAnahtarlari(etkenler, { tekil: false });
  return new Map([...tum].map(([id, a]) => [id, { sozler: tekil.get(id).sozler, ifadeler: a.ifadeler }]));
}

/** Parçanın sözcüklerinde etkenler.json'daki bir etken adı var mı (ör. "Benzilpenisilin prokain", "Kalsiyum glukonat"). */
function bilinenEtkenVar(parca, anahtarlar) {
  const sozler = tokenle(parca).map((t) => t.k);
  for (const { sozler: s, ifadeler } of anahtarlar.values()) {
    if (s.some((k) => sozler.some((t) => sozEsit(t, k)))) return true;
    if (ifadeler.some((ifade) => sozler.some((_, i) => ifade.every((k, j) => sozler[i + j] === k)))) return true;
  }
  return false;
}

/**
 * Bakanlık listesinde etken kaydı olmayan etkin maddelerin (eslesmeyen) KÜB bölüm 2 etkin kısmındaki AYNEN yazımı.
 * Arama sırası: (1) maddenin ayırt edici sözcüklerinin hepsinin geçtiği satır, (2) maddenin sözcük dizisi ("Vitamin B12"),
 * (3) en ayırt edici (en uzun) sözcüğün geçtiği satırlar. Bulunan satırın miktar / nokta dizisi / sütun boşluğuyla
 * ayrılmış parçası ad olarak alınır ("Prednizolon………10 mg" → "Prednizolon"). Parça "…'e eşdeğer" ifadesiyse sonraki
 * geçiş denenir; parça etkenler.json'daki bir etkenin adıysa ("Benzilpenisilin prokain", "Kalsiyum glukonat") madde
 * o etken sayılır ve yazılmaz. KÜB metni yoksa ya da madde bileşimde bulunamazsa yazılmaz.
 * @param {string|null} metin  KÜB metni
 * @param {string[]} eslesmeyen  Bakanlık "Etkin Maddeler" hücresinden etkenler.json'a eşlenmeyen adlar
 * @param {object[]} etkenler  veri/etkenler.json
 * @param {Map} [anahtarlar]  taramaAnahtarlari(etkenler)
 * @returns {string[]}
 */
export function digerEtkenAdlari(metin, eslesmeyen, etkenler, anahtarlar = bilinenAnahtarlar(etkenler)) {
  if (typeof metin !== 'string' || !eslesmeyen?.length) return [];
  const b = belgeBilgisi(metin);
  if (b.tur !== 'kub' && b.tur !== 'prospektus') return [];
  const kisim = etkinKisim(b.bilesim);
  if (!kisim) return [];
  const sozler = tokenle(kisim);
  const duzMetin = metin.replace(/\s+/g, ' '); // aynen denetimi (yalnız boşluk sadeleşir)
  const satirOf = (i) => {
    const bas = kisim.lastIndexOf('\n', sozler[i].bas) + 1;
    const n = kisim.indexOf('\n', sozler[i].son);
    return { bas, son: n < 0 ? kisim.length : n };
  };
  const parcaOf = (i) => {
    const { bas, son } = satirOf(i);
    const satir = kisim.slice(bas, son);
    const kesimler = [0, ...[...satir.matchAll(MIKTAR)].flatMap((m) => [m.index, m.index + m[0].length]), satir.length];
    const yer = sozler[i].bas - bas;
    for (let n = 0; n + 1 < kesimler.length; n += 1) {
      if (kesimler[n] <= yer && yer < kesimler[n + 1]) {
        return satir.slice(kesimler[n], kesimler[n + 1])
          .replace(/^[\s,;.\-–(]+|[\s,;.\-–(]+$/gu, '').replace(/\s+(?:içerir|ihtiva\s+eder)$/iu, '').replace(/\s+/g, ' ');
      }
    }
    return '';
  };
  const sonuc = [];
  for (const ad of eslesmeyen) {
    const ana = kucukHarf(ad.replace(/\([^)]*\)/g, ' ')).split(' ').filter(Boolean);
    const parantez = kucukHarf((ad.match(/\(([^)]*)\)/) ?? [])[1] ?? '').split(' ').filter(Boolean);
    const ayirt = [...ana, ...parantez].filter((s) => s.length >= 4 && !TUZ_SOZU.has(s) && /\p{L}/u.test(s)).map(sesAnahtari);
    const adaylar = []; // söz dizinleri, öncelik sırasıyla
    let tamAdaySayisi = 0; // (1) ve (2) adayları: yedek (yalnız sözcük) yalnız bunlardan
    const ekle = (i) => { if (i >= 0 && !adaylar.includes(i)) adaylar.push(i); };
    if (ayirt.length) { // (1) bütün ayırt edici sözcüklerin geçtiği satır
      sozler.forEach((s, i) => {
        if (!ayirt.some((k) => tokenEsit(s.k, k))) return;
        const { bas, son } = satirOf(i);
        const satirSoz = sozler.filter((x) => x.bas >= bas && x.son <= son).map((x) => x.k);
        if (ayirt.every((k) => satirSoz.some((t) => tokenEsit(t, k)))) ekle(i);
      });
    }
    for (const dizi of [ana, parantez].filter((d) => d.length).map((d) => d.map(sesAnahtari))) { // (2) sözcük dizisi
      sozler.forEach((_, i) => { if (dizi.every((k, n) => sozler[i + n] && (n === dizi.length - 1 ? tokenEsit(sozler[i + n].k, k) : sozler[i + n].k === k))) ekle(i); });
    }
    tamAdaySayisi = adaylar.length;
    const enAyirt = [...ayirt].reverse().sort((x, y) => y.length - x.length)[0]; // (3) en uzun (eşitse sondaki) sözcük
    if (enAyirt) sozler.forEach((s, i) => { if (tokenEsit(s.k, enAyirt)) ekle(i); });
    let secilen = null;
    let yedek = null;
    for (const [sira, i] of adaylar.entries()) {
      const parca = parcaOf(i);
      if (parca.length >= 2 && bilinenEtkenVar(parca, anahtarlar)) continue; // bilinen etkenin adı: dış madde değil
      if (parca.length < 2 || parca.length > 60 || ESDEGER.test(parca) || !duzMetin.includes(parca)) {
        if (sira < tamAdaySayisi) yedek ??= kisim.slice(sozler[i].bas, sozler[i].son);
        continue;
      }
      secilen = parca;
      break;
    }
    const adKub = secilen ?? yedek;
    if (adKub && !sonuc.includes(adKub)) sonuc.push(adKub);
  }
  return sonuc;
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
  const metinler = new Map();
  for (const dosya of readdirSync(PDF_KLASORU).filter((d) => d.endsWith('.pdf')).sort()) {
    const u = urunOf.get(dosya.slice(0, -4));
    const metin = u ? metinCikar(arac, join(PDF_KLASORU, dosya)) : null;
    if (!metin) continue;
    taranan += 1;
    metinler.set(u.urunId, metin);
    const eksik = eksikEtkenler(metin, u, etkenler, anahtarlar);
    if (eksik.length) sonuc.push({ urunId: u.urunId, ad: u.ad, etkenler: u.etkenler, kubBilesimindeEksik: eksik.map((e) => e.id) });
  }
  // Bakanlık listesinde etkenler.json karşılığı olmayan etkin maddeler (yalnız urunler.json'daki ürünler)
  const ham = existsSync(HAM)
    ? bakanlikEslesmeyen(readdirSync(HAM).filter((f) => f.endsWith('.html') && !f.startsWith('00-')).map((f) => readFileSync(join(HAM, f), 'utf8')), etkenler)
    : new Map();
  // digerEtkenler: Bakanlık listesinde etken kaydı olmayan maddenin KÜB §2'deki aynen yazımı (KÜB yoksa / bulunamazsa yok)
  const bilinen = bilinenAnahtarlar(etkenler);
  const diger = new Map(urunler.map((u) => [u, digerEtkenAdlari(metinler.get(u.urunId) ?? null, ham.get(u.urunId) ?? [], etkenler, bilinen)]));
  const tanimsiz = urunler.filter((u) => (ham.get(u.urunId) ?? []).length)
    .map((u) => ({ urunId: u.urunId, ad: u.ad, etkenler: u.etkenler, tanimsizMaddeler: ham.get(u.urunId), digerEtkenler: diger.get(u) }));
  writeFileSync(RAPOR, `${JSON.stringify({ taranan, eksikli: sonuc.length, urunler: sonuc, tanimsizMaddeliUrun: tanimsiz.length, tanimsiz }, null, 2)}\n`);
  console.log(`Taranan KÜB: ${taranan} · bileşimde olup etken listesinde olmayan etkeni olan ürün: ${sonuc.length} → ${RAPOR}`);
  for (const s of sonuc) console.log(`  ${s.ad} (${s.urunId.slice(0, 8)}) [${s.etkenler.join(', ')}] — KÜB bileşiminde ayrıca: ${s.kubBilesimindeEksik.join(', ')}`);
  const madde = new Map();
  for (const t of tanimsiz) for (const m of t.tanimsizMaddeler) madde.set(m, (madde.get(m) ?? 0) + 1);
  console.log(`Bakanlık listesinde etkenler.json karşılığı olmayan etkin maddesi olan ürün: ${tanimsiz.length} (farklı madde: ${madde.size}; `
    + `en sık: ${[...madde].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, n]) => `${m} ${n}`).join(', ')}) → ${RAPOR} (tanimsiz)`);
  const dolu = urunler.filter((u) => diger.get(u).length);
  console.log(`digerEtkenler (KÜB §2'de bulunan, etken kaydı olmayan): ${dolu.length} ürün`);
  if (process.argv.includes('--yaz')) {
    // alan sırası: etkenler'den hemen sonra
    const yeni = urunler.map((u) => Object.fromEntries(Object.entries({ ...u, digerEtkenler: undefined })
      .flatMap(([k, v]) => (k === 'digerEtkenler' ? [] : k === 'etkenler' ? [[k, v], ['digerEtkenler', diger.get(u)]] : [[k, v]]))));
    writeFileSync(join(KOK, 'veri', 'urunler.json'), `${JSON.stringify(yeni, null, 2)}
`);
    console.log(`  → veri/urunler.json digerEtkenler yazıldı (${urunler.length} ürün)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
