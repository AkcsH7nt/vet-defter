// Ekran 1: Tanı girişi. Durum (girdi) değiştikçe sessionStorage'a yazılır.
import { el, doldur, YASLAR, SISTEMLER, bilinenGirdi } from './ortak.js';
import { isiOku, isiBulgusu } from '../lib/puan.js';
import { belirtiAra } from '../lib/arama.js';

const BAGLAMLAR = [
  ['dogumSonrasi', 'Son 30 gün doğum'],
  ['suru', 'Birden çok hayvan'],
  ['aniOlum', 'Ani ölüm'],
];

export function render(kok, veri, durum) {
  const girdi = durum.girdi;
  const secilebilir = veri.belirtiler.filter((b) => b.secilebilir !== false && (b.tur ?? ['sigir']).includes('sigir'));
  const bilinen = new Set(secilebilir.map((b) => b.id));
  girdi.belirtiler = girdi.belirtiler.filter((id) => bilinen.has(id));
  const kaydet = () => durum.kaydet?.();

  const yasKutusu = el('div', { class: 'secenekler', role: 'group', 'aria-label': 'Yaş grubu' });
  const yasCiz = () => {
    doldur(yasKutusu, ...YASLAR.map(([k, ad]) => el('button', {
      type: 'button', class: 'secenek', 'data-yas': k, 'aria-pressed': String(girdi.yas === k),
      onclick: () => { girdi.yas = k; kaydet(); yasCiz(); isiIpucuCiz(); },
    }, ad)));
  };

  const baglamKutusu = el('div', { class: 'baglam' }, BAGLAMLAR.map(([k, ad]) => el('label', { class: 'onay-kutusu' },
    el('input', {
      type: 'checkbox', checked: girdi.baglam[k] === true, 'data-baglam': k,
      onchange: (e) => { girdi.baglam[k] = e.target.checked; kaydet(); },
    }),
    el('span', {}, ad))));

  const isiIpucu = el('p', { class: 'ipucu', 'aria-live': 'polite' });
  const isiGirdisi = el('input', {
    id: 'isi', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'örn. 40,6', class: 'alan',
    value: girdi.isi == null ? '' : String(girdi.isi).replace('.', ','),
    oninput: (e) => { girdi.isi = isiOku(e.target.value); kaydet(); isiIpucuCiz(); },
  });
  function isiIpucuCiz() {
    const ham = isiGirdisi.value.trim();
    if (!ham) { isiIpucu.textContent = ''; return; }
    if (girdi.isi == null) { isiIpucu.textContent = 'Isı 30–45 °C arasında olmalı; puana katılmıyor.'; return; }
    const b = isiBulgusu(girdi.isi, girdi.yas);
    isiIpucu.textContent = b === 'ates' ? '→ ateş (yaşa göre)' : b === 'hipotermi' ? '→ düşük vücut ısısı' : '→ normal aralık';
  }

  const aramaKutusu = el('input', {
    id: 'ara', type: 'search', class: 'alan', autocomplete: 'off', placeholder: 'Belirti ara (örn. öksürük)',
    oninput: () => bolumCiz(),
  });
  const sonuclar = el('div', { class: 'belirti-liste', 'aria-live': 'polite' });
  const secili = el('div', { class: 'secili' });
  const cipler = el('div', { class: 'secenekler cipler', role: 'group', 'aria-label': 'Sistem' });
  let acikSistem = null;

  const ad = (id) => secilebilir.find((b) => b.id === id)?.ad ?? id;
  const degistir = (id) => {
    const i = girdi.belirtiler.indexOf(id);
    if (i >= 0) girdi.belirtiler.splice(i, 1); else girdi.belirtiler.push(id);
    kaydet(); bolumCiz();
  };
  const belirtiDugmesi = (b) => el('button', {
    type: 'button', class: 'belirti-dugme', 'data-belirti': b.id,
    'aria-pressed': String(girdi.belirtiler.includes(b.id)), onclick: () => degistir(b.id),
  }, b.ad);

  function bolumCiz() {
    doldur(secili, 
      girdi.belirtiler.length ? el('p', { class: 'etiket-baslik' }, 'Seçili belirtiler') : null,
      ...girdi.belirtiler.map((id) => el('button', {
        type: 'button', class: 'cip-secili', 'data-secili': id, 'aria-label': `Kaldır: ${ad(id)}`, onclick: () => degistir(id),
      }, `${ad(id)} ✕`)),
    );
    const sorgu = aramaKutusu.value.trim();
    let liste = [];
    let bos = '';
    if (sorgu) {
      liste = belirtiAra(sorgu, secilebilir).slice(0, 8);
      if (!liste.length) bos = 'Eşleşen belirti yok.';
    } else if (acikSistem) {
      liste = secilebilir.filter((b) => b.sistem === acikSistem);
    }
    doldur(sonuclar, ...liste.map(belirtiDugmesi), bos ? el('p', { class: 'ipucu' }, bos) : null);
    const sistemler = [...new Set(secilebilir.map((b) => b.sistem))];
    doldur(cipler, ...sistemler.map((s) => el('button', {
      type: 'button', class: 'secenek', 'aria-pressed': String(acikSistem === s),
      onclick: () => { acikSistem = acikSistem === s ? null : s; aramaKutusu.value = ''; bolumCiz(); },
    }, SISTEMLER[s] ?? s)));
  }

  yasCiz(); isiIpucuCiz(); bolumCiz();

  doldur(kok, 
    el('h1', {}, 'Tanı'),
    el('p', { class: 'soluk' }, 'Tür: Sığır'),
    el('h2', {}, 'Yaş'), yasKutusu,
    el('h2', {}, 'Bağlam'), baglamKutusu,
    el('h2', {}, el('label', { for: 'isi' }, 'Vücut ısısı (°C)')), isiGirdisi, isiIpucu,
    el('h2', {}, el('label', { for: 'ara' }, 'Belirtiler')), aramaKutusu, cipler, sonuclar, secili,
    el('button', {
      type: 'button', class: 'dugme ana', id: 'goster',
      onclick: () => { Object.assign(girdi, bilinenGirdi(girdi, veri)); kaydet(); location.hash = '#/sonuc'; },
    }, 'Sonuçları göster'),
  );
}
