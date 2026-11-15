// Kiloya göre tedavi önerisi motoru (lib/oneri.js): ürün seçimi, ml hesabı ve öneri yapısı.
// Örnek veri (test/ornek/veri) yüklenir, testin gerektirdiği ürün / KÜB / etken / hastalık kayıtları bellekte eklenir
// (paylaşılan örnek dosyalar değişmez).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { gosterilebilirMi, kuruDonemUrunuMu, mlHesapla, urunSec, tedaviOnerisi } from '../lib/oneri.js';

const ORNEK = fileURLToPath(new URL('./ornek/', import.meta.url));

const oran = (mlPerKg, ek = {}) => ({
  mlPerKg, ifade: `${mlPerKg} ml/kg`, cumle: `Örnek cümle ${mlPerKg} ml/kg`, kaynak: 'ml_kg', kapsam: 'sigir',
  guven: 'yuksek', yerBasinaMaxMl: null, ...ek,
});
const DUSUK = { mlPerKg: null, ifade: null, cumle: null, kaynak: null, kapsam: null, guven: 'dusuk', yerBasinaMaxMl: null };

/** Örnek veri + bellekte eklenen ürünler. urunler: [{ urun, kayit }] (kayit null → kub.json'da kayıt yok). */
async function veriHazirla(urunler = [], { etkenler = [], hastaliklar = [] } = {}) {
  const veri = await veriYukle(dizindenOku(ORNEK));
  for (const { urun, kayit } of urunler) {
    veri.urunler.push({ firma: 'Test', form: 'enjeksiyonluk çözelti', hedefTurler: ['sigir'], kub: [], ...urun });
    if (kayit) veri.kub.urunler[urun.urunId] = { doz: 'Örnek doz metni.', arinma: null, metinYok: false, yollar: [], sigir: { guven: 'yuksek' }, ...kayit };
  }
  veri.etkenler.push(...etkenler);
  veri.hastaliklar.push(...hastaliklar);
  return veri;
}

const ILAC = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null };
// Örnek veride ornek-u1 (ornek_antibiyotik, oran yok) zaten var: bu testlerde aday ürünlerden biri.

test('mlHesaplaYuvarlamaVeYerSayisi', () => {
  assert.deepEqual(mlHesapla(0.1, 450, null), { ml: 45, ham: 45, yerSayisi: 1 });
  assert.equal(mlHesapla(0.025, 450, null).ml, 11.5); // ham 11,25 → 0,5'e
  assert.equal(mlHesapla(0.025, 450, null).ham, 11.25);
  assert.equal(mlHesapla(0.0333, 95, null).ml, 3.2); // ham < 10 → 0,1'e
  assert.equal(mlHesapla(0.1, 450, 20).yerSayisi, 3);
  assert.equal(mlHesapla(0.1, 450, 45).yerSayisi, 1); // tam sınır: tek yer
  assert.equal(mlHesapla(0.1, 450, 50).yerSayisi, 1);
  assert.equal(mlHesapla(0.02, 450, 13).yerSayisi, 1); // 9 ml ≤ 13
  assert.equal(mlHesapla(0.0333, 300, null).ml, 10); // ham 9,99 → 0,1'e: 10
  assert.equal(mlHesapla(1 / 30, 450, null).ml, 15); // ham 15,0000… kayan nokta gürültüsü yuvarlamayı bozmaz
  assert.equal(mlHesapla(0.15, 31, null).ml, 4.7); // 0,15 × 31 = 4,6499999… (kayan nokta) → 4,65 → 4,7
  assert.equal(mlHesapla(0.35, 45, null).ml, 16); // 15,749999… → 15,75 → 16
});

test('urunSecHesaplanabilirUrunHesaplanamayanTekEtkenlidenOnce', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-kombi', ad: 'Zeta Kombi', etkenler: ['ornek_antibiyotik', 'ornek_nsaii'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
  ]);
  const s = urunSec(ILAC, veri, 'inek');
  assert.equal(s.urun.urunId, 't-kombi');
  assert.equal(s.hesaplanabilir, true);
  assert.equal(s.digerSayisi, 1); // ornek-u1
  assert.equal(s.kayit, veri.kub.urunler['t-kombi']);
});

