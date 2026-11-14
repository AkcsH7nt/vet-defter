// Uyum puanı motoru (spec §9): ısı okuma/bulgusu, bulgu listesi, uygunluk süzgeci,
// sıralama ve iki değişmez (beklenen belirti eklemek düşürmez; ilgisiz hastalık eklemek değiştirmez).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { isiOku, isiBulgusu, bulgular, yetersizMi, puanla } from '../lib/puan.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const ORNEK = join(KOK, 'test', 'ornek');
const ornek = () => veriYukle(dizindenOku(ORNEK));
const kopya = (x) => JSON.parse(JSON.stringify(x));

// Örnek veride hiçbir hastalığın mevsimi olmayan ay (ornek_ishal: 3–5) ve mevsim içi ay.
const MEVSIM_DISI = new Date(2026, 10, 14); // Kasım
const MEVSIM_ICI = new Date(2026, 3, 10); // Nisan

const girdi = (ek = {}) => ({
  tur: 'sigir',
  yas: 'buzagi',
  baglam: { dogumSonrasi: false, suru: false, aniOlum: false },
  isi: null,
  belirtiler: [],
  ...ek,
});
const bul = (sonuc, id) => sonuc.find((s) => s.id === id);
const idler = (sonuc) => sonuc.map((s) => s.id);

// Tekrarlanabilir sözde rastgele (mulberry32).
function tohumlu(tohum) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const YASLAR = ['buzagi', 'dana', 'duve', 'inek', 'boga'];
const ISILAR = [null, 37.0, 38.5, 39.6, 40.2, 41.0];

function rastgeleGirdiler(veri, adet, tohum) {
  const r = tohumlu(tohum);
  const secilebilir = veri.belirtiler.filter((b) => b.secilebilir !== false).map((b) => b.id);
  const sonuc = [];
  for (let i = 0; i < adet; i++) {
    const belirtiler = secilebilir.filter(() => r() < 0.3);
    sonuc.push(girdi({
      yas: YASLAR[Math.floor(r() * YASLAR.length)],
      baglam: { dogumSonrasi: r() < 0.5, suru: r() < 0.5, aniOlum: r() < 0.2 },
      isi: ISILAR[Math.floor(r() * ISILAR.length)],
      belirtiler,
    }));
  }
  return sonuc;
}

// --- isiOku ---

test('isiOkuVirgulVeNoktaKabulEder', () => {
  assert.equal(isiOku('40,6'), 40.6);
  assert.equal(isiOku('40.6'), 40.6);
  assert.equal(isiOku(' 38 '), 38);
});

test('isiOkuAralikDisiVeBozukGirdideNull', () => {
  assert.equal(isiOku('406'), null);
  assert.equal(isiOku('29,9'), null);
  assert.equal(isiOku('45,1'), null);
  assert.equal(isiOku(''), null);
  assert.equal(isiOku('kırk'), null);
  assert.equal(isiOku('40,6,1'), null);
  assert.equal(isiOku(null), null);
});

test('isiOkuSinirlarDahil', () => {
  assert.equal(isiOku('30'), 30);
  assert.equal(isiOku('45'), 45);
});

// --- isiBulgusu ---

test('isiBulgusuYasaGoreAtesEsigi', () => {
  assert.equal(isiBulgusu(39.6, 'buzagi'), null);
  assert.equal(isiBulgusu(39.6, 'inek'), 'ates');
  assert.equal(isiBulgusu(39.9, 'buzagi'), 'ates');
  assert.equal(isiBulgusu(39.8, 'buzagi'), null);
  assert.equal(isiBulgusu(39.3, 'dana'), null);
  assert.equal(isiBulgusu(39.4, 'boga'), 'ates');
});

test('isiBulgusuHipotermiVeNormal', () => {
  assert.equal(isiBulgusu(37.7, 'inek'), 'hipotermi');
  assert.equal(isiBulgusu(37.8, 'inek'), null);
  assert.equal(isiBulgusu(38.5, 'buzagi'), null);
  assert.equal(isiBulgusu(null, 'inek'), null);
});

// --- bulgular / yetersizMi ---

