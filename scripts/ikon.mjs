// ikon.svg → ikon-192.png, ikon-512.png, apple-touch-icon.png (180). Kullanım: node scripts/ikon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync('ikon.svg', 'utf8');
const tarayici = await chromium.launch({ channel: 'chrome' });
for (const [ad, boyut] of [['ikon-192.png', 192], ['ikon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const sayfa = await tarayici.newPage({ viewport: { width: boyut, height: boyut } });
  await sayfa.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${boyut}px;height:${boyut}px}</style>${svg}`);
  writeFileSync(ad, await sayfa.screenshot({ omitBackground: true }));
  await sayfa.close();
}
await tarayici.close();