test('urunSecYalnizBuzagiUrunuInekteSecilmezBuzagidaSecilir', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-buz', ad: 'Buzağı Ürünü', etkenler: ['ornek_nsaii'], hedefTurler: ['buzagi'] }, kayit: { oran: oran(0.05, { kapsam: 'buzagi' }), yollar: ['IV'] } },
  ]);
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null };
  assert.equal(urunSec(ilac, veri, 'inek'), null);
  assert.equal(urunSec(ilac, veri, 'dana'), null);
  const s = urunSec(ilac, veri, 'buzagi');
  assert.equal(s.urun.urunId, 't-buz');
  assert.equal(s.hesaplanabilir, true);
  assert.equal(s.digerSayisi, 0);
});

test('urunSecBuzagiKapsamliOranInekteHesaplanamaz', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-kb', ad: 'Kapsam Buzağı', etkenler: ['ornek_nsaii'], hedefTurler: ['sigir'] }, kayit: { oran: oran(0.05, { kapsam: 'buzagi' }), yollar: ['IV'] } },
  ]);
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null };
  assert.equal(urunSec(ilac, veri, 'inek').hesaplanabilir, false);
  assert.equal(urunSec(ilac, veri, 'buzagi').hesaplanabilir, true);
});

test('urunSecYolUyusmayanSecilmezBosYolElenmez', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-im', ad: 'Kas İçi Ürün', etkenler: ['ornek_mineral'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
  ]);
  const meme = { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'İntramammer', not: null };
  assert.equal(urunSec(meme, veri, 'inek'), null);
  // ürünün yolu bilinmiyor (boş) → elenmez
  veri.kub.urunler['t-im'].yollar = [];
  assert.equal(urunSec(meme, veri, 'inek').urun.urunId, 't-im');
  // protokol yolu çözülemiyor (boş) → elenmez
  veri.kub.urunler['t-im'].yollar = ['IM'];
  assert.equal(urunSec({ ...meme, yol: 'Gerektiğinde' }, veri, 'inek').urun.urunId, 't-im');
  // kesişim yeterli: "IM / SC" protokolü, SC ürün
  veri.kub.urunler['t-im'].yollar = ['SC'];
  assert.equal(urunSec({ ...meme, yol: 'IM / SC' }, veri, 'inek').urun.urunId, 't-im');
});

test('urunSecBelgeUyumsuzSigirHedefDegilVeSigirDisiUrunSecilmez', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-uy', ad: 'Uyumsuz', etkenler: ['ornek_mineral'] }, kayit: { oran: oran(0.1), belgeUyumsuz: true } },
    { urun: { urunId: 't-hd', ad: 'Hedef Değil', etkenler: ['ornek_mineral'] }, kayit: { oran: oran(0.1), sigirHedefDegil: true } },
    { urun: { urunId: 't-ky', ad: 'Koyun', etkenler: ['ornek_mineral'], hedefTurler: ['koyun'] }, kayit: { oran: oran(0.1) } },
  ]);
  assert.equal(urunSec({ etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV' }, veri, 'inek'), null);
});

test('urunSecBuzagidaKullanilmazDiyenUrunBuzagidaSecilmez', async () => {
  // Gerçek örnek: Seftio-Taç 4.9 "Ürün buzağılarda kullanılmamalıdır" ile biter.
  const veri = await veriHazirla([
    { urun: { urunId: 't-sef', ad: 'Seftio Örnek', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.02), doz: 'Her 50 kg vücut ağırlığı için günde 1 ml.\nÜrün buzağılarda kullanılmamalıdır.' } },
  ]);
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'SC' };
  assert.equal(urunSec(ilac, veri, 'buzagi'), null);
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-sef');
  for (const doz of ['Buzağılara kullanılmaz.', 'Buzağıda kullanılmamalıdır.', 'buzağılarda uygulanmamalıdır']) {
    veri.kub.urunler['t-sef'].doz = doz;
    assert.equal(urunSec(ilac, veri, 'buzagi'), null, doz);
  }
});

