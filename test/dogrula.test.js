// Veri doğrulayıcı: örnek veri temiz; spec §8 kurallarının her biri bozulunca hata verir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dogrula, dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { icerikOzeti } from '../lib/onay.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const ORNEK = join(KOK, 'test', 'ornek');

const ornek = () => veriYukle(dizindenOku(ORNEK));
const hastalik = (veri, id) => veri.hastaliklar.find((h) => h.id === id);

function hataIcerir(hatalar, desen) {
  assert.ok(hatalar.some((h) => desen.test(h)), `beklenen hata yok: ${desen}\nhatalar: ${JSON.stringify(hatalar, null, 1)}`);
}

test('ornekVeriTemiz', async () => {
  assert.deepEqual(dogrula(await ornek()), []);
});

test('gercekVeriTemiz', async () => {
  assert.deepEqual(dogrula(await veriYukle(dizindenOku(KOK))), []);
});

test('veriYukleTumDosyalariGoreliYoldanOkurVeGruplariBirlestirir', async () => {
  const istenen = [];
  const temel = dizindenOku(ORNEK);
  const veri = await veriYukle((yol) => { istenen.push(yol); return temel(yol); });
  for (const yol of ['veri/meta.json', 'veri/belirtiler.json', 'veri/etkenler.json', 'veri/bayraklar.json',
    'veri/ihbar.json', 'veri/yasaklar.json', 'veri/urunler.json', 'veri/hastaliklar/index.json',
    'veri/hastaliklar/solunum.json', 'veri/hastaliklar/ihbar_zehir.json']) {
    assert.ok(istenen.includes(yol), `okunmadı: ${yol}`);
  }
  assert.deepEqual(Object.keys(veri).sort(),
    ['bayraklar', 'belirtiler', 'etkenler', 'hastaliklar', 'ihbar', 'meta', 'urunler', 'yasaklar']);
  // index.json sırasıyla birleşir
  assert.deepEqual(veri.hastaliklar.map((h) => h.id), ['ornek_solunum', 'ornek_ishal', 'ornek_metabolik', 'ornek_ihbar',
    'ornek_sarbon', 'ornek_kuduz', 'ornek_bruselloz', 'ornek_lsd']);
});

test('veriYukleIndexDiziDegilseHata', async () => {
  const temel = dizindenOku(ORNEK);
  await assert.rejects(veriYukle((yol) => (yol === 'veri/hastaliklar/index.json' ? { yanlis: 1 } : temel(yol))));
});

test('yasakEtkenProtokoldeHataVeAdIcerir', async () => {
  const veri = await ornek();
  veri.etkenler.push({
    id: 'kloramfenikol', ad: 'Kloramfenikol', sinif: 'antimikrobiyal', atcvet: null, ameg: 'C',
    mekanizma: { hedef: 'h', etki: 'e', tur: 't', spektrum: null, etkilesimler: [], kaynak: null },
    onay: { durum: 'taslak' },
  });
  hastalik(veri, 'ornek_ishal').protokol.ilaclar.push({
    etkenId: 'kloramfenikol', sinif: 'antimikrobiyal', sira: 2, yol: 'IM', not: null,
    kaynak: { tur: 'KUB', urun: null, bolum: null },
  });
  hastalik(veri, 'ornek_ishal').antibiyotikEndikeDegil = false;
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /ornek_ishal.*Kloramfenikol/);
});

test('yasakEtkenEtkenlerdeYoksaDaYakalanir', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').protokol.ilaclar[0].etkenId = 'kloramfenikol';
  hataIcerir(dogrula(veri), /Kloramfenikol/);
});

test('yasakEtkenAdlaEslesirseYakalanir', async () => {
  const veri = await ornek();
  veri.etkenler[0].ad = 'kloramfenikol';
  hataIcerir(dogrula(veri), /ornek_solunum.*yasak/i);
});

test('ihbariHastalikIhbarAdimlariBossaHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_ihbar').protokol.ihbarAdimlari = [];
  hataIcerir(dogrula(veri), /ornek_ihbar.*ihbarAdimlari/);
});

