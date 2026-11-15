// Ekran 1: Tanı girişi. Durum (girdi) değiştikçe sessionStorage'a yazılır.
import { el, doldur, YASLAR, SISTEMLER, bilinenGirdi } from './ortak.js';
import { isiOku, isiBulgusu, bulgular } from '../lib/puan.js';
import { kiloOku, yasAyOku, kiloUyarisi } from '../lib/hayvan.js';
import { belirtiAra, normalize } from '../lib/arama.js';

const BAGLAMLAR = [
  ['dogumSonrasi', 'Son 30 gün doğum'],
  ['suru', 'Birden çok hayvan'],
  ['aniOlum', 'Ani ölüm'],
];

/** Sorgu ateş / ısı ile ilgili mi? (ateş elle seçilmez, ısıdan hesaplanır) */
const isiSorgusuMu = (sorgu) => /^(ates|hipoterm|vucut isi|isi$|isi |sicaklik)/.test(normalize(sorgu));

export function render(kok, veri, durum) {
  const girdi = durum.girdi;
  const secilebilir = veri.belirtiler.filter((b) => b.secilebilir !== false && (b.tur ?? ['sigir']).includes('sigir'));
  const bilinen = new Set(secilebilir.map((b) => b.id));
  girdi.belirtiler = girdi.belirtiler.filter((id) => bilinen.has(id));
  const kaydet = () => { durum.kaydet?.(); gosterCiz(); };

  const yasKutusu = el('div', { class: 'secenekler', role: 'group', 'aria-label': 'Yaş grubu' });
  const yasCiz = () => {
    doldur(yasKutusu, ...YASLAR.map(([k, ad]) => el('button', {
      type: 'button', class: 'secenek', 'data-yas': k, 'aria-pressed': String(girdi.yas === k),
      onclick: () => { girdi.yas = k; kaydet(); yasCiz(); isiIpucuCiz(); kiloIpucuCiz(); },
    }, ad)));
  };

  const baglamKutusu = el('div', { class: 'baglam' }, BAGLAMLAR.map(([k, ad]) => el('label', { class: 'onay-kutusu' },
    el('input', {
      type: 'checkbox', checked: girdi.baglam[k] === true, 'data-baglam': k,
      onchange: (e) => { girdi.baglam[k] = e.target.checked; kaydet(); },
    }),
    el('span', {}, ad))));

  // Geçersiz ısı metni (ör. "406") silinmesin: Sonuçlar'dan dönünce aynı metin ve uyarı görünsün.
  const isiIpucu = el('p', { class: 'ipucu', id: 'isi-ipucu', 'aria-live': 'polite' });
  const isiGirdisi = el('input', {
    id: 'isi', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'örn. 40,6', class: 'alan',
    value: durum.isiMetni ?? (girdi.isi == null ? '' : String(girdi.isi).replace('.', ',')),
    oninput: (e) => { durum.isiMetni = e.target.value; girdi.isi = isiOku(e.target.value); kaydet(); isiIpucuCiz(); },
  });
  function isiIpucuCiz() {
    const ham = isiGirdisi.value.trim();
    if (!ham) { isiIpucu.textContent = ''; return; }
    if (girdi.isi == null) { isiIpucu.textContent = 'Isı 30–45 °C arasında olmalı; puana katılmıyor.'; return; }
    const b = isiBulgusu(girdi.isi, girdi.yas);
    isiIpucu.textContent = b === 'ates' ? '→ ateş (yaşa göre)' : b === 'hipotermi' ? '→ düşük vücut ısısı' : '→ normal aralık';
  }

  // Kilo ve yaş (ay): geçersiz metin silinmez; girdi.kilo / girdi.yasAy her zaman sayı ya da null.
  const sayiMetni = (v) => (v == null ? '' : String(v).replace('.', ','));
  const kiloIpucu = el('p', { class: 'ipucu', id: 'kilo-ipucu', 'aria-live': 'polite' });
  const kiloGirdisi = el('input', {
    id: 'kilo', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'örn. 450', class: 'alan',
    value: durum.kiloMetni ?? sayiMetni(girdi.kilo),
    oninput: (e) => { durum.kiloMetni = e.target.value; girdi.kilo = kiloOku(e.target.value); kaydet(); kiloIpucuCiz(); },
  });
  const yasAyGirdisi = el('input', {
    id: 'yas-ay', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'örn. 18', class: 'alan',
    value: durum.yasAyMetni ?? sayiMetni(girdi.yasAy),
    oninput: (e) => { durum.yasAyMetni = e.target.value; girdi.yasAy = yasAyOku(e.target.value); kaydet(); },
  });
  function kiloIpucuCiz() {
    const u = kiloUyarisi(girdi.kilo, girdi.yas);
    if (u) kiloIpucu.textContent = u.metin;
    else kiloIpucu.textContent = kiloGirdisi.value.trim() && girdi.kilo == null ? 'Kilo sayı olmalı (örn. 450).' : '';
  }
  const kiloSatiri = el('div', { class: 'alan-satiri', style: 'display:flex;gap:12px;align-items:flex-end' },
    el('div', { style: 'flex:1' }, el('label', { for: 'kilo' }, 'Kilo (kg)'), kiloGirdisi),
    el('div', { style: 'flex:1' }, el('label', { for: 'yas-ay' }, 'Yaş (ay, isteğe bağlı)'), yasAyGirdisi));

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
    'aria-pressed': String(girdi.belirtiler.includes(b.id)),
    onclick: () => {
      // Aramadan seçince kutu temizlenir, odak kalır: sıradaki belirti hemen yazılabilir.
      if (aramaKutusu.value.trim()) { aramaKutusu.value = ''; degistir(b.id); aramaKutusu.focus(); } else degistir(b.id);
    },
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
    sonuclar.classList.toggle('iki-sutun', !sorgu && !!acikSistem);
    const isiNotu = sorgu && isiSorgusuMu(sorgu)
      ? el('p', { class: 'ipucu', id: 'isi-notu' }, 'Ateş ve düşük ısı vücut ısısından hesaplanır — yukarıdaki kutuya ısıyı girin.') : null;
    doldur(sonuclar, isiNotu, ...liste.map(belirtiDugmesi), bos && !isiNotu ? el('p', { class: 'ipucu' }, bos) : null);
    const sistemler = [...new Set(secilebilir.map((b) => b.sistem))];
    doldur(cipler, ...sistemler.map((s) => el('button', {
      type: 'button', class: 'secenek', 'aria-pressed': String(acikSistem === s),
      onclick: () => { acikSistem = acikSistem === s ? null : s; aramaKutusu.value = ''; bolumCiz(); },
    }, SISTEMLER[s] ?? s)));
  }

  // Alt çubuk: "Sonuçları göster" kaydırmadan erişilir (alt gezinme ve sabit notun üstünde yapışık).
  const goster = el('button', {
    type: 'button', class: 'dugme ana', id: 'goster',
    onclick: () => { Object.assign(girdi, bilinenGirdi(girdi, veri)); durum.kaydet?.(); location.hash = '#/sonuc'; },
  });
  function gosterCiz() {
    const n = bulgular(bilinenGirdi(girdi, veri)).length;
    goster.textContent = n ? `Sonuçları göster (${n} bulgu)` : 'Sonuçları göster';
  }

  yasCiz(); isiIpucuCiz(); kiloIpucuCiz(); bolumCiz(); gosterCiz();

  doldur(kok,
    el('h1', {}, 'Tanı'),
    el('p', { class: 'soluk' }, 'Tür: Sığır'),
    el('h2', {}, 'Yaş'), yasKutusu, kiloSatiri, kiloIpucu,
    el('h2', {}, 'Bağlam'), baglamKutusu,
    el('h2', {}, el('label', { for: 'isi' }, 'Vücut ısısı (°C)')), isiGirdisi, isiIpucu,
    el('h2', {}, el('label', { for: 'ara' }, 'Belirtiler')), aramaKutusu, cipler, sonuclar, secili,
    el('div', { class: 'alt-cubuk' }, goster),
  );
}
