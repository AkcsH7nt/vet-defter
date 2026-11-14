// Uyum puanı motoru (spec §9). Saf: DOM yok, tarayıcıda ve Node'da çalışır.
// skor = ln(ön) + Σ bulgu katkısı + Σ ceza  → sıralama için.
// uyum = hastalığın kendi beklenen belirtilerinin ağırlıkça bulunan payı (mutlak kapsama;
// hastalıklar arasında normalize edilmez, kalibre olasılık değildir).

const DUYARLILIK = { kardinal: 0.9, tipik: 0.6, olasi: 0.25 };
const LISTEDE_YOK = 0.03;
const ON = { sik: 3, orta: 1, nadir: 0.3 };
const MEVSIM_CARPANI = 2;
const YOKLUK_DUYARLILIGI = 0.1;
const DISLAYICI_CEZASI = -5;
const UYUM_AGIRLIGI = { kardinal: 3, tipik: 2, olasi: 1 };
const AGIRLIK_SIRASI = { kardinal: 0, tipik: 1, olasi: 2 };
const ISI_BULGULARI = new Set(['ates', 'hipotermi']);

/** Kullanıcının yazdığı ısıyı okur: virgül ya da nokta; 30–45 °C dışı ya da bozuksa null. */
export function isiOku(metin) {
  if (typeof metin === 'number') return Number.isFinite(metin) && metin >= 30 && metin <= 45 ? metin : null;
  if (typeof metin !== 'string') return null;
  const sade = metin.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(sade)) return null;
  const isi = Number(sade);
  return isi >= 30 && isi <= 45 ? isi : null;
}

/** Isıdan bulgu: ateş (buzağıda > 39,8, diğerlerinde > 39,3), hipotermi (< 37,8) ya da null. */
export function isiBulgusu(isi, yas) {
  if (typeof isi !== 'number' || !Number.isFinite(isi)) return null;
  const atesEsigi = yas === 'buzagi' ? 39.8 : 39.3;
  if (isi > atesEsigi) return 'ates';
  if (isi < 37.8) return 'hipotermi';
  return null;
}

/** Seçili belirtiler + ısı bulgusu, tekrarsız. ates/hipotermi yalnız ısıdan gelir. */
export function bulgular(girdi) {
  const sonuc = [];
  for (const id of girdi.belirtiler ?? []) {
    if (!ISI_BULGULARI.has(id) && !sonuc.includes(id)) sonuc.push(id);
  }
  const isiB = isiBulgusu(girdi.isi, girdi.yas);
  if (isiB) sonuc.push(isiB);
  return sonuc;
}

/** 3'ten az bulguda puan anlamlı değildir ("Yetersiz girdi — belirti ekleyin"). */
export function yetersizMi(girdi) {
  return bulgular(girdi).length < 3;
}

function uygunMu(h, girdi) {
  if (!h.tur.includes(girdi.tur)) return false;
  if (!h.yasGruplari.includes(girdi.yas)) return false;
  for (const [ad, deger] of Object.entries(h.baglam ?? {})) {
    if (deger === 'zorunlu' && girdi.baglam?.[ad] !== true) return false;
  }
  return true;
}

const agirlikSirali = (liste) =>
  [...liste].sort((a, b) => AGIRLIK_SIRASI[a.agirlik] - AGIRLIK_SIRASI[b.agirlik]);

