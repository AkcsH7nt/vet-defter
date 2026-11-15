// KÜB 4.9 metninden sığır ml/kg oranı ve uygulama yolu kodları (tedavi önerisi planı Task 1).
// Örnekler test/ornek/kub/oran/*.txt: veri/kub.json'daki gerçek KÜB 4.9 metinlerinden kesitler.
// Anti-hedef: yanlış bir `yuksek` oran (ekranda hayvana ml olarak hesaplanır). Emin değilse dusuk, mlPerKg null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dozOrani, hedefKapsami, sigirYollari, yolKodlari } from '../lib/oran.js';

const DIZIN = fileURLToPath(new URL('./ornek/kub/oran/', import.meta.url));
const ornek = (ad) => readFileSync(join(DIZIN, `${ad}.txt`), 'utf8');
const yakin = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} ≈ ${b}`);
const dusukBos = (o) => {
  assert.equal(o.guven, 'dusuk');
  assert.equal(o.mlPerKg, null);
  assert.equal(o.kaynak, null);
};

// --- Brief örnekleri ---

test('tekOranYuksek', () => {
  const cumle = 'Derin kas içi yolla 1 ml/10 kg canlı ağırlık dozunda tek doz uygulanır.';
  const o = dozOrani(`${cumle}\nKullanmadan önce çalkalayınız.`);
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.kapsam, 'sigir');
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kaynak, 'ml_kg');
  assert.ok(o.ifade.startsWith('1 ml/10 kg'), o.ifade);
  assert.equal(o.ifade, '1 ml/10 kg canlı ağırlık');
  assert.equal(o.cumle, cumle);
  assert.equal(o.yerBasinaMaxMl, null);
});

test('esdegerTekrarTekOran', () => {
  const o = dozOrani('Deri altı yolla 6 mg/kg (1 ml/30 kg vücut ağırlığı) dozunda uygulanır. '
    + '300 kg ağırlığındaki bir sığır için 10 ml/300 kg hesabıyla uygulanır.');
  yakin(o.mlPerKg, 0.0333);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, '1 ml/30 kg vücut ağırlığı');
});

test('esdegerTekrarTekOran: gerçek KÜB (Advocine) — ikinci uygulamadaki aynı mg/kg ve yer başı sınırı', () => {
  const o = dozOrani(ornek('advocine'));
  yakin(o.mlPerKg, 1 / 30);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kapsam, 'sigir');
  assert.equal(o.ifade, '1 ml/30 kg vücut ağırlığı');
  assert.ok(o.cumle.startsWith('Deri altı yada damar içi yolla 6 mg/kg') && o.cumle.endsWith('bir enjeksiyon olarak uygulanır.'), o.cumle);
  assert.equal(o.yerBasinaMaxMl, 15);
});

test('farkliIkiOranDusuk', () => {
  dusukBos(dozOrani('IV: 1 ml/10 kg canlı ağırlık. IM: 2 ml/10 kg canlı ağırlık.'));
});

test('farkliIkiOranDusuk: gerçek KÜB (Tolfenak) — mastitis ve solunumda farklı oran', () => {
  const o = dozOrani(ornek('tolfenak'));
  dusukBos(o);
  assert.equal(o.ifade, null);
  assert.equal(o.cumle, null);
});

test('farkliIkiOranDusuk: sığırda iki tedavi endikasyonu farklı oranla (ameliyat oranı değil)', () => {
  // Meloksikam KÜB'ündeki "Ameliyattan önce" oranı K8-A7 ile ayrıldı (aşağıda); iki tedavi oranı hâlâ dusuk.
  dusukBos(dozOrani('Sığır:\n0,5 mg/kg (yani 2,5 ml/100 kg vücut ağırlığı) solunum yolu enfeksiyonunda.\n'
    + '0,4 mg/kg (yani 1 ml/50 kg vücut ağırlığı) ishalde.'));
});

test('koyunCumlesiSayilmaz', () => {
  const o = dozOrani('Sığır: 1 ml/10 kg. Koyun ve keçi: 1 ml/5 kg.');
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.cumle, 'Sığır: 1 ml/10 kg.');
});

test('koyunCumlesiSayilmaz: gerçek KÜB (Shotapen) — köpek cümlesindeki aralık sığır oranını bozmaz', () => {
  const o = dozOrani(ornek('shotapen'));
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kapsam, 'sigir');
  assert.equal(o.ifade, '10 ml/100 kg');
});

test('koyunCumlesiSayilmaz: başlık satırı sonraki cümlelere geçer (Draxxin: "Sığır" / "Koyun")', () => {
  const o = dozOrani(ornek('draxxin'));
  assert.equal(o.mlPerKg, 0.025);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kapsam, 'sigir');
  assert.ok(o.cumle.startsWith('Draxxin® enjeksiyonluk çözelti’nin önerilen dozu deri altı'), o.cumle);
  assert.equal(o.yerBasinaMaxMl, 7.5);
  // yalnız koyun başlığı altındaki oran sığır sayılmaz
  dusukBos(dozOrani('Koyun ve keçi:\n1 ml/10 kg canlı ağırlık dozunda kas içi uygulanır.'));
  dusukBos(dozOrani('Atlarda:\nYavaş ven içi 1 ml/10 kg canlı ağırlık.'));
});

test('koyunCumlesiSayilmaz: aynı oranlı koyun cümlesi ve koyun yer sınırı (Respirex)', () => {
  const o = dozOrani(ornek('respirex'));
  assert.equal(o.mlPerKg, 0.025);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.yerBasinaMaxMl, 7.5);
});

test('yalnizBuzagi', () => {
  const o = dozOrani('Buzağılarda 1 ml/20 kg canlı ağırlık dozunda ağızdan uygulanır.');
  assert.equal(o.kapsam, 'buzagi');
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.05);
});

test('yalnizBuzagi: gerçek KÜB (Baytril-K %5) — buzağı oranı, koyun/köpek cümleleri ve koyun yer sınırı sayılmaz', () => {
  const o = dozOrani(ornek('baytril-k'));
  assert.equal(o.kapsam, 'buzagi');
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.yerBasinaMaxMl, 10);
});

test('sigirVeBuzagiAyniOran → kapsam sigir', () => {
  const o = dozOrani('Buzağılarda 1 ml/20 kg. Sığırlarda 1 ml/20 kg canlı ağırlık.');
  assert.equal(o.kapsam, 'sigir');
  assert.equal(o.guven, 'yuksek');
});

test('aralikDusuk', () => {
  dusukBos(dozOrani('1-2 ml/10 kg canlı ağırlık dozunda uygulanır.'));
  dusukBos(dozOrani('1–2 ml/10 kg canlı ağırlık dozunda uygulanır.'));
  dusukBos(dozOrani('1 ila 2 ml/10 kg canlı ağırlık dozunda uygulanır.'));
  dusukBos(dozOrani('Plazma değerine göre yaklaşık 2 - 5 ml/kg vücut ağırlığı. Ortalama 2 ml/kg vücut ağırlığı.'));
});

test('aralikDusuk: gerçek KÜB (Favetrim) — paydada aralık "1 ml/10-15 kg"', () => {
  dusukBos(dozOrani(ornek('favetrim')));
});

test('tabloDusuk', () => {
  dusukBos(dozOrani('Derin kas içi yolla 1 ml/10 kg canlı ağırlık dozunda uygulanır.', { tablo: true }));
  dusukBos(dozOrani(ornek('draxxin'), { tablo: true }));
  dusukBos(dozOrani(ornek('draxxin'), { eskiBicim: true }));
});

test('kilosuzDoz', () => {
  dusukBos(dozOrani('Etkilenen her meme lobuna bir enjektör uygulanır.'));
  const o = dozOrani(ornek('viramast'));
  dusukBos(o);
  assert.equal(o.kapsam, null);
  assert.equal(o.yerBasinaMaxMl, null);
  dusukBos(dozOrani(null));
  dusukBos(dozOrani(''));
});

test('yerSiniri', () => {
  assert.equal(dozOrani("Bir enjeksiyon yerine 20 ml'den fazla uygulanmamalıdır.").yerBasinaMaxMl, 20);
  assert.equal(dozOrani('Bir enjeksiyon bölgesine 10 ml’den fazla uygulamayınız.').yerBasinaMaxMl, 10);
  assert.equal(dozOrani('Bir enjeksiyon bölgesine en fazla 15 ml uygulanmalıdır.').yerBasinaMaxMl, 15);
  assert.equal(dozOrani('Enjeksiyon bölgesine uygulanan doz hacmi 10 ml’yi aşmamalıdır.').yerBasinaMaxMl, 10);
  // türe göre sınır: sığırınki alınır; sığır sayısı ayrılamıyorsa null
  assert.equal(dozOrani('Bir enjeksiyon bölgesine sığırda 20, keçi ve koyunda 5 ml’den fazla uygulanmamalıdır.').yerBasinaMaxMl, 20);
  assert.equal(dozOrani('Atlarda bir bölgeye en fazla 15, sığırlarda 6, koyunlarda 3 ml uygulanmalıdır.').yerBasinaMaxMl, 6);
  assert.equal(dozOrani('Sığırlarda ve özellikle atlarda 10 ml ve koyunlarda da 5 ml’den fazlasının aynı bölgeye enjeksiyonundan kaçınılmalıdır.').yerBasinaMaxMl, null);
  assert.equal(dozOrani('Koyunlarda bir enjeksiyon yerine 2 ml\'den fazla enjeksiyon yapılmamalıdır.').yerBasinaMaxMl, null);
  // yer sınırı oranı bozmaz
  const o = dozOrani('Kas içi 1 ml/10 kg canlı ağırlık. Bir enjeksiyon bölgesine en fazla 10 ml enjekte edilmelidir.');
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.yerBasinaMaxMl, 10);
});

test('ustSinirDusuk: oranlı cümlede "en fazla / maksimum / üzerindeki hayvan" + ml sınırı', () => {
  dusukBos(dozOrani('Kas içi 1 ml/10 kg canlı ağırlık, ancak 400 kg üzerindeki hayvanlarda en fazla 40 ml uygulanır.'));
  dusukBos(dozOrani('Kas içi 1 ml/10 kg canlı ağırlık (hayvan başına maksimum 50 ml).'));
});

test('endikasyonaGoreFarkliDozDusuk: oranı olmayan cümlede başka mg/kg dozu', () => {
  dusukBos(dozOrani('Solunum yolu enfeksiyonlarında 2,5 mg/kg (1 ml/40 kg vücut ağırlığı) deri altı. '
    + 'Mastitiste 5 mg/kg vücut ağırlığı dozunda damar içi uygulanır.'));
  // aynı mg/kg tekrarı bozmaz (Eprinomec: farmakolojik doz ayrı cümlede, ters yazılı eşdeğer oran)
  const o = dozOrani(ornek('eprinomec'));
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, '1 ml / 10 kg vücut ağırlığı');
});

test('tersYaziliFarkliOranDusuk: "50 kg vücut ağırlığı için 2 ml" ileri orana uymuyorsa', () => {
  dusukBos(dozOrani('Kas içi 1 ml/10 kg canlı ağırlık. Buzağılarda 50 kg vücut ağırlığı için 2 ml uygulanır.'));
});

// --- Ters yazım: "her 30 kg için 1 ml" (aynı ml/kg oranı; aynı güvenlik kuralları) ---

test('tersYazim: gerçek KÜB (Micotil) — "her 30 kg vücut ağırlığı için 1 ml ürün", koyun yer sınırı sayılmaz', () => {
  const o = dozOrani(ornek('micotil'));
  yakin(o.mlPerKg, 1 / 30);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kaynak, 'ml_kg');
  assert.equal(o.kapsam, 'sigir');
  assert.equal(o.ifade, 'her 30 kg vücut ağırlığı için 1 ml');
  assert.equal(o.cumle, 'Her kg vücut ağırlığı için 10 mg tilmikosin (her 30 kg vücut ağırlığı için 1 ml ürün) kullanılır.');
  assert.equal(o.yerBasinaMaxMl, 20);
});

test('tersYazim: gerçek KÜB (ivermektin) — "Sığır" / "Koyun" başlıkları, "Her 50 kg … 1 ml"', () => {
  const o = dozOrani(ornek('mectinol'));
  assert.equal(o.mlPerKg, 0.02);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, 'Her 50 kg vücut ağırlığı için 1 ml');
});

test('tersYazim: gerçek KÜB (Cobactan LA) — "30 kg canlı ağırlığa 1 ml"', () => {
  const o = dozOrani(ornek('cobactan'));
  yakin(o.mlPerKg, 1 / 30);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, '30 kg canlı ağırlığa 1 ml');
  assert.equal(o.yerBasinaMaxMl, 10);
});

test('tersYazim: gerçek KÜB (Flunova) — atın oranı "At:" başlığı altında, sığırınki "Sığır:" altında', () => {
  const o = dozOrani(ornek('flunova'));
  assert.equal(o.mlPerKg, 0.04);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, 'her 50 kg vücut ağırlığı için 2 ml');
});

test('tersYazim: kısa biçimler', () => {
  assert.equal(dozOrani("Kas içi, 30 kg'a 1 ml uygulanır.").mlPerKg, 1 / 30);
  assert.equal(dozOrani('Deri altı, her 10 kg canlı ağırlığa 1 ml uygulanır.').ifade, 'her 10 kg canlı ağırlığa 1 ml');
  assert.equal(dozOrani('Kas içi, 100 kg vücut ağırlığı için günde 3 ml.').mlPerKg, 0.03);
  assert.equal(dozOrani('Kas içi 20 kg vücut ağırlığı başına 1 ml’dir.').mlPerKg, 0.05);
  // kilo sınıfı / örnek hayvan: dar biçim değil → kaynak olmaz
  dusukBos(dozOrani('450 kg’lık bir inek için 15 ml uygulanır.'));
  dusukBos(dozOrani('300 kg’dan ağır sığırlara 15 ml uygulanır.'));
});

test('tersYazimKiloAraligiDusuk: "100-200 kg canlı ağırlığa 10 ml" (kilo bandı)', () => {
  dusukBos(dozOrani('Sığırlarda 100-200 kg canlı ağırlığa 10 ml uygulanır.'));
  dusukBos(dozOrani('Sığırlarda 150 – 200 kg vücut ağırlığı için 10 ml'));
  dusukBos(dozOrani('10 ila 20 kg vücut ağırlığı için 1 ml'));
  dusukBos(dozOrani('100-200 kg canlı ağırlığa 10 ml\n200-300 kg canlı ağırlığa 15 ml'));
});

test('tersYazimTabloDusuk: gerçek KÜB (Rafokin) — "aşağıda tablo olarak", kilo satırları', () => {
  dusukBos(dozOrani(ornek('rafokin')));
  // tablo sözcüğü olmadan da: bir satırda farklı kilolu birden çok ters oran, ya da ardışık kilo satırları
  dusukBos(dozOrani('Sığır: 50 kg canlı ağırlığa 5 ml 100 kg canlı ağırlığa 10 ml'));
  dusukBos(dozOrani('Sığır:\n50 kg canlı ağırlığa 5 ml\n100 kg canlı ağırlığa 10 ml'));
  // aynı kilo tekrarı (endikasyon başına) tablo değildir
  assert.equal(dozOrani('Solunum: her 50 kg vücut ağırlığı için günde 1 ml.\nMetritis: her 50 kg vücut ağırlığı için günde 1 ml.').guven, 'yuksek');
});

test('kapsamYalnizKaynaktan: buzağı oranı, eşit ama kaynak olmayan sığır örneğiyle genişlemez', () => {
  const o = dozOrani('Buzağılarda 1 ml/20 kg canlı ağırlık. 400 kg vücut ağırlığındaki bir sığır için 20 ml.');
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.05);
  assert.equal(o.kapsam, 'buzagi');
  assert.equal(o.cumle, 'Buzağılarda 1 ml/20 kg canlı ağırlık.');
});

test('tersYazimAralikDusuk: gerçek KÜB (Teknomycin 100) — "her 20 kg vücut ağırlığına günde 1-2 ml"', () => {
  dusukBos(dozOrani(ornek('teknomycin')));
  dusukBos(dozOrani('Kas içi, 100 kg vücut ağırlığı için 3-5 ml uygulanır.'));
});

test('ileriVeTersAyniOran: gerçek KÜB (Eprinomec) — tek yuksek, ifade ileri yazım', () => {
  const o = dozOrani(ornek('eprinomec'));
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.ifade, '1 ml / 10 kg vücut ağırlığı');
  const s = dozOrani('Sığırlarda 1 ml/20 kg canlı ağırlık. 400 kg vücut ağırlığı için 20 ml uygulanır.');
  assert.equal(s.guven, 'yuksek');
  assert.equal(s.ifade, '1 ml/20 kg canlı ağırlık');
  dusukBos(dozOrani('Sığırlarda 1 ml/20 kg canlı ağırlık. Her 10 kg vücut ağırlığı için 1 ml uygulanır.'));
});

test('tersYazim + bölünmüş günlük doz: gerçek KÜB (Tilmovet) — "…/gün dozunda günde iki defa"', () => {
  dusukBos(dozOrani(ornek('tilmovet')));
});

test('yalnizErişkin: gerçek KÜB (Bromoscol) — "Erişkin Sığır: 100 kg vücut ağırlığına 5 ml"', () => {
  dusukBos(dozOrani(ornek('bromoscol')));
});

test('urunBicimSozu: gerçek KÜB (Cephaset) — "1 ml enjeksiyonluk süspansiyon/10 kg"; kedi-köpek ters oranı sayılmaz', () => {
  const o = dozOrani(ornek('cephaset'));
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, '1 ml enjeksiyonluk süspansiyon/10 kg vücut ağırlığı');
});

test('bolunmusGunlukDozDusuk: gerçek KÜB (Medox) — "günlük doz ikiye bölünerek"', () => {
  dusukBos(dozOrani(ornek('medox')));
});

test('noktadanSonraBosluksuzCumle: gerçek KÜB (Huvexxin) — "uygulanır.300 kg’dan" iki cümle', () => {
  const o = dozOrani(ornek('huvexxin'));
  assert.equal(o.mlPerKg, 0.025);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.cumle, '2.5 mg tulatromisin/kg vücut ağırlığı (1 ml/40 kg vücut ağırlığına eşdeğer) '
    + 'tek bir deri altı enjeksiyonu ile uygulanır.');
  assert.equal(o.yerBasinaMaxMl, 7.5);
});

test('haricTurSayilmaz: gerçek KÜB (Neuron-B) — "(atlar hariç)" sonraki cümleyi ata bağlamaz', () => {
  const o = dozOrani(ornek('neuron-b'));
  assert.equal(o.mlPerKg, 0.05);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kapsam, 'sigir');
});

test('urunAdliOran: gerçek KÜB (Kinoloks) — "1 ml KİNOLOKS/20 kg"', () => {
  const o = dozOrani(ornek('kinoloks'));
  assert.equal(o.mlPerKg, 0.05);
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.ifade, '1 ml KİNOLOKS/20 kg vücut ağırlığı');
  assert.equal(o.yerBasinaMaxMl, 10);
  // küçük harfli sözcük ürün adı sayılmaz
  dusukBos(dozOrani('Kas içi 1 ml su/10 kg canlı ağırlık.'));
});

test('yemOraniSayilmaz', () => {
  dusukBos(dozOrani('Sürü sağaltımında 1 ml/10 kg yem olacak şekilde karıştırılır.'));
});

test('ondalikVeBitisikYazim', () => {
  assert.equal(dozOrani('Kas içi 2,5 ml/100 kg vücut ağırlığı dozunda.').mlPerKg, 0.025);
  assert.equal(dozOrani('Kas içi 2.5 ml/100 kg vücut ağırlığı dozunda.').mlPerKg, 0.025);
  assert.equal(dozOrani('Deri altı (1ml/40kg vücut ağırlığına eşdeğer) dozunda.').mlPerKg, 0.025);
  assert.equal(dozOrani('Damar içi 0,06 ml/kg vücut ağırlığı.').mlPerKg, 0.06);
  assert.equal(dozOrani('Pratik doz 1 ml ürün/20 kg canlı ağırlıktır.').mlPerKg, 0.05);
});

// --- yolKodlari ---

test('yolKodlari', () => {
  assert.deepEqual(yolKodlari('Derin kas içi ya da deri altı'), ['IM', 'SC']);
  assert.deepEqual(yolKodlari('İntramammer (kuru dönem)'), ['IMM']);
  assert.deepEqual(yolKodlari('SC / IV (yavaş, kombine çözelti)'), ['IV', 'SC']);
  assert.deepEqual(yolKodlari('Ağızdan / sonda ile'), ['ORAL']);
  assert.deepEqual(yolKodlari(null), []);
  assert.deepEqual(yolKodlari(''), []);
});

test('yolKodlari: eş anlamlılar ve sıra', () => {
  assert.deepEqual(yolKodlari('i.m. veya i.v.'), ['IM', 'IV']);
  assert.deepEqual(yolKodlari('İntravenöz, intramüsküler, subkutan'), ['IM', 'IV', 'SC']);
  assert.deepEqual(yolKodlari('Yavaş ven içi veya deri altı yolla uygulanır.'), ['IV', 'SC']);
  assert.deepEqual(yolKodlari('İçme suyuna ya da süt ikamesine katılarak'), ['ORAL']);
  assert.deepEqual(yolKodlari('Meme kanalı yoluyla; her meme lobuna'), ['IMM']);
  assert.deepEqual(yolKodlari('Uterus içi (intrauterin) köpük'), ['IU']);
  assert.deepEqual(yolKodlari('Dökme (pour-on) çözelti, sırt çizgisine'), ['TOPIKAL']);
  assert.deepEqual(yolKodlari('Sprey; lokal olarak'), ['TOPIKAL']);
  assert.deepEqual(yolKodlari('Rumen bolusu'), ['ORAL']);
  assert.deepEqual(yolKodlari('deri altı (sc) ve kas içi (im)'), ['IM', 'SC']);
});

test('yolKodlari: olumsuz cümledeki yol sayılmaz (Shotapen: "Damar içi yolla uygulanmamalıdır")', () => {
  assert.deepEqual(yolKodlari(ornek('shotapen')), ['IM', 'SC']);
  assert.deepEqual(yolKodlari('Deri altı uygulanır, damar içi uygulanmamalıdır.'), ['SC']);
  assert.deepEqual(yolKodlari(ornek('eprinomec')), ['TOPIKAL']);
  assert.deepEqual(yolKodlari(ornek('viramast')), ['IMM']);
});

// --- K8 düzeltme dalgası A (.superpowers/sdd/2026-11-15-tedavi-onerisi/k8-duzeltme-A.md) ---
// Fikstürler: veri/kub.json'daki gerçek 4.9 metinleri (oran/*.txt).

test('A1 yerSiniri: "20 ml’den büyük dozlar en az iki farklı bölgeye" (fluniksin, Vet-Fulin)', () => {
  const o = dozOrani(ornek('vet-fulin'));
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.04);
  assert.equal(o.yerBasinaMaxMl, 20);
  assert.equal(o.yerBasinaYol, null);
});

test('A1 yerSiniri: at bölümünden sonra gelen "Kas içi uygulamalarda bir bölgeye 5 ml" sığırındır (at yalnız ven içi; Tobrofin, Ketosil)', () => {
  for (const ad of ['tobrofin', 'ketosil']) {
    const o = dozOrani(ornek(ad));
    assert.equal(o.guven, 'yuksek', ad);
    assert.equal(o.mlPerKg, 0.03, ad);
    assert.equal(o.yerBasinaMaxMl, 5, ad);
    assert.equal(o.yerBasinaYol, 'IM', ad);
  }
  // sınırın yolu at bölümünde de geçiyorsa (atta da kas içi) kime ait olduğu belirsiz: sayı yok
  const belirsiz = dozOrani('Sığır\nKas içi 3 ml/100 kg.\nAt\nKas içi veya ven içi 1 ml/45 kg.\nKas içi uygulamalarda bir bölgeye 5 ml’den fazla uygulanmamalıdır.');
  assert.equal(belirsiz.yerBasinaMaxMl, null);
  // yolsuz sınır at bağlamında kalır (tür taşıma kuralı aynen)
  assert.equal(dozOrani('Sığır\nKas içi 3 ml/100 kg.\nAt\nVen içi 1 ml/45 kg.\nBir bölgeye 5 ml’den fazla uygulanmamalıdır.').yerBasinaMaxMl, null);
});

test('A1 yerSiniri: yeni kalıplar ve yol bağı', () => {
  assert.equal(dozOrani('Bir uygulama yerine 15 ml’den fazla uygulanmamalıdır.').yerBasinaMaxMl, 15);
  assert.equal(dozOrani('Bir bölgeye sığırlarda en fazla 10 ml enjekte edilmelidir.').yerBasinaMaxMl, 10);
  const im = dozOrani('Kas içi uygulamalarda bir bölgeye 5 ml’den fazla uygulanmamalıdır.');
  assert.equal(im.yerBasinaMaxMl, 5);
  assert.equal(im.yerBasinaYol, 'IM');
  const sc = dozOrani('Deri altı uygulamada bir enjeksiyon yerine 10 ml’den fazla verilmemelidir.');
  assert.equal(sc.yerBasinaYol, 'SC');
  assert.equal(dozOrani('Bir enjeksiyon yerine 20 ml\'den fazla uygulanmamalıdır.').yerBasinaYol, null);
  // koyun cümlesi sayılmaz
  assert.equal(dozOrani('Koyunlarda 5 ml’den büyük dozlar iki farklı bölgeye uygulanmalıdır.').yerBasinaMaxMl, null);
});

test('A1 yerSiniri: KÜB 4.5 (özel uyarılar) cümlesi — amoksisilin LA (Clamoxyl LA)', () => {
  const ozelOnlem = 'Bu ürünün ürün özellikleri özetinde verilen bilgilerden farklı kullanımı direncin gelişmesine neden olabilir.\n'
    + 'Bir bölgeye sığırlarda en fazla 10, koyun ve keçilerde 5 ml enjekte edilmelidir.';
  const o = dozOrani(ornek('clamoxyl-la'), { ozelOnlem });
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.mlPerKg, 0.1);
  assert.equal(o.yerBasinaMaxMl, 10);
  assert.equal(dozOrani(ornek('clamoxyl-la')).yerBasinaMaxMl, null); // 4.5 verilmezse sınır yok
  // 4.9 ve 4.5 farklı sınır verirse sayı yok
  assert.equal(dozOrani('Bir enjeksiyon yerine 20 ml’den fazla uygulanmamalıdır.', { ozelOnlem: 'Bir bölgeye en fazla 10 ml enjekte edilmelidir.' }).yerBasinaMaxMl, null);
  // 4.5'te yalnız kedi-köpek sınırı sayılmaz
  assert.equal(dozOrani('Kas içi 1 ml/10 kg.', { ozelOnlem: 'Kedi ve köpeklerde bir enjeksiyon yerine 2 ml’den fazla uygulanmamalıdır.' }).yerBasinaMaxMl, null);
});

test('A2 kiloBandiListesiDusuk: gerçek KÜB (Kriptostop) — "35 kg < buzağı ≤ 45 kg : … 8 ml" yanında oran', () => {
  dusukBos(dozOrani(ornek('kriptostop')));
  dusukBos(dozOrani('Her 10 kg vücut ağırlığı için 2 ml.\n35–45 kg: 8 ml\n45-60 kg: 12 ml'));
  // ml'siz kilo aralığı (yalnız tanım) oranı bozmaz
  assert.equal(dozOrani('100-200 kg ağırlığındaki buzağılarda 1 ml/10 kg canlı ağırlık dozunda uygulanır.').guven, 'yuksek');
});

test('A3 kapsam KÜB 4.1 hedef türünden: "Sığır (buzağı)" → buzagi; erişkin sığır yoksa sigir verilmez', () => {
  assert.equal(hedefKapsami('Sığır (buzağı) ve koyun (kuzu).'), 'buzagi');
  assert.equal(hedefKapsami('Buzağı, kuzu'), 'buzagi');
  assert.equal(hedefKapsami('Sığır (sütten kesilmemiş buzağılar)'), 'buzagi');
  assert.equal(hedefKapsami('Sığır, koyun, keçi, köpek, kedi'), 'sigir');
  assert.equal(hedefKapsami('Sığır (inek, buzağı)'), 'sigir');
  assert.equal(hedefKapsami('Köpek, kedi'), null);
  assert.equal(hedefKapsami(null), null);
  // Cocciril: 4.9 oranı tür belirtmiyor (kapsam sigir) ama 4.1 yalnız buzağı
  const doz = '1 kg vücut ağırlığı için 1 mg diklazuril, yani 2.5 kg vücut ağırlığı için 1 ml dozundaki ürün tek bir oral uygulama ile verilmelidir.';
  const o = dozOrani(doz, { hedefTur: 'Sığır (buzağı) ve koyun (kuzu).' });
  assert.equal(o.guven, 'yuksek');
  assert.equal(o.kapsam, 'buzagi');
  assert.equal(dozOrani(doz).kapsam, 'sigir');
  assert.equal(dozOrani(doz, { hedefTur: 'Sığır, koyun' }).kapsam, 'sigir');
});

test('A4 kisitlar: 4.1/4.2/4.3/4.9 yaş-kilo kısıtı cümleleri aynen; yoksa []', () => {
  const seftio = dozOrani(ornek('seftio-tac'));
  assert.deepEqual(seftio.kisitlar, ['Ürün buzağılarda kullanılmamalıdır.']);
  assert.equal(seftio.guven, 'yuksek'); // kısıt oranı bozmaz
  assert.deepEqual(dozOrani(ornek('vet-fulin')).kisitlar, []);
  const t = dozOrani('Buzağılar 1 ml/10 kg.', { kisitMetinleri: ['Etkin maddeye aşırı duyarlılıkta kullanmayınız.\n80 kg’dan daha ağır buzağılarda kullanılmaz.'] });
  assert.deepEqual(t.kisitlar, ['80 kg’dan daha ağır buzağılarda kullanılmaz.']);
  const p = dozOrani('1 ml/35 kg.', { kisitMetinleri: ['Sığırda (6 aylık ve üzeri) akut enfeksiyöz solunum yolu hastalığı ve akut mastitisin klinik belirtilerinin azaltılmasında kullanılır.'] });
  assert.equal(p.kisitlar.length, 1);
  assert.ok(p.kisitlar[0].startsWith('Sığırda (6 aylık ve üzeri)'));
  // sığır dışı türün kısıtı ve 4.9'daki doz bölme cümlesi kısıt değildir
  assert.deepEqual(dozOrani('1 ml/25 kg.\nVücut ağırlığı 250 kg’ın üzerindeki sığırlarda tek bir enjeksiyon bölgesine 10 ml’den fazla uygulanmayacak şekilde doz bölünmelidir.',
    { kisitMetinleri: ['6 haftalıktan küçük kedi, köpeklerde ve 2 kg’dan az kedilerde kullanılmaz.'] }).kisitlar, []);
  assert.deepEqual(dozOrani(ornek('kinoloks')).kisitlar, []); // "2 yaşın altındaki sığırlarda … 5 gün uygulanır": süre, kısıt değil
  assert.deepEqual(dozOrani(null).kisitlar, []);
});

test('A5 sabitDoz: hayvan başına / meme lobu başına doz, kilo oranı yok', () => {
  const d = dozOrani(ornek('dinolytic-hc'));
  dusukBos(d);
  assert.equal(d.sabitDoz, true);
  assert.equal(dozOrani(ornek('viramast')).sabitDoz, true);
  assert.equal(dozOrani('Etkilenen her meme lobuna bir enjektör uygulanır.').sabitDoz, true);
  assert.equal(dozOrani('Laktasyondaki inekte her çeyreğe bir tüp.').sabitDoz, true);
  // kilo oranı varsa (yüksek ya da düşük güven) sabit değil
  assert.equal(dozOrani(ornek('vet-fulin')).sabitDoz, false);
  assert.equal(dozOrani(ornek('tolfenak')).sabitDoz, false);
  assert.equal(dozOrani('Hayvan başına 2 ml, 300 kg üzeri hayvanlarda 4 ml.').sabitDoz, false);
  // yalnız koyun cümlesindeki "hayvan başına" sayılmaz
  assert.equal(dozOrani('Koyun: hayvan başına 1 ml.').sabitDoz, false);
  assert.equal(dozOrani(null).sabitDoz, false);
});

test('A6 sigirYollari: yalnız sığıra ait cümleler, olumsuzlar düşer (Fable çapraz-tür listesi)', () => {
  assert.deepEqual(sigirYollari(ornek('gentavilin')), ['IM', 'IV']); // SC kedi-köpek; "Deri altı uygulanmaz"
  assert.deepEqual(sigirYollari(ornek('clamoxyl-la')), ['IM']); // SC kedi-köpek
  assert.deepEqual(sigirYollari(ornek('klavetsilin')), ['IM']); // SC köpek-kedi
  assert.deepEqual(sigirYollari(ornek('micospectone')), ['IM']); // SC tavuk-hindi
  assert.deepEqual(sigirYollari(ornek('tulabiotic')), ['SC']); // IM koyun
  assert.deepEqual(sigirYollari(ornek('shotapen')), ['IM']); // SC köpek; damar içi olumsuz
  assert.deepEqual(sigirYollari(ornek('heyzan')), ['SC']); // "sığırlarda boyun bölges ne ve koyunlarda omuzun önüne der altı" (PDF'te i düşmüş)
  assert.deepEqual(sigirYollari(ornek('eprinomec')), ['TOPIKAL']);
  assert.deepEqual(sigirYollari(ornek('viramast')), ['IMM']);
  assert.deepEqual(sigirYollari('Sığır, koyun ve keçilerde derin kas içi yolla uygulanır.'), ['IM']);
  assert.deepEqual(sigirYollari('Sığırlarda kas içi ve koyunlarda deri altı uygulanır.'), ['IM']);
  assert.deepEqual(sigirYollari(null), []);
  // 4.9'da yol yoksa farmasötik şekil: oral süspansiyon → ORAL (Baycox %5)
  assert.deepEqual(sigirYollari('Buzağılar tek doz olarak 15 mg/kg doz (her 10 kg vücut ağırlığı için 3 ml ürün) uygulanarak tedavi edilmelidir.', { sekil: 'Oral Süspansiyon' }), ['ORAL']);
  assert.deepEqual(sigirYollari('Her 10 kg için 3 ml.', { sekil: 'Enjeksiyonluk çözelti' }), []);
  assert.deepEqual(sigirYollari('Kas içi uygulanır.', { sekil: 'Oral Süspansiyon' }), ['IM']); // 4.9'da yol varsa şekle bakılmaz
});

test('A7 meloksikam: sığırda tek tedavi oranı; "Ameliyattan önce" oranı ve at/köpek/kedi oranları sayılmaz', () => {
  const x4 = dozOrani(ornek('maxicam-x4'));
  assert.equal(x4.guven, 'yuksek');
  yakin(x4.mlPerKg, 0.025);
  assert.equal(x4.ifade, '2,5 ml/100 kg vücut ağırlığı');
  assert.equal(x4.kapsam, 'sigir');
  const anaflex = dozOrani(ornek('anaflex'));
  assert.equal(anaflex.guven, 'yuksek');
  yakin(anaflex.mlPerKg, 0.1);
  // yalnız ameliyat oranı varsa sayı yok
  dusukBos(dozOrani('Sığır:\nAmeliyattan önce 0,4 mg meloksikam/kg vücut ağırlığı (yani 1 ml/50 kg vücut ağırlığı) dozunda tek kas içi enjeksiyon.'));
  // tek cümlede sığır ve at oranı (Lomecam): "… (1 ml/40 kg) ve atlarda; … (3 ml/100 kg)"
  const lomecam = dozOrani(ornek('lomecam'));
  assert.equal(lomecam.guven, 'yuksek');
  yakin(lomecam.mlPerKg, 0.025);
  assert.equal(lomecam.ifade, '1 ml/40 kg');
  // salt tür öbeği ("Sığır ve koyunlarda:", "Sığır, koyun ve keçide") bölünmez
  assert.equal(dozOrani('Sığır ve koyunlarda: 1 ml/10 kg canlı ağırlık.').mlPerKg, 0.1);
  assert.equal(dozOrani('Sığır, koyun ve keçide 1 ml/10 kg canlı ağırlık.').mlPerKg, 0.1);
});