test('bulgularSeciliBelirtilerArtiIsiTekrarsiz', () => {
  assert.deepEqual(bulgular(girdi({ yas: 'inek', isi: 40.1, belirtiler: ['oksuruk', 'oksuruk', 'diare'] })),
    ['oksuruk', 'diare', 'ates']);
  assert.deepEqual(bulgular(girdi({ isi: null, belirtiler: ['oksuruk'] })), ['oksuruk']);
});

test('bulgularElleSecilenAtesVeHipotermiyiYokSayar', () => {
  // ates/hipotermi yalnız ısıdan türetilir.
  assert.deepEqual(bulgular(girdi({ isi: 38.5, belirtiler: ['ates', 'hipotermi', 'diare'] })), ['diare']);
  assert.deepEqual(bulgular(girdi({ yas: 'inek', isi: 37.0, belirtiler: ['ates'] })), ['hipotermi']);
});

test('yetersizMiUcBulgununAltinda', () => {
  assert.equal(yetersizMi(girdi({ belirtiler: ['oksuruk', 'diare'] })), true);
  assert.equal(yetersizMi(girdi({ belirtiler: ['oksuruk'], isi: 40.5 })), true);
  assert.equal(yetersizMi(girdi({ belirtiler: ['oksuruk', 'diare'], isi: 40.5 })), false);
  assert.equal(yetersizMi(girdi({ belirtiler: ['oksuruk', 'diare', 'salya'] })), false);
});

// --- puanla: şekil ve süzgeç ---

test('puanlaSonucSekli', async () => {
  const veri = await ornek();
  const sonuc = puanla(girdi({ isi: 40.5, belirtiler: ['oksuruk', 'burun_akintisi'] }), veri, MEVSIM_DISI);
  const s = bul(sonuc, 'ornek_solunum');
  assert.ok(s);
  assert.equal(s.ad, 'Örnek solunum hastalığı (test)');
  assert.ok(Number.isInteger(s.uyum) && s.uyum >= 0 && s.uyum <= 100);
  assert.ok(['guclu', 'orta', 'zayif'].includes(s.bant));
  assert.equal(typeof s.skor, 'number');
  assert.ok(Number.isFinite(s.skor));
  for (const alan of ['eslesen', 'eksik', 'celisen']) assert.ok(Array.isArray(s[alan]), alan);
});

test('puanlaSkoraGoreAzalan', async () => {
  const veri = await ornek();
  for (const g of rastgeleGirdiler(veri, 60, 7)) {
    const sonuc = puanla(g, veri, MEVSIM_DISI);
    for (let i = 1; i < sonuc.length; i++) assert.ok(sonuc[i - 1].skor >= sonuc[i].skor, JSON.stringify(g));
  }
});

test('yasaUymayanHastalikSonuctaYok', async () => {
  const veri = await ornek();
  const sonuc = puanla(girdi({ yas: 'inek', belirtiler: ['diare', 'dehidrasyon', 'oksuruk'] }), veri, MEVSIM_DISI);
  assert.ok(!idler(sonuc).includes('ornek_ishal')); // yalnız buzağı
  assert.ok(!idler(sonuc).includes('ornek_solunum')); // buzağı, dana
  assert.ok(idler(sonuc).includes('ornek_ihbar')); // tüm yaşlar
  const buzagi = puanla(girdi({ yas: 'buzagi', belirtiler: ['diare', 'dehidrasyon', 'oksuruk'] }), veri, MEVSIM_DISI);
  assert.ok(idler(buzagi).includes('ornek_ishal'));
});

test('turuUymayanHastalikSonuctaYok', async () => {
  const veri = await ornek();
  veri.hastaliklar.find((h) => h.id === 'ornek_ihbar').tur = ['koyun'];
  const sonuc = puanla(girdi({ belirtiler: ['salya', 'topallik', 'vezikul_agiz'] }), veri, MEVSIM_DISI);
  assert.ok(!idler(sonuc).includes('ornek_ihbar'));
});