test('urunSecSiralama', async () => {
  const ilac = { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV' };
  const sec = async (urunler) => urunSec(ilac, await veriHazirla(urunler), 'inek').urun.urunId;
  const u = (urunId, ad, etkenler = ['ornek_mineral']) => ({ urunId, ad, etkenler });
  // arınma güveni yüksek olan önce
  assert.equal(await sec([
    { urun: u('a', 'Alfa'), kayit: { oran: oran(0.1), sigir: { guven: 'dusuk' } } },
    { urun: u('b', 'Beta'), kayit: { oran: oran(0.1), sigir: { guven: 'yuksek' } } },
  ]), 'b');
  // daha az etken önce
  assert.equal(await sec([
    { urun: u('a', 'Alfa', ['ornek_mineral', 'ornek_nsaii']), kayit: { oran: DUSUK } },
    { urun: u('b', 'Beta'), kayit: { oran: DUSUK } },
  ]), 'b');
  // KÜB metni olmayan (metinYok ya da kayıt yok) sona
  assert.equal(await sec([
    { urun: u('a', 'Alfa'), kayit: { metinYok: true, oran: undefined, sigir: { guven: 'yuksek' } } },
    { urun: u('c', 'Celal'), kayit: null },
    { urun: u('b', 'Beta'), kayit: { oran: DUSUK } },
  ]), 'b');
  // ad (Türkçe sıralama): Çam, Dut'tan önce
  assert.equal(await sec([
    { urun: u('d', 'Dut'), kayit: { oran: DUSUK } },
    { urun: u('c', 'Çam'), kayit: { oran: DUSUK } },
  ]), 'c');
});

test('urunSecYalnizMlKgKaynakliYuksekGuvenliOranHesaplanabilir', async () => {
  const ilac = { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV' };
  for (const o of [DUSUK, oran(0.1, { kaynak: 'mg_kg' }), oran(null), oran(0), oran(0.1, { guven: 'dusuk' })]) {
    const veri = await veriHazirla([{ urun: { urunId: 't', ad: 'Tek', etkenler: ['ornek_mineral'] }, kayit: { oran: o } }]);
    assert.equal(urunSec(ilac, veri, 'inek').hesaplanabilir, false, JSON.stringify(o));
  }
  const veri = await veriHazirla([{ urun: { urunId: 't', ad: 'Tek', etkenler: ['ornek_mineral'] }, kayit: null }]);
  assert.equal(urunSec(ilac, veri, 'inek').hesaplanabilir, false);
});

const ETKENLER = [
  { id: 'test_ameg_a', ad: 'AMEG A test', sinif: 'antimikrobiyal', ameg: 'A' },
  { id: 'kloramfenikol', ad: 'Kloramfenikol', sinif: 'antimikrobiyal', ameg: null },
  { id: 'test_urunsuz', ad: 'Ürünsüz test', sinif: 'nsaii', ameg: null },
];
const hastalik = (ek = {}) => ({
  id: 'test_h', ad: 'Test hastalığı', tedaviKipi: 'normal', antibiyotikEndikeDegil: false,
  protokol: {
    ilaclar: [
      { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null },
      { etkenId: 'test_urunsuz', sinif: 'nsaii', sira: 1, yol: 'IV', not: null },
      { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 2, yol: 'IV', not: null },
      { etkenId: 'test_ameg_a', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null },
      { etkenId: 'kloramfenikol', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null },
      { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null },
    ],
    destekleyici: ['Sıvı desteği'], bakim: ['Havalandırma'], ihbarAdimlari: [],
  },
  onay: { durum: 'taslak' },
  ...ek,
});
const URUNLER = [
  { urun: { urunId: 't-nsaii', ad: 'NSAİİ Ürün', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.025, { yerBasinaMaxMl: 5 }), yollar: ['IV'] } },
  { urun: { urunId: 't-ab', ad: 'AB Ürün', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
  { urun: { urunId: 't-ameg', ad: 'AMEG A Ürün', etkenler: ['test_ameg_a'] }, kayit: { oran: oran(0.1) } },
  { urun: { urunId: 't-klor', ad: 'Klor Ürün', etkenler: ['kloramfenikol'] }, kayit: { oran: oran(0.1) } },
];

test('tedaviOnerisiYapisiGruplarVeHesap', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  const o = tedaviOnerisi(hastalik(), veri, { yas: 'inek', kilo: 450, yasAy: null });
  assert.equal(o.taslak, true);
  assert.equal(o.ilacOnerilmez, false);
  assert.equal(o.antibiyotikEndikeDegil, false);
  assert.equal(o.kilo, 450);
  assert.equal(o.kiloUyari, null);
  assert.deepEqual(o.destekleyici, ['Sıvı desteği']);
  assert.deepEqual(o.bakim, ['Havalandırma']);
  // antimikrobiyal grup önce; sonra ilk görünme sırası. sira 2 (ornek_mineral), AMEG A ve yasak etken yok.
  assert.deepEqual(o.gruplar.map((g) => g.sinif), ['antimikrobiyal', 'nsaii']);
  assert.deepEqual(o.gruplar.map((g) => g.satirlar.map((s) => s.ilac.etkenId)), [['ornek_antibiyotik'], ['ornek_nsaii', 'test_urunsuz']]);
  const [ab] = o.gruplar[0].satirlar;
  assert.equal(ab.etken.id, 'ornek_antibiyotik');
  assert.equal(ab.secim.urun.urunId, 't-ab');
  assert.equal(ab.neden, null);
  assert.equal(ab.hesap.ml, 45);
  assert.equal(ab.hesap.ifade, '0.1 ml/kg');
  assert.equal(ab.hesap.cumle, 'Örnek cümle 0.1 ml/kg');
  const [ns, urunsuz] = o.gruplar[1].satirlar;
  assert.deepEqual({ ml: ns.hesap.ml, ham: ns.hesap.ham, yerSayisi: ns.hesap.yerSayisi }, { ml: 11.5, ham: 11.25, yerSayisi: 3 });
  assert.equal(urunsuz.secim, null);
  assert.equal(urunsuz.hesap, null);
  assert.equal(urunsuz.neden, 'urun_yok');
  assert.equal(urunsuz.etken.ad, 'Ürünsüz test');
});

test('tedaviOnerisiOnayliHastalikTaslakDegil', async () => {
  const veri = await veriHazirla();
  const h = veri.hastaliklar.find((x) => x.id === 'ornek_solunum');
  const o = tedaviOnerisi(h, veri, { yas: 'inek', kilo: 450 });
  assert.equal(o.taslak, false);
  // ornek-u1'de oran yok → oran_yok
  assert.equal(o.gruplar[0].sinif, 'antimikrobiyal');
  assert.equal(o.gruplar[0].satirlar[0].secim.urun.urunId, 'ornek-u1');
  assert.equal(o.gruplar[0].satirlar[0].neden, 'oran_yok');
  assert.equal(o.gruplar[0].satirlar[0].hesap, null);
});

test('tedaviOnerisiYasakVeYokKipindeIlacOnerilmez', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  for (const tedaviKipi of ['yasak', 'yok']) {
    const o = tedaviOnerisi(hastalik({ tedaviKipi }), veri, { yas: 'inek', kilo: 450 });
    assert.equal(o.ilacOnerilmez, true);
    assert.deepEqual(o.gruplar, []);
  }
  assert.equal(tedaviOnerisi(hastalik({ tedaviKipi: 'semptomatik' }), veri, { yas: 'inek', kilo: 450 }).ilacOnerilmez, false);
});

test('tedaviOnerisiAntibiyotikEndikeDegilseAntimikrobiyalAtlanir', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  const o = tedaviOnerisi(hastalik({ antibiyotikEndikeDegil: true }), veri, { yas: 'inek', kilo: 450 });
  assert.equal(o.antibiyotikEndikeDegil, true);
  assert.deepEqual(o.gruplar.map((g) => g.sinif), ['nsaii']);
});

