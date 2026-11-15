// KÜB bölüm ayrıştırma (4.9 doz, 4.11 arınma) ve sığır arınma okuma (plan Task 2, Review Focus 1–4).
// Örnekler test/ornek/kub/*.txt: gerçek KÜB PDF'lerinden `pdftotext -simple -enc UTF-8` çıktısının 4.9 → 5. kısmı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bolumAyir, sigirArinmasi, belgeBilgisi, kubUrunleUyumlu, sesAnahtari, yaklasikIcerir, sigirHedefMi, eskiBicimAyir,
  sutTavsiyeEdilmez, sagmaldaKullanilmaz, bolum47, bolumMetni, farmasotikSekil,
} from '../lib/kub.js';

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
  assert.deepEqual(bolumAyir(''), { doz: null, arinma: null, tablo: false });
  assert.deepEqual(bolumAyir('Prospektüs\nKULLANIM ŞEKLİ VE DOZU\nGünde 1 kez.\nİlaç kalıntı arınma süresi: 28 gün'), { doz: null, arinma: null, tablo: false });
});

test('baslikVarIcerikBossaNull', () => {
  assert.deepEqual(bolumAyir('4.9 Dozaj ve kullanım yolu\n\n4.10 Doz aşımı\nYok.\n4.11 Kalıntı arınma süreleri\n   \n5. FARMAKOLOJİK ÖZELLİKLER\n'),
    { doz: null, arinma: null, tablo: false });
});

test('girintiliBaslikVeNoktaliBaslikTanınır', () => {
  const albetab = bolumAyir(ornek('albetab'));
  assert.ok(albetab.arinma.startsWith('Tedavi süresince ve son ilaç uygulamasından sonra eti için yetiştirilen sığırlar 14 gün geçmeden'), albetab.arinma);
  assert.ok(albetab.doz.startsWith('Veteriner hekim tarafından'), albetab.doz);
  const akson = bolumAyir(ornek('akson-b'));
  assert.ok(akson.arinma.startsWith('Et ve süt için kalıntı süresi'), akson.arinma);
});