test('zorunluBaglamYoksaHastalikSonuctaYok', async () => {
  const veri = await ornek();
  const temel = { yas: 'inek', belirtiler: ['yatma', 'kas_titremesi', 'istahsizlik'] };
  const yok = puanla(girdi({ ...temel, baglam: { dogumSonrasi: false, suru: true, aniOlum: false } }), veri, MEVSIM_DISI);
  assert.ok(!idler(yok).includes('ornek_metabolik'));
  const var_ = puanla(girdi({ ...temel, baglam: { dogumSonrasi: true, suru: false, aniOlum: false } }), veri, MEVSIM_DISI);
  assert.ok(idler(var_).includes('ornek_metabolik'));
});

test('desteklerBaglamiSuzmez', async () => {
  const veri = await ornek();
  // ornek_solunum: { suru: 'destekler' } — sürü işaretsiz de listede.
  const sonuc = puanla(girdi({ belirtiler: ['oksuruk'] }), veri, MEVSIM_DISI);
  assert.ok(idler(sonuc).includes('ornek_solunum'));
});

test('tumUygunHastaliklarDoner', async () => {
  const veri = await ornek();
  // Hiç bulgu yokken de uygun hastalıkların tamamı döner (UI 5'e keser).
  const sonuc = puanla(girdi({ yas: 'buzagi' }), veri, MEVSIM_DISI);
  assert.deepEqual(idler(sonuc).sort(), ['ornek_ihbar', 'ornek_ishal', 'ornek_solunum']);
});

// --- puanla: eşleşen / eksik / çelişen, uyum, bant ---

test('eslesenEksikVeUyum', async () => {
  const veri = await ornek();
  // ornek_solunum: ates K3, oksuruk K3, burun_akintisi T2, solunum_guclugu T2, istahsizlik O1 → toplam 11.
  const s = bul(puanla(girdi({ isi: 40.5, belirtiler: ['oksuruk', 'burun_akintisi'] }), veri, MEVSIM_DISI), 'ornek_solunum');
  assert.deepEqual([...s.eslesen].sort(), ['ates', 'burun_akintisi', 'oksuruk']);
  assert.deepEqual(s.eksik, ['solunum_guclugu']); // olası eksik sayılmaz
  assert.deepEqual(s.celisen, []);
  assert.equal(s.uyum, Math.round((3 + 3 + 2) / 11 * 100)); // 73
  assert.equal(s.bant, 'guclu');
});

test('bantEsikleri', async () => {
  const veri = await ornek();
  const solunum = (g) => bul(puanla(girdi(g), veri, MEVSIM_DISI), 'ornek_solunum');
  // 3/11 = 27 → zayıf
  assert.equal(solunum({ belirtiler: ['oksuruk'] }).uyum, 27);
  assert.equal(solunum({ belirtiler: ['oksuruk'] }).bant, 'zayif');
  // 5/11 = 45 → orta
  assert.equal(solunum({ belirtiler: ['oksuruk', 'burun_akintisi'] }).uyum, 45);
  assert.equal(solunum({ belirtiler: ['oksuruk', 'burun_akintisi'] }).bant, 'orta');
  // 7/11 = 64 → güçlü
  assert.equal(solunum({ belirtiler: ['oksuruk', 'burun_akintisi', 'solunum_guclugu'] }).uyum, 64);
  assert.equal(solunum({ belirtiler: ['oksuruk', 'burun_akintisi', 'solunum_guclugu'] }).bant, 'guclu');
});