test('tedaviKipiYasakIkenIlacVarsaHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_ihbar').protokol.ilaclar.push({
    etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null,
    kaynak: { tur: 'KUB', urun: null, bolum: null },
  });
  hataIcerir(dogrula(veri), /ornek_ihbar.*tedaviKipi/);
});

test('tedaviKipiYokIkenIlacVarsaHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_ishal').tedaviKipi = 'yok';
  hataIcerir(dogrula(veri), /ornek_ishal.*tedaviKipi/);
});

test('kaynaksizIlacSatiriHata', async () => {
  const veri = await ornek();
  delete hastalik(veri, 'ornek_solunum').protokol.ilaclar[1].kaynak;
  hataIcerir(dogrula(veri), /ornek_solunum.*kaynak/);
  const veri2 = await ornek();
  hastalik(veri2, 'ornek_solunum').protokol.ilaclar[1].kaynak = { tur: 'kitap', urun: null, bolum: null };
  hataIcerir(dogrula(veri2), /ornek_solunum.*kaynak/);
});

test('onayliAmaOzetTutmuyorsaHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').sahadaDogrula.push('Sonradan eklenen satır');
  hataIcerir(dogrula(veri), /ornek_solunum.*özet/);
});

test('onayliKayittaKimTarihEksikseHata', async () => {
  const veri = await ornek();
  const h = hastalik(veri, 'ornek_ishal');
  h.onay = { durum: 'onayli', icerikOzeti: icerikOzeti(h) };
  hataIcerir(dogrula(veri), /ornek_ishal.*onay/);
});

test('bilinmeyenKimliklerHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').belirtiler.push({ id: 'uydurma_belirti', agirlik: 'olasi', yoklugu_dusurur: false });
  hastalik(veri, 'ornek_solunum').dislayicilar.push('uydurma_dislayici');
  hastalik(veri, 'ornek_solunum').ayiriciTani.push('uydurma_hastalik');
  hastalik(veri, 'ornek_solunum').protokol.ilaclar[0].etkenId = 'uydurma_etken';
  veri.bayraklar[0].hastalikId = 'uydurma_bayrak_hastaligi';
  veri.bayraklar[0].kosul.hepsi.push('uydurma_kosul');
  veri.urunler[0].etkenler.push('uydurma_urun_etkeni');
  const hatalar = dogrula(veri);
  for (const id of ['uydurma_belirti', 'uydurma_dislayici', 'uydurma_hastalik', 'uydurma_etken',
    'uydurma_bayrak_hastaligi', 'uydurma_kosul', 'uydurma_urun_etkeni']) {
    hataIcerir(hatalar, new RegExp(id));
  }
});

test('tekrarlayanKimlikHata', async () => {
  const veri = await ornek();
  veri.belirtiler.push({ ...veri.belirtiler[2] });
  veri.hastaliklar.push(structuredClone(hastalik(veri, 'ornek_ishal')));
  veri.etkenler.push(structuredClone(veri.etkenler[0]));
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /istahsizlik.*tekrar/);
  hataIcerir(hatalar, /ornek_ishal.*tekrar/);
  hataIcerir(hatalar, /ornek_antibiyotik.*tekrar/);
});

test('belirtiAlanlariDenetlenir', async () => {
  const veri = await ornek();
  veri.belirtiler.find((b) => b.id === 'ates').secilebilir = true;
  veri.belirtiler.find((b) => b.id === 'oksuruk').genelSiklik = 1;
  veri.belirtiler.find((b) => b.id === 'diare').sistem = 'bagirsak';
  veri.belirtiler.find((b) => b.id === 'salya').tur = ['koyun'];
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /ates.*secilebilir/);
  hataIcerir(hatalar, /oksuruk.*genelSiklik/);
  hataIcerir(hatalar, /diare.*sistem/);
  hataIcerir(hatalar, /salya.*tur/);
});

