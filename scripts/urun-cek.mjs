// Ruhsatlı ürün listesi: Bakanlık ürün sorgusundan (hbs.tarbil.gov.tr) tek seferlik anlık görüntü → veri/urunler.json.
// Uygulama çalışırken siteye hiç bağlanmaz. Kullanım:
//   node scripts/urun-cek.mjs                      siteden çek (terapötik grup başına bir POST, Sığır + Buzağı), ham HTML'i kaydet, üret
//   node scripts/urun-cek.mjs --ham <klasor>       kaydedilmiş ham HTML'lerden yeniden üret (ağ yok)
//   node scripts/urun-cek.mjs --dosya <dosya.html> elle kaydedilmiş tek sonuç sayfasından üret (ağ yok)
// Ek: --rapor <dosya> eşleşmeyen etken maddeler dökümünü yazar; --tarih YYYY-AA-GG çekilme tarihini sabitler.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/arama.js';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://hbs.tarbil.gov.tr';
const ARAMA_URL = `${SITE}/Receipt/SearchProduct`;
const HAM_VARSAYILAN = join(KOK, '.superpowers/sdd/2026-11-14-vet-defter/urun-ham');
const BEKLEME_MS = 2500;
const UA = 'vet-defter-veri-cekici/1.0 (cevrimdisi arac; tek seferlik anlik goruntu)';
const HEDEF_TURLER = ['Sığır', 'Buzağı'];

// ---- Etken eşleme ----------------------------------------------------------------------------------------------
// Tuz / form sözcükleri: yalnız ayrı kelime olarak ve etken adının SONUNDA ya da başında atılır (kalsiyum, magnezyum
// gibi kendi başına etken olanlar buraya girmez).
const TUZ_KELIMELERI = new Set([
  'hidroklorur', 'dihidroklorur', 'mikronize', 'anhidrit', 'hidroklorid', 'hcl', 'hidrokloru', 'dihidrat', 'trihidrat', 'tetrahidrat', 'pentahidrat', 'hekzahidrat', 'heptahidrat', 'monohidrat', 'hidrat', 'anhidrat', 'anhidr',
  'laktat', 'meglumin', 'aseturat', 'dipropiyonat', 'hidroiyodur', 'baz', 'base', 'sodyum', 'potasyum', 'sulfat',
  'benzoat', 'maleat', 'tartarat', 'fosfat', 'klorur', 'asetat', 'sitrat', 'tuzu', 'ph', 'eur', 'bp', 'usp',
  'vet', 'ci', 'ig', 'ml', 'mg', 'g',
]);

