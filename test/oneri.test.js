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
  // KÜB metni olmayan (metinYok ya da kayıt yok) seçilmez
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
  // KÜB kaydı olmayan tek ürün seçilmez (B2: KÜB metni yoksa ürünü hekim seçer)
  const veri = await veriHazirla([{ urun: { urunId: 't', ad: 'Tek', etkenler: ['ornek_mineral'] }, kayit: null }]);
  assert.equal(urunSec(ilac, veri, 'inek'), null);
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
  // ornek_solunum yaş grupları buzağı / dana
  const o = tedaviOnerisi(h, veri, { yas: 'dana', kilo: 450 });
  assert.equal(o.taslak, false);
  assert.equal(o.yasUymuyor, false);
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

// --- K8 düzeltme dalgası B ---
const satirlarOf = (o) => o.gruplar.flatMap((g) => g.satirlar);
const tekSatirli = (ilac, ek = {}) => hastalik({ protokol: { ilaclar: [ilac], destekleyici: [], bakim: [], ihbarAdimlari: [] }, ...ek });

test('B1 tedaviOnerisiYasGrubunaUymayanHayvandaMlYokUrunVar', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  const h = hastalik({ yasGruplari: ['buzagi', 'dana'] });
  const o = tedaviOnerisi(h, veri, { yas: 'inek', kilo: 450 });
  assert.equal(o.yasUymuyor, true);
  assert.deepEqual(o.yasGruplari, ['buzagi', 'dana']);
  const [ab, ns, urunsuz] = satirlarOf(o);
  assert.equal(ab.secim.urun.urunId, 't-ab'); // ürün seçimi yine gösterilir
  assert.equal(ab.hesap, null);
  assert.equal(ab.neden, 'yas_uymuyor');
  assert.equal(ns.neden, 'yas_uymuyor');
  assert.equal(ns.hesap, null);
  assert.equal(urunsuz.neden, 'urun_yok');
  // uyan yaş: ml hesaplanır
  const b = tedaviOnerisi(h, veri, { yas: 'dana', kilo: 450 });
  assert.equal(b.yasUymuyor, false);
  assert.equal(satirlarOf(b)[0].hesap.ml, 45);
  // yaş grubu tanımsız ya da yaş yok: denetim yok
  assert.equal(tedaviOnerisi(hastalik(), veri, { yas: 'inek', kilo: 450 }).yasUymuyor, false);
  assert.equal(tedaviOnerisi(h, veri, { yas: null, kilo: 450 }).yasUymuyor, false);
});

test('B2 metabolikSatirdaYalnizHesaplanabilirUrunYoksaHekimSecer', async () => {
  const ilac = { etkenId: 'ornek_mineral', sinif: 'metabolik', sira: 1, yol: 'IV', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-a', ad: 'Alfa Tonik', etkenler: ['ornek_mineral'] }, kayit: { oran: DUSUK, yollar: ['IV'] } },
    { urun: { urunId: 't-b', ad: 'Beta İnfüzyon', etkenler: ['ornek_mineral'] }, kayit: { oran: DUSUK, yollar: ['IV'] } },
  ]);
  const [s] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(s.secim, null);
  assert.equal(s.neden, 'hekim_secer');
  assert.equal(s.urunSayisi, 2);
  // metabolik dışı satırda hesaplanamayan ürün yine seçilir
  const [d] = satirlarOf(tedaviOnerisi(tekSatirli({ ...ilac, sinif: 'diger' }), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(d.secim.urun.urunId, 't-a');
  assert.equal(d.neden, 'oran_yok');
  // hesaplanabilir ürün varsa (ad sırasında sonda olsa da) o seçilir
  veri.kub.urunler['t-b'].oran = oran(0.5);
  const [m] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(m.secim.urun.urunId, 't-b');
  assert.equal(m.hesap.ml, 225);
  assert.equal(m.urunSayisi, 2);
  // hesaplanabilir tek ürün protokol dışı etken içeriyorsa (Novacoc: metamizol, kafein) metabolik satırda seçilmez
  veri.urunler.find((u) => u.urunId === 't-b').etkenler = ['ornek_mineral', 'test_metamizol'];
  const [n] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(n.secim, null);
  assert.equal(n.neden, 'hekim_secer');
  veri.urunler.find((u) => u.urunId === 't-b').etkenler = ['ornek_mineral'];
  veri.urunler.find((u) => u.urunId === 't-b').digerEtkenler = ['Kafein'];
  assert.equal(satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }))[0].neden, 'hekim_secer');
});

