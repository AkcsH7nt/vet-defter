// KÜB bölüm ayrıştırma (4.9 doz, 4.11 arınma) ve sığır arınma okuma (plan Task 2, Review Focus 1–4).
// Örnekler test/ornek/kub/*.txt: gerçek KÜB PDF'lerinden `pdftotext -simple -enc UTF-8` çıktısının 4.9 → 5. kısmı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bolumAyir, sigirArinmasi } from '../lib/kub.js';

const DIZIN = fileURLToPath(new URL('./ornek/kub/', import.meta.url));
const ornek = (ad) => readFileSync(join(DIZIN, `${ad}.txt`), 'utf8');
const arinmaOf = (ad) => bolumAyir(ornek(ad)).arinma;
const oku = (ad) => sigirArinmasi(arinmaOf(ad));

// --- bolumAyir ---

test('ekomisinDozVeArinmaBolumleri', () => {
  const { doz, arinma } = bolumAyir(ornek('ekomisin'));
  assert.ok(doz.startsWith('Derin kas içi yolla uygulanır.'), doz);
  assert.ok(arinma.startsWith('Tedavi süresince'), arinma);
  // başlık satırları ve sonraki bölümler dışarıda
  assert.ok(!/4\.9|4\.10|antidot|Spesifik/.test(doz), doz);
  assert.ok(!/4\.11|FARMAKOLOJ|Kalıntı arınma süreleri/.test(arinma), arinma);
  // satır kırılmaları paragrafa birleşir, fazla boşluk temizlenir; kelimeler aynen kalır
  assert.equal(arinma, 'Tedavi süresince ve son ilaç uygulamasından itibaren sığır, keçi ve koyunlar 28 gün geçmeden '
    + 'kesime gönderilmemeli, sığırlarda 10 gün (20 sağım), keçi ve koyunlarda 7 gün (14 sağım) boyunca elde edilen '
    + 'sütler insan tüketimine sunulmamalıdır.');
  assert.ok(!/ {2}/.test(doz) && doz.includes('Tavsiye edilen doz 20 mg/kg vücut ağırlığı (her 10 kg vücut ağırlığı için 1 ml) dir.'));
  // cümle sonunda biten satırdan sonra büyük harfle başlayan satır ayrı satır kalır
  assert.ok(doz.includes('uygulanmamalıdır.\nDoğru doz için'), doz);
});

test('baslikYoksaBolumlerNull', () => {
  assert.deepEqual(bolumAyir(''), { doz: null, arinma: null });
  assert.deepEqual(bolumAyir('Prospektüs\nKULLANIM ŞEKLİ VE DOZU\nGünde 1 kez.\nİlaç kalıntı arınma süresi: 28 gün'), { doz: null, arinma: null });
});

test('baslikVarIcerikBossaNull', () => {
  assert.deepEqual(bolumAyir('4.9 Dozaj ve kullanım yolu\n\n4.10 Doz aşımı\nYok.\n4.11 Kalıntı arınma süreleri\n   \n5. FARMAKOLOJİK ÖZELLİKLER\n'),
    { doz: null, arinma: null });
});

test('girintiliBaslikVeNoktaliBaslikTanınır', () => {
  const albetab = bolumAyir(ornek('albetab'));
  assert.ok(albetab.arinma.startsWith('Tedavi süresince ve son ilaç uygulamasından sonra eti için yetiştirilen sığırlar 14 gün geçmeden'), albetab.arinma);
  assert.ok(albetab.doz.startsWith('Veteriner hekim tarafından'), albetab.doz);
  const akson = bolumAyir(ornek('akson-b'));
  assert.ok(akson.arinma.startsWith('Et ve süt için kalıntı süresi'), akson.arinma);
});

test('dozdakiTabloSatirlariAyriKalir', () => {
  // 4.9 içinde "FARMAKOLOJİK DOZ" tablo başlığı bölümü bitirmez; satırlar birbirine yapışmaz.
  const { doz, arinma } = bolumAyir(ornek('bavet-meloksikam'));
  assert.ok(doz.includes('FARMAKOLOJİK DOZ'), doz);
  assert.ok(/\nSığır 0,5 100 10\.0 Deri altı/.test(doz), doz);
  assert.ok(/\nKöpek 0,2 10 0,4/.test(doz), doz);
  assert.ok(arinma.startsWith('GIDALARDA İLAÇ KALINTI UYARILAR'), arinma);
});

