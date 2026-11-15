# Hekime sorulacaklar (içerik onayından önce)

Tarih: 14.11.2026. Danışman model (Fable) incelemeleri ve içerik ajanlarının açık bıraktığı, yalnız hekimin
cevaplayabileceği konular. Bütün tıbbi kayıtlar şu an **taslak**; doz hiçbir yerde gösterilmiyor.
Cevaplandıkça bu dosyada işaretleyin.

## Mevzuat ve gıda güvenliği
1. Nitrat zehirlenmesinde metilen mavisi sahada uygulanıyor mu; uygulanan hayvan kesim/sütten kalıcı çıkarılıyor mu?
   (Şu an: yasaklar listesinde + hastalıkta yalnız uyarı metni.)
2. Pralidoksim ve kalsiyum disodyum EDTA kullanılıyor mu? (Şu an: yalnız uyarı metni; MRL statüsü doğrulanmadı.) Yasaklara taşınsın mı?
3. Diazepam yasaklar listesine eklensin mi?
4. 17β-östradiol ve klenbuterol: tedavi amaçlı kullanım görülüyor mu; otomatik yasak listesine girmeli mi?
5. Kristal viyole / gentian violet içeren sığır için ruhsatlı yara spreyi hâlâ var mı?
6. Kolistin ve gentamisin için Türkiye'de sığırda güncel ruhsat ve kısıt durumu? Diminazenin sığır ruhsatı var mı?
7. `veri/yasaklar.json` ve `veri/ihbar.json` Resmî Gazete'deki güncel metinle kelimesi kelimesine karşılaştırılmalı.
8. Şarbon: canlı hasta / temaslı hayvana resmî hekim denetiminde penisilin uygulanıyor mu? (`tedaviKipi` "yasak" mı "normal" mi.)
9. Enzootik lökozda `tedaviKipi` "yok" olması uygun mu?

## Kırmızı uyarılar (bayraklar)
10. Kuduz uyarısı salyasız da çıksın mı (böğürme + felç/yutamama/ıkınma)?
11. Ağızda/ayakta vezikül tek başına şap uyarısını tetiklesin mi?
12. Ani ölüm girilen her vakada "nekropsiden önce şarbonu dışlayın" uyarısı çıksın mı? (Şu an çıkıyor.)
13. Atık yapan inekte "son 30 gün doğum" kutusu işaretlenir mi? (Son atamama kaydı buna bağlı.)

## Protokoller
14. Sağmal inekte solunum yolu enfeksiyonunda ilk seçeneğiniz? (Florfenikol, tulatromisin, tilmikosin süt nedeniyle uyarılı.)
15. Akut mastitiste meme içi ilk tercih; perakut koliform mastitiste sistemik ilk tercih?
16. Buzağı koksidiyozunda sülfonamid kullanıyor musunuz; protokole girsin mi?
17. Rumen asidozunda bikarbonat mı, magnezyum oksit/hidroksit mi?
18. Endometritiste sefapirin (uterus içi) prostaglandinle aynı düzeyde (1. sıra) uygun mu?
19. Kalsiyum glukonat ürünleri kalsiyum boroglukonattan ayrı etken olarak tutulsun mu?
20. Retensiyo sekundinarumda doğum bağlamının "destekler" olması uygun mu?

## Sıralama ve dil
21. Yaygınlık: LSD ve şap "orta" mı; klinik tüberküloz "nadir" mi?
22. Belirti sıklıkları (ör. kene 0,10 · ishal 0,20 · topallık 0,12) kendi hasta defterinize göre makul mü?
23. Yöresel adlar: "amel", "sürgün", "sakırga", "dönme" sizin bölgenizde bu anlamda mı? Eklenmesini istediğiniz yerel adlar?
24. `test/vinyetler.json`'daki 135 örnek vaka sahaya uyuyor mu; eklenmesini istediğiniz zor ayırıcı tanı vakaları?
25. Uyum yüzdesi tipik vakada %40–55 çıkıyor; bant eşikleri (Güçlü ≥60, Orta 35–59) değiştirilsin mi?

## Teknik açık işler (hekim kararı gerekmez)
- ATCvet kodları WHOCC dizininden doğrulanmalı.
- Hekim onay akışı (kayıt onaylanınca dozun KÜB'den açılması) ve KÜB'den doz/arınma çıkarımı sonraki sürümde.
- Yalnız buzağı için ruhsatlı ürünler yetişkin hastalıkta "(yalnız buzağı)" etiketiyle görünüyor; onay başlayınca yaşa göre süzülmeli.

## Tedavi önerisi kartı (16.11.2026, v29)
26. Meloksikam KÜB'lerinde "Sığır" başlığı altında "Ameliyattan önce 0,4 mg/kg tek kas içi" satırı var; aynı PDF'lerin §5'i bu dozu domuz için veriyor (4.1'de domuz yok). Uygulama bunu domuzdan kayma sayıp sığırda yalnız 0,5 mg/kg (SC/IV) oranını kullanıyor. Uygun mu?
27. Bavet Meloxicam x8: "Sığırlarda ishal tedavisi için bir haftadan küçük hayvanlarda kullanmayınız" kısıtı şu an tüm buzağı hastalıklarında ml'yi durduruyor (yaş girilmezse "Yaşı (ay) girin"). Yalnız ishalde mi uygulansın?
28. Linkomisin+spektinomisin: "Geviş getiren sığırlarda kullanılmaz" yalnız uyarı olarak gösteriliyor (oranlar zaten yalnız buzağı kapsamlı). Yeterli mi?
29. Metritis/salmonellozda ampisilin satırı "Ürün hekim seçer" diyor (KÜB'ü olan tek etkenli ampisilin ürünü yok; kombineler kolistin/deksametazon/bromheksin içeriyor). Uygun mu?
30. Kalsiyum/magnezyum/dekstroz satırları bilinçli olarak "Ürün hekim seçer" (derişim/hacim ürüne göre değişir). Tercih ettiğiniz ürünler varsa protokole yazılabilir.
- Teknik: Bromvet, Mucolit, Rabenzole için KÜB PDF'i indirilmedi (onayınızla `npm run kub-indir`); Raftiben'in KÜB bağlantısı yok.