// Açık takma ad tablosu (normalize edilmiş anahtar → etken kimliği). Tahmin yok: yalnız açık durumlar.
const TAKMA = {
  'prokain benzilpenisilin': 'penisilin_g_prokain', 'penisilin g prokain': 'penisilin_g_prokain',
  'benzilpenisilin prokain': 'penisilin_g_prokain', 'procaine benzylpenicillin': 'penisilin_g_prokain',
  'prokain penisilin g': 'penisilin_g_prokain', 'benzil penisilin prokain': 'penisilin_g_prokain',
  'benzatin benzilpenisilin': 'penisilin_g_benzatin', 'penisilin g benzatin': 'penisilin_g_benzatin',
  'benzilpenisilin benzatin': 'penisilin_g_benzatin', 'benzatin penisilin g': 'penisilin_g_benzatin',
  'benzil penisilin benzatin': 'penisilin_g_benzatin',
  'penetamat hidroiyodur': 'penetamat', 'penetamat hidroiyodid': 'penetamat',
  'klavulanik asit': 'amoksisilin_klavulanat', 'klavulanat': 'amoksisilin_klavulanat',
  'amoksisilin trihidrat': 'amoksisilin', 'amoksisilin sodyum': 'amoksisilin',
  'ampisilin trihidrat': 'ampisilin', 'ampisilin sodyum': 'ampisilin',
  'kloksasilin benzatin': 'kloksasilin', 'kloksasilin sodyum': 'kloksasilin', 'kloksasilin benzatin': 'kloksasilin',
  'sefaleksin monohidrat': 'sefaleksin', 'sefkinom sulfat': 'sefkinom',
  'seftiofur hcl': 'seftiofur', 'seftiofur hidroklorur': 'seftiofur', 'seftiofur sodyum': 'seftiofur',
  'sefoperazon sodyum': 'sefoperazon',
  'oksitetrasiklin dihidrat': 'oksitetrasiklin', 'oksitetrasiklin hcl': 'oksitetrasiklin', 'oksitetrasiklin hidroklorur': 'oksitetrasiklin',
  'doksisiklin hiklat': 'doksisiklin', 'doksisiklin hidroklorur': 'doksisiklin', 'doksisiklin hcl': 'doksisiklin',
  'tilmikosin fosfat': 'tilmikosin', 'tilozin tartarat': 'tilozin', 'tilozin fosfat': 'tilozin', 'tilosin': 'tilozin', 'tilosin tartarat': 'tilozin',
  'sefkuinom': 'sefkinom', 'penethamat hidriodid': 'penetamat', 'penetamat hidriodid': 'penetamat', 'd kloprostenol': 'kloprostenol', 'd kloprostenol sodyum': 'kloprostenol', 'magnezyum klorit': 'magnezyum', 'magnezyum klorur 6h20': 'magnezyum', 'seftiofur kristalin serbest asit': 'seftiofur', 'sefaleksin benzatin': 'sefaleksin', 'sefkuinom sulfat': 'sefkinom',
  'linkomisin hidroklorur': 'linkomisin', 'linkomisin hcl': 'linkomisin',
  'spektinomisin sulfat': 'spektinomisin', 'spektinomisin hidroklorur': 'spektinomisin', 'spektinomisin hcl': 'spektinomisin',
  'gentamisin sulfat': 'gentamisin', 'streptomisin sulfat': 'streptomisin', 'dihidrostreptomisin sulfat': 'dihidrostreptomisin',
  'neomisin sulfat': 'neomisin', 'kanamisin sulfat': 'kanamisin', 'kanamisin monosulfat': 'kanamisin',
  'enrofloksasin hidroklorur': 'enrofloksasin', 'danofloksasin mesilat': 'danofloksasin',
  'kolistin sulfat': 'kolistin', 'polimiksin e': 'kolistin', 'kolistin sulfat': 'kolistin',
  'sulfadiazin': 'sulfonamid_trimetoprim', 'trimetoprim': 'sulfonamid_trimetoprim',
  'sulfadoksin': 'sulfonamid_trimetoprim', 'sulfametoksazol': 'sulfonamid_trimetoprim',
  'sulfadimidin': 'sulfonamid_trimetoprim', 'sulfametazin': 'sulfonamid_trimetoprim',
  'imidokarb dipropiyonat': 'imidokarb', 'diminazen aseturat': 'diminazen', 'diminazen diaseturat': 'diminazen',
  'halofuginon laktat': 'halofuginon', 'halofuginon hidrobromur': 'halofuginon',
  'fluniksin meglumin': 'fluniksin_meglumin', 'fluniksin': 'fluniksin_meglumin',
  'tolfenamik asit': 'tolfenamik_asit', 'dipiron': 'metamizol', 'metamizol sodyum': 'metamizol', 'dipiron sodyum': 'metamizol',
  'kalsiyum boroglukonat': 'kalsiyum_boroglukonat', 'kalsiyum borogluconat': 'kalsiyum_boroglukonat',
  'kalsiyum glukonat boroglukonat': 'kalsiyum_boroglukonat',
  'kalsiyum klorur': 'oral_kalsiyum', 'kalsiyum propiyonat': 'oral_kalsiyum', 'kalsiyum formiat': 'oral_kalsiyum',
  'magnezyum sulfat': 'magnezyum', 'magnezyum klorur': 'magnezyum', 'magnezyum glukonat': 'magnezyum',
  'magnezyum hipofosfit': 'magnezyum', 'magnezyum boroglukonat': 'magnezyum',
  'glukoz': 'dekstroz', 'dekstroz monohidrat': 'dekstroz', 'glukoz monohidrat': 'dekstroz', 'susuz glukoz': 'dekstroz',
  'sodyum bikarbonat': 'sodyum_bikarbonat', 'sodyum hidrojen karbonat': 'sodyum_bikarbonat',
  'tiamin hidroklorur': 'tiamin', 'tiamin hcl': 'tiamin', 'vitamin b1': 'tiamin', 'b1 vitamini': 'tiamin',
  'dinoprost trometamin': 'dinoprost', 'dinoprost trometamol': 'dinoprost', 'dinoprost tromethamine': 'dinoprost',
  'kloprostenol sodyum': 'kloprostenol', 'deksametazon sodyum fosfat': 'deksametazon', 'deksametazon fosfat': 'deksametazon',
  'deksametazon sodyum': 'deksametazon', 'atropin sulfat': 'atropin', 'simetikon': 'dimetikon',
  'povidon iyot': 'povidon_iyot', 'povidon iyodur': 'povidon_iyot', 'povidone iodine': 'povidon_iyot', 'polividon iyot': 'povidon_iyot',
  'bakir sulfat': 'bakir_sulfat', 'bakir ii sulfat': 'bakir_sulfat', 'bakir sulfat pentahidrat': 'bakir_sulfat',
  'sipermetrin': 'sipermetrin', 'alfa sipermetrin': 'sipermetrin', 'beta sipermetrin': 'sipermetrin', 'zeta sipermetrin': 'sipermetrin',
  'parafin sivi': 'parafin_yagi', 'sivi parafin': 'parafin_yagi', 'sivi vazelin': 'parafin_yagi', 'parafin': 'parafin_yagi',
  'aktif komur': 'aktif_komur', 'karbo medicinalis': 'aktif_komur', 'metilen mavisi': 'metilen_mavisi', 'metiltionin klorur': 'metilen_mavisi',
  'propilen glikol': 'propilen_glikol', 'enilkonazol sulfat': 'enilkonazol', 'enilkonazol': 'enilkonazol',
  'ivermektin': 'ivermektin', 'doramektin': 'doramektin', 'eprinomektin': 'eprinomektin',
};
// Not: sulfonamid_trimetoprim, kombinasyonun herhangi bir bileşeniyle işaretlenir; tek bileşen listelense de ürün
// kombinasyon sayılır ve sonuçta tek kimlik (tekrarsız) yazılır. Üretici bilgisi yeterli değilse yine de sadece o kimlik.