test('B2 kubMetniOlanUrunVarkenMetinYokUrunSecilmezHepsiMetinYoksaHekimSecer', async () => {
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'IV', not: null };
  const veri = await veriHazirla([
    // metinYok ama her anahtarda önde (ad, tek etken)
    { urun: { urunId: 't-my', ad: 'Aaa Metinsiz', etkenler: ['ornek_nsaii'] }, kayit: { metinYok: true, doz: null, oran: undefined, yollar: ['IV'] } },
    { urun: { urunId: 't-k', ad: 'Zzz KÜB', etkenler: ['ornek_nsaii', 'ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['IV'] } },
  ]);
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-k');
  assert.equal(urunSec(ilac, veri, 'inek').digerSayisi, 1);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 't-k');
  assert.equal(urunSec(ilac, veri, 'inek'), null);
  const [s] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(s.secim, null);
  assert.equal(s.neden, 'hekim_secer');
  assert.equal(s.urunSayisi, 1);
});

test('B3 sagmalIndeKullanilmazUrunInekVeDuvedeSonraSecilirseIsaretli', async () => {
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-sy', ad: 'Aaa Sütte Yok', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: oran(0.1), yollar: ['IM'], sigir: { et_gun: 28, sut: 'kullanilmaz', guven: 'dusuk' } } },
    { urun: { urunId: 't-sv', ad: 'Bbb Süt Var', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['IM'], sigir: { et_gun: 28, sut: { saat: 72 }, guven: 'yuksek' } } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  // sağmal anahtarı hesaplanabilirden önce: inek ve düvede süt arınmalı ürün
  for (const yas of ['inek', 'duve']) assert.equal(urunSec(ilac, veri, yas).urun.urunId, 't-sv', yas);
  // dana / boğa / buzağıda anahtar yok
  for (const yas of ['dana', 'boga', 'buzagi']) {
    const s = urunSec(ilac, veri, yas);
    assert.equal(s.urun.urunId, 't-sy', yas);
    assert.equal(s.sutYasak, false, yas);
  }
  // tek seçenekse seçilir ve işaretlenir (güven düşük olsa da)
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 't-sv');
  const s = urunSec(ilac, veri, 'inek');
  assert.equal(s.urun.urunId, 't-sy');
  assert.equal(s.sutYasak, true);
  // 4.11'de "süt veren ineklerde tavsiye edilmez" (sut kullanilmaz değil) de sayılır
  veri.kub.urunler['t-sy'].sigir = { et_gun: 28, sut: null, guven: 'dusuk' };
  veri.kub.urunler['t-sy'].arinma = 'Et için 28 gün. Süt veren ineklerde kullanılması tavsiye edilmez.';
  assert.equal(urunSec(ilac, veri, 'inek').sutYasak, true);
  // sigirArinmasi'nın okuyamadığı yasak cümlesi (Selectan): "süt elde edilen sığırlarda kullanılmaz"
  veri.kub.urunler['t-sy'].arinma = 'Sığırlar 30 gün geçmeden kesime gönderilmemelidir. İnsan tüketimi için süt elde edilen sığırlarda (kuru dönem dahil) kullanılmaz.';
  assert.equal(urunSec(ilac, veri, 'inek').sutYasak, true);
  veri.kub.urunler['t-sy'].arinma = 'Et için 28 gün. Süt için 3 gün.';
  assert.equal(urunSec(ilac, veri, 'inek').sutYasak, false);
});

test('B3 kuruDonemSatirindaSagmalIsaretiYok', async () => {
  const veri = await veriHazirla(MEME);
  veri.kub.urunler['t-dc'].sigir = { sut: 'kullanilmaz', guven: 'yuksek' };
  const kuru = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'İntramammer (kuru dönem)' };
  const s = urunSec(kuru, veri, 'inek');
  assert.equal(s.urun.urunId, 't-dc');
  assert.equal(s.sutYasak, false);
});

