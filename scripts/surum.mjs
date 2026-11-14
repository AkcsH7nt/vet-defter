// sw.js önbellek sürümü: DOSYALAR içeriğinin özeti `// icerik: <özet>` satırında tutulur.
// Kullanım: node scripts/surum.mjs   (npm run surum)
//   İçerik değiştiyse özeti yazar ve SURUM'u bir artırır; değişmediyse dokunmaz.
// test/sw.test.js özetin güncel olduğunu denetler: bir veri / kod düzeltmesi SURUM artırılmadan yayına gidemez
// (aksi hâlde kurulu telefonlar eski protokolleri süresiz göstermeye devam eder; final-review I4).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const METIN = /\.(html|js|mjs|css|json|webmanifest|svg|txt|md)$/i;

/** sw.js metninden DOSYALAR dizisi. */
export function swDosyalari(sw) {
  return JSON.parse(sw.match(/const DOSYALAR = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
}

/** DOSYALAR'ın içerik özeti. Metin dosyalarında satır sonu farkı (CRLF / LF) özeti değiştirmez. */
export function icerikOzetiHesapla(kok = KOK, sw = readFileSync(join(kok, 'sw.js'), 'utf8')) {
  const h = createHash('sha256');
  for (const d of swDosyalari(sw)) {
    if (d === './') continue;
    let icerik = readFileSync(join(kok, d));
    if (METIN.test(d)) icerik = Buffer.from(icerik.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    h.update(`${d}\0`).update(icerik).update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

export const kayitliOzet = (sw) => sw.match(/^\/\/ icerik: ([0-9a-f]+)$/m)?.[1] ?? null;
export const surumNo = (sw) => Number(sw.match(/const SURUM = 'vet-defter-v(\d+)'/)[1]);

function main() {
  const yol = join(KOK, 'sw.js');
  let sw = readFileSync(yol, 'utf8');
  const ozet = icerikOzetiHesapla(KOK, sw);
  if (kayitliOzet(sw) === ozet) { console.log(`Değişiklik yok: vet-defter-v${surumNo(sw)} (${ozet})`); return; }
  const yeni = surumNo(sw) + 1;
  sw = sw.replace(/const SURUM = 'vet-defter-v\d+';/, `const SURUM = 'vet-defter-v${yeni}';`);
  sw = kayitliOzet(sw) === null
    ? sw.replace(/^(const SURUM = .*)$/m, `// icerik: ${ozet}\n$1`)
    : sw.replace(/^\/\/ icerik: [0-9a-f]+$/m, `// icerik: ${ozet}`);
  writeFileSync(yol, sw);
  console.log(`SURUM → vet-defter-v${yeni} (içerik ${ozet})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
