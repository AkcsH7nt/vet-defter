// Ekran 3: Hastalık protokolü. Doz yalnız onaylı hastalık + KÜB'ü doğrulanmış (ve sonra değişmemiş) üründe gösterilir.
import { el, doldur, bulunamadi, taslakEtiketi, geriDugmesi } from './ortak.js';
import { onayliMi, kubDogruMu } from '../lib/onay.js';
import { normalize } from '../lib/arama.js';

const KIP = {
  yasak: 'Tedavi yasak', yok: 'Tedavi yok', semptomatik: 'Yalnız semptomatik tedavi', normal: 'Normal tedavi',
};

/** Ürün sığır için ruhsatlı mı? Hedef türde "sığır" ya da "buzağı" (büyük-küçük harf ve aksan fark etmez). */
export function sigirMi(urun) {
  return (urun.hedefTurler ?? []).some((t) => normalize(t) === 'sigir' || normalize(t) === 'buzagi');
}

/** Yalnız buzağı için ruhsatlı (hedef türde sığır yok, buzağı var). */
export function yalnizBuzagiMi(urun) {
  const t = (urun.hedefTurler ?? []).map(normalize);
  return t.includes('buzagi') && !t.includes('sigir');
}

export function sutYaz(sut) {
  if (sut && typeof sut === 'object' && sut.saat != null) return `${sut.saat} saat`;
  if (sut === 'kullanilmaz') return 'sağmal inekte kullanılmaz';
  return 'belirtilmemiş';
}

/**
 * Protokol satırının kaynak ürünü: kaynak.urunId (tercih) ya da tam ad; ürün satırın etkenini içermeli ve
 * sığır / buzağı için ruhsatlı olmalı. Ad birden çok ürüne uyuyorsa belirsizdir → null (doz gösterilmez).
 */
export function kaynakUrunu(ilac, urunler) {
  const k = ilac?.kaynak ?? {};
  if (!k.urunId && !k.urun) return null;
  const adaylar = (urunler ?? []).filter((u) => (k.urunId ? u.urunId === k.urunId : u.ad === k.urun)
    && (u.etkenler ?? []).includes(ilac.etkenId) && sigirMi(u));
  return adaylar.length === 1 ? adaylar[0] : null;
}

/**
 * Gösterilebilir doz: hastalık onaylı (özet tutuyor) + kaynak ürünü bulunuyor + ürünün KÜB'ü doğrulanmış ve
 * sonra değişmemiş + KÜB'te satırın yoluyla aynı sığır satırı ve dozu var. Yoksa null.
 */
export function dozBilgisi(h, ilac, urunler) {
  if (!onayliMi(h)) return null;
  const urun = kaynakUrunu(ilac, urunler);
  if (!urun || !kubDogruMu(urun)) return null;
  const kub = (urun.kub ?? []).find((x) => normalize(x.tur) === 'sigir' && normalize(x.yol) === normalize(ilac.yol));
  return kub?.doz ? { urun, kub } : null;
}

/** Arayüzdeki ikinci savunma hattı: yasak madde ve AMEG A protokolde hiç gösterilmez (dogrula ilk hattır). */
function gosterilebilirMi(ilac, veri) {
  const yasaklar = veri.yasaklar?.ogeler ?? [];
  const e = veri.etkenler.find((x) => x.id === ilac.etkenId);
  const yasak = yasaklar.some((y) => y.id === ilac.etkenId || (e && normalize(y.ad) === normalize(e.ad)));
  if (yasak || e?.ameg === 'A') {
    console.warn(`Protokol satırı gösterilmedi (${yasak ? 'yasak madde' : 'AMEG A'}): ${ilac.etkenId}`);
    return false;
  }
  return true;
}

function dozOgesi(h, ilac, veri) {
  const doz = dozBilgisi(h, ilac, veri.urunler);
  const urun = doz?.urun ?? kaynakUrunu(ilac, veri.urunler);
  const kubBaglantisi = urun?.kubUrl
    ? [el('a', { href: urun.kubUrl, target: '_blank', rel: 'noopener' }, 'KÜB ▸'), el('span', { class: 'soluk' }, ' (internet gerekir)')] : null;
  if (!doz) return el('p', { class: 'doz' }, 'Doz: KÜB\'e bakın ', kubBaglantisi);
  const { kub: k } = doz;
  const d = k.doz;
  const parca = [`${d.miktar} ${d.birim}`, d.aralik, d.sure].filter(Boolean).join(' · ');
  return el('p', { class: 'doz' },
    el('strong', {}, `KÜB dozu: ${parca}`),
    el('br'),
    `Et ${k.et_gun == null ? 'belirtilmemiş' : `${k.et_gun} g`} · Süt: ${sutYaz(k.sut)} `,
    kubBaglantisi,
    ilac.kaynak?.bolum ? ` (bölüm ${ilac.kaynak.bolum})` : null);
}