test('B3 yolAnahtariSagmalAnahtarindanOnce', async () => {
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-yb', ad: 'Aaa Yolsuz', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: [], sigir: { sut: { saat: 72 }, guven: 'yuksek' } } },
    { urun: { urunId: 't-sy', ad: 'Bbb Sütte Yok', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['IM'], sigir: { sut: 'kullanilmaz', guven: 'yuksek' } } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-sy');
});

test('B3 arinmaOkunamadiIsareti', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-d', ad: 'Düşük Arınma', etkenler: ['ornek_mineral'] }, kayit: { oran: DUSUK, yollar: ['IV'], sigir: { guven: 'dusuk' } } },
  ]);
  const ilac = { etkenId: 'ornek_mineral', sinif: 'diger', sira: 1, yol: 'IV' };
  assert.equal(urunSec(ilac, veri, 'inek').arinmaOkunamadi, true);
  veri.kub.urunler['t-d'].sigir = { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' };
  assert.equal(urunSec(ilac, veri, 'inek').arinmaOkunamadi, false);
});

test('B4 urunYollariVeProtokolYoluGenisMi', async () => {
  const veri = await veriHazirla([
    { urun: { urunId: 't-la', ad: 'LA Ürün', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IV / IM' };
  const s = urunSec(ilac, veri, 'inek');
  assert.deepEqual(s.urunYollari, ['IM']);
  assert.equal(s.yolGenis, true);
  assert.equal(urunSec({ ...ilac, yol: 'IM' }, veri, 'inek').yolGenis, false);
  // satırın yolu çözülemiyorsa geniş sayılmaz; ürünün yolu yoksa da
  assert.equal(urunSec({ ...ilac, yol: 'Gerektiğinde' }, veri, 'inek').yolGenis, false);
  veri.kub.urunler['t-la'].yollar = [];
  assert.equal(urunSec(ilac, veri, 'inek').yolGenis, false);
  assert.deepEqual(urunSec(ilac, veri, 'inek').urunYollari, []);
});

test('B6 yerBolmeYoluVeBuyukHacim', async () => {
  // satır yolu çözülemiyor: ürünün yolu elenmeye yol açmaz, büyük hacim ürünün yoluna bakar
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'Gerektiğinde', not: null };
  const hazir = async (o, yollar) => {
    const veri = await veriHazirla([{ urun: { urunId: 't', ad: 'Tek', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: o, yollar } }]);
    veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
    return satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }))[0].hesap;
  };
  const yb = await hazir(oran(0.03, { yerBasinaMaxMl: 5, yerBasinaYol: 'IM' }), ['IM', 'IV']);
  assert.deepEqual({ ml: yb.ml, yerSayisi: yb.yerSayisi, yerBasinaMaxMl: yb.yerBasinaMaxMl, yerBasinaYol: yb.yerBasinaYol, buyukHacim: yb.buyukHacim },
    { ml: 13.5, yerSayisi: 3, yerBasinaMaxMl: 5, yerBasinaYol: 'IM', buyukHacim: false });
  // IM / SC, ml > 20 ve KÜB sınırı yok → büyük hacim
  assert.equal((await hazir(oran(0.1), ['IM'])).buyukHacim, true);
  assert.equal((await hazir(oran(0.1), ['SC', 'IV'])).buyukHacim, true);
  assert.equal((await hazir(oran(0.1), ['IV'])).buyukHacim, false);
  assert.equal((await hazir(oran(0.1), ['ORAL'])).buyukHacim, false);
  assert.equal((await hazir(oran(0.04), ['IM'])).buyukHacim, false); // 18 ml
  assert.equal((await hazir(oran(0.1, { yerBasinaMaxMl: 20 }), ['IM'])).buyukHacim, false); // KÜB sınırı var
});