function hastalikPuani(h, bulgu, bulguKumesi, belirtiHaritasi, isiBiliniyor, ay) {
  const beklenen = new Map(h.belirtiler.map((b) => [b.id, b]));
  const dislayicilar = new Set(h.dislayicilar ?? []);

  let on = ON[h.yayginlik];
  if (Array.isArray(h.mevsim) && h.mevsim.includes(ay)) on *= MEVSIM_CARPANI;
  let skor = Math.log(on);

  // Bulgu katkıları; aynı sistemdeki pozitifler büyükten küçüğe 1, ½, ¼… ile çarpılır.
  const pozitifler = new Map(); // sistem → katkılar
  const celisen = [];
  for (const id of bulgu) {
    const b = belirtiHaritasi.get(id);
    const e = beklenen.get(id);
    let katki;
    if (e) {
      // Beklenen belirtinin katkısı tabanda 0: genelSiklik duyarlılığı aşsa bile beklenen
      // bulguyu eklemek skoru düşürmez (değişmez 1).
      katki = Math.max(0, Math.log(DUYARLILIK[e.agirlik] / b.genelSiklik));
    } else {
      katki = Math.log(LISTEDE_YOK / b.genelSiklik);
    }
    if (katki > 0) {
      if (!pozitifler.has(b.sistem)) pozitifler.set(b.sistem, []);
      pozitifler.get(b.sistem).push(katki);
    } else {
      skor += katki;
    }
    if (dislayicilar.has(id)) {
      skor += DISLAYICI_CEZASI;
      celisen.push(id);
    }
  }
  for (const katkilar of pozitifler.values()) {
    katkilar.sort((a, b) => b - a);
    let carpan = 1;
    for (const k of katkilar) { skor += k * carpan; carpan /= 2; }
  }

  // Yokluğu düşüren, bulunmayan beklenen belirti. Isı girilmediyse ateş/hipotermi bilinmiyor sayılır.
  for (const e of h.belirtiler) {
    if (!e.yoklugu_dusurur || bulguKumesi.has(e.id)) continue;
    if (ISI_BULGULARI.has(e.id) && !isiBiliniyor) continue;
    const b = belirtiHaritasi.get(e.id);
    if (!b) continue;
    skor += Math.log(YOKLUK_DUYARLILIGI / (1 - b.genelSiklik));
  }

  // Uyum: ağırlıkça kapsama.
  let toplam = 0;
  let bulunan = 0;
  for (const e of h.belirtiler) {
    toplam += UYUM_AGIRLIGI[e.agirlik];
    if (bulguKumesi.has(e.id)) bulunan += UYUM_AGIRLIGI[e.agirlik];
  }
  const uyum = toplam > 0 ? Math.round((bulunan / toplam) * 100) : 0;
  let bant = uyum >= 60 ? 'guclu' : uyum >= 35 ? 'orta' : 'zayif';
  if (celisen.length) bant = 'zayif';

  const sirali = agirlikSirali(h.belirtiler);
  return {
    id: h.id,
    ad: h.ad,
    uyum,
    bant,
    skor,
    eslesen: sirali.filter((e) => bulguKumesi.has(e.id)).map((e) => e.id),
    eksik: sirali.filter((e) => e.agirlik !== 'olasi' && !bulguKumesi.has(e.id)).map((e) => e.id),
    celisen,
  };
}

/**
 * Uygun hastalıkları skora göre azalan sırada döndürür (eşitlikte ad, tr).
 * @param {{ tur, yas, baglam, isi, belirtiler }} girdi
 * @param {{ belirtiler: any[], hastaliklar: any[] }} veri
 * @param {Date} simdi mevsim ayı bundan alınır
 */
export function puanla(girdi, veri, simdi = new Date()) {
  const ay = simdi.getMonth() + 1;
  const belirtiHaritasi = new Map(veri.belirtiler.map((b) => [b.id, b]));
  const bulgu = bulgular(girdi).filter((id) => belirtiHaritasi.has(id)); // bilinmeyen kimlik yok sayılır
  const bulguKumesi = new Set(bulgu);
  const isiBiliniyor = typeof girdi.isi === 'number' && Number.isFinite(girdi.isi);

  return veri.hastaliklar
    .filter((h) => uygunMu(h, girdi))
    .map((h) => hastalikPuani(h, bulgu, bulguKumesi, belirtiHaritasi, isiBiliniyor, ay))
    .sort((a, b) => b.skor - a.skor || a.ad.localeCompare(b.ad, 'tr') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
