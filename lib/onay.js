// Hekim onayı ve içerik özeti. Saf: tarayıcıda ve Node'da aynı çalışır.
// Bir kayıt onaylandığında içeriğinin özeti `onay.icerikOzeti`ne yazılır. İçerik sonradan
// değişirse özet tutmaz ve kayıt yeniden taslak sayılır (doz gösterilmez).

/** Anahtarları her düzeyde alfabetik sıralı JSON. Dizi sırası korunur (sıra anlamlıdır). */
export function siraliJson(deger) {
  return JSON.stringify(sirala(deger));
}

function sirala(deger) {
  if (Array.isArray(deger)) return deger.map(sirala);
  if (deger && typeof deger === 'object') {
    const sonuc = {};
    for (const anahtar of Object.keys(deger).sort()) sonuc[anahtar] = sirala(deger[anahtar]);
    return sonuc;
  }
  return deger;
}

/** FNV-1a 32-bit, metnin UTF-8 baytları üzerinden; 8 haneli küçük harf onaltılık. */
export function fnv1a(metin) {
  let h = 0x811c9dc5;
  for (const bayt of new TextEncoder().encode(metin)) {
    h ^= bayt;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Kaydın `onay` alanı dışındaki içeriğinin özeti. */
export function icerikOzeti(kayit) {
  const { onay, ...icerik } = kayit ?? {};
  return fnv1a(siraliJson(icerik));
}

/** Hekim onaylı ve onaydan sonra içeriği değişmemiş mi? */
export function onayliMi(kayit) {
  const onay = kayit?.onay;
  return !!onay && onay.durum === 'onayli' && onay.icerikOzeti === icerikOzeti(kayit);
}

/** Ürünün kub[] özeti: KÜB doğrulaması bu özetle kaydedilir (`kubDogrulandi.icerikOzeti`). */
export function kubOzeti(urun) {
  return fnv1a(siraliJson(urun?.kub ?? []));
}

/** Ürünün KÜB bilgisi hekimce doğrulanmış ve doğrulamadan sonra kub[] değişmemiş mi? */
export function kubDogruMu(urun) {
  const d = urun?.kubDogrulandi;
  return !!d && typeof d === 'object' && typeof d.icerikOzeti === 'string' && d.icerikOzeti === kubOzeti(urun);
}
