import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfMi, dosyaAdi } from '../scripts/kub-indir.mjs';

test('pdfMi: %PDF- ile başlayan baytlar', () => {
  assert.equal(pdfMi(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(pdfMi(new TextEncoder().encode('<!DOCTYPE html>')), false);
  assert.equal(pdfMi(new Uint8Array([0x25, 0x50])), false);
  assert.equal(pdfMi(null), false);
});

test('dosyaAdi: güvenli urunId → .pdf, aksi null', () => {
  assert.equal(dosyaAdi('e685b91f-ae1a-4d5b-b36c-cca552fac963'), 'e685b91f-ae1a-4d5b-b36c-cca552fac963.pdf');
  assert.equal(dosyaAdi('../x'), null);
  assert.equal(dosyaAdi(''), null);
  assert.equal(dosyaAdi(undefined), null);
});