/** Etken adı aday biçimleri: tam hâl, ardından baştan/sondan tuz kelimeleri atılmış hâller. */
function adaylar(ham) {
  const tam = normalize(ham.replace(/\([^)]*\)/g, ' '));
  const kelimeler = tam.split(' ').filter(Boolean);
  const sonuc = new Set([tam]);
  let k = [...kelimeler];
  while (k.length > 1 && TUZ_KELIMELERI.has(k[k.length - 1])) { k = k.slice(0, -1); sonuc.add(k.join(' ')); }
  k = [...kelimeler];
  while (k.length > 1 && TUZ_KELIMELERI.has(k[0])) { k = k.slice(1); sonuc.add(k.join(' ')); }
  return [...sonuc];
}

function etkenIndeksi(etkenler) {
  const idx = new Map();
  for (const e of etkenler) {
    // Ad ve parantez içi / "(…)" ayrıntıları ayrı adaylar; "+" ve "/" ile ayrılmış alt adlar da.
    const adlar = new Set([e.ad, e.ad.replace(/\([^)]*\)/g, ' ')]);
    for (const m of e.ad.matchAll(/\(([^)]*)\)/g)) adlar.add(m[1]);
    for (const a of [...adlar]) for (const p of a.split(/\s*[+/,]\s*/)) adlar.add(p);
    for (const a of adlar) { const n = normalize(a); if (n && !idx.has(n)) idx.set(n, e.id); }
    idx.set(normalize(e.id.replace(/_/g, ' ')), e.id);
  }
  for (const [a, id] of Object.entries(TAKMA)) if (etkenler.some((e) => e.id === id)) idx.set(normalize(a), id);
  return idx;
}

/** "Etkin Maddeler" hücresini ayrı maddelere böler. */
function maddeleriAyir(hucre) {
  return hucre.split(/\s*(?:[,;+]|\bve\b|\n)\s*/i).map((s) => s.trim()).filter(Boolean);
}

function etkenCoz(madde, idx) {
  for (const a of adaylar(madde)) if (idx.has(a)) return idx.get(a);
  return null;
}