const madde = (liste) => el('ul', { class: 'madde' }, liste.map((x) => el('li', {}, x)));
function bolum(baslik, icerik) {
  return el('details', { class: 'bolum', open: true }, el('summary', {}, baslik), icerik);
}

export function render(kok, veri, durum, rota) {
  const h = veri.hastaliklar.find((x) => x.id === rota.id);
  if (!h) { bulunamadi(kok, 'Bu hastalık kaydı bulunamadı.'); return; }
  const p = h.protokol ?? {};
  const onayli = onayliMi(h);
  const tedaviYok = h.tedaviKipi === 'yasak' || h.tedaviKipi === 'yok';
  if (tedaviYok && (p.ilaclar ?? []).length) console.warn(`Tedavi kipi '${h.tedaviKipi}' iken ilaç satırları gösterilmedi: ${h.id}`);

  const ilacSatirlari = tedaviYok ? [] : [...(p.ilaclar ?? [])]
    .filter((i) => gosterilebilirMi(i, veri))
    .sort((a, b) => a.sira - b.sira).map((i) => {
      const e = veri.etkenler.find((x) => x.id === i.etkenId);
      const href = `#/etken/${encodeURIComponent(i.etkenId)}`;
      const urunSayisi = veri.urunler.filter((u) => (u.etkenler ?? []).includes(i.etkenId) && sigirMi(u)).length;
      return el('li', { class: 'ilac' },
        el('span', { class: 'sira' }, `${i.sira}. seçenek`),
        ' ',
        el('a', { href, class: 'ilac-ad' }, e?.ad ?? i.etkenId),
        el('span', { class: 'soluk' }, ` · ${i.yol}`),
        i.not ? el('p', { class: 'soluk' }, i.not) : null,
        dozOgesi(h, i, veri),
        urunSayisi
          ? el('a', { class: 'dugme ikincil', href }, `Ruhsatlı ürünler (${urunSayisi}) ▸`)
          : el('p', { class: 'soluk' }, 'Listede ruhsatlı sığır ürünü yok.'));
    });

  const ayirici = (h.ayiriciTani ?? []).map((id) => {
    const d = veri.hastaliklar.find((x) => x.id === id);
    return d ? el('li', {}, el('a', { href: `#/hastalik/${encodeURIComponent(id)}` }, d.ad)) : el('li', {}, id);
  });

  doldur(kok,
    el('h1', {}, h.ad, ' ', onayli ? null : taslakEtiketi()),
    h.ihbari ? el('div', { class: 'bant tehlike', role: 'alert' },
      el('strong', {}, '⛔ İhbarı mecburi — bildirin'), madde(p.ihbarAdimlari ?? [])) : null,
    h.zoonoz ? el('div', { class: 'bant zoonoz' }, el('strong', {}, '⚠ Zoonoz — insana bulaşır; korunmadan temas etmeyin')) : null,
    h.turkiyedeGorulmez ? el('p', { class: 'kip' }, el('strong', {}, 'Türkiye\'de görülmez'), ' (eradike ya da bildirilmemiş); şüphede ihbar edin.') : null,
    (h.uyarilar ?? []).length ? el('div', { class: 'bant uyari-liste', role: 'note' }, el('strong', {}, 'Uyarılar'), madde(h.uyarilar)) : null,
    el('p', { class: 'kip' }, el('strong', {}, 'Tedavi kipi: '), KIP[h.tedaviKipi] ?? h.tedaviKipi),
    h.antibiyotikEndikeDegil ? el('p', { class: 'kip' }, el('strong', {}, 'Antibiyotik endike değil')) : null,
    ilacSatirlari.length ? bolum('İlaçlar (1./2. seçenek)', el('ul', { class: 'madde ilaclar' }, ilacSatirlari)) : null,
    (p.destekleyici ?? []).length ? bolum('Destekleyici', madde(p.destekleyici)) : null,
    (p.bakim ?? []).length ? bolum('Bakım / yönetim', madde(p.bakim)) : null,
    (h.sahadaDogrula ?? []).length ? bolum('Sahada doğrula', madde(h.sahadaDogrula)) : null,
    ayirici.length ? bolum('Ayırıcı tanı', el('ul', { class: 'madde ayirici' }, ayirici)) : null,
    onayli ? null : el('p', { class: 'soluk' }, 'Bu kayıt henüz hekim onayından geçmedi; doz için ürünün KÜB\'üne bakın.'),
    geriDugmesi(),
  );
}