test('dozdakiTabloSatirlariAyriKalir', () => {
  // 4.9 içinde "FARMAKOLOJİK DOZ" tablo başlığı bölümü bitirmez; satırlar birbirine yapışmaz; sütun aralıkları korunur (K7 O2).
  const { doz, arinma, tablo } = bolumAyir(ornek('bavet-meloksikam'));
  assert.equal(tablo, true);
  assert.ok(doz.includes('FARMAKOLOJİK DOZ'), doz);
  assert.ok(/\n Sığır {17}0,5 {25}100 {24}10\.0 {16}Deri altı/.test(doz), doz);
  assert.ok(/\n Köpek {17}0,2 {25}10 /.test(doz), doz);
  // eski biçim alt başlığı ("GIDALARDA İLAÇ KALINTI UYARILAR") metin değil, atılır (K7 küçük bulgu)
  assert.ok(arinma.startsWith('İlaç kalıntı arınma süresi ( i.k.a.s): Tedavi süresince'), arinma);
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

// --- K7 danışman denetimi düzeltmeleri (.superpowers/sdd/2026-11-15-kub-onay/k7-fable.md) ---
// Fikstürler gerçek PDF'lerden: zolamox-zoloxy, tylaron-stabilite, albadoks-santadoks, atromax (bölüm 1 → 4.1 + 4.9 → 5),
// ubrostar-prospektus (tam), weldox (ilk 80 satır), diğerleri 4.9 → 5. Sayfa sonu (\f) işaretleri korunmuştur.

const ETKENLER = JSON.parse(readFileSync(fileURLToPath(new URL('../veri/etkenler.json', import.meta.url)), 'utf8'));
const kimlik = async (ad, etkenler) => {
  const { urunKimligi } = await import('../scripts/kub-ayikla.mjs');
  return urunKimligi({ ad, etkenler }, ETKENLER);
};

test('K1_yanlisBelge_ZolamoxLA_oksitetrasiklinKUBu', async () => {
  // Bakanlık bağlantısı amoksisilin ürünü için "ZOLOXY LA" (oksitetrasiklin) KÜB'ünü veriyor.
  const metin = ornek('zolamox-zoloxy');
  const u = kubUrunleUyumlu(metin, await kimlik('Zolamox LA', ['amoksisilin']));
  assert.equal(u.uyumlu, false);
  assert.deepEqual(u.eksik, ['amoksisilin']);
  assert.match(u.neden, /amoksisilin/);
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const k = kubKaydi(metin, await kimlik('Zolamox LA', ['amoksisilin']));
  assert.equal(k.belgeUyumsuz, true);
  assert.equal(k.metinYok, true);
  assert.equal(k.doz, null);
  assert.equal(k.arinma, null);
  assert.equal(k.sigir.guven, 'dusuk'); // "Et 28 gün · Süt 10 gün" etiketi artık yok
  assert.match(k.belgeNeden, /amoksisilin/);
  // aynı belge kendi ürünü için uyumlu
  const dogru = kubUrunleUyumlu(metin, await kimlik('Zoloxy LA', ['oksitetrasiklin']));
  assert.deepEqual(dogru, { uyumlu: true, kubAdi: null, eksik: [], neden: null });
});

test('K1_belgeKubDegil_stabiliteRaporu', async () => {
  const metin = ornek('tylaron-stabilite'); // "STABİLİTE ÖZET RAPORU": tilosin geçse de KÜB değil
  assert.equal(belgeBilgisi(metin).tur, 'diger');
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const k = kubKaydi(metin, await kimlik('Tylaron 200', ['tilozin']));
  assert.equal(k.belgeUyumsuz, true);
  assert.equal(k.metinYok, true);
  assert.match(k.belgeNeden, /KÜB ya da prospektüs değil/);
});

test('O5_baskaTicariAdlaKUB_kubAdi', async () => {
  const metin = ornek('albadoks-santadoks');
  const u = kubUrunleUyumlu(metin, await kimlik('Albadoks %10', ['doksisiklin']));
  assert.equal(u.uyumlu, true);
  assert.equal(u.kubAdi, 'SANTADOKS %10');
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const k = kubKaydi(metin, await kimlik('Albadoks %10', ['doksisiklin']));
  assert.equal(k.kubAdi, 'SANTADOKS %10');
  assert.equal(k.belgeUyumsuz, undefined);
  assert.ok(k.doz && k.arinma);
});

test('K1_yazimFarklariEslesir', () => {
  // Latin / İngilizce yazımlar ve KÜB yazım hataları etken uyuşmazlığı sayılmaz
  assert.equal(sesAnahtari('Tylosin'), sesAnahtari('tilozin'));
  assert.ok(sesAnahtari('Cefquinome sülfat').includes(sesAnahtari('sefkinom')));
  assert.ok(sesAnahtari('Dexamethasone').includes(sesAnahtari('deksametazon')));
  assert.ok(sesAnahtari('Oxytetracycline').includes(sesAnahtari('oksitetrasiklin')));
  assert.ok(yaklasikIcerir(sesAnahtari('Levamizol HCl 300 mg Oksiklazonid 600 mg'), sesAnahtari('oksiklozanid')));
  assert.ok(yaklasikIcerir(sesAnahtari('Tilmiskosin (fosfat halinde) 300 mg'), sesAnahtari('tilmikosin')));
  assert.ok(!yaklasikIcerir(sesAnahtari('Oksitetrasiklin 200 mg (215 mg oksitetrasiklin dihidrat olarak)'), sesAnahtari('amoksisilin')));
});

test('O1_sagmalHayvandaTavsiyeEdilmez_etiketYok', () => {
  // Procastrep: sayı doğru (et 60 gün, süt 15 gün) ama KÜB süt veren hayvana uygulanmasını tavsiye etmiyor
  const s = oku('procastrep');
  assert.equal(s.guven, 'dusuk');
  assert.equal(s.et_gun, 60);
  assert.deepEqual(s.sut, { saat: 360 });
  assert.equal(sutTavsiyeEdilmez(arinmaOf('procastrep')), true);
  // başka türe ait öğüt ve "tavsiye edilmediği takdirde" kalıbı etkilemez
  assert.equal(sutTavsiyeEdilmez('Sütü insan tüketimine sunulan koyunlarda kullanılması tavsiye edilmez.'), false);
  assert.equal(sutTavsiyeEdilmez('Veteriner hekim tarafından başka şekilde tavsiye edilmediği takdirde süt 4 gün kullanılmaz.'), false);
  assert.deepEqual(sigirArinmasi('Sığırlar 28 gün geçmeden kesime gönderilmemelidir. Süt veren ineklerde kullanılması önerilmez. Süt: 4 gün.').guven, 'dusuk');
});

test('sagmaldaKullanilmaz_urununSutHayvanindaKullanimiYasak', () => {
  // gerçek 4.11 cümleleri (Selectan, Florac, Tulatram, Ampicure DC, Hektamec-P.O., Rafokin)
  for (const m of [
    'Sığırlar 30 gün geçmeden kesime gönderilmemelidir. İnsan tüketimi için süt elde edilen sığırlarda (kuru dönem dahil) kullanılmaz.',
    'İnsan tüketimi için süt elde edilen koyun ve sığırlarda (kuru periyod dahil) kullanılmaz.',
    'Sütü insan tüketimi için kullanılan laktasyondaki ineklere ve doğumuna 2 aydan az kalan düve ve ineklere uygulanmamalıdır.',
    'Bu ürün laktasyondaki hayvanlarda kullanılmaz.',
    'Kuru dönem dahil, sütü insan tüketimine sunulan sağmal sığırlarda kullanılmamalıdır.',
    'Gebeliğin son üç aylık dönemide dahil olmak üzere insan tüketimi için süt elde edilen sığırlara uygulanamaz.',
    // Draxxin: önceki parantezde süre var; Bavetaxin: eş dizimde ek son sözcükte
    'İlaç uygulanmasından sonra 22 gün geçmeden sığırlar kesime sevk edilmemelidir. (i.k.a.s. sığır eti için 22-koyun eti için 16 gündür) Sütü insan tüketimi için kullanılan laktasyondaki ineklere ve koyunlara uygulanmamalıdır.',
    'Sütü insan tüketimine sunulan laktasyondaki inek ve koyunlara uygulanmamalıdır.',
  ]) assert.equal(sagmaldaKullanilmaz(m), true, m);
  for (const m of [
    // süt arınması (sütün kendisi kullanılmaz), başka tür, sayılı süre
    'Son uygulamayı izleyen 4 gün (8 sağım) içinde elde edilen sütler insan gıdası olarak kullanılmamalıdır.',
    'Tedavi süresince ve son ilaç uygulamasından sonra 72 saat boyunca elde edilen inek ve keçi sütü insan gıdası olarak kullanılmamalıdır.',
    'İnsan tüketimi için yumurta elde edilen tavuk ve hindilerde ve süt elde edilen koyun ve keçilerde kullanılmaz.',
    'Süt elde edilen ineklerde tedavi süresince ve son uygulamadan sonra 72 saat geçmeden elde edilen sütler insan tüketimine sunulmamalıdır.',
    'Sütten kesilmiş buzağılarda kullanılmaz.',
    null,
  ]) assert.equal(sagmaldaKullanilmaz(m), false, String(m));
});

test('O1_4_7deLaktasyondaTavsiyeEdilmez_etiketYok', async () => {
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const kub = (yedi) => `4.7 Gebelik, laktasyon veya yumurtlama döneminde kullanım\n${yedi}\n4.8 Etkileşim\nYok.\n`
    + '4.9 Dozaj ve kullanım yolu\nKas içi 10 mg/kg.\n4.10 Doz aşımı\nYok.\n'
    + '4.11 Kalıntı arınma süreleri\nEt ve sakatat: 28 gün\nSüt: 4 gün\n5. FARMAKOLOJİK ÖZELLİKLER\n';
  assert.equal(bolum47(kub('Laktasyondaki ineklerde kullanılması tavsiye edilmez.')), 'Laktasyondaki ineklerde kullanılması tavsiye edilmez.');
  assert.equal(kubKaydi(kub('Laktasyondaki ineklerde kullanılması tavsiye edilmez.')).sigir.guven, 'dusuk');
  assert.equal(kubKaydi(kub('Gebe ve laktasyondaki ineklerde güvenle kullanılabilir.')).sigir.guven, 'yuksek');
});

test('O2_dozTablosuSutunlariKorunur_Mirazol', () => {
  const { doz, tablo } = bolumAyir(ornek('mirazol'));
  assert.equal(tablo, true);
  const satir = (kg) => doz.split('\n').find((s) => s.trim().startsWith(kg));
  // 200 kg: yalnız 2. sütun (erişkin karaciğer kelebeği) 1 tablet; 300 kg: yalnız 1. sütun 1 tablet
  assert.ok(satir('200 kg').indexOf('1 tablet') > satir('300 kg').indexOf('1 tablet') + 20, doz);
  assert.match(satir('800 kg'), /3 tablet {10,}4 Tablet/);
  // düz metin paragrafı yine birleşir
  assert.ok(doz.includes('Yuvarlak kurt, akciğer kurdu, şeritler ile karaciğer kelebeği ve yuvarlak kurt yumurtaları için 7,5 mg albendazol/kg'));
  // tablosuz bölümde tablo yok
  assert.equal(bolumAyir(ornek('ekomisin')).tablo, false);
});

test('O3_baslikSatirindakiMetinKorunur', () => {
  const nilzan = bolumAyir(ornek('nilzan'));
  assert.ok(nilzan.arinma.startsWith('Tedavi süresince ve son ilaç uygulamasından sonra eti için yetiştirilen sığırlar ve koyunlar 28 gün'), nilzan.arinma);
  assert.ok(nilzan.doz.startsWith('Veteriner hekim tarafından başka bir şekilde tavsiye edilmediği takdirde;'), nilzan.doz);
  assert.deepEqual(sigirArinmasi(nilzan.arinma), { et_gun: 28, sut: 'kullanilmaz', guven: 'yuksek' });
  assert.ok(bolumAyir(ornek('huvegen')).doz.startsWith('Doğru dozaj sağlamak için vücut ağırlığının olabildiğince doğru bir şekilde'));
  // yalnız başlık: içerik eklenmez
  assert.ok(bolumAyir(ornek('albetab')).doz.startsWith('Veteriner hekim tarafından'));
  assert.equal(bolumAyir('4.9 Dozaj\nX.\n4.10 A\n4.11 İlaç kalıntı arınma süresi (i.k.a.s.):\nEt: 28 gün\n5. FARMAKOLOJİK\n').arinma, 'Et: 28 gün');
});

test('O4_imzaKasesiVeSayfaNumarasiAtilir', () => {
  const atilan = [];
  const a = bolumAyir(ornek('albecure1500'), { atilan });
  assert.deepEqual(atilan, ['Mustafa YIKILMAZ', 'Bakan a.', 'Daire Başkanı V.']);
  assert.doesNotMatch(a.doz, /Bakan a\.|YIKILMAZ|Daire Başkanı/);
  assert.match(a.doz, /10 mg albendazol\/kg vücut ağırlığı/);
  const atilan2 = [];
  const d = bolumAyir(ornek('dinolytic-hc'), { atilan: atilan2 });
  assert.deepEqual(atilan2, ['2']);
  assert.doesNotMatch(d.doz, /\n2\n|(^|\n)2 Sabit/);
  assert.match(d.doz, /\nSabit zamanlı tohumlamanın bir parçası olarak uygulama:/);
  // birimli satır sayfa sınırında da atılmaz; sayfa ortasındaki çıplak sayı da atılmaz
  const m = '4.9 Doz\nGünde bir kez:\n10 mg/kg\n\fDevam.\n3\nSon.\n4.10 A\nYok\n4.11 Arınma\nEt: 2 gün\n4 / 9\n\f5. FARMAKOLOJİK\n';
  const atilan3 = [];
  const r = bolumAyir(m, { atilan: atilan3 });
  assert.match(r.doz, /10 mg\/kg/);
  assert.match(r.doz, /Devam\. 3\nSon\./); // sayfa ortasındaki "3" atılmadı (paragraf birleştirmesi onu öncekine ekler)
  assert.equal(r.arinma, 'Et: 2 gün');
  assert.deepEqual(atilan3, ['4 / 9']);
});

test('O6_hedefTurdeSigirYok', async () => {
  assert.equal(sigirHedefMi(ornek('atromax')), false); // At, kedi, köpek
  assert.equal(sigirHedefMi(ornek('zolamox-zoloxy')), true); // Sığır, koyun, keçi
  assert.equal(sigirHedefMi(ornek('ekomisin')), null); // 4.1 yok: bilinmiyor
  assert.equal(sigirHedefMi('4.1 Hedef tür\nKoyun, keçi\n4.2 Kullanım alanı\n'), false);
  assert.equal(sigirHedefMi('4.1 Hedef tür\nBüyükbaş hayvanlar\n4.2 Kullanım alanı\n'), true);
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  assert.equal(kubKaydi(ornek('atromax'), await kimlik('Atromax', ['atropin'])).sigirHedefDegil, true);
  assert.equal(kubKaydi(ornek('ekomisin')).sigirHedefDegil, undefined);
});

test('eskiBicimProspektus_Ubrostar', async () => {
  const e = eskiBicimAyir(ornek('ubrostar-prospektus'));
  assert.ok(e.doz.startsWith('Meme içine uygulanır.'), e.doz);
  assert.match(e.arinma, /Et için: 8 gün/);
  assert.doesNotMatch(e.arinma, /KONTRENDİKASYON/);
  assert.equal(belgeBilgisi(ornek('ubrostar-prospektus')).tur, 'prospektus');
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const k = kubKaydi(ornek('ubrostar-prospektus'), await kimlik('Ubrostar', ['penetamat']));
  assert.equal(k.eskiBicim, true);
  assert.equal(k.metinYok, false);
  assert.equal(k.sigir.guven, 'dusuk');
  // okunabilir olsa da eski biçimde etiket yok
  const temiz = 'Prospektüs\nKULLANIM ŞEKLİ VE DOZU: Kas içi 10 ml.\nGIDA DEĞERİ OLAN HAYVANLARDA KALINTI UYARILARI\n'
    + 'Et ve süt için 0 gündür.\nKONTRENDİKASYONLAR\nYok.\n';
  const t = kubKaydi(temiz);
  assert.deepEqual([t.eskiBicim, t.doz, t.arinma, t.sigir.guven], [true, 'Kas içi 10 ml.', 'Et ve süt için 0 gündür.', 'dusuk']);
});

test('kucukBulgular_ProntocillRafokinGonderme', () => {
  // "5..FARMAKOLOJİK" bölüm sonu; "4. 11" başlığı; "4.11 bölümlerine bakınız" başlık değildir
  const p = bolumAyir(ornek('prontocill')).arinma;
  assert.doesNotMatch(p, /FARMAKOLOJ|ATC/);
  assert.ok(p.endsWith('kullanılmamalıdır.'), p);
  assert.ok(bolumAyir(ornek('rafokin')).arinma.startsWith('Tedavi süresince ve son ilaç uygulamasından sonra 60 gün'));
  assert.equal(bolumAyir('4.9 Doz\nGünde 1.\n4.10 Aşım\n4.11 bölümlerine bakınız.\n4.11 Kalıntı arınma süreleri\nEt: 28 gün\n5. FARMAKOLOJİK\n').arinma, 'Et: 28 gün');
});

test('harfiDusmusMetinOkunamaz_Weldox', async () => {
  const { kubKaydi, harfDusmus } = await import('../scripts/kub-ayikla.mjs');
  assert.equal(harfDusmus(ornek('weldox')), true);
  assert.equal(harfDusmus(ornek('zolamox-zoloxy')), false);
  const rapor = { atilan: [] };
  const k = kubKaydi(ornek('weldox'), await kimlik('Weldox %50', ['doksisiklin']), rapor);
  assert.equal(k.metinYok, true);
  assert.equal(k.belgeUyumsuz, undefined);
  assert.match(rapor.neden, /harfi düşmüş/);
});

// --- K8 düzeltme dalgası A: 4.1 / 4.2 / 4.3 / 4.5 ve bölüm 3 (farmasötik şekil) okuma, kubKaydi'ye bağlanması ---
// Fikstürler gerçek PDF'lerin bölüm 3 → 5 kesitleri (<ad>-3-5.txt).

test('K8A_bolumMetni: 4.1 / 4.2 / 4.3 / 4.5 ve farmasötik şekil', () => {
  const c = ornek('clamoxyl-la-3-5');
  assert.equal(bolumMetni(c, '4.1'), 'Sığır, koyun, keçi, köpek, kedi');
  assert.ok(bolumMetni(c, '4.3').startsWith('Bu ürün intravenöz veya intratekal kullanım için uygun değildir.'));
  const b45 = bolumMetni(c, '4.5');
  assert.ok(b45.includes('Bir bölgeye sığırlarda en fazla 10, koyun ve keçilerde 5 ml enjekte edilmelidir.'), b45);
  assert.ok(!/4\.6|İstenmeyen etkiler/.test(b45), b45);
  assert.ok(bolumMetni(ornek('paincarp-3-5'), '4.2').startsWith('Sığırda (6 aylık ve üzeri) akut enfeksiyöz'));
  assert.equal(bolumMetni(ornek('cocciril-3-5'), '4.1'), 'Sığır (buzağı) ve koyun (kuzu).');
  assert.equal(farmasotikSekil(ornek('baycox-3-5')), 'Oral Süspansiyon');
  assert.ok(farmasotikSekil(ornek('paincarp-3-5')).includes('enjeksiyonluk çözelti'));
  assert.equal(bolumMetni('başka bir metin', '4.5'), null);
  assert.equal(farmasotikSekil(null), null);
  // "4.5 μg/mL düzeyine ulaşır" (bölüm 5'te) 4.5 başlığı değildir
  assert.equal(bolumMetni('5.2 Farmakokinetik\n4.5 μg/mL düzeyine ulaşır. 48 saat arayla yapılan ikinci uygulamadan sonra\n5.3 Çevresel', '4.5'), null);
});

test('K8A_kubKaydi: 4.5 yer sınırı, 4.1 kapsam, 4.3 kısıtlar, bölüm 3 ORAL; 4.5 metni kayda yazılmaz', async () => {
  const { kubKaydi } = await import('../scripts/kub-ayikla.mjs');
  const amoks = kubKaydi(ornek('clamoxyl-la-3-5'));
  assert.equal(amoks.oran.guven, 'yuksek');
  assert.equal(amoks.oran.yerBasinaMaxMl, 10); // KÜB 4.5
  assert.equal(amoks.oran.yerBasinaYol, null);
  assert.deepEqual(amoks.yollar, ['IM']); // SC kedi-köpek
  assert.ok(!JSON.stringify(amoks).includes('Bir bölgeye sığırlarda'), '4.5 metni kayda yazılmaz');

  const cocciril = kubKaydi(ornek('cocciril-3-5'));
  assert.equal(cocciril.oran.guven, 'yuksek');
  assert.equal(cocciril.oran.kapsam, 'buzagi'); // 4.1 "Sığır (buzağı) ve koyun (kuzu)."

  const baycox = kubKaydi(ornek('baycox-3-5'));
  assert.deepEqual(baycox.yollar, ['ORAL']); // 4.9'da yol yok; bölüm 3 "Oral Süspansiyon"
  assert.equal(baycox.oran.kapsam, 'buzagi');

  const toltrazor = kubKaydi(ornek('toltrazor-3-5'));
  assert.deepEqual(toltrazor.yollar, ['ORAL']);
  // 4.3 aynen; birleşen büyük harfli başlık öneki ("ÇEVRE SAĞLIĞI AÇISINDAN;") atılır
  assert.deepEqual(toltrazor.oran.kisitlar, [{ tur: 'kosullu', metin: '80 kg’dan daha ağır buzağılarda kullanılmaz.' }]);

  const paincarp = kubKaydi(ornek('paincarp-3-5'));
  // 4.2 (kullanım alanı) cümlesi olumsuz / "yalnız" ifadesi olmadan kısıt sayılmaz (inceleme turu 1, I2)
  assert.deepEqual(paincarp.oran.kisitlar, []);
  assert.equal(paincarp.oran.sabitDoz, false);
});
