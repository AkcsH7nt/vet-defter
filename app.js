// Hash yönlendirici. Ekran modülleri: export function render(kok, veri, durum).
// Task 7: aşağıdaki EKRANLAR içindeki `modul` alanlarına './ui/tani.js' gibi yollar yazılır.
import { el, bulunamadi, girdiNormalize, icGecisEkle } from './ui/ortak.js';
import { veriYukle } from './lib/veri.js';
import { isiOku } from './lib/puan.js';

const kok = document.getElementById('kok');

// kimlik: true → rota bir kimlik ister (#/hastalik/<id>). Veri gelene kadar kimlikler bilinmez → Bulunamadı.
const EKRANLAR = {
  tani: { baslik: 'Tanı', modul: './ui/tani.js', gezinme: 'tani' },
  sonuc: { baslik: 'Sonuçlar', modul: './ui/sonuc.js', gezinme: 'tani' },
  hastalik: { baslik: 'Hastalık', modul: './ui/hastalik.js', gezinme: 'hastaliklar', kimlik: true },
  etken: { baslik: 'Etken madde', modul: './ui/etken.js', gezinme: 'ilaclar', kimlik: true },
  hastaliklar: { baslik: 'Hastalıklar', modul: './ui/listeler.js', gezinme: 'hastaliklar' },
  ilaclar: { baslik: 'İlaçlar', modul: './ui/listeler.js', gezinme: 'ilaclar' },
  hakkinda: { baslik: 'Hakkında', modul: './ui/hakkinda.js', gezinme: 'hakkinda' },
};

// Ekranlar arası paylaşılan durum (girdi: Task 4 Girdi). sessionStorage'da tutulur.
const ANAHTAR = 'vet-defter-durum';
function durumYukle() {
  let ham = null;
  try { ham = JSON.parse(sessionStorage.getItem(ANAHTAR))?.girdi; } catch { /* depolama kapalı ya da bozuk */ }
  return girdiNormalize(ham, isiOku);
}
const durum = { girdi: durumYukle(), kaydet: durumKaydet };
export function durumKaydet() {
  try { sessionStorage.setItem(ANAHTAR, JSON.stringify({ girdi: durum.girdi })); } catch { /* yoksay */ }
}

// Veri bir kez yüklenir; başarısızlıkta "Yeniden dene" ile tekrar denenir.
let veriSozu = null;
function veriIste() {
  veriSozu ??= veriYukle().catch((e) => { veriSozu = null; throw e; });
  return veriSozu;
}

function rotaAyir() {
  let parcalar;
  try {
    parcalar = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // bozuk %-kodlama
  }
  const ad = parcalar[0] ?? 'tani';
  return { ad, id: parcalar[1], fazla: parcalar.length > (EKRANLAR[ad]?.kimlik ? 2 : 1) };
}

function gezinmeIsaretle(ad) {
  for (const a of document.querySelectorAll('.alt-gezinme a')) {
    if (a.dataset.rota === ad) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

let sonCizim = 0;
async function ciz() {
  if (!location.hash) { location.replace('#/tani'); return; }
  const benim = ++sonCizim;
  const rota = rotaAyir();
  const ekran = rota && Object.hasOwn(EKRANLAR, rota.ad) ? EKRANLAR[rota.ad] : null;
  if (!ekran || rota.fazla || (ekran.kimlik && !rota.id)) { gezinmeIsaretle(null); bulunamadi(kok); return; }
  gezinmeIsaretle(ekran.gezinme);
  document.title = `${ekran.baslik} · Vet Defter`;
  if (!ekran.modul) { yerTutucu(ekran); return; }
  let veri;
  try {
    if (!veriSozu) kok.replaceChildren(el('p', { class: 'yukleniyor', role: 'status' }, 'Yükleniyor…'));
    veri = await veriIste();
  } catch (e) {
    if (benim !== sonCizim) return;
    console.warn(e);
    kok.replaceChildren(
      el('h1', {}, 'Veri yüklenemedi'),
      el('p', { class: 'bulunamadi', role: 'alert' }, 'Veri dosyaları açılamadı. Bağlantıyı kontrol edip yeniden deneyin.'),
      el('button', { type: 'button', class: 'dugme', onclick: ciz }, 'Yeniden dene'),
    );
    return;
  }
  if (benim !== sonCizim) return;
  try {
    const m = await import(ekran.modul);
    if (benim !== sonCizim) return;
    m.render(kok, veri, durum, rota);
  } catch (e) {
    if (benim !== sonCizim) return;
    bulunamadi(kok, 'Bu ekran yüklenemedi.');
    console.warn(e);
  }
}

function yerTutucu(ekran) {
  kok.replaceChildren(
    el('h1', {}, ekran.baslik),
    el('p', { class: 'yer-tutucu' }, 'Bu ekran yakında eklenecek.'),
  );
}

document.body.append(el('p', { class: 'sabit-not' }, 'Hekim kararının yerine geçmez'));
addEventListener('hashchange', () => { icGecisEkle(); ciz(); });
ciz();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı kabuk olmadan da çalışır */ });
}
