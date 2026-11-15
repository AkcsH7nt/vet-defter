// KÜB 4.9 metninden sığır ml/kg oranı ve uygulama yolu kodları (tedavi önerisi planı Task 1).
// Örnekler test/ornek/kub/oran/*.txt: veri/kub.json'daki gerçek KÜB 4.9 metinlerinden kesitler.
// Anti-hedef: yanlış bir `yuksek` oran (ekranda hayvana ml olarak hesaplanır). Emin değilse dusuk, mlPerKg null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dozOrani, yolKodlari } from '../lib/oran.js';

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

test('farkliIkiOranDusuk: gerçek KÜB (meloksikam) — sığırda iki endikasyon, atta üçüncü oran', () => {
  dusukBos(dozOrani(ornek('maxicam-x4')));
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
  // yalnız ters yazım: bu planda oran sayılmaz
  dusukBos(dozOrani('30 kg vücut ağırlığı için 1 ml deri altı uygulanır.'));
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