test('tedaviOnerisiKiloYokVeGecersiz', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  const satir = (girdi) => tedaviOnerisi(hastalik(), veri, girdi).gruplar[0].satirlar[0];
  const yok = satir({ yas: 'inek', kilo: null });
  assert.equal(yok.neden, 'kilo_yok');
  assert.equal(yok.hesap, null);
  assert.equal(yok.secim.urun.urunId, 't-ab');
  for (const kilo of [5, 1500]) {
    const o = tedaviOnerisi(hastalik(), veri, { yas: 'inek', kilo });
    assert.equal(o.kiloUyari.tur, 'gecersiz');
    assert.equal(o.gruplar[0].satirlar[0].neden, 'kilo_gecersiz');
    assert.equal(o.gruplar[0].satirlar[0].hesap, null);
  }
  // yumuşak uyarı: hesap yapılır
  const o = tedaviOnerisi(hastalik(), veri, { yas: 'inek', kilo: 100 });
  assert.equal(o.kiloUyari.tur, 'yumusak');
  assert.equal(o.gruplar[0].satirlar[0].hesap.ml, 10);
  // ürünü olmayan satırda neden urun_yok (kilo geçersiz olsa da)
  assert.equal(tedaviOnerisi(hastalik(), veri, { yas: 'inek', kilo: 5 }).gruplar[1].satirlar[1].neden, 'urun_yok');
});