test('bantSiniri60ve35', async () => {
  const veri = await ornek();
  const h = {
    ...kopya(veri.hastaliklar.find((x) => x.id === 'ornek_ishal')),
    id: 'sinir_testi', ad: 'Sınır testi', mevsim: undefined,
    // toplam 20: kardinal ×5 (15) + tipik ×2 (4) + olası ×1 (1)
    belirtiler: [
      { id: 'diare', agirlik: 'kardinal', yoklugu_dusurur: false },
      { id: 'salya', agirlik: 'kardinal', yoklugu_dusurur: false },
      { id: 'oksuruk', agirlik: 'kardinal', yoklugu_dusurur: false },
      { id: 'topallik', agirlik: 'kardinal', yoklugu_dusurur: false },
      { id: 'abort', agirlik: 'kardinal', yoklugu_dusurur: false },
      { id: 'dehidrasyon', agirlik: 'tipik', yoklugu_dusurur: false },
      { id: 'yatma', agirlik: 'tipik', yoklugu_dusurur: false },
      { id: 'istahsizlik', agirlik: 'olasi', yoklugu_dusurur: false },
    ],
  };
  delete h.mevsim;
  veri.hastaliklar = [h];
  const s = (belirtiler) => puanla(girdi({ belirtiler }), veri, MEVSIM_DISI)[0];
  assert.equal(s(['diare', 'salya', 'oksuruk', 'topallik']).uyum, 60); // 12/20
  assert.equal(s(['diare', 'salya', 'oksuruk', 'topallik']).bant, 'guclu');
  assert.equal(s(['diare', 'salya', 'oksuruk', 'istahsizlik', 'dehidrasyon']).uyum, 60); // 3+3+3+1+2
  assert.equal(s(['diare', 'salya', 'oksuruk', 'dehidrasyon']).uyum, 55);
  assert.equal(s(['diare', 'salya', 'oksuruk', 'dehidrasyon']).bant, 'orta');
  assert.equal(s(['diare', 'salya', 'istahsizlik']).uyum, 35);
  assert.equal(s(['diare', 'salya', 'istahsizlik']).bant, 'orta');
  assert.equal(s(['diare', 'dehidrasyon', 'istahsizlik']).uyum, 30);
  assert.equal(s(['diare', 'dehidrasyon', 'istahsizlik']).bant, 'zayif');
});

test('dislayiciSecilinceBantZayifVeCelisenDolu', async () => {
  const veri = await ornek();
  const baglam = { dogumSonrasi: true, suru: false, aniOlum: false };
  const temel = { yas: 'inek', baglam, belirtiler: ['yatma', 'kas_titremesi', 'istahsizlik'] };
  // ornek_metabolik dışlayıcı: ates. Isı normal → güçlü (6/8 = 75).
  const normal = bul(puanla(girdi({ ...temel, isi: 38.6 }), veri, MEVSIM_DISI), 'ornek_metabolik');
  assert.equal(normal.uyum, 75);
  assert.equal(normal.bant, 'guclu');
  assert.deepEqual(normal.celisen, []);
  // Ateş → çelişen dolu, bant en fazla zayıf, skor −5'ten fazla düşer.
  const atesli = bul(puanla(girdi({ ...temel, isi: 40.2 }), veri, MEVSIM_DISI), 'ornek_metabolik');
  assert.deepEqual(atesli.celisen, ['ates']);
  assert.equal(atesli.bant, 'zayif');
  assert.equal(atesli.uyum, 75); // uyum kapsamadır, çelişen onu değiştirmez
  assert.ok(atesli.skor <= normal.skor - 5);
});

test('dislayiciElleSecilmisBelirtiyleDe', async () => {
  const veri = await ornek();
  // ornek_solunum dışlayıcı: vezikul_agiz
  const s = bul(puanla(girdi({ isi: 40.5, belirtiler: ['oksuruk', 'burun_akintisi', 'solunum_guclugu', 'vezikul_agiz'] }),
    veri, MEVSIM_DISI), 'ornek_solunum');
  assert.deepEqual(s.celisen, ['vezikul_agiz']);
  assert.equal(s.bant, 'zayif');
});

// --- puanla: skor bileşenleri ---

test('skorBilesenleriKatsayilarlaTutar', async () => {
  const veri = await ornek();
  const gs = Object.fromEntries(veri.belirtiler.map((b) => [b.id, b.genelSiklik]));
  // ornek_ishal (sık, mevsim dışı): diare K, dehidrasyon T (ikisi farklı sistem), oksuruk listede yok.
  // istahsizlik/ates seçilmedi, yoklugu_dusurur değiller → katkı yok.
  const s = bul(puanla(girdi({ belirtiler: ['diare', 'dehidrasyon', 'oksuruk'] }), veri, MEVSIM_DISI), 'ornek_ishal');
  const beklenen = Math.log(3) + Math.log(0.9 / gs.diare) + Math.log(0.6 / gs.dehidrasyon) + Math.log(0.03 / gs.oksuruk);
  assert.ok(Math.abs(s.skor - beklenen) < 1e-9, `${s.skor} ≠ ${beklenen}`);
});

