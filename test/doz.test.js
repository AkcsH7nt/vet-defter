// Doz yolu (final-review I3, kontrolör kararı 8): doz yalnız onaylı hastalık + kimlik/adla bulunan, satırın
// etkenini içeren, KÜB'ü doğrulanmış ve sonra değişmemiş ürün + satırın yoluyla aynı KÜB satırı varken gösterilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { veriYukle } from '../lib/veri.js';
import { kubOzeti, icerikOzeti } from '../lib/onay.js';
import { dozBilgisi, kaynakUrunu, sigirMi, yalnizBuzagiMi } from '../ui/hastalik.js';

const ORNEK = join(fileURLToPath(new URL('..', import.meta.url)), 'test', 'ornek');

/** Örnek veri: ornek_solunum onaylı, 1. satır "Örnek Ürün %10 (test)" IM; ürünün KÜB'ü doğrulanmış. */
async function hazir() {
  const veri = await veriYukle(dizindenOku(ORNEK));
  const u = veri.urunler[0];
  u.kubDogrulandi = { kim: 'hekim', tarih: '2026-11-14', icerikOzeti: kubOzeti(u) };
  const h = veri.hastaliklar.find((x) => x.id === 'ornek_solunum');
  return { veri, h, ilac: h.protokol.ilaclar[0], u };
}

test('dozTumKosullarTutunca', async () => {
  const { veri, h, ilac } = await hazir();
  const d = dozBilgisi(h, ilac, veri.urunler);
  assert.equal(d.kub.doz.miktar, 10);
  assert.equal(d.kub.yol, 'IM');
});

test('taslakHastaliktaDozYok', async () => {
  const { veri, h, ilac } = await hazir();
  const taslak = { ...h, ad: `${h.ad} değişti` }; // özet tutmaz → taslak
  assert.equal(dozBilgisi(taslak, ilac, veri.urunler), null);
});

test('kubDogrulanmamisYaDaSonradanDegismisseDozYok', async () => {
  const { veri, h, ilac, u } = await hazir();
  u.kub[0].doz.miktar = 99; // doğrulamadan sonra değişti
  assert.equal(dozBilgisi(h, ilac, veri.urunler), null);
  u.kubDogrulandi = null;
  assert.equal(dozBilgisi(h, ilac, veri.urunler), null);
});

test('urunSatirinEtkeniniIcermiyorsaDozYok', async () => {
  const { veri, h, ilac, u } = await hazir();
  u.etkenler = ['ornek_nsaii'];
  assert.equal(kaynakUrunu(ilac, veri.urunler), null);
  assert.equal(dozBilgisi(h, ilac, veri.urunler), null);
});

test('ayniAdliIkiUrunBelirsizDozYokUrunIdIleBelirli', async () => {
  const { veri, h, ilac, u } = await hazir();
  const ikiz = structuredClone(u);
  ikiz.firma = 'Başka Firma';
  ikiz.kub[0].doz.miktar = 50;
  ikiz.kubDogrulandi.icerikOzeti = kubOzeti(ikiz);
  veri.urunler.push(ikiz);
  assert.equal(dozBilgisi(h, ilac, veri.urunler), null, 'ad iki ürüne uyuyor: belirsiz');
  u.urunId = '11';
  ikiz.urunId = '22';
  const ilacId = { ...ilac, kaynak: { ...ilac.kaynak, urunId: '22' } };
  const h2 = structuredClone(h);
  h2.protokol.ilaclar[0] = ilacId;
  h2.onay.icerikOzeti = icerikOzeti(h2);
  assert.equal(dozBilgisi(h2, ilacId, veri.urunler).kub.doz.miktar, 50);
});

test('kubSatiriYolaUymuyorsaDozYok', async () => {
  const { veri, h, ilac, u } = await hazir();
  u.kub[0].yol = 'IV';
  u.kubDogrulandi.icerikOzeti = kubOzeti(u);
  assert.equal(dozBilgisi(h, ilac, veri.urunler), null);
});

test('sigirVeBuzagiUrunleriSigirSayilir', () => {
  assert.equal(sigirMi({ hedefTurler: ['sigir'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['buzagi'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['Buzağı'] }), true);
  assert.equal(sigirMi({ hedefTurler: ['koyun', 'kuzu'] }), false);
  assert.equal(yalnizBuzagiMi({ hedefTurler: ['buzagi', 'kuzu'] }), true);
  assert.equal(yalnizBuzagiMi({ hedefTurler: ['sigir', 'buzagi'] }), false);
});

test('gercekVerideToltrazurilVeHalofuginonUrunleriVar', async () => {
  const veri = await veriYukle(dizindenOku(fileURLToPath(new URL('..', import.meta.url))));
  for (const id of ['toltrazuril', 'halofuginon']) {
    assert.ok(veri.urunler.some((u) => u.etkenler.includes(id) && sigirMi(u)), id);
  }
});