test('B8 kediKopekHedefliUrunSigirYalnizUrundenSonraSagmalAnahtarindanSonra', async () => {
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'SC', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-kk', ad: 'Aaa %0,5', etkenler: ['ornek_nsaii'], hedefTurler: ['sigir', 'kedi', 'Köpek'] }, kayit: { oran: oran(0.1), yollar: ['SC'] } },
    { urun: { urunId: 't-s', ad: 'Bbb 20 mg', etkenler: ['ornek_nsaii'], hedefTurler: ['sigir', 'domuz'] }, kayit: { oran: DUSUK, yollar: ['SC'] } },
  ]);
  assert.equal(urunSec(ilac, veri, 'dana').urun.urunId, 't-s');
  assert.equal(urunSec(ilac, veri, 'dana').kediKopek, false);
  // sağmal anahtarı önce gelir
  veri.kub.urunler['t-s'].sigir = { sut: 'kullanilmaz', guven: 'yuksek' };
  const s = urunSec(ilac, veri, 'inek');
  assert.equal(s.urun.urunId, 't-kk');
  assert.equal(s.kediKopek, true);
});

test('B9 sabitDozluUrundeNedenSabitDoz', async () => {
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'İntramammer', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-tup', ad: 'Tüp LC', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: { ...DUSUK, sabitDoz: true }, yollar: ['IMM'] } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  const [s] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(s.neden, 'sabit_doz');
  assert.equal(s.hesap, null);
  // kilo yoksa da sabit doz (kiloya bağlı değil)
  assert.equal(satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: null }))[0].neden, 'sabit_doz');
});

test('B10 kisitlarSecimdeBuzagidaOlumsuzBuzagiKisitiEler', async () => {
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'SC' };
  const kisitlar = [{ tur: 'olumsuz', metin: 'Ürün buzağılarda kullanılmamalıdır.' }];
  const veri = await veriHazirla([
    { urun: { urunId: 't-k', ad: 'Kısıtlı', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.02, { kisitlar }), yollar: ['SC'] } },
  ]);
  assert.equal(urunSec(ilac, veri, 'buzagi'), null);
  const s = urunSec(ilac, veri, 'inek');
  assert.deepEqual(s.kisitlar, kisitlar);
  // koşullu kısıt buzağıyı elemez; buzağı geçmeyen olumsuz kısıt ve yaş kısıtı da
  for (const k of [{ tur: 'kosullu', metin: 'Rumen faaliyeti başlamamış buzağılarda kullanılmaz.' }, { tur: 'olumsuz', metin: 'Gebelikte kullanılmaz.' }, { tur: 'yas', metin: 'Yalnız buzağılarda kullanılır.' }]) {
    veri.kub.urunler['t-k'].oran = oran(0.02, { kisitlar: [k] });
    assert.equal(urunSec(ilac, veri, 'buzagi').urun.urunId, 't-k', k.metin);
  }
  // oran yoksa (kayıtta kısıt yok) boş liste
  veri.kub.urunler['t-k'].oran = undefined;
  assert.deepEqual(urunSec(ilac, veri, 'inek').kisitlar, []);
});

test('B11 ihbarliSemptomatikteIhbarOnce', async () => {
  const veri = await veriHazirla(URUNLER, { etkenler: ETKENLER });
  assert.equal(tedaviOnerisi(hastalik({ ihbari: true, tedaviKipi: 'semptomatik' }), veri, { yas: 'inek', kilo: 450 }).ihbarOnce, true);
  assert.equal(tedaviOnerisi(hastalik({ ihbari: true }), veri, { yas: 'inek', kilo: 450 }).ihbarOnce, false);
  assert.equal(tedaviOnerisi(hastalik({ tedaviKipi: 'semptomatik' }), veri, { yas: 'inek', kilo: 450 }).ihbarOnce, false);
});