test('ayniSistemPozitifKatkilarAzalanCarpanla', async () => {
  const veri = await ornek();
  const gs = Object.fromEntries(veri.belirtiler.map((b) => [b.id, b.genelSiklik]));
  // ornek_solunum (sık): oksuruk K, burun_akintisi T, solunum_guclugu T — üçü de solunum sistemi.
  const s = bul(puanla(girdi({ belirtiler: ['oksuruk', 'burun_akintisi', 'solunum_guclugu'] }), veri, MEVSIM_DISI),
    'ornek_solunum');
  const katkilar = [Math.log(0.9 / gs.oksuruk), Math.log(0.6 / gs.burun_akintisi), Math.log(0.6 / gs.solunum_guclugu)]
    .sort((a, b) => b - a);
  const beklenen = Math.log(3) + katkilar[0] + 0.5 * katkilar[1] + 0.25 * katkilar[2];
  assert.ok(Math.abs(s.skor - beklenen) < 1e-9, `${s.skor} ≠ ${beklenen}`);
});

test('yokluguDusurenEksikBelirtiCezasi', async () => {
  const veri = await ornek();
  const gs = Object.fromEntries(veri.belirtiler.map((b) => [b.id, b.genelSiklik]));
  // ornek_solunum: oksuruk yoklugu_dusurur; seçilmezse ln(0,1 / (1 − gs)).
  const s = bul(puanla(girdi({ belirtiler: ['burun_akintisi'] }), veri, MEVSIM_DISI), 'ornek_solunum');
  const beklenen = Math.log(3) + Math.log(0.6 / gs.burun_akintisi) + Math.log(0.1 / (1 - gs.oksuruk));
  assert.ok(Math.abs(s.skor - beklenen) < 1e-9, `${s.skor} ≠ ${beklenen}`);
});

test('yayginlikOnAgirligi', async () => {
  const veri = await ornek();
  // Hiç bulgu yok, yoklugu_dusurur cezası yok → skor = ln(ön). ornek_ihbar nadir 0,3.
  const s = bul(puanla(girdi({ yas: 'inek' }), veri, MEVSIM_DISI), 'ornek_ihbar');
  assert.ok(Math.abs(s.skor - Math.log(0.3)) < 1e-9);
});

test('mevsimIciOnAgirlikIkiKati', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['dehidrasyon'] });
  const disi = bul(puanla(g, veri, MEVSIM_DISI), 'ornek_ishal');
  const ici = bul(puanla(g, veri, MEVSIM_ICI), 'ornek_ishal');
  assert.ok(Math.abs(ici.skor - disi.skor - Math.log(2)) < 1e-9);
  assert.equal(ici.uyum, disi.uyum);
});

test('mevsimIciOnAgirlikSiraniOneAlir', async () => {
  const veri = await ornek();
  // Aynı belirtili iki hastalık; yalnız biri bu ay mevsiminde. Mevsim dışında ad sırasıyla
  // "A" önde; mevsim içinde "B" öne geçer.
  const sablon = kopya(veri.hastaliklar.find((h) => h.id === 'ornek_solunum'));
  delete sablon.mevsim;
  const a = { ...kopya(sablon), id: 'ikiz_a', ad: 'A ikiz' };
  const b = { ...kopya(sablon), id: 'ikiz_b', ad: 'B ikiz', mevsim: [4] };
  veri.hastaliklar = [b, a];
  const g = girdi({ isi: 40.5, belirtiler: ['oksuruk', 'burun_akintisi'] });
  assert.deepEqual(idler(puanla(g, veri, MEVSIM_DISI)), ['ikiz_a', 'ikiz_b']);
  assert.deepEqual(idler(puanla(g, veri, MEVSIM_ICI)), ['ikiz_b', 'ikiz_a']);
});

test('mevsimOrnekVerideSiraDegistirir', async () => {
  const veri = await ornek();
  // Ateşli buzağıda iştahsızlık: mevsim dışında solunum önde (ishalde ateş yalnız olası),
  // ishalin mevsiminde (Nisan) ön ×2 ishali öne alır.
  const g = girdi({ isi: 40.5, belirtiler: ['istahsizlik'] });
  assert.deepEqual(idler(puanla(g, veri, MEVSIM_DISI)).slice(0, 2), ['ornek_solunum', 'ornek_ishal']);
  assert.deepEqual(idler(puanla(g, veri, MEVSIM_ICI)).slice(0, 2), ['ornek_ishal', 'ornek_solunum']);
});