test('hastalikAlanlariDenetlenir', async () => {
  const veri = await ornek();
  const h = hastalik(veri, 'ornek_ishal');
  h.grup = 'bagirsak';
  h.yasGruplari = ['yavru'];
  h.yayginlik = 'cok';
  h.tedaviKipi = 'bilinmiyor';
  h.mevsim = [0, 13];
  h.isi = { min: 41, max: 39 };
  h.baglam = { dogumSonrasi: true };
  h.belirtiler[0].agirlik = 'onemli';
  const hatalar = dogrula(veri);
  for (const alan of ['grup', 'yasGruplari', 'yayginlik', 'tedaviKipi', 'mevsim', 'isi', 'baglam', 'agirlik']) {
    hataIcerir(hatalar, new RegExp(`ornek_ishal.*${alan}`));
  }
});

test('bilinmeyenAlanHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').yokluguDusurur = true;
  hastalik(veri, 'ornek_solunum').belirtiler[0].yoklugudusurur = true;
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /ornek_solunum.*yokluguDusurur/);
  hataIcerir(hatalar, /ornek_solunum.*yoklugudusurur/);
});

test('belirtiHemBeklenenHemDislayiciOlamaz', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').dislayicilar.push('oksuruk');
  hataIcerir(dogrula(veri), /hastalik\[ornek_solunum\]: oksuruk hem beklenen belirti hem dışlayıcı/);
  // Isıdan türetilen bulgu da (ates) iki listede birden olamaz.
  const veri2 = await ornek();
  hastalik(veri2, 'ornek_ihbar').dislayicilar.push('ates');
  hataIcerir(dogrula(veri2), /hastalik\[ornek_ihbar\]: ates hem beklenen belirti hem dışlayıcı/);
});

test('amegAEtkenProtokoldeHata', async () => {
  const veri = await ornek();
  veri.etkenler[0].ameg = 'A';
  hataIcerir(dogrula(veri), /ornek_solunum.*AMEG A/);
});

test('antimikrobiyalAmegsizHata', async () => {
  const veri = await ornek();
  delete veri.etkenler[0].ameg;
  hataIcerir(dogrula(veri), /ornek_antibiyotik.*ameg/);
});

test('antibiyotikEndikeDegilkenAntimikrobiyalHata', async () => {
  const veri = await ornek();
  const h = hastalik(veri, 'ornek_ishal');
  h.protokol.ilaclar.push({ etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 2, yol: 'IM', not: null,
    kaynak: { tur: 'KUB', urun: null, bolum: null } });
  hataIcerir(dogrula(veri), /ornek_ishal.*antibiyotikEndikeDegil/);
});

test('ilacSinifiEtkenSinifinaUymazsaHata', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_solunum').protokol.ilaclar[1].sinif = 'antimikrobiyal';
  hataIcerir(dogrula(veri), /ornek_solunum.*sinif/);
});

test('ihbarListesiIleTutarlilik', async () => {
  const veri = await ornek();
  hastalik(veri, 'ornek_ihbar').ihbari = false;
  hataIcerir(dogrula(veri), /ornek_ihbar.*ihbar listesinde/);
  const veri2 = await ornek();
  hastalik(veri2, 'ornek_solunum').ihbari = true;
  hastalik(veri2, 'ornek_solunum').protokol.ihbarAdimlari = ['Bildir'];
  hataIcerir(dogrula(veri2), /ornek_solunum.*ihbar listesinde yok/);
});

test('ihbariHastalikBayraksizsaHata', async () => {
  // final-review C1: ihbar şüphesi yalnız sıralamaya bırakılmaz.
  const veri = await ornek();
  veri.bayraklar = veri.bayraklar.filter((b) => b.hastalikId !== 'ornek_ihbar');
  hataIcerir(dogrula(veri), /ornek_ihbar.*kırmızı bayrak kuralı yok/);
});

