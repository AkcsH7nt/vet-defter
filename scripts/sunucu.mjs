// Geliştirme ve test için basit statik sunucu. Kullanım: node scripts/sunucu.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = resolve(process.cwd());
const port = Number(process.argv[2] ?? process.env.PORT ?? 5180);
const turler = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.gz': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg',
};

// taban: uygulamayı alt yola bağlar (ör. '/vet-defter/' → GitHub Pages benzeri); boşsa kökte sunulur.
export function sunucuBaslat(p = port, taban = '') {
  const onek = taban ? `/${taban.replace(/^\/+|\/+$/g, '')}` : '';
  const s = createServer(async (istek, yanit) => {
    try {
      let yolu = decodeURIComponent(new URL(istek.url, 'http://x').pathname);
      if (onek) {
        if (yolu !== onek && !yolu.startsWith(`${onek}/`)) throw new Error('taban dışı');
        yolu = yolu.slice(onek.length) || '/';
      }
      if (yolu.endsWith('/')) yolu += 'index.html';
      const dosya = normalize(join(kok, yolu));
      if (dosya !== kok && !dosya.startsWith(kok + sep)) throw new Error('yasak');
      if (!(await stat(dosya)).isFile()) throw new Error('yok');
      yanit.writeHead(200, { 'Content-Type': turler[extname(dosya)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      yanit.end(await readFile(dosya));
    } catch {
      yanit.writeHead(404); yanit.end('bulunamadı');
    }
  });
  return new Promise((r) => s.listen(p, () => r(s)));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  sunucuBaslat().then(() => console.log(`http://localhost:${port}`));
}