test('esitSkordaAdaGoreKararli', async () => {
  const veri = await ornek();
  const sablon = kopya(veri.hastaliklar.find((h) => h.id === 'ornek_ishal'));
  delete sablon.mevsim;
  veri.hastaliklar = [
    { ...kopya(sablon), id: 'z_kayit', ad: 'Çiçek' },
    { ...kopya(sablon), id: 'y_kayit', ad: 'Ceviz' },
    { ...kopya(sablon), id: 'x_kayit', ad: 'Dut' },
  ];
  // tr sıralaması: Ceviz < Çiçek < Dut
  assert.deepEqual(idler(puanla(girdi({ belirtiler: ['diare'] }), veri, MEVSIM_DISI)), ['y_kayit', 'z_kayit', 'x_kayit']);
});

test('bilinmeyenBelirtiSessizceYokSayilir', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['oksuruk', 'burun_akintisi'] });
  const temiz = puanla(g, veri, MEVSIM_DISI);
  const kirli = puanla({ ...g, belirtiler: [...g.belirtiler, 'boyle_bir_belirti_yok'] }, veri, MEVSIM_DISI);
  assert.deepEqual(kirli, temiz);
});

test('elleSecilenAtesPuanaGirmez', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['oksuruk', 'burun_akintisi'] });
  assert.deepEqual(puanla({ ...g, belirtiler: [...g.belirtiler, 'ates', 'hipotermi'] }, veri, MEVSIM_DISI),
    puanla(g, veri, MEVSIM_DISI));
});

test('isiGirilmediyseAtesYoklugunuCezalandirmaz', async () => {
  const veri = await ornek();
  const gs = Object.fromEntries(veri.belirtiler.map((b) => [b.id, b.genelSiklik]));
  // ates yoklugu_dusurur olan bir hastalık: ısı yoksa bilinmiyor (ceza yok); ısı normalse ceza.
  const h = kopya(veri.hastaliklar.find((x) => x.id === 'ornek_solunum'));
  h.belirtiler.find((b) => b.id === 'ates').yoklugu_dusurur = true;
  veri.hastaliklar = [h];
  const bilinmiyor = puanla(girdi({ belirtiler: ['oksuruk'] }), veri, MEVSIM_DISI)[0];
  const normal = puanla(girdi({ belirtiler: ['oksuruk'], isi: 38.6 }), veri, MEVSIM_DISI)[0];
  assert.ok(Math.abs(bilinmiyor.skor - normal.skor - -Math.log(0.1 / (1 - gs.ates))) < 1e-9);
});

test('puanlaGirdiyiVeVeriyiDegistirmez', async () => {
  const veri = await ornek();
  const once = kopya(veri);
  const g = girdi({ isi: 40.5, belirtiler: ['oksuruk', 'diare'] });
  const gOnce = kopya(g);
  puanla(g, veri, MEVSIM_DISI);
  assert.deepEqual(veri, once);
  assert.deepEqual(g, gOnce);
});

test('simdiVerilmezseBugunuKullanir', async () => {
  const veri = await ornek();
  const g = girdi({ belirtiler: ['diare'] });
  assert.deepEqual(puanla(g, veri), puanla(g, veri, new Date()));
});

// --- değişmezler (özellik tabanlı) ---

test('degismez1BeklenenBelirtiEklemekSkorVeUyumuDusurmez', async () => {
  const veri = await ornek();
  const secilebilir = new Set(veri.belirtiler.filter((b) => b.secilebilir !== false).map((b) => b.id));
  let denenen = 0;
  for (const simdi of [MEVSIM_DISI, MEVSIM_ICI]) {
    for (const g of rastgeleGirdiler(veri, 150, 42)) {
      const once = puanla(g, veri, simdi);
      for (const s of once) {
        const h = veri.hastaliklar.find((x) => x.id === s.id);
        const mevcut = new Set(bulgular(g));
        for (const b of h.belirtiler) {
          if (!secilebilir.has(b.id) || mevcut.has(b.id)) continue;
          const sonra = bul(puanla({ ...g, belirtiler: [...g.belirtiler, b.id] }, veri, simdi), s.id);
          denenen++;
          const ne = `${s.id} + ${b.id} @ ${JSON.stringify(g)}`;
          assert.ok(sonra, `hastalık listeden düştü: ${ne}`);
          assert.ok(sonra.skor >= s.skor - 1e-12, `skor düştü ${s.skor} → ${sonra.skor}: ${ne}`);
          assert.ok(sonra.uyum >= s.uyum, `uyum düştü ${s.uyum} → ${sonra.uyum}: ${ne}`);
        }
      }
    }
  }
  assert.ok(denenen > 200, `yeterli deneme yok: ${denenen}`);
});