test('gercekVerideHerIhbariHastaligiBayrakKorur', async () => {
  const veri = await veriYukle(dizindenOku(KOK));
  const bayrakli = new Set(veri.bayraklar.map((b) => b.hastalikId));
  const eksik = veri.hastaliklar.filter((h) => h.ihbari && !bayrakli.has(h.id)).map((h) => h.id);
  assert.deepEqual(eksik, []);
});

test('urunAlanlariDenetlenir', async () => {
  const veri = await ornek();
  veri.urunler[0].kub[0].sut = { gun: 7 };
  veri.urunler[0].kub[1].et_gun = -1;
  veri.urunler[0].kubDogrulandi = 'evet';
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /Örnek Ürün.*sut/);
  hataIcerir(hatalar, /Örnek Ürün.*et_gun/);
  hataIcerir(hatalar, /Örnek Ürün.*kubDogrulandi/);
});

test('bayrakKosuluBossaHata', async () => {
  for (const kosul of [{ hepsi: [] }, { herhangi: [] }, { hepsi: [], herhangi: [] }, {}, { baglam: { aniOlum: true } }]) {
    const veri = await ornek();
    veri.bayraklar[0].kosul = kosul;
    hataIcerir(dogrula(veri), /ornek_ihbar_bayragi.*kosul en az bir belirti/);
  }
});

test('bayrakKosuluYalnizHerhangiYaDaIkisiBirlikteGecerli', async () => {
  for (const kosul of [
    { herhangi: ['salya', 'vezikul_agiz'] },
    { herhangi: ['salya'], baglam: { suru: true } },
    { hepsi: ['salya'], herhangi: ['vezikul_agiz', 'topallik'] },
    { hepsi: [], herhangi: ['salya'] },
    { hepsi: ['salya'], herhangi: [] },
  ]) {
    const veri = await ornek();
    veri.bayraklar[0].kosul = kosul;
    assert.deepEqual(dogrula(veri), [], JSON.stringify(kosul));
  }
});

test('bayrakKosuluBicimHatalari', async () => {
  const veri = await ornek();
  veri.bayraklar[0].kosul = { hepsi: ['salya'], herhangi: 'vezikul_agiz' };
  veri.bayraklar[1].kosul = { hepsi: ['dogal_deliklerden_kan'], baglam: { aniOlum: 'evet' } };
  veri.bayraklar[2].kosul = { hepsi: ['salya'], baglam: { kis: true } };
  veri.bayraklar[3].kosul = { hepsi: ['abort'], hicbiri: ['salya'] };
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /ornek_ihbar_bayragi.*kosul\.herhangi dizi olmalı/);
  hataIcerir(hatalar, /ornek_sarbon_bayragi.*kosul\.baglam\.aniOlum/);
  hataIcerir(hatalar, /ornek_kuduz_bayragi.*kosul\.baglam\.kis/);
  hataIcerir(hatalar, /ornek_bruselloz_bayragi.*bilinmeyen alan: hicbiri/);
});

test('bayrakSemasiHepsiYaDaHerhangiIster', () => {
  const sema = JSON.parse(readFileSync(join(KOK, 'veri', 'sema', 'bayrak.schema.json'), 'utf8'));
  const kosul = sema.items.properties.kosul;
  assert.ok(!(kosul.required ?? []).includes('hepsi'), 'hepsi tek başına zorunlu olmamalı');
  assert.deepEqual(Object.keys(kosul.properties).sort(), ['baglam', 'hepsi', 'herhangi']);
  // anyOf: hepsi dolu ya da herhangi dolu.
  const secenekler = kosul.anyOf.map((s) => [s.required, s.properties[s.required[0]].minItems]);
  assert.deepEqual(secenekler, [[['hepsi'], 1], [['herhangi'], 1]]);
});

test('metaVeListeSekilleriDenetlenir', async () => {
  const veri = await ornek();
  veri.meta.semaSurumu = 'bir';
  veri.ihbar.ogeler[0].dogrulandi = 'hayir';
  veri.yasaklar = [];
  const hatalar = dogrula(veri);
  hataIcerir(hatalar, /meta.*semaSurumu/);
  hataIcerir(hatalar, /ihbar.*dogrulandi/);
  hataIcerir(hatalar, /yasaklar/);
});

