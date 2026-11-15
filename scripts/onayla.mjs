// Hekim onay araçları. Kullanım:
//   npm run onayla -- <id> [--kim "Hekim"] [--kaldir]
//   npm run onay-durumu
// Onay, kaydın içerik özetiyle birlikte yazılır; içerik değişirse onay kendiliğinden düşer (lib/onay.js).
// Dosyalar elle biçimlendirilmiştir: yalnız ilgili kaydın "onay" bölümü metin olarak değiştirilir.
// Başka kök için VET_DEFTER_KOK ortam değişkeni kullanılabilir.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veriYukle } from '../lib/veri.js';
import { icerikOzeti, onayliMi } from '../lib/onay.js';
import { dogrula, dizindenOku } from './dogrula.mjs';

const VARSAYILAN_KIM = 'Sorumlu hekim';
const bugun = () => new Date().toISOString().slice(0, 10);

function bul(veri, id) {
  const k = veri.hastaliklar.find((h) => h.id === id);
  if (!k) throw new Error(`bilinmeyen hastalık: ${id}`);
  return k;
}

/** Kaydı onaylı hale getirip yeni kaydı döndürür (girdiyi değiştirmez). */
export function onayla(veri, hastalikId, { kim = VARSAYILAN_KIM, tarih = bugun() } = {}) {
  const kayit = bul(veri, hastalikId);
  return { ...kayit, onay: { durum: 'onayli', kim, tarih, icerikOzeti: icerikOzeti(kayit) } };
}

/** Onayı kaldırıp taslak kaydı döndürür. */
export function onayKaldir(veri, hastalikId) {
  return { ...bul(veri, hastalikId), onay: { durum: 'taslak' } };
}

/** [{ id, ad, grup, durum: 'onayli' | 'taslak' | 'dustu' }]; 'dustu' = onaylı yazıyor ama özet tutmuyor. */
export function onayDurumu(veri) {
  return veri.hastaliklar.map((h) => ({
    id: h.id,
    ad: h.ad,
    grup: h.grup,
    durum: onayliMi(h) ? 'onayli' : h.onay?.durum === 'onayli' ? 'dustu' : 'taslak',
  }));
}

/** n. kaydın 4 boşluk girintili "onay" bölümünün satır aralığı [bas, son] (son dahil). */
function onaySatirlari(satirlar, n) {
  let say = -1;
  for (let i = 0; i < satirlar.length; i++) {
    if (!/^ {4}"onay": /.test(satirlar[i])) continue;
    if (++say !== n) continue;
    if (/\{.*\}\s*,?\s*$/.test(satirlar[i])) return [i, i];
    let j = i + 1;
    while (j < satirlar.length && !/^ {4}\},?\s*$/.test(satirlar[j])) j++;
    return [i, j];
  }
  throw new Error('onay bölümü dosyada bulunamadı');
}

/** cokSatir: taslak için bölümün dosyadaki mevcut biçimi korunur (tek satır ya da açık yazım). */
function onayMetni(onay, cokSatir) {
  if (onay.durum !== 'onayli') return cokSatir ? `    "onay": {\n      "durum": "taslak"\n    }` : '    "onay": { "durum": "taslak" }';
  const al = (a) => `      "${a}": ${JSON.stringify(onay[a])}`;
  return `    "onay": {\n      "durum": "onayli",\n${['kim', 'tarih', 'icerikOzeti'].map(al).join(',\n')}\n    }`;
}

/**
 * kök/veri altındaki kaydı yerinde günceller. secenek: { kim, tarih } ya da { kaldir: true }.
 * Sonuç dogrula'dan yeni hata alırsa hiçbir şey yazılmaz.
 */
export async function dosyadaOnayla(kok, hastalikId, secenek = {}) {
  const oku = dizindenOku(kok);
  const veri = await veriYukle(oku);
  const yeni = secenek.kaldir ? onayKaldir(veri, hastalikId) : onayla(veri, hastalikId, secenek);

  const onceki = dogrula(veri);
  const sonraki = dogrula({ ...veri, hastaliklar: veri.hastaliklar.map((h) => (h.id === hastalikId ? yeni : h)) });
  const yeniHatalar = sonraki.filter((h) => !onceki.includes(h));
  if (yeniHatalar.length) throw new Error(`doğrulama hatası, yazılmadı:\n  - ${yeniHatalar.join('\n  - ')}`);

  for (const dosya of oku('veri/hastaliklar/index.json')) {
    const n = oku(`veri/hastaliklar/${dosya}`).findIndex((h) => h.id === hastalikId);
    if (n < 0) continue;
    const yol = join(kok, 'veri/hastaliklar', dosya);
    const metin = readFileSync(yol, 'utf8');
    const eol = metin.includes('\r\n') ? '\r\n' : '\n';
    const satirlar = metin.split(eol);
    const [bas, son] = onaySatirlari(satirlar, n);
    const virgul = /,\s*$/.test(satirlar[son]) ? ',' : '';
    satirlar.splice(bas, son - bas + 1, ...(onayMetni(yeni.onay, son > bas) + virgul).split('\n'));
    writeFileSync(yol, satirlar.join(eol));
    return { id: hastalikId, dosya, durum: yeni.onay.durum };
  }
  throw new Error(`bilinmeyen hastalık: ${hastalikId}`);
}

export function tablo(durumlar) {
  const gruplar = new Map();
  for (const d of durumlar) {
    if (!gruplar.has(d.grup)) gruplar.set(d.grup, []);
    gruplar.get(d.grup).push(d);
  }
  const sat = [];
  const toplam = { onayli: 0, taslak: 0, dustu: 0 };
  for (const [grup, liste] of gruplar) {
    const say = { onayli: 0, taslak: 0, dustu: 0 };
    for (const d of liste) { say[d.durum]++; toplam[d.durum]++; }
    sat.push(`${grup}: ${say.onayli} onaylı, ${say.taslak} taslak, ${say.dustu} düştü`);
    for (const d of liste) {
      const isaret = { onayli: '[onaylı]', taslak: '[taslak]', dustu: '[DÜŞTÜ ]' }[d.durum];
      sat.push(`  ${isaret} ${d.id} — ${d.ad}`);
    }
  }
  sat.push('', `Toplam: ${durumlar.length} hastalık — ${toplam.onayli} onaylı, ${toplam.taslak} taslak, ${toplam.dustu} düştü`);
  return sat.join('\n');
}

async function cli(argv) {
  const kok = resolve(process.env.VET_DEFTER_KOK ?? fileURLToPath(new URL('..', import.meta.url)));
  if (argv[0] === '--durum') {
    console.log(tablo(onayDurumu(await veriYukle(dizindenOku(kok)))));
    return;
  }
  const ki = argv.indexOf('--kim');
  const id = argv.find((a, i) => !a.startsWith('--') && (ki < 0 || i !== ki + 1));
  if (!id) { console.error('Kullanım: npm run onayla -- <id> [--kim "Hekim"] [--kaldir]'); process.exit(2); }
  const secenek = argv.includes('--kaldir')
    ? { kaldir: true }
    : { kim: ki >= 0 && argv[ki + 1] ? argv[ki + 1] : VARSAYILAN_KIM, tarih: bugun() };
  try {
    const s = await dosyadaOnayla(kok, id, secenek);
    console.log(`${s.id}: ${s.durum === 'onayli' ? 'onaylandı' : 'onayı kaldırıldı (taslak)'} (${s.dosya})`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli(process.argv.slice(2));