test('B13 digerEtkenliUrunProtokolDisiSayilir', async () => {
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM' };
  const veri = await veriHazirla([
    { urun: { urunId: 't-pred', ad: 'Aaa Prednizolonlu', etkenler: ['ornek_antibiyotik'], digerEtkenler: ['prednizolon'] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
    { urun: { urunId: 't-tek', ad: 'Zzz Tek', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['IM'] } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-tek');
  assert.equal(urunSec(ilac, veri, 'inek', { protokolEtkenleri: new Set(['ornek_antibiyotik']) }).urun.urunId, 't-tek');
});

test('B14 buzagiKapsamliOranliUrunYetiskindeIsaretli', async () => {
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'nsaii', sira: 1, yol: 'SC' };
  const veri = await veriHazirla([
    { urun: { urunId: 't-gb', ad: 'Genç Sığır', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.025, { kapsam: 'buzagi' }), yollar: ['SC'] } },
  ]);
  const s = urunSec(ilac, veri, 'inek');
  assert.equal(s.hesaplanabilir, false);
  assert.equal(s.dozBuzagiIcin, true);
  assert.equal(urunSec(ilac, veri, 'buzagi').dozBuzagiIcin, false);
  // düşük güvenli buzağı kapsamı (oran yok) işaretlenmez
  veri.kub.urunler['t-gb'].oran = { ...DUSUK, kapsam: 'buzagi' };
  assert.equal(urunSec(ilac, veri, 'inek').dozBuzagiIcin, false);
});

// --- K8 dalga B, düzeltme turu 1 ---
test('F1 amegAyaDaBEslikciEtkenliUrunKarttaSecilmezYoksaHekimSecer', async () => {
  // Multibio benzeri: ampisilin + kolistin (AMEG B) + deksametazon; satır etkeni AMEG C
  const etkenler = [{ id: 'test_kolistin', ad: 'Kolistin test', sinif: 'antimikrobiyal', ameg: 'B' }];
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-multi', ad: 'Aaa Multi', etkenler: ['ornek_antibiyotik', 'test_kolistin'], digerEtkenler: [] }, kayit: { oran: oran(0.1), yollar: ['IM'] } },
    { urun: { urunId: 't-tek', ad: 'Zzz Tek', etkenler: ['ornek_antibiyotik'] }, kayit: { oran: DUSUK, yollar: ['IM'], sigir: { sut: 'kullanilmaz', guven: 'yuksek' } } },
  ], { etkenler });
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  // sağmal anahtarı tekli ürünü arkaya atsa da AMEG B eşlikçili ürün seçilmez
  const protokolEtkenleri = new Set(['ornek_antibiyotik', 'test_kolistin']);
  assert.equal(urunSec(ilac, veri, 'inek', { protokolEtkenleri }).urun.urunId, 't-tek');
  // tek aday AMEG B eşlikçiliyse → hekim seçer
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 't-tek');
  assert.equal(urunSec(ilac, veri, 'inek'), null);
  const [s] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(s.secim, null);
  assert.equal(s.neden, 'hekim_secer');
  assert.equal(s.urunSayisi, 1);
  // AMEG A eşlikçi de
  veri.etkenler.find((e) => e.id === 'test_kolistin').ameg = 'A';
  assert.equal(urunSec(ilac, veri, 'inek'), null);
  // satırın kendi etkeni AMEG B ise (kolistin satırı) eşlikçi kuralı uygulanmaz
  veri.etkenler.find((e) => e.id === 'test_kolistin').ameg = 'B';
  assert.equal(urunSec({ ...ilac, etkenId: 'test_kolistin' }, veri, 'inek').urun.urunId, 't-multi');
  // eşlikçi AMEG C / D ya da AMEG'siz (NSAİİ) elemez
  veri.etkenler.find((e) => e.id === 'test_kolistin').ameg = 'C';
  assert.equal(urunSec(ilac, veri, 'inek').urun.urunId, 't-multi');
});

