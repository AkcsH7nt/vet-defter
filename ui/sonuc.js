// Ekran 2: Sonuçlar. Kırmızı bayraklar en üstte, ardından ilk 5 uyum sonucu.
// Türkiye'de görülmeyen hastalıklar (turkiyedeGorulmez) ilk 5'e alınmaz, ayrı kapalı bölümde durur;
// kendi kırmızı bayrağı tutarsa normal sıralamaya girer.
import { el, doldur, bilinenGirdi, belirtiAdi, girdiNormalize, SIRALAMA_ACIKLAMASI, YASLAR } from './ortak.js';
import { puanla, yetersizMi, isiOku } from '../lib/puan.js';
import { bayraklar } from '../lib/bayrak.js';

const BANT = { guclu: 'Güçlü', orta: 'Orta', zayif: 'Zayıf' };
const ZAYIF_UYUM = 25;

/** Karşılaştırma için: küçük harf (tr), noktalama yok, tek boşluk. */
function sadeMetin(s) {
  return String(s).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const icinde = (uzun, kisa) => ` ${uzun} `.includes(` ${kisa} `);

/** Uyarıyı listeye ekler: aynısı (boşluk / noktalama farkı dahil) ya da daha uzun biçimi varsa eklemez; kısa biçimi varsa uzunuyla değiştirir. */
function uyariEkle(liste, u) {
  const n = sadeMetin(u);
  if (!n) return;
  const i = liste.findIndex((x) => icinde(sadeMetin(x), n) || icinde(n, sadeMetin(x)));
  if (i < 0) liste.push(u);
  else if (sadeMetin(u).length > sadeMetin(liste[i]).length) liste[i] = u;
}

/** Aynı hastalığın birden çok kuralı tutarsa tek bant: ilk kuralın başlığı, uyarılar sırayla ve tekrarsız. */
export function bayraklariBirlestir(liste) {
  const gruplar = new Map();
  for (const b of liste) {
    const anahtar = b.hastalikId ?? b.id;
    let g = gruplar.get(anahtar);
    if (!g) { g = { ...b, uyarilar: [] }; gruplar.set(anahtar, g); }
    for (const u of b.uyarilar ?? []) uyariEkle(g.uyarilar, u);
  }
  return [...gruplar.values()];
}

/**
 * Ekranın saf içeriği: birleşik bayraklar, ilk 5 (yerli ya da bayrağı tutan), Türkiye'de görülmeyenler.
 * @returns {{ bayraklar, yetersiz: boolean, ana: any[], egzotik: any[], uyanKayitYok: boolean }}
 */
export function sonucListeleri(girdi, veri, simdi = new Date()) {
  const birlesik = bayraklariBirlestir(bayraklar(girdi, veri));
  if (yetersizMi(girdi)) return { bayraklar: birlesik, yetersiz: true, ana: [], egzotik: [], uyanKayitYok: false };
  const bayrakli = new Set(birlesik.map((b) => b.hastalikId));
  const hastalik = new Map(veri.hastaliklar.map((h) => [h.id, h]));
  const ayri = (id) => hastalik.get(id)?.turkiyedeGorulmez === true && !bayrakli.has(id);
  const tum = puanla(girdi, veri, simdi);
  const ana = tum.filter((s) => !ayri(s.id)).slice(0, 5);
  const egzotik = tum.filter((s) => ayri(s.id) && s.eslesen.length > 0);
  // Güçlü eşleşme: en az bir ana (kardinal) bulgu eşleşti ve uyum ≥ %25. Hiçbiri güçlü değilse ekranda not çıkar.
  const kardinalVar = (s) => (hastalik.get(s.id)?.belirtiler ?? [])
    .some((b) => b.agirlik === 'kardinal' && s.eslesen.includes(b.id));
  const gucluEslesme = (s) => kardinalVar(s) && s.uyum >= ZAYIF_UYUM;
  return { bayraklar: birlesik, yetersiz: false, ana, egzotik, uyanKayitYok: ana.length > 0 && !ana.some(gucluEslesme) };
}

export function render(kok, veri, durum) {
  const girdi = bilinenGirdi(durum.girdi, veri);
  const varMi = (id) => veri.hastaliklar.some((h) => h.id === id);
  const adlar = (ids) => ids.map((id) => belirtiAdi(veri, id)).join(', ');
  const s = sonucListeleri(girdi, veri);

  const bayrakBolumu = s.bayraklar.map((b) => {
    const icerik = [
      el('strong', { class: 'bayrak-baslik' }, `⛔ ${b.baslik}`),
      el('ul', {}, (b.uyarilar ?? []).map((u) => el('li', {}, u))),
    ];
    return varMi(b.hastalikId)
      ? el('a', { class: 'bayrak', href: `#/hastalik/${encodeURIComponent(b.hastalikId)}` }, ...icerik, el('span', { class: 'bayrak-git' }, 'Ayrıntı ▸'))
      : el('div', { class: 'bayrak' }, ...icerik);
  });

  const liste = (sonuclar) => el('ol', { class: 'sonuc-liste' }, sonuclar.map((x) => el('li', {},
    el('a', { class: `sonuc ${x.bant}`, href: `#/hastalik/${encodeURIComponent(x.id)}` },
      el('span', { class: 'sonuc-ust' },
        el('strong', {}, x.ad),
        el('span', { class: 'uyum' }, `${BANT[x.bant]} · uyum ${x.uyum}%`)),
      x.eslesen.length ? el('span', { class: 'sonuc-alt' }, `eşleşen: ${adlar(x.eslesen)}`) : null,
      x.eksik.length ? el('span', { class: 'sonuc-alt' }, `eksik: ${adlar(x.eksik)}`) : null,
      x.celisen.length ? el('span', { class: 'sonuc-alt' }, `çelişen: ${adlar(x.celisen)}`) : null)),
  ));

  let govde;
  if (s.yetersiz) {
    govde = el('p', { class: 'yetersiz', role: 'status' }, 'Yetersiz girdi — belirti ekleyin');
  } else {
    govde = [
      s.uyanKayitYok ? el('p', { class: 'yetersiz', id: 'uyan-yok' }, 'Bu tabloya güçlü uyan kayıt yok: aşağıdakilerin hiçbirinde ana bulgu ile en az %25 uyum yok. Listede olmayan bir hastalık olabilir.') : null,
      s.ana.length ? liste(s.ana) : el('p', { class: 'yetersiz' }, 'Bu girdiye uyan hastalık kaydı yok.'),
      s.egzotik.length ? el('details', { class: 'bolum egzotik' },
        el('summary', {}, `Türkiye'de görülmeyen hastalıklar (${s.egzotik.length})`),
        el('div', {},
          el('p', { class: 'soluk' }, 'Eradike ya da Türkiye\'de bildirilmemiş hastalıklar; kendi kırmızı bayrağı çıkmadıkça sıralamaya alınmaz.'),
          liste(s.egzotik))) : null,
    ];
  }

  const yeniVaka = () => {
    durum.girdi = girdiNormalize(null, isiOku);
    delete durum.isiMetni;
    delete durum.kiloMetni;
    delete durum.yasAyMetni;
    durum.kaydet?.();
    location.hash = '#/tani';
  };

  const yasAdi = YASLAR.find(([k]) => k === girdi.yas)?.[1] ?? '';
  const ozet = [yasAdi, girdi.kilo != null ? `${String(girdi.kilo).replace('.', ',')} kg` : null].filter(Boolean).join(' · ');

  doldur(kok,
    el('h1', {}, 'Sonuçlar'),
    ozet ? el('p', { class: 'soluk', id: 'girdi-ozeti' }, ozet) : null,
    s.yetersiz ? null : el('p', { class: 'aciklama soluk' }, SIRALAMA_ACIKLAMASI),
    bayrakBolumu.length ? el('section', { class: 'bayraklar', 'aria-label': 'Kırmızı bayraklar' }, bayrakBolumu) : null,
    govde,
    el('a', { class: 'dugme', href: '#/tani' }, '◂ Girdiyi düzenle'),
    el('button', { type: 'button', class: 'dugme', id: 'yeni-vaka', onclick: yeniVaka }, 'Yeni vaka'),
  );
}
