// Hash yönlendirici. Ekran modülleri: export function render(kok, veri, durum).
// Task 7: aşağıdaki EKRANLAR içindeki `modul` alanlarına './ui/tani.js' gibi yollar yazılır.
import { el, bulunamadi, sorumlulukNotu } from './ui/ortak.js';

const kok = document.getElementById('kok');

// kimlik: true → rota bir kimlik ister (#/hastalik/<id>). Veri gelene kadar kimlikler bilinmez → Bulunamadı.
const EKRANLAR = {
  tani: { baslik: 'Tanı', modul: null, gezinme: 'tani' },
  sonuc: { baslik: 'Sonuçlar', modul: null, gezinme: 'tani' },
  hastalik: { baslik: 'Hastalık', modul: null, gezinme: 'hastaliklar', kimlik: true },
  etken: { baslik: 'Etken madde', modul: null, gezinme: 'ilaclar', kimlik: true },
  hastaliklar: { baslik: 'Hastalıklar', modul: null, gezinme: 'hastaliklar' },
  ilaclar: { baslik: 'İlaçlar', modul: null, gezinme: 'ilaclar' },
  hakkinda: { baslik: 'Hakkında', modul: null, gezinme: 'hakkinda' },
};

// Ekranlar arası paylaşılan durum (girdi: Task 4 Girdi). sessionStorage'da tutulur.
const ANAHTAR = 'vet-defter-durum';
function durumYukle() {
  try {
    const d = JSON.parse(sessionStorage.getItem(ANAHTAR));
    if (d && typeof d === 'object') return d;
  } catch { /* depolama kapalı ya da bozuk: boş durumla devam */ }
  return { girdi: {} };
}
const durum = durumYukle();
export function durumKaydet() {
  try { sessionStorage.setItem(ANAHTAR, JSON.stringify(durum)); } catch { /* yoksay */ }
}

// Task 2-3 gelince veri/*.json burada yüklenecek.
const veri = null;

function rotaAyir() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const ad = parcalar[0] ?? 'tani';
  return { ad, id: parcalar[1], fazla: parcalar.length > (EKRANLAR[ad]?.kimlik ? 2 : 1) };
}

function gezinmeIsaretle(ad) {
  for (const a of document.querySelectorAll('.alt-gezinme a')) {
    if (a.dataset.rota === ad) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function ciz() {
  if (!location.hash) { location.replace('#/tani'); return; }
  const { ad, id, fazla } = rotaAyir();
  const ekran = Object.hasOwn(EKRANLAR, ad) ? EKRANLAR[ad] : null;
  if (!ekran || fazla || (ekran.kimlik && !id)) { gezinmeIsaretle(null); bulunamadi(kok); return; }
  gezinmeIsaretle(ekran.gezinme);
  document.title = `${ekran.baslik} · Vet Defter`;
  if (ekran.modul) {
    try {
      const m = await import(ekran.modul);
      m.render(kok, veri, durum);
    } catch (e) {
      bulunamadi(kok, 'Bu ekran yüklenemedi.');
      console.warn(e);
    }
    return;
  }
  if (ekran.kimlik) { bulunamadi(kok, 'Bu kayıt bulunamadı.'); return; }
  yerTutucu(ekran);
}

function yerTutucu(ekran) {
  kok.replaceChildren(
    el('h1', {}, ekran.baslik),
    el('p', { class: 'yer-tutucu' }, 'Bu ekran yakında eklenecek.'),
    ekran.gezinme === 'hakkinda' ? sorumlulukNotu() : null,
  );
}

addEventListener('hashchange', ciz);
ciz();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı kabuk olmadan da çalışır */ });
}