// --- K8 son düzeltme turu (Fable yeniden denetimi) ---
test('F4 kiloKosulluKisitMlVermez', async () => {
  const ilac = { etkenId: 'ornek_nsaii', sinif: 'antiparaziter', sira: 1, yol: 'Ağızdan', not: null };
  const hazir = async (metin) => {
    const veri = await veriHazirla([
      { urun: { urunId: 't-bay', ad: 'Baycox Örnek', etkenler: ['ornek_nsaii'] }, kayit: { oran: oran(0.3, { kisitlar: [{ tur: 'kosullu', metin }] }), yollar: ['ORAL'] } },
    ]);
    return (girdi) => satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, girdi))[0];
  };
  const ust = await hazir('80 kg’dan daha ağır buzağılarda kullanılmaz.');
  const agir = ust({ yas: 'buzagi', kilo: 100 });
  assert.equal(agir.hesap, null);
  assert.equal(agir.neden, 'kisit');
  assert.deepEqual(agir.kisitEngel, { tur: 'kosullu', metin: '80 kg’dan daha ağır buzağılarda kullanılmaz.' });
  assert.equal(ust({ yas: 'buzagi', kilo: 80 }).hesap.ml, 24); // sınırda: daha ağır değil
  assert.equal(ust({ yas: 'buzagi', kilo: 45 }).hesap.ml, 13.5);
  assert.equal(ust({ yas: 'buzagi', kilo: null }).neden, 'kilo_yok'); // kilo yok: kısıt denetimi yok
  assert.equal(ust({ yas: 'buzagi', kilo: 45 }).kisitEngel, null);
  // "fazla" ve "kg'ın üzerinde"
  assert.equal((await hazir("120 kg'dan fazla hayvanlarda kullanılmamalıdır."))({ yas: 'buzagi', kilo: 150 }).neden, 'kisit');
  // alt sınır: "kg'ın altında" / "kg'dan az" / "kg'dan hafif"
  const alt = await hazir("Vücut ağırlığı 200 kg'ın altında olan hayvanlara uygulanmamalıdır.");
  assert.equal(alt({ yas: 'dana', kilo: 150 }).neden, 'kisit');
  assert.equal(alt({ yas: 'dana', kilo: 250 }).hesap.ml, 75);
  assert.equal((await hazir("Vücut ağırlığı 200 kg'dan az olan hayvanlara uygulanmamalıdır."))({ yas: 'dana', kilo: 150 }).neden, 'kisit');
  assert.equal((await hazir('1,25 kg’ın altında olan hayvanlara uygulanmamalıdır.'))({ yas: 'buzagi', kilo: 45 }).hesap.ml, 13.5);
  // kilo içermeyen koşullu kısıt (rumen) ml'yi kesmez
  assert.equal((await hazir('Geviş getiren sığırlarda kullanılmaz.'))({ yas: 'dana', kilo: 250 }).hesap.ml, 75);
});

test('F5 enIyiAdayProtokolDisiEtkenliyseHekimSecer', async () => {
  // Vetamplius Mucosol benzeri: ampisilin + bromheksin (protokolde yok); meme içi tüpler de kloksasilinli
  const ilac = { etkenId: 'ornek_antibiyotik', sinif: 'antimikrobiyal', sira: 1, yol: 'IM', not: null };
  const veri = await veriHazirla([
    { urun: { urunId: 't-brom', ad: 'Aaa Bromheksinli', etkenler: ['ornek_antibiyotik', 'test_bromheksin'] }, kayit: { oran: oran(0.1), yollar: ['IM', 'IV'] } },
    { urun: { urunId: 't-tup', ad: 'Bbb LC', etkenler: ['ornek_antibiyotik', 'test_kloksasilin'], form: 'süspansiyon' }, kayit: { oran: DUSUK, yollar: [] } },
    { urun: { urunId: 't-diger', ad: 'Ccc Kafeinli', etkenler: ['ornek_antibiyotik'], digerEtkenler: ['Kafein'] }, kayit: { oran: DUSUK, yollar: ['IM'] } },
  ]);
  veri.urunler = veri.urunler.filter((u) => u.urunId !== 'ornek-u1');
  const protokolEtkenleri = new Set(['ornek_antibiyotik', 'ornek_nsaii']);
  assert.equal(urunSec(ilac, veri, 'inek', { protokolEtkenleri }), null);
  const [s] = satirlarOf(tedaviOnerisi(tekSatirli(ilac), veri, { yas: 'inek', kilo: 450 }));
  assert.equal(s.secim, null);
  assert.equal(s.neden, 'hekim_secer');
  assert.equal(s.urunSayisi, 3);
  // protokol dışı etkeni olmayan aday varsa o seçilir
  veri.urunler.push({ firma: 'Test', form: 'çözelti', hedefTurler: ['sigir'], kub: [], urunId: 't-tek', ad: 'Zzz Tek', etkenler: ['ornek_antibiyotik'] });
  veri.kub.urunler['t-tek'] = { doz: 'Örnek.', arinma: null, metinYok: false, yollar: ['IM'], sigir: { guven: 'yuksek' }, oran: DUSUK };
  assert.equal(urunSec(ilac, veri, 'inek', { protokolEtkenleri }).urun.urunId, 't-tek');
});