test('satirSonuTiresiBirlesir', () => {
  const metin = '4.9 Dozaj\nKas içi uygulanır, tedavi beş gün sürdürülür ve hayvanın genel du-\nrumu izlenir.\n4.10 Doz aşımı\nYok\n'
    + '4.11 Kalıntı arınma süreleri\nEt ve sakatat: 28 gün\nSüt: 96 saat\n5. FARMAKOLOJİK ÖZELLİKLER\n';
  const { doz, arinma } = bolumAyir(metin);
  assert.equal(doz, 'Kas içi uygulanır, tedavi beş gün sürdürülür ve hayvanın genel durumu izlenir.');
  assert.equal(arinma, 'Et ve sakatat: 28 gün\nSüt: 96 saat');
});

test('bolumSonuBulunamazsaNull', () => {
  // 4.11 başladı ama 4.12 / 5. başlığı yok: metnin geri kalanını almak yerine null (yanlış metin göstermemek için).
  assert.equal(bolumAyir('4.9 Doz\nGünde 1 kez.\n4.10 Aşım\nYok.\n4.11 Arınma\nEt: 28 gün\nbaşka her şey').arinma, null);
});

// --- sigirArinmasi: plan Step 1 değerleri ---

test('ekomisinCokTurluCumle', () => {
  // Review Focus 1: keçi / koyun değerleri sığıra karışmaz; süt 10 gün = 240 saat; "20 sağım" doğrular.
  assert.deepEqual(oku('ekomisin'), { et_gun: 28, sut: { saat: 240 }, guven: 'yuksek' });
});

test('sutuInsanTuketimineSunulanIneklerdeKullanilmaz', () => {
  // Review Focus 2
  assert.deepEqual(sigirArinmasi('Et ve sakatat: 28 gün. Sütü insan tüketimine sunulan laktasyondaki ineklerde kullanılmaz.'),
    { et_gun: 28, sut: 'kullanilmaz', guven: 'yuksek' });
  assert.deepEqual(oku('amoxygen'), { et_gun: 140, sut: 'kullanilmaz', guven: 'yuksek' });
  assert.deepEqual(oku('levasym'), { et_gun: 20, sut: 'kullanilmaz', guven: 'yuksek' });
});

