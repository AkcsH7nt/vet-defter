// Ekranların ortak yardımcıları.

/** el('div', {class: 'x', onclick: fn}, 'metin', baskaOge) → HTMLElement */
export function el(tag, attrs = {}, ...cocuklar) {
  const oge = document.createElement(tag);
  for (const [ad, deger] of Object.entries(attrs ?? {})) {
    if (deger == null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') oge.addEventListener(ad.slice(2), deger);
    else if (ad === 'class') oge.className = deger;
    else oge.setAttribute(ad, deger === true ? '' : deger);
  }
  for (const c of cocuklar.flat()) {
    if (c == null || c === false) continue;
    oge.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return oge;
}

/** Bilinmeyen rota ya da kimlik için sayfa. */
export function bulunamadi(kok, mesaj = 'Aradığınız sayfa bulunamadı.') {
  kok.replaceChildren(
    el('h1', {}, 'Bulunamadı'),
    el('p', { class: 'bulunamadi', role: 'alert' }, mesaj),
    el('a', { href: '#/tani' }, 'Tanı ekranına dön'),
  );
}

/** Sonuç ve hakkında ekranlarındaki sabit not. */
export function sorumlulukNotu() {
  return el('p', { class: 'sorumluluk' }, 'Hekim kararının yerine geçmez');
}