test('degismez1IsiylaGelenBeklenenBulguIcinDe', async () => {
  const veri = await ornek();
  // ates beklenen olan hastalıklarda ısı girilmemişken ateşli ısı girmek düşürmez.
  for (const g of rastgeleGirdiler(veri, 100, 3).map((x) => ({ ...x, isi: null }))) {
    const once = puanla(g, veri, MEVSIM_DISI);
    const sonra = puanla({ ...g, isi: 41.0 }, veri, MEVSIM_DISI);
    for (const s of once) {
      const h = veri.hastaliklar.find((x) => x.id === s.id);
      if (!h.belirtiler.some((b) => b.id === 'ates')) continue;
      const t = bul(sonra, s.id);
      assert.ok(t.skor >= s.skor - 1e-12, `${s.id}: ${s.skor} → ${t.skor}`);
      assert.ok(t.uyum >= s.uyum);
    }
  }
});

test('degismez1ZorBelirtiSiklikleriyle', async () => {
  // Beklenen belirtinin genelSiklik'i duyarlılığından büyük olsa da (ln < 0) eklemek düşürmez.
  const veri = await ornek();
  for (const b of veri.belirtiler) if (b.id === 'istahsizlik' || b.id === 'dehidrasyon') b.genelSiklik = 0.95;
  for (const g of rastgeleGirdiler(veri, 100, 11)) {
    const once = puanla(g, veri, MEVSIM_DISI);
    for (const s of once) {
      for (const ek of ['istahsizlik', 'dehidrasyon']) {
        const h = veri.hastaliklar.find((x) => x.id === s.id);
        if (!h.belirtiler.some((b) => b.id === ek) || g.belirtiler.includes(ek)) continue;
        const t = bul(puanla({ ...g, belirtiler: [...g.belirtiler, ek] }, veri, MEVSIM_DISI), s.id);
        assert.ok(t.skor >= s.skor - 1e-12, `${s.id} + ${ek}: ${s.skor} → ${t.skor}`);
      }
    }
  }
});

test('degismez2IlgisizHastalikEklemekMevcutlariDegistirmez', async () => {
  const veri = await ornek();
  const genis = kopya(veri);
  const sablon = kopya(veri.hastaliklar.find((h) => h.id === 'ornek_solunum'));
  genis.hastaliklar.push(
    { ...kopya(sablon), id: 'yeni_bir', ad: 'Yeni bir hastalık', yayginlik: 'sik', mevsim: [4, 11],
      yasGruplari: ['buzagi', 'dana', 'duve', 'inek', 'boga'], baglam: {},
      belirtiler: [
        { id: 'abort', agirlik: 'kardinal', yoklugu_dusurur: true },
        { id: 'salya', agirlik: 'tipik', yoklugu_dusurur: false },
        { id: 'oksuruk', agirlik: 'olasi', yoklugu_dusurur: false },
      ],
      dislayicilar: ['diare'] },
    { ...kopya(sablon), id: 'yeni_iki', ad: 'Aaa yeni', yayginlik: 'nadir', baglam: { aniOlum: 'zorunlu' } },
  );
  for (const simdi of [MEVSIM_DISI, MEVSIM_ICI]) {
    for (const g of rastgeleGirdiler(veri, 200, 99)) {
      const once = puanla(g, veri, simdi);
      const sonra = puanla(g, genis, simdi).filter((s) => !s.id.startsWith('yeni_'));
      // Mevcut hastalıkların uyum, skor ve diğer alanları aynı; göreli sıraları da aynı.
      assert.deepEqual(sonra, once, JSON.stringify(g));
    }
  }
});
