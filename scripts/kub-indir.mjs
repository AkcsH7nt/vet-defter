// KÜB PDF'lerini Bakanlık sitesinden tek seferlik indirir → .superpowers/kub-pdf/<urunId>.pdf (git dışı).
// Yalnız veri/urunler.json'daki kubUrl'ler; sıralı, istekler arası 2500 ms, genel User-Agent.
//   node scripts/kub-indir.mjs                 tümünü indir (var olan PDF atlanır)
//   node scripts/kub-indir.mjs --sinir N       yalnız ilk N ürün (deneme)
//   node scripts/kub-indir.mjs --yeniden-dene  yalnız önceki raporda hatalı olanlar
// 3 ardışık hata → durur. _rapor.json her 25 üründe ve sonda yazılır.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KLASOR = join(KOK, '.superpowers/kub-pdf');
const BEKLEME_MS = 2500;
const UA = 'vet-defter-veri-cekici/1.0 (cevrimdisi arac; tek seferlik anlik goruntu)';
const ARDISIK_HATA_SINIRI = 3;

/** Baştaki 5 bayt "%PDF-" ise PDF'tir. */
export function pdfMi(bayt) {
  return !!bayt && bayt.length >= 5 && bayt[0] === 0x25 && bayt[1] === 0x50 && bayt[2] === 0x44 && bayt[3] === 0x46 && bayt[4] === 0x2d;
}

/** urunId → güvenli dosya adı (yalnız harf/rakam/tire; aksi halde null). */
export function dosyaAdi(urunId) {
  if (typeof urunId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(urunId)) return null;
  return `${urunId}.pdf`;
}

const arg = (ad) => { const i = process.argv.indexOf(ad); return i >= 0 ? process.argv[i + 1] : null; };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const urunler = JSON.parse(readFileSync(join(KOK, 'veri/urunler.json'), 'utf8'));
  mkdirSync(KLASOR, { recursive: true });
  const raporYol = join(KLASOR, '_rapor.json');
  let liste = [];
  const goruldu = new Set();
  for (const u of urunler) {
    if (!u.urunId || !u.kubUrl || goruldu.has(u.urunId) || !dosyaAdi(u.urunId)) continue;
    goruldu.add(u.urunId); liste.push({ urunId: u.urunId, kubUrl: u.kubUrl });
  }
  if (process.argv.includes('--yeniden-dene')) {
    let onceki = { hatali: [] };
    try { onceki = JSON.parse(readFileSync(raporYol, 'utf8')); } catch { /* yok */ }
    const h = new Set((onceki.hatali ?? []).map((x) => x.urunId));
    liste = liste.filter((u) => h.has(u.urunId));
  }
  if (arg('--sinir')) liste = liste.slice(0, Number(arg('--sinir')));

  const rapor = { indirilen: 0, atlanan: 0, hatali: [], baslangic: new Date().toISOString(), bitis: null };
  const yaz = () => writeFileSync(raporYol, JSON.stringify(rapor, null, 2) + '\n');
  let istekSayisi = 0, ardisik = 0, durdu = false;

  for (let i = 0; i < liste.length; i += 1) {
    const { urunId, kubUrl } = liste[i];
    const sira = `${i + 1}/${liste.length}`;
    const yol = join(KLASOR, dosyaAdi(urunId));
    if (existsSync(yol)) {
      rapor.atlanan += 1; console.log(`${sira} ${urunId} skip`);
    } else {
      if (istekSayisi > 0) await bekle(BEKLEME_MS);
      istekSayisi += 1;
      let durum = null;
      try {
        const r = await fetch(kubUrl, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr' } });
        if (!r.ok) durum = `HTTP ${r.status}`;
        else {
          const bayt = new Uint8Array(await r.arrayBuffer());
          if (!pdfMi(bayt)) durum = `PDF degil (${r.headers.get('content-type') ?? '?'}, ${bayt.length} bayt)`;
          else { writeFileSync(yol + '.part', bayt); renameSync(yol + '.part', yol); }
        }
      } catch (e) { durum = `ag hatasi: ${e.message}`; }
      if (durum) {
        rapor.hatali.push({ urunId, durum }); ardisik += 1; console.log(`${sira} ${urunId} error ${durum}`);
      } else {
        rapor.indirilen += 1; ardisik = 0; console.log(`${sira} ${urunId} ok`);
      }
      if (ardisik >= ARDISIK_HATA_SINIRI) { durdu = true; console.error(`${ARDISIK_HATA_SINIRI} ardisik hata: durduruldu.`); break; }
    }
    if ((i + 1) % 25 === 0) yaz();
  }
  rapor.bitis = new Date().toISOString();
  if (durdu) rapor.durdu = true;
  yaz();
  console.log(`Bitti: indirilen ${rapor.indirilen}, atlanan ${rapor.atlanan}, hatali ${rapor.hatali.length}, istek ${istekSayisi}`);
  if (durdu) process.exit(2);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
}
