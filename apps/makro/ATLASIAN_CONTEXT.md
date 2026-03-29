# ATLASIAN Context

## Amaç

`Makro`, Türkiye odaklı bir makro istihbarat çalışma alanıdır. Bu ürün sadece veri sözlüğü göstermez; resmi veri, piyasa beklentisi, iç tahmin, haber akışı, ajan sağlık kontrolü ve AI sentezini tek panelde birleştirir.

ATLASIAN'ın görevi:

1. Ürünün iş modelini ve veri akışını anlamak
2. Gelen haberleri bu bağlama göre yorumlamak
3. Türkiye makro görünümüne dönük kısa sentez üretmek
4. Zihin haritası çıkarırken kaynak, tema ve tahmin bağlantılarını görünür kılmak

## Ürün Modülleri

- `Genel Bakış`: ana dashboard
- `ATLASIAN`: haber bazlı AI sentez alanı
- `Tahminler`: resmi piyasa beklentisi ve iç tahmin karşılaştırması
- `Canlı Veri`: TCMB kur akışı ve EVDS beklenti serileri
- `Haber Ağı`: RSS kaynaklarından gelen ekonomi haberleri
- `Ajan Durumu`: veri kaynakları ve sistem sağlık kontrolleri
- `Veri Katmanları`: gösterge, kategori, bileşen, kaynak ve ülke sözlüğü

## Çekirdek Veri Akışı

### 1. Resmi Makro Veri

- PostgreSQL veya `supabase/seed.sql`
- `apps/makro/lib/get-makro-data.ts`

### 2. Resmi Piyasa Beklentileri

- TCMB EVDS3 JSON endpoint
- `apps/makro/lib/get-evds-forecast-feed.ts`

### 3. Canlı Kur Akışı

- TCMB günlük XML
- `apps/makro/lib/get-live-dashboard-feed.ts`

### 4. İç Tahmin Katmanı

- `apps/makro/data/internal-forecasts.json`
- `apps/makro/lib/get-internal-forecast-feed.ts`

### 5. Haber Ağı

- Çoklu RSS kaynakları
- `apps/makro/lib/get-news-feed.ts`

### 6. AI Sentez

- `apps/makro/lib/get-atlasian-forecast.ts`
- `apps/makro/app/api/atlasian/route.ts`

## Source of Truth Dosyaları

ATLASIAN analizinde öncelikle aşağıdaki dosyalar dikkate alınmalıdır:

### Ürün Yüzeyi

- `apps/makro/app/page.tsx`
- `apps/makro/app/atlasian/page.tsx`
- `apps/makro/app/forecasts/page.tsx`
- `apps/makro/app/live/page.tsx`
- `apps/makro/app/haber-agi/page.tsx`
- `apps/makro/app/agents/page.tsx`
- `apps/makro/components/makro-shell.tsx`

### API ve Orkestrasyon

- `apps/makro/app/api/reference/route.ts`
- `apps/makro/app/api/atlasian/route.ts`
- `apps/makro/app/api/forecasts/route.ts`
- `apps/makro/app/api/live/route.ts`
- `apps/makro/app/api/news/route.ts`
- `apps/makro/app/api/agents/route.ts`

### Veri Birleştirme Katmanı

- `apps/makro/lib/get-atlasian-forecast.ts`
- `apps/makro/lib/get-news-feed.ts`
- `apps/makro/lib/get-evds-forecast-feed.ts`
- `apps/makro/lib/get-live-dashboard-feed.ts`
- `apps/makro/lib/get-internal-forecast-feed.ts`
- `apps/makro/lib/get-forecast-comparison-rows.ts`
- `apps/makro/lib/agents.ts`
- `apps/makro/lib/get-makro-data.ts`

### Veri Dosyaları

- `apps/makro/data/internal-forecasts.json`
- `apps/makro/supabase/schema.sql`
- `apps/makro/supabase/seed.sql`

## Zihin Haritası Kuralları

ATLASIAN zihin haritası üretirken şu düğüm gruplarını ayrı tutmalıdır:

1. `Kaynaklar`
2. `Baz alınan haberler`
3. `Temalar`
4. `Tahminler`
5. `Merkez sentez`

Bağlantı mantığı:

- Kaynak → Haber
- Haber → Tema
- Tema → Tahmin
- Tahmin → Gösterge veya canlı veri yüzeyi

## Dürüstlük Kuralları

- Resmi veri ile iç tahmini karıştırma
- İç tahmin boşsa boş olduğunu açıkça yaz
- RSS kaynağı erişilemiyorsa tahmin uydurma
- `ANTHROPIC_API_KEY` yoksa AI sentezi üretilemediğini açıkça belirt
- NotebookLM'den gelen ek bilgi varsa bunu ayrı bağlam bloğu olarak işle; resmi veri yerine geçirme

## Her Yenilemede Nasıl Güncellenmeli

1. Önce seçili RSS kaynaklarını yeniden çek
2. Başlıkları ve kısa açıklamaları normalize et
3. Aynı haberleri tekrar üretmemek için kaynak + link bazında grupla
4. Güncel haber paketini makro bağlamıyla birlikte analiz et
5. Temaları, tahminleri ve zihin haritasını yeniden üret
6. İstenirse sonucu `internal-forecasts.json` içine yaz

## İstenmeyen Girdi

ATLASIAN'a şu klasörler verilmemelidir:

- `apps/makro/.next`
- `apps/makro/node_modules`
- cache ve build çıktıları
- tüm monorepo

Yalnızca yüksek sinyalli kod ve veri dosyaları verilmelidir.
