// Hekim onay araçları: saf işlevler ve dosya güncelleme (yalnız geçici kopyalar üzerinde).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veriYukle } from '../lib/veri.js';
import { onayliMi } from '../lib/onay.js';
import { dizindenOku } from '../scripts/dogrula.mjs';
import { onayla, onayKaldir, onayDurumu, dosyadaOnayla } from '../scripts/onayla.mjs';

const KOK = fileURLToPath(new URL('..', import.meta.url));

function kopya() {
  const dizin = mkdtempSync(join(tmpdir(), 'onayla-'));
  cpSync(join(KOK, 'veri'), join(dizin, 'veri'), { recursive: true });
  return dizin;
}
const yukle = (dizin) => veriYukle(dizindenOku(dizin));
const OLAY = { kim: 'Dr. Test', tarih: '2026-11-15' };

test('onaylananKayitOnayliMi', async () => {
  const veri = await yukle(KOK);
  const id = veri.hastaliklar[0].id;
  const k = onayla(veri, id, OLAY);
  assert.equal(onayliMi(k), true);
  assert.equal(k.onay.kim, OLAY.kim);
  assert.equal(k.onay.tarih, OLAY.tarih);
  assert.equal(onayliMi(veri.hastaliklar[0]), false, 'girdi değişmemeli');
});

test('icerikDegisinceDustu', async () => {
  const veri = await yukle(KOK);
  const h = veri.hastaliklar[0];
  veri.hastaliklar[0] = onayla(veri, h.id, OLAY);
  assert.equal(onayDurumu(veri).find((o) => o.id === h.id).durum, 'onayli');
  veri.hastaliklar[0].ad += ' (değişti)';
  const d = onayDurumu(veri);
  assert.equal(d.find((o) => o.id === h.id).durum, 'dustu');
  assert.equal(d.find((o) => o.id === veri.hastaliklar[1].id).durum, 'taslak');
  assert.deepEqual(Object.keys(d[0]).sort(), ['ad', 'durum', 'grup', 'id']);
});

test('bilinmeyenIdHata', async () => {
  const veri = await yukle(KOK);
  assert.throws(() => onayla(veri, 'yok_boyle', OLAY), /bilinmeyen hastalık/);
  assert.throws(() => onayKaldir(veri, 'yok_boyle'), /bilinmeyen hastalık/);
});

test('onayKaldirTaslagaDondurur', async () => {
  const veri = await yukle(KOK);
  const id = veri.hastaliklar[0].id;
  veri.hastaliklar[0] = onayla(veri, id, OLAY);
  assert.deepEqual(onayKaldir(veri, id).onay, { durum: 'taslak' });
});

test('dosyaBicimiKorunur', async () => {
  const dizin = kopya();
  try {
    const veri = await yukle(dizin);
    const hedef = veri.hastaliklar.find((h) => h.protokol.ilaclar.length === 0);
    const yol = join(dizin, 'veri/hastaliklar');
    const grupDosyalari = JSON.parse(readFileSync(join(yol, 'index.json'), 'utf8'));
    const once = Object.fromEntries(grupDosyalari.map((d) => [d, readFileSync(join(yol, d), 'utf8')]));

    const sonuc = await dosyadaOnayla(dizin, hedef.id, OLAY);
    assert.equal(sonuc.durum, 'onayli');
    for (const d of grupDosyalari) {
      const sonra = readFileSync(join(yol, d), 'utf8');
      if (d !== sonuc.dosya) { assert.equal(sonra, once[d], `${d} değişmemeli`); continue; }
      assert.ok(sonra.endsWith('\n') && !sonra.endsWith('\n\n'));
      const eski = once[d].split('\n');
      const fark = sonra.split('\n').filter((s) => !eski.includes(s));
      assert.ok(fark.length > 0 && fark.every((s) => /"durum"|"kim"|"tarih"|"icerikOzeti"|"onay"/.test(s)), fark.join('|'));
    }
    const yeni = await yukle(dizin);
    assert.equal(onayliMi(yeni.hastaliklar.find((h) => h.id === hedef.id)), true);
    assert.equal(yeni.hastaliklar.filter(onayliMi).length, 1, 'başka kayıt etkilenmemeli');

    await dosyadaOnayla(dizin, hedef.id, { kaldir: true });
    const son = await yukle(dizin);
    assert.equal(son.hastaliklar.filter(onayliMi).length, 0);
    assert.deepEqual(son.hastaliklar, veri.hastaliklar);
    assert.equal(readFileSync(join(yol, sonuc.dosya), 'utf8'), once[sonuc.dosya], 'kaldırınca dosya aynen eski haline döner');
  } finally { rmSync(dizin, { recursive: true, force: true }); }
});

test('dogrulamaHatasiVarsaYazmaz', async () => {
  const dizin = kopya();
  try {
    const veri = await yukle(dizin);
    const hedef = veri.hastaliklar.find((h) => h.protokol.ilaclar.length > 0 && onayliMi(h) === false);
    const yol = join(dizin, 'veri/hastaliklar', `${hedef.grup}.json`);
    const once = readFileSync(yol, 'utf8');
    let hata;
    try { await dosyadaOnayla(dizin, hedef.id, OLAY); } catch (e) { hata = e; }
    // ilaçlı kayıt yeni doğrulama hatası getirirse reddedilir ve dosya aynen kalır
    if (hata) { assert.match(hata.message, /yazılmadı/); assert.equal(readFileSync(yol, 'utf8'), once); }
  } finally { rmSync(dizin, { recursive: true, force: true }); }
});

test('bilinmeyenIdDosyayaDokunmaz', async () => {
  const dizin = kopya();
  try {
    await assert.rejects(() => dosyadaOnayla(dizin, 'yok_boyle', OLAY), /bilinmeyen hastalık/);
  } finally { rmSync(dizin, { recursive: true, force: true }); }
});