test('gercekYasakListesiTemelMaddeleriIcerir', () => {
  const yasaklar = JSON.parse(readFileSync(join(KOK, 'veri', 'yasaklar.json'), 'utf8'));
  const idler = yasaklar.ogeler.map((o) => o.id);
  for (const id of ['kloramfenikol', 'nitrofuranlar', 'furazolidon', 'nitroimidazoller', 'metronidazol',
    'dimetridazol', 'ronidazol', 'klorpromazin', 'kolsisin', 'dapson', 'kloroform', 'aristolochia',
    'stilbenler', 'tireostatikler', 'fenilbutazon']) {
    assert.ok(idler.includes(id), `yasak listesinde yok: ${id}`);
  }
  assert.ok(yasaklar.ogeler.every((o) => o.dogrulandi === false), 'hiçbir öge doğrulanmış sayılmaz');
  assert.equal(yasaklar.kaynakTarihi, null);
});

test('gercekIhbarListesiYanikaraIcermezVeDogrulanmamis', () => {
  const ihbar = JSON.parse(readFileSync(join(KOK, 'veri', 'ihbar.json'), 'utf8'));
  const idler = ihbar.ogeler.map((o) => o.id);
  assert.ok(!idler.some((id) => id.includes('yanikara')), 'yanıkara ihbar listesinde olmamalı');
  for (const id of ['sap', 'sarbon', 'kuduz', 'bruselloz', 'tuberkuloz', 'noduler_ekzantem']) {
    assert.ok(idler.includes(id), `ihbar listesinde yok: ${id}`);
  }
  assert.ok(ihbar.ogeler.every((o) => o.dogrulandi === false && typeof o.emin === 'boolean'));
  assert.equal(ihbar.kaynakTarihi, null);
});

test('semaDosyalariGecerliJson', () => {
  const dizin = join(KOK, 'veri', 'sema');
  const dosyalar = readdirSync(dizin).filter((d) => d.endsWith('.schema.json'));
  assert.ok(dosyalar.length >= 8);
  for (const d of dosyalar) {
    const sema = JSON.parse(readFileSync(join(dizin, d), 'utf8'));
    assert.equal(sema.$id, d, `${d} $id dosya adıyla aynı olmalı`);
  }
});

test('cliTemizVeriIcinSifirCikar', () => {
  const s = spawnSync(process.execPath, ['scripts/dogrula.mjs', 'test/ornek'], { cwd: KOK, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr + s.stdout);
  assert.match(s.stdout, /Veri doğrulaması: temiz/);
});

test('cliHataliVeriIcinBirCikar', () => {
  const gecici = mkdtempSync(join(tmpdir(), 'vet-defter-'));
  try {
    cpSync(ORNEK, gecici, { recursive: true });
    const dosya = join(gecici, 'veri', 'hastaliklar', 'ihbar_zehir.json');
    const liste = JSON.parse(readFileSync(dosya, 'utf8'));
    liste[0].protokol.ihbarAdimlari = [];
    writeFileSync(dosya, JSON.stringify(liste));
    const s = spawnSync(process.execPath, ['scripts/dogrula.mjs', gecici], { cwd: KOK, encoding: 'utf8' });
    assert.equal(s.status, 1);
    assert.match(s.stdout + s.stderr, /ihbarAdimlari/);
  } finally {
    rmSync(gecici, { recursive: true, force: true });
  }
});

test('cliEksikDosyadaBirCikar', () => {
  const gecici = mkdtempSync(join(tmpdir(), 'vet-defter-'));
  try {
    const s = spawnSync(process.execPath, ['scripts/dogrula.mjs', gecici], { cwd: KOK, encoding: 'utf8' });
    assert.equal(s.status, 1);
  } finally {
    rmSync(gecici, { recursive: true, force: true });
  }
});
