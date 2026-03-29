---
description: Makroekonomi Haber ve Küresel Veri Sentezi Ajanı
---

# 🤖 "Makro Güncelleme" Otonom İş Akışı

Bu iş akışı (workflow), kilit yabancı (CNBC, WSJ) ve yerli (Bloomberg HT) ekonomi kaynaklarındaki en güncel kırılmaları otomatik olarak tarayıp "Altın, Gümüş, Petro-Dolar ve Jeopolitik" ekseninde sentezleyerek `haber-ajansi` klasörüne yazar. 

**🚨 KRİTİK KURAL:** Bilgisayarın terminal (Node/NPM) dünyasında "dış internete bağlanma engeli (DNS/Firewall)" olduğu için asla Terminal tabanlı bir betik (`curl`, `npm install`, `node`) veya Python Kodu yazıp/çalıştırıp internete çıkmaya çalışma! Verileri KESİNLİKLE sadece AI modelinin saf yeteneği olan `read_url_content` veya `browser_subagent` araçlarıyla çek.

## 🎯 Adımlar:

1. Kendi sistemindeki `read_url_content` ve web arama araçlarını kullanarak aşağıdaki ağları tara:
   - **WSJ Markets RSS:** `https://feeds.a.dj.com/rss/RSSMarketsMain.xml`
   - **CNBC Economy RSS:** `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664`
   - **CoinDesk (Kripto):** `https://www.coindesk.com/arc/outboundfeeds/rss/`
   - **Sosyal Medya (X/Twitter):** O günün Ekonomi ve Finans alanında en çok etkileşim alan, trend olan global ve yerel analiz tweetlerini araştır.
   - **YouTube (Genel Ekonomi):** O günün en çok izlenen/beğenilen kilit makroekonomi değerlendirme videolarının özetlerini al.
   - **🚨 ÖZEL TAKİP (Bloomberg HT Sabah Raporu):** YouTube üzerinden Bloomberg HT kanalının en son "Sabah Raporu" yayınını (videoyu) mutlaka bul ve kaydet.
   - **Bloomberg HT Son Dakika:** `https://www.bloomberght.com/sondakika`
   - *(Eğer istenirse/seçenek)* **Investing Turkiye Emtia RSS:** `https://tr.investing.com/rss/commodities.rss`

2. Okuduğun ham İngilizce ve Türkçe başlıkları anında çevirip zihninde analiz et. Verileri şu makro kutulara yerleştirerek değerlendir:
   - **Altın ve Gümüş'te (🔼, 🔽, ↔️) Trend Yönü** *(Hedge Fon Tavsiyeleri, Merkez Bankası Alımları)*
   - **Enerji & Petro-Dolar Radarı** *(Kızıldeniz/Hürmüz Jeopolitiği, 100$ Petrol korkusu)*
   - **Kur Savaşları ve Gümrük/Tarifeler** *(Örn: Kahve, Emtia kotaları)*
   - **Borsa ve Faiz Paradoksu** *(ABD Russell 2000 Düzeltmeleri, Kredi Daralması, TCMB Rezervleri)*
   - **Kripto Varlıklar & Dedolarizasyon** *(Stablecoin'lerin Doların Tahtını Tehdidi ve Bitcoin Hacmi)*

3. Hazırladığın bu yeni analiz sentezini, `write_to_file` aracıyla doğrudan `/Users/oguzkurker/Projects/Makro/haber-ajansi/` dizininin içine, `vX-tam-sentez-[BUGUNUN-TARIHI].md` adıyla kaydet.

4. **[ÇOK KRİTİK] NOTEBOOKLM ENTEGRASYONU:** 
   İş akışının tüm gücü NotebookLM kütüphanesiyle birleşmelidir. Dosyayı kaydettikten YAPMAN GEREKEN SON İŞLEM:
   - `browser_subagent` aracını çalıştırarak Chrome'u aç.
   - `notebooklm.google.com` adresine git ve kullanıcının "Küresel Piyasalar: Altın, Petrol..." adlı projesini aç.
   - **Oluşturulan yepyeni V4 Sentez Raporunu** NotebookLM'e yeni bir kaynak (Metin/Note) olarak ekle.
   - **Bloomberg HT "Sabah Raporu" YouTube linkini** de doğrudan yeni YouTube Kaynağı olarak NotebookLM'e yükle.

5. İşi saniyeler içinde sessizce bitirdikten sonra kullanıcıya güncel NotebookLM raporuyla birlikte haber ver.