// ---- HTML ayrıştırma ------------------------------------------------------------------------------------------
const VARLIKLAR = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function metinCoz(s) {
  return s.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
      if (k[0] === '#') return String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
      return VARLIKLAR[k.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ').trim();
}

/** Sonuç tablosundaki satırlar: [{ ad, yol, form, grup, atcvet, hedef, etkin, kubUrl, firma }] */
export function tabloAyristir(html) {
  const t = html.match(/<table[^>]*id="product-table"[^>]*>([\s\S]*?)<\/table>/i);
  if (!t) return [];
  const govde = t[1];
  const basliklar = [...(govde.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => normalize(metinCoz(m[1])));
  const sutun = (...adlar) => basliklar.findIndex((b) => adlar.some((a) => b.startsWith(a)));
  const i = {
    ad: sutun('urun adi'), yol: sutun('uygulama'), form: sutun('farmasotik'), grup: sutun('terapotik'),
    atcvet: sutun('atcvet'), hedef: sutun('hedef'), etkin: sutun('etkin'), kub: sutun('urun ozellikleri'), firma: sutun('ruhsat'),
  };
  if (Object.values(i).some((x) => x < 0)) throw new Error(`Beklenmeyen tablo başlıkları: ${basliklar.join(' | ')}`);
  const tbody = govde.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? govde;
  const satirlar = [];
  for (const tr of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const hucreler = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (hucreler.length < basliklar.length) continue;
    const href = hucreler[i.kub].match(/href="([^"]+)"/i)?.[1];
    satirlar.push({
      ad: metinCoz(hucreler[i.ad]), yol: metinCoz(hucreler[i.yol]), form: metinCoz(hucreler[i.form]),
      grup: metinCoz(hucreler[i.grup]), atcvet: metinCoz(hucreler[i.atcvet]), hedef: metinCoz(hucreler[i.hedef]),
      etkin: metinCoz(hucreler[i.etkin]), firma: metinCoz(hucreler[i.firma]),
      kubUrl: href ? new URL(metinCoz(href), SITE + '/').href : null,
    });
  }
  return satirlar;
}

function turKimligi(ad) { return normalize(ad).replace(/ /g, '_'); }
function liste(s) { return s.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean); }