test('ikiYolFarkliSureGuvenDusuk', () => {
  // Review Focus 4
  const s = sigirArinmasi('Kas içi uygulamada sığırlar 28 gün, ven içi uygulamada 14 gün geçmeden kesime gönderilmemelidir. '
    + 'Süt: 4 gün.');
  assert.equal(s.guven, 'dusuk');
  assert.equal(s.et_gun, null);
  assert.equal(oku('fizin').guven, 'dusuk');
  assert.equal(oku('baytril').guven, 'dusuk');
  assert.equal(oku('fizin').et_gun, null);
  assert.equal(oku('baytril').et_gun, null);
  // ayrı cümlelerde iki yol, farklı süre
  assert.equal(sigirArinmasi('Kas içi uygulamadan sonra sığırlar 28 gün geçmeden kesime gönderilmemelidir. '
    + 'Deri altı uygulamadan sonra sığırlar 35 gün geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
});

test('sifirGunNulldanAyri', () => {
  const s = sigirArinmasi('Et: 0 gün. Süt: 0 saat.');
  assert.strictEqual(s.et_gun, 0);
  assert.deepEqual(s, { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' });
  assert.deepEqual(oku('kaldif'), { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' });
  assert.deepEqual(oku('akson-b'), { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' });
  const sifir = sigirArinmasi('Sıfır gün.'); // et mi süt mü yazmıyor
  assert.equal(sifir.et_gun, null);
  assert.equal(sifir.guven, 'dusuk');
});

test('nullMetinOkunamaz', () => {
  assert.deepEqual(sigirArinmasi(null), { et_gun: null, sut: null, guven: 'dusuk' });
  assert.deepEqual(sigirArinmasi(''), { et_gun: null, sut: null, guven: 'dusuk' });
});

// --- gerçek KÜB örnekleri ---

test('gercekOrneklerYuksekGuven', () => {
  assert.deepEqual(oku('advocine'), { et_gun: 8, sut: { saat: 96 }, guven: 'yuksek' });
  assert.deepEqual(oku('amoksivet'), { et_gun: 92, sut: { saat: 216 }, guven: 'yuksek' });
  assert.deepEqual(oku('bavet-meloksikam'), { et_gun: 15, sut: { saat: 120 }, guven: 'yuksek' });
  assert.deepEqual(oku('albetab'), { et_gun: 14, sut: { saat: 72 }, guven: 'yuksek' });
  assert.deepEqual(oku('eprecis'), { et_gun: 63, sut: { saat: 0 }, guven: 'yuksek' });
  // "Et :" / "Süt: '0' gün." etiketli yazım
  assert.deepEqual(oku('baveprin'), { et_gun: 10, sut: { saat: 0 }, guven: 'yuksek' });
  // yalnız koyuna dair "uygulanamaz" sığır sütünü etkilemez
  assert.deepEqual(oku('fortezol'), { et_gun: 28, sut: { saat: 120 }, guven: 'yuksek' });
});

test('sayiOnceTurSonraYazimi', () => {
  // "22 gün geçmeden sığırlar, 16 gün geçmeden koyunlar" → sığır 22 (koyunun 16'sı sığıra geçmez)
  assert.deepEqual(sigirArinmasi('İlaç uygulanmasından sonra 22 gün geçmeden sığırlar, 16 gün geçmeden koyunlar kesime sevk '
    + 'edilmemelidir. İnek sütü 4 gün boyunca insan tüketimine sunulmamalıdır.'), { et_gun: 22, sut: { saat: 96 }, guven: 'yuksek' });
  assert.deepEqual(sigirArinmasi('İlaç uygulanmasından sonra 16 gün geçmeden koyunlar, 22 gün geçmeden sığırlar kesime sevk '
    + 'edilmemelidir. İnek sütü 4 gün boyunca insan tüketimine sunulmamalıdır.'), { et_gun: 22, sut: { saat: 96 }, guven: 'yuksek' });
});

test('birimsizSayiSonrakiBirimiAlir', () => {
  assert.deepEqual(sigirArinmasi('İlaç uygulamasından sonra sığırlar 14, koyun ve keçiler 10 gün geçmeden kesime gönderilmemeli, '
    + 'ineklerde 72 saat (6 sağım), koyun ve keçilerde 6 gün (144 saat-12 sağım) geçmeden elde edilen süt insan tüketimine '
    + 'sunulmamalıdır.'), { et_gun: 14, sut: { saat: 72 }, guven: 'yuksek' });
});

test('birimYoksaOkunmaz', () => {
  // gerçek KÜB yazım hatası: "sığırlar 14 geçmeden"
  const s = oku('albezol');
  assert.equal(s.et_gun, null);
  assert.equal(s.guven, 'dusuk');
});

test('sigirGecmeyenMetinOkunmaz', () => {
  // yalnız koyun: türsüz süt cümlesi sığıra yazılmaz
  assert.deepEqual(oku('alenzol375'), { et_gun: null, sut: null, guven: 'dusuk' });
});

test('turBelirtmeyenCumleBaskaTurVarkenBelirsiz', () => {
  const s = sigirArinmasi('Sığırlar 28 gün, koyunlar 14 gün geçmeden kesime gönderilmemeli, 4 gün boyunca elde edilen süt insan '
    + 'tüketimine sunulmamalıdır.');
  assert.equal(s.et_gun, 28);
  assert.equal(s.sut, null);
  assert.equal(s.guven, 'dusuk');
});

test('turBelirtmeyenMetinHerTureUyar', () => {
  assert.deepEqual(sigirArinmasi('Et ve sakatat: 28 gün\nSüt: 96 saat'), { et_gun: 28, sut: { saat: 96 }, guven: 'yuksek' });
  assert.deepEqual(sigirArinmasi('Et ve sakatat: 4 hafta. Süt: 4 gün (8 sağım).'), { et_gun: 28, sut: { saat: 96 }, guven: 'yuksek' });
});

test('sagimSayisiTutmazsaDusuk', () => {
  assert.equal(sigirArinmasi('Et: 28 gün. Süt: 5 gün (8 sağım).').guven, 'dusuk');
  assert.equal(sigirArinmasi('Et: 28 gün. Süt: 6 gün (140 saat-12 sağım).').guven, 'dusuk');
});

test('kuruDonemDogumGebelikDusuk', () => {
  // kuru dönem / doğum sonrası kuralı tek sayıya indirgenemez
  const a = oku('actimisin');
  assert.equal(a.guven, 'dusuk');
  assert.equal(a.et_gun, 70);
  assert.equal(oku('dectomax').guven, 'dusuk');
  assert.equal(oku('draxxin').guven, 'dusuk');
  assert.equal(oku('draxxin').et_gun, 22);
});

test('sutsuzMetinBelirtilmemis', () => {
  // buzağı ürünü: süt hiç geçmiyor
  assert.deepEqual(oku('cocciril'), { et_gun: 0, sut: 'belirtilmemis', guven: 'yuksek' });
  // "sütten kesilmemiş buzağı" süt arınması değildir
  assert.deepEqual(sigirArinmasi('Buzağılar 7 gün geçmeden kesime gönderilmemelidir. Sütten kesilmemiş buzağılarda kullanılmaz.'),
    { et_gun: 7, sut: 'belirtilmemis', guven: 'yuksek' });
});

test('belirsizSayilarDusuk', () => {
  // aralık, fazladan sayı, ay birimi, sağım tek başına, tür içinde farklı süre
  assert.equal(sigirArinmasi('Sığırlar 28-35 gün geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
  assert.equal(sigirArinmasi('Günde 2 kez uygulamada sığırlar 28 gün geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
  assert.equal(sigirArinmasi('Sığırlar 2 ay geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
  assert.equal(sigirArinmasi('Sığırlar 28 gün geçmeden kesime gönderilmemeli, 8 sağım boyunca süt kullanılmamalıdır.').guven, 'dusuk');
  assert.equal(sigirArinmasi('Sığırlar 28 gün, buzağılar 14 gün geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
  // aynı tür için iki cümlede farklı süre
  assert.equal(sigirArinmasi('Et: 28 gün. Sığırlar 35 gün geçmeden kesime gönderilmemelidir. Süt: 4 gün.').guven, 'dusuk');
  // kullanılmaz ile sayılı süt arınması birlikte
  assert.equal(sigirArinmasi('Et: 28 gün. Süt: 4 gün. Laktasyondaki ineklerde kullanılmaz.').guven, 'dusuk');
});

test('etYoksaYuksekOlmaz', () => {
  // süt okunsa da et süresi yoksa sayı gösterilmez
  assert.equal(sigirArinmasi('Süt: 4 gün.').guven, 'dusuk');
  assert.equal(sigirArinmasi('İlaç kalıntı arınma süresi 28 gündür.').guven, 'dusuk'); // et mi süt mü yazmıyor
});

// --- gerçek KÜB'lerde görülen yazımlar (veri taraması) ---

test('turBasligiSonrakiCumlelereUyar', () => {
  assert.deepEqual(sigirArinmasi('Sığır, koyun ve at için; Et ve sakatat: 0 gün Süt: 0 gün'), { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' });
  assert.deepEqual(sigirArinmasi('Koyun ve keçi için; Et ve sakatat: 0 gün Süt: 0 gün'), { et_gun: null, sut: null, guven: 'dusuk' });
});

test('sifirYazimlari', () => {
  for (const metin of ['Et ve Süt için: “0” sıfır gündür.', 'Et ve süt için 0(sıfır) gündür.', 'Et ve süt için sıfır “0” gündür.',
    'Et, süt ve yumurta için bekleme süresi ‘’0’’ gündür.', 'Et ve sakatat için : 0(sıfır) gün Süt için : 0(sıfır) gün']) {
    assert.deepEqual(sigirArinmasi(metin), { et_gun: 0, sut: { saat: 0 }, guven: 'yuksek' }, metin);
  }
});

test('etVeSutAyriSureliTekCumle', () => {
  assert.deepEqual(sigirArinmasi('İlaç Kalıntı Arınma Süresi (İ.K.A.S.): Sığırlarda ilaç kalıntı arınma süresi et ve sakatat için 2 gün, '
    + 'süt için sıfır (0) gündür.'), { et_gun: 2, sut: { saat: 0 }, guven: 'yuksek' });
});

test('sagimOnceSaatParantezde', () => {
  assert.deepEqual(sigirArinmasi('Tedavi süresince ve son ilaç uygulamasından sonra 18 gün geçmeden sığırlar kesime gönderilmemeli, '
    + '4 sağım (48 saat) geçmeden elde edilen sütler insan tüketimine sunulmamalıdır.'), { et_gun: 18, sut: { saat: 48 }, guven: 'yuksek' });
  // KÜB'ün kendi içinde tutarsız: 80 saat ≠ 7 sağım
  assert.equal(sigirArinmasi('Sığırlar 42 gün geçmeden kesime gönderilmemeli, 80 saat (7 sağım) boyunca elde edilen inek sütleri '
    + 'insan tüketimine sunulmamalıdır.').guven, 'dusuk');
});

test('bozukTabloSatiriYuksekOlmaz', () => {
  // pdftotext'in karıştırdığı tablo: "28 gün" et mi süt mü belli değil
  assert.equal(sigirArinmasi('Et Süt Sığır, Sütü insan tüketimine Koyun, 28 gün sunulan hayvanlara Keçi uygulamayınız.').guven, 'dusuk');
});

test('yolaYaDaKosulaBagliSureDusuk', () => {
  assert.equal(sigirArinmasi('Tedavi süresince ve son ilaç uygulamasından sonra sığırlar 13 gün geçmeden kesime gönderilmemelidir. '
    + 'Süt için kalıntı arınma süresi “0” gündür. Et arınma süresine uyulabilmesi için, yalnızca kulak tabanı lokasyonunda yenilebilir '
    + 'olmayan dokuya derialtı yolla uygulanması gerekmektedir.').guven, 'dusuk');
  // meme içi tek yol: süreyi koşula bağlamaz
  assert.deepEqual(sigirArinmasi('Meme içi uygulamadan sonra 4 gün geçmeden sığırlar kesime gönderilmemeli, 5 gün (10 sağım) geçmeden '
    + 'elde edilen inek sütü insan tüketimine sunulmamalıdır.'), { et_gun: 4, sut: { saat: 120 }, guven: 'yuksek' });
});

test('gebelikKisitiDusuk', () => {
  const s = sigirArinmasi('İlaç uygulamasından sonra sığırlar 66 gün geçmeden kesime gönderilmemelidir. İnsan tüketimi için süt elde '
    + 'edilen ineklerde kullanılmaz. Gebe ineklerde doğumdan önceki 60 gün içerisinde kullanılmaz.');
  assert.equal(s.guven, 'dusuk');
});

test('bolumSonuBoslukluVeNumarasizBaslik', () => {
  const a = bolumAyir('4.9 Doz\nGünde 1 kez.\n4.10 Aşım\nYok.\n4.11 Arınma\nEt ve sakatat : 2 gün\nSüt: 2 gün (4 sağım )\n'
    + '5 . FARMAKOLOJİK ÖZELLİKLERİ\nFarmakoterapötik grup: meme içi\n');
  assert.equal(a.arinma, 'Et ve sakatat : 2 gün\nSüt: 2 gün (4 sağım )');
  assert.deepEqual(sigirArinmasi(a.arinma), { et_gun: 2, sut: { saat: 48 }, guven: 'yuksek' });
  const b = bolumAyir('4.9. Dozaj\nGünde 1 kez.\n4.10. Aşım\nYok.\n4.11. Arınma\nEt: 8 gün.\nFARMAKOLOJİK ÖZELLİKLER\nATC Vet Kodu: QH02AB02\n');
  assert.equal(b.arinma, 'Et: 8 gün.');
});

// --- scripts/kub-ayikla.mjs ---

test('kubKaydiMetinYokVeDolu', async () => {
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const bos = { doz: null, arinma: null, sigir: { et_gun: null, sut: null, guven: 'dusuk' }, metinYok: true };
  assert.deepEqual(kubKaydi(null), bos); // pdftotext hata verdi
  assert.deepEqual(kubKaydi('   \n'), bos); // taranmış PDF: metin yok
  assert.deepEqual(kubKaydi('Prospektüs\nKULLANIM ŞEKLİ VE DOZU\n'), bos); // eski biçim: 4.9 / 4.11 başlığı yok
  const k = kubKaydi(ornek('ekomisin'));
  assert.equal(k.metinYok, false);
  assert.ok(k.doz.startsWith('Derin kas içi'));
  assert.deepEqual(k.sigir, { et_gun: 28, sut: { saat: 240 }, guven: 'yuksek' });
});

test('pdftotextBulunamazsaNull', async () => {
  const { pdftotextBul } = await import('../scripts/kub-ayikla.mjs');
  assert.equal(pdftotextBul(['/olmayan/yol/pdftotext-yok']), null);
});

test('etVeSutAyriSureVeIleBagli', () => {
  assert.deepEqual(sigirArinmasi('İlaç Kalıntı Arınma Süresi ( i.k.a.s): Sığırlarda et ve sakatat için “3” gün ve süt için “0” gündür.'),
    { et_gun: 3, sut: { saat: 0 }, guven: 'yuksek' });
  assert.deepEqual(sigirArinmasi('Eti için yetiştirilen sığırlar 21 gün geçmeden kesime gönderilmemelidir. Süt için ilaç kalıntı arınma '
    + 'süresi (0) gündür.'), { et_gun: 21, sut: { saat: 0 }, guven: 'yuksek' });
  assert.deepEqual(sigirArinmasi('İnekler için ette yasal arınma süresi “1” gündür. Süt için yasal arınma süresi “0” gündür.'),
    { et_gun: 1, sut: { saat: 0 }, guven: 'yuksek' });
});