test('gosterilebilirMiYasakVeAmegAEleniyor', async () => {
  const veri = await veriHazirla([], { etkenler: ETKENLER });
  const uyari = console.warn;
  console.warn = () => {};
  try {
    assert.equal(gosterilebilirMi({ etkenId: 'test_ameg_a' }, veri), false);
    assert.equal(gosterilebilirMi({ etkenId: 'kloramfenikol' }, veri), false);
    assert.equal(gosterilebilirMi({ etkenId: 'ornek_nsaii' }, veri), true);
  } finally { console.warn = uyari; }
});

test('urunSecProtokolDisiEtkenliKombineUrunSonra', async () => {
  const ilac = { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV' };
  const veri = await veriHazirla([
    // hesaplanabilir ama protokolde olmayan bir etken (ör. Novacoc'taki metamizol) içeriyor
    { urun: { urunId: 't-kombi', ad: 'Alfa Kombi', etkenler: ['ornek_mineral', 'test_metamizol'] }, kayit: { oran: oran(0.5), yollar: ['IV'] } },
    // tek etkenli, hesaplanamaz
    { urun: { urunId: 't-tek', ad: 'Zeta Tek', etkenler: ['ornek_mineral'] }, kayit: { oran: DUSUK, yollar: ['IV'] } },
  ]);
  // protokol etken kümesi verilmezse ilk anahtar yok: hesaplanabilir kombine önce
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-kombi');
  const s = urunSec(ilac, veri, 'inek', { protokolEtkenleri: new Set(['ornek_mineral', 'ornek_nsaii']) });
  assert.equal(s.urun.urunId, 't-tek');
  assert.equal(s.hesaplanabilir, false);
  assert.equal(s.digerSayisi, 1);
  // kombinenin tüm etkenleri protokoldeyse (herhangi bir sırada) cezalandırılmaz
  assert.equal(urunSec(ilac, veri, 'inek', { protokolEtkenleri: new Set(['ornek_mineral', 'test_metamizol']) }).urun.urunId, 't-kombi');
});

test('tedaviOnerisiAyniUrunIkinciSatirdaMlGostermez', async () => {
  // hipomagnezemi benzeri: Ca ve Mg satırları aynı kombine ürüne çıkıyor
  const veri = await veriHazirla([
    { urun: { urunId: 't-camg', ad: 'CaMg Kombi', etkenler: ['ornek_mineral', 'test_mg'] }, kayit: { oran: oran(0.5), yollar: ['IV'] } },
  ], { etkenler: [{ id: 'test_mg', ad: 'Magnezyum test', sinif: 'metabolik', ameg: null }] });
  const h = hastalik({
    protokol: {
      ilaclar: [
        { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV (yavaş)', not: null },
        { etkenId: 'test_mg', sinif: 'metabolik', sira: 1, yol: 'SC; IV yalnız yavaş ve kombine çözeltiyle', not: null },
      ],
      destekleyici: [], bakim: [], ihbarAdimlari: [],
    },
  });
  const [ca, mg] = tedaviOnerisi(h, veri, { yas: 'inek', kilo: 450 }).gruplar[0].satirlar;
  assert.equal(ca.hesap.ml, 225);
  assert.equal(ca.neden, null);
  assert.equal(ca.ayniUrunIle, null);
  assert.equal(mg.secim.urun.urunId, 't-camg');
  assert.equal(mg.hesap, null);
  assert.equal(mg.neden, 'ayni_urun');
  assert.equal(mg.ayniUrunIle, 'ornek_mineral');
});

test('tedaviOnerisiAyniUrunEkranSirasinaGore', async () => {
  // protokolde NSAİİ önce, antimikrobiyal sonra; ekranda antimikrobiyal grup önce → ml antimikrobiyal satırda
  const veri = await veriHazirla([
    { urun: { urunId: 't-abns', ad: 'AB+NSAİİ', etkenler: ['ornek_antibiyotik', 'ornek_nsaii'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
  ]);
  const h = hastalik({
    protokol: {
      ilaclar: [
        { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IM', not: null },
        { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null },
      ],
      destekleyici: [], bakim: [], ihbarAdimlari: [],
    },
  });
  const o = tedaviOnerisi(h, veri, { yas: 'inek', kilo: 450 });
  assert.deepEqual(o.gruplar.map((g) => g.sinif), ['antimikrobiyal', 'nsaii']);
  const ab = o.gruplar[0].satirlar[0];
  const ns = o.gruplar[1].satirlar[0];
  assert.equal(ab.secim.urun.urunId, 't-abns');
  assert.equal(ab.hesap.ml, 45);
  assert.equal(ns.secim.urun.urunId, 't-abns');
  assert.equal(ns.neden, 'ayni_urun');
  assert.equal(ns.ayniUrunIle, 'ornek_antibiyotik');
});

test('urunSecYoluBilinenUrunYoluBilinmeyendenOnce', async () => {
  // dijital dermatit benzeri: "Lokal (sprey ya da sargı)" satırı; ad sırasında önde gelen yolu bilinmeyen ürün seçilmez
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'Lokal (sprey ya da sargı)' };
  const veri = await veriHazirla([
    { urun: { urunId: 't-oral', ad: 'Aaa Oral Toz', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: [] } },
    { urun: { urunId: 't-sprey', ad: 'Zzz Sprey', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['TOPIKAL'] } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  const s = urunSec(ilac, veri, 'buzagi');
  assert.equal(s.urun.urunId, 't-sprey');
  assert.equal(s.yolBilinmiyor, false);
  // yolu bilinen ve hesaplanabilir olmasa da, hesaplanabilir yolu bilinmeyenden önce
  veri.kub.urunler['t-oral'].oran = oran(0.1);
  assert.equal(urunSec(ilac, veri, 'buzagi').urun.urunId, 't-sprey');
  // yalnız yolu bilinmeyen ürün kalırsa o seçilir ve yolBilinmiyor işaretlenir
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 't-sprey');
  const y = urunSec(ilac, veri, 'buzagi');
  assert.equal(y.urun.urunId, 't-oral');
  assert.equal(y.yolBilinmiyor, true);
  // satırın yolu çözülemiyorsa yolBilinmiyor false
  assert.equal(urunSec({ ...ilac, yol: 'Gerektiğinde' }, veri, 'buzagi').yolBilinmiyor, false);
});

// Combilac 4 LC (laktasyon) ve Rilexine DC 375 (kuru dönem) örnekli meme içi ürünler
const MEME = [
  { urun: { urunId: 't-lc', ad: 'Combilac 4 LC Örnek', etkenler: ['ornek_antibiyotik'], form: 'intramammer süspansiyon' }, kayit: { oran: DUSUK, yollar: ['IMM'], doz: 'Her sağımdan sonra meme lobuna bir şırınga.' } },
  { urun: { urunId: 't-dc', ad: 'Rilexine DC 375 Örnek', etkenler: ['ornek_antibiyotik'], form: 'intramammer süspansiyon' }, kayit: { oran: DUSUK, yollar: ['IMM'], doz: 'Son sağımdan sonra her meme lobuna bir şırınga.' } },
];

test('kuruDonemUrunuMu', () => {
  assert.equal(kuruDonemUrunuMu({ ad: 'Rilexine DC 375 mg' }, null), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Masticol-DC' }, null), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Syvamast Dry' }, null), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Masticure Kuru Dönem' }, null), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Bovimast' }, { doz: 'İneklerde kuru döneme girmeden önceki son sağımda…' }), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Örnek' }, { doz: 'Kuruya çıkarılan ineklerde…' }), true);
  assert.equal(kuruDonemUrunuMu({ ad: 'Combilac 4 LC' }, { doz: 'Her sağımdan sonra.' }), false);
  assert.equal(kuruDonemUrunuMu({ ad: 'Pendcillin' }, null), false); // "dc" sözcük içinde değil
});

test('urunSecMemeIciKuruDonemVeLaktasyonAyrimi', async () => {
  const veri = await veriHazirla(MEME);
  const kuru = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'İntramammer (kuru dönem)' };
  const laktasyon = { ...kuru, yol: 'İntramammer' };
  // kuru dönem satırı: yalnız kuru dönem ürünü (laktasyon ürünü ve kuru dönem olmayan ornek-u1 elenir)
  const k = urunSec(kuru, veri, 'inek');
  assert.equal(k.urun.urunId, 't-dc');
  assert.equal(k.digerSayisi, 0);
  // laktasyon satırı: kuru dönem ürünü elenir (ornek-u1'in yolu bilinmiyor, elenmez ama sonra gelir)
  const l = urunSec(laktasyon, veri, 'inek');
  assert.equal(l.urun.urunId, 't-lc');
  assert.equal(l.digerSayisi, 1);
  assert.equal(urunSec(laktasyon, { ...veri, urunler: veri.urunler.filter((u) => u.urunId === 't-dc') }, 'inek'), null);
  // meme içi olmayan satırda ayrım yok: kuru dönem adlı ürün IM satırında seçilebilir
  veri.kub.urunler['t-dc'].yollar = ['IM'];
  assert.equal(urunSec({ ...kuru, yol: 'IM' }, veri, 'inek').urun.urunId, 't-dc');
  // kuru dönem ürünü yoksa kuru dönem satırına laktasyon ürünü önerilmez
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 't-dc');
  assert.equal(urunSec(kuru, veri, 'inek'), null);
});

test('tedaviOnerisiOncekiKombineUrunBuEtkeniVeriyorsaMlYok', async () => {
  // Önceki satır AB+NSAİİ kombine ürünü seçti; NSAİİ satırı başka (tek etkenli, hesaplanabilir) ürün seçse de ml yok
  const veri = await veriHazirla([
    { urun: { urunId: 't-abns', ad: 'AB+NSAİİ', etkenler: ['ornek_antibiyotik', 'ornek_nsaii'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
    { urun: { urunId: 't-ns', ad: 'NSAİİ Tek', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.02), yollar: ['IV'] } },
  ]);
  const h = hastalik({
    protokol: {
      ilaclar: [
        { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null },
        { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null },
      ],
      destekleyici: [], bakim: [], ihbarAdimlari: [],
    },
  });
  const o = tedaviOnerisi(h, veri, { yas: 'inek', kilo: 450 });
  const ab = o.gruplar[0].satirlar[0];
  const ns = o.gruplar[1].satirlar[0];
  assert.equal(ab.secim.urun.urunId, 't-abns');
  assert.equal(ab.hesap.ml, 45);
  assert.equal(ns.secim.urun.urunId, 't-ns');
  assert.equal(ns.hesap, null);
  assert.equal(ns.neden, 'ayni_urun');
  assert.equal(ns.ayniUrunIle, 'ornek_antibiyotik');
});

test('urunSecBuzagidaKullanilmazBuyukHarfle', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-sef', ad: 'Seftio Örnek', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.02), doz: 'ÜRÜN BUZAĞILARDA KULLANILMAMALIDIR.' } },
  ]);
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'SC' };
  assert.equal(urunSec(ilac, veri, 'buzagi'), null);
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-sef');
});