// ---- Ağ --------------------------------------------------------------------------------------------------------
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let istekSayisi = 0;
async function istek(url, secenek = {}) {
  if (istekSayisi > 0) await bekle(BEKLEME_MS);
  istekSayisi += 1;
  const r = await fetch(url, { ...secenek, headers: { 'User-Agent': UA, 'Accept-Language': 'tr', ...(secenek.headers ?? {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} (${url})`);
  return r;
}

async function sitedenCek(hamKlasor) {
  mkdirSync(hamKlasor, { recursive: true });
  const g = await istek(ARAMA_URL);
  const sayfa = await g.text();
  const cerez = (g.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  writeFileSync(join(hamKlasor, '00-form.html'), sayfa);
  const gruplar = [...(sayfa.match(/<select[^>]*id="tedaviGrubu"[\s\S]*?<\/select>/i)?.[0] ?? '').matchAll(/<option[^>]*value="([^"]*)"/gi)]
    .map((m) => metinCoz(m[1])).filter(Boolean);
  if (gruplar.length === 0) throw new Error('Form sayfasında tedaviGrubu seçenekleri bulunamadı.');
  console.log(`${gruplar.length} terapötik grup, ${HEDEF_TURLER.length} hedef tür, ~${gruplar.length + HEDEF_TURLER.length} istek.`);
  const gonder = async (dosya, alanlar) => {
    const govde = new URLSearchParams();
    govde.append('Name', ''); govde.append('TAXNUMBER', ''); govde.append('atcvetKodu', '');
    for (const [k, v] of alanlar) govde.append(k, v);
    const r = await istek(`${ARAMA_URL}?Length=7`, {
      method: 'POST', body: govde,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: ARAMA_URL, Origin: SITE, 'X-Requested-With': 'XMLHttpRequest', ...(cerez ? { Cookie: cerez } : {}) },
    });
    const html = await r.text();
    writeFileSync(join(hamKlasor, dosya), html);
    console.log(`${dosya}: ${tabloAyristir(html).length} satır`);
  };
  const guvenli = (s) => normalize(s).replace(/ /g, '-');
  for (const g2 of gruplar) await gonder(`sigir--${guvenli(g2)}.html`, [['hedefTur', 'Sığır'], ['tedaviGrubu', g2]]);
  // Buzağı: tüm gruplar tek istekte (hedefTur=Buzağı, grup süzgeci yok).
  await gonder('buzagi--hepsi.html', [['hedefTur', 'Buzağı']]);
}

// ---- Üretim ----------------------------------------------------------------------------------------------------
function uret(dosyalar, etkenler, tarih) {
  const idx = etkenIndeksi(etkenler);
  const urunler = new Map();
  const eslesmeyen = new Map();
  const istat = [];
  let toplamSatir = 0, atilan = 0;
  for (const { ad: dosyaAdi, html } of dosyalar) {
    const satirlar = tabloAyristir(html);
    istat.push({ dosya: dosyaAdi, satir: satirlar.length });
    toplamSatir += satirlar.length;
    for (const s of satirlar) {
      const anahtar = s.kubUrl ? (new URL(s.kubUrl).searchParams.get('urunId') ?? s.kubUrl) : `${normalize(s.ad)}|${normalize(s.firma)}`;
      const maddeler = maddeleriAyir(s.etkin);
      const ids = [];
      for (const m of maddeler) {
        const id = etkenCoz(m, idx);
        if (id) { if (!ids.includes(id)) ids.push(id); }
        else eslesmeyen.set(m, (eslesmeyen.get(m) ?? 0) + 1);
      }
      const onceki = urunler.get(anahtar);
      if (onceki) { // başka sorgudan gelen aynı ürün: hedef türleri birleştir
        for (const t of liste(s.hedef).map(turKimligi)) if (!onceki.hedefTurler.includes(t)) onceki.hedefTurler.push(t);
        for (const id of ids) if (!onceki.etkenler.includes(id)) onceki.etkenler.push(id);
        continue;
      }
      urunler.set(anahtar, { s, ids, hedefTurler: liste(s.hedef).map(turKimligi), etkenler: ids });
    }
  }
  const cikti = [];
  for (const u of urunler.values()) {
    if (u.etkenler.length === 0) { atilan += 1; continue; }
    const { s } = u;
    cikti.push({
      ad: s.ad, firma: s.firma, form: s.form, etkenler: u.etkenler, hedefTurler: u.hedefTurler,
      kubUrl: s.kubUrl, cekilmeTarihi: tarih, kub: [], kubDogrulandi: null,
    });
  }
  cikti.sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.firma.localeCompare(b.firma, 'tr'));
  const sifir = etkenler.filter((e) => !cikti.some((u) => u.etkenler.includes(e.id))).map((e) => e.id);
  return { cikti, istat, toplamSatir, benzersiz: urunler.size, atilan, eslesmeyen, sifir };
}

function rapor(r, tarih) {
  const ust = [...r.eslesmeyen].sort((a, b) => b[1] - a[1]).slice(0, Number(arg('--ust') ?? 40));
  return [
    `Tarih: ${tarih}`, `İstek: ${istekSayisi}`,
    `Satır (tüm sorgular): ${r.toplamSatir}`, `Benzersiz ürün: ${r.benzersiz}`, `Tutulan: ${r.cikti.length}`, `Atılan (etkeni eşleşmeyen): ${r.atilan}`,
    '', 'Dosya başına satır:', ...r.istat.map((x) => `  ${x.dosya}: ${x.satir}`),
    '', `Eşleşmeyen etkin madde (ilk 40 / toplam ${r.eslesmeyen.size}):`, ...ust.map(([m, n]) => `  ${n}\t${m}`),
    '', `Ürünü olmayan etken (${r.sifir.length}):`, ...r.sifir.map((x) => `  ${x}`),
  ].join('\n');
}

// ---- Giriş -----------------------------------------------------------------------------------------------------
const arg = (ad) => { const i = process.argv.indexOf(ad); return i >= 0 ? process.argv[i + 1] : null; };
async function main() {
  const etkenler = JSON.parse(readFileSync(join(KOK, 'veri/etkenler.json'), 'utf8'));
  const tarih = arg('--tarih') ?? new Date().toISOString().slice(0, 10);
  let dosyalar;
  if (arg('--dosya')) {
    dosyalar = [{ ad: arg('--dosya'), html: readFileSync(arg('--dosya'), 'utf8') }];
  } else {
    const klasor = arg('--ham') ? resolve(arg('--ham')) : HAM_VARSAYILAN;
    if (!arg('--ham')) await sitedenCek(klasor);
    else if (!existsSync(klasor)) throw new Error(`Klasör yok: ${klasor}`);
    dosyalar = readdirSync(klasor).filter((f) => f.endsWith('.html') && !f.startsWith('00-')).sort()
      .map((f) => ({ ad: f, html: readFileSync(join(klasor, f), 'utf8') }));
  }
  const r = uret(dosyalar, etkenler, tarih);
  writeFileSync(join(KOK, 'veri/urunler.json'), JSON.stringify(r.cikti, null, 2) + '\n');
  const metaYol = join(KOK, 'veri/meta.json');
  const meta = JSON.parse(readFileSync(metaYol, 'utf8'));
  meta.urunListesiTarihi = tarih;
  writeFileSync(metaYol, JSON.stringify(meta, null, 2) + '\n');
  const metin = rapor(r, tarih);
  if (arg('--rapor')) writeFileSync(arg('--rapor'), metin + '\n');
  console.log(metin);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
}
