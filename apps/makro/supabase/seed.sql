insert into countries (iso_code, name, currency_code)
values
    ('TUR', 'Türkiye', 'TRY')
on conflict (iso_code) do update
set
    name = excluded.name,
    currency_code = excluded.currency_code;

insert into sources (source_code, source_name, source_type, base_url, is_primary_source, reliability_score, notes)
values
    ('TUIK', 'Türkiye İstatistik Kurumu', 'official_statistics', 'https://data.tuik.gov.tr', true, 100.00, 'Resmi istatistik kaynağı'),
    ('TCMB_EVDS', 'TCMB EVDS', 'central_bank_data', 'https://evds2.tcmb.gov.tr', true, 100.00, 'Merkez bankası veri dağıtım sistemi'),
    ('HMB', 'T.C. Hazine ve Maliye Bakanlığı', 'public_finance', 'https://www.hmb.gov.tr', true, 100.00, 'Kamu maliyesi ve borç verileri'),
    ('IMF', 'IMF Data', 'international', 'https://data.imf.org', false, 95.00, 'Uluslararası çapraz doğrulama kaynağı'),
    ('WORLD_BANK', 'World Bank Data', 'international', 'https://data.worldbank.org', false, 92.00, 'Uzun dönem çapraz kontrol kaynağı'),
    ('OECD', 'OECD Data', 'international', 'https://data-explorer.oecd.org', false, 92.00, 'Karşılaştırmalı makro veri kaynağı'),
    ('SPGLOBAL_PMI', 'S&P Global PMI', 'survey', 'https://www.spglobal.com', false, 90.00, 'PMI ve öncü göstergeler'),
    ('REUTERS', 'Reuters', 'news', 'https://www.reuters.com', false, 90.00, 'Yüksek güvenilirlikli haber akışı')
on conflict (source_code) do update
set
    source_name = excluded.source_name,
    source_type = excluded.source_type,
    base_url = excluded.base_url,
    is_primary_source = excluded.is_primary_source,
    reliability_score = excluded.reliability_score,
    notes = excluded.notes;

insert into indicators (
    indicator_code,
    indicator_name,
    category,
    frequency,
    unit,
    value_type,
    seasonal_adjustment,
    base_year,
    description_short,
    description_long,
    formula_text,
    interpretation_text,
    learner_note,
    analyst_note,
    expert_note
)
values
    (
        'GDP_REAL_GROWTH_YOY',
        'Reel GSYH Büyüme Oranı',
        'growth',
        'quarterly',
        'percent',
        'rate',
        'SA',
        null,
        'Ekonominin yıllık reel büyüme oranı',
        'Reel GSYH''nin geçen yılın aynı dönemine göre yüzde değişimini gösterir.',
        '((Reel GSYH_t / Reel GSYH_t-4) - 1) * 100',
        'Yüksek değer büyüme ivmesini, düşük veya negatif değer yavaşlamayı gösterir.',
        'Ekonomi geçen yıla göre ne kadar büyümüş veya küçülmüş sorusunun cevabıdır.',
        'Baz etkisi, mevsim etkisi ve revizyonlar ayrıca izlenmelidir.',
        'Çeyreklik zincirlenmiş hacim serisi, takvim etkisi ve çıktı açığıyla birlikte okunmalıdır.'
    ),
    (
        'IPI_YOY',
        'Sanayi Üretim Endeksi Yıllık Değişim',
        'growth',
        'monthly',
        'percent',
        'rate',
        'SA',
        '2021=100',
        'Sanayi üretimindeki yıllık değişim',
        'Sanayi üretim endeksinin geçen yılın aynı ayına göre değişimini gösterir.',
        '((Endeks_t / Endeks_t-12) - 1) * 100',
        'Büyümenin kısa vadeli yönü için öncü sinyal niteliğindedir.',
        'Fabrikalar ve üretim tarafı geçen yıla göre güçleniyor mu sorusunu yanıtlar.',
        'Ara malı, sermaye malı ve enerji kırılımları birlikte incelenmelidir.',
        'Milli gelir nowcasting çalışmalarında yüksek frekanslı açıklayıcı değişken olarak kullanılabilir.'
    ),
    (
        'CPI_YOY',
        'TÜFE Yıllık Enflasyon',
        'inflation',
        'monthly',
        'percent',
        'rate',
        'NSA',
        '2024=100',
        'Tüketici fiyatlarının yıllık değişimi',
        'Tüketici fiyat endeksinin geçen yılın aynı ayına göre yüzde değişimini gösterir.',
        '((TÜFE_t / TÜFE_t-12) - 1) * 100',
        'Hanehalkı maliyetlerindeki genel artışı gösterir.',
        'Market, ulaşım, konut gibi kalemlerdeki ortalama fiyat artışını özetler.',
        'Aylık momentum, yayılım ve ana eğilim ile birlikte okunmalıdır.',
        'Çekirdek, hizmet, mal, enerji ve gıda ayrımı yapılmadan sağlıklı analiz tamamlanmış sayılmaz.'
    ),
    (
        'CORE_CPI_YOY',
        'Çekirdek Enflasyon Yıllık Değişim',
        'inflation',
        'monthly',
        'percent',
        'rate',
        'NSA',
        '2024=100',
        'Oynak kalemler hariç fiyat eğilimi',
        'Enerji, gıda, alkollü içecekler, tütün ve altın gibi oynak kalemler dışlanarak hesaplanan yıllık fiyat değişimidir.',
        '((Çekirdek Endeks_t / Çekirdek Endeks_t-12) - 1) * 100',
        'Ana enflasyon eğilimini okumada yardımcıdır.',
        'Geçici fiyat sıçramalarını ayıklayarak kalıcı eğilimi görmeye yarar.',
        'Manşet ve çekirdek farkı geçici şokların büyüklüğünü gösterebilir.',
        'Difüzyon, medyan enflasyon ve trimli ortalama ile birlikte değerlendirilmesi daha sağlıklıdır.'
    ),
    (
        'PPI_YOY',
        'ÜFE Yıllık Değişim',
        'inflation',
        'monthly',
        'percent',
        'rate',
        'NSA',
        '2024=100',
        'Üretici fiyatlarındaki yıllık değişim',
        'Üretici fiyat endeksinin geçen yılın aynı ayına göre değişimini gösterir.',
        '((ÜFE_t / ÜFE_t-12) - 1) * 100',
        'Maliyet baskılarını ve fiyat geçişkenliği riskini gösterir.',
        'Üreticilerin maliyetleri artıyorsa tüketici fiyatlarına yansıma gelebilir.',
        'Kur, enerji ve emtia geçişkenliği burada daha erken görülebilir.',
        'TÜFE''ye geçiş katsayısı sektör bazında heterojendir; doğrusal varsayım yapılmamalıdır.'
    ),
    (
        'UNEMP_RATE',
        'İşsizlik Oranı',
        'labor',
        'monthly',
        'percent',
        'ratio',
        'SA',
        null,
        'İşsizlerin işgücüne oranı',
        'İş arayan ve çalışmaya hazır olan işsizlerin toplam işgücüne oranıdır.',
        '(İşsiz Sayısı / İşgücü) * 100',
        'İşgücü piyasasının sıkılığı veya zayıflığı hakkında temel göstergedir.',
        'İş bulmakta zorlananların oranını gösterir.',
        'Katılım oranı ile birlikte okunmadığında eksik yorum üretilebilir.',
        'İstihdam yaratmayan büyüme, eksik istihdam ve geniş tanımlı işsizlik ayrıca incelenmelidir.'
    ),
    (
        'LFPR',
        'İşgücüne Katılım Oranı',
        'labor',
        'monthly',
        'percent',
        'ratio',
        'SA',
        null,
        'Çalışma çağındaki nüfusun işgücüne katılımı',
        'Çalışma çağındaki nüfus içinde çalışan veya iş arayanların payını gösterir.',
        '(İşgücü / Çalışma Çağındaki Nüfus) * 100',
        'İşsizlik verisinin arkasındaki davranışı anlamada gereklidir.',
        'İnsanlar iş aramayı bırakırsa işsizlik tek başına gerçeği tam göstermez.',
        'Katılım düşüşü işsizlikte sahte iyileşme yaratabilir.',
        'Demografi, eğitim, kadın istihdamı ve çevrimsel cayma etkileri ayrıştırılmalıdır.'
    ),
    (
        'CURRENT_ACCOUNT_BALANCE',
        'Cari İşlemler Dengesi',
        'external',
        'monthly',
        'usd_mn',
        'level',
        'NSA',
        null,
        'Dış ekonomik dengenin temel göstergesi',
        'Mal, hizmet, birincil gelir ve ikincil gelir kalemlerinin toplam dengesidir.',
        'Mal Dengesi + Hizmet Dengesi + Birincil Gelir + İkincil Gelir',
        'Negatif değer dış finansman ihtiyacını, pozitif değer dış fazla durumunu gösterir.',
        'Ülkenin döviz kazanıp kazanmadığını özetler.',
        'Enerji ve altın hariç çekirdek denge ayrıca izlenmelidir.',
        'Sürdürülebilirlik analizi için finansman kompozisyonu ve rezerv yeterliliğiyle birlikte okunmalıdır.'
    ),
    (
        'EXPORTS_FOB',
        'İhracat FOB',
        'external',
        'monthly',
        'usd_mn',
        'level',
        'NSA',
        null,
        'Yurtdışına satılan mal değeri',
        'Belirli dönemde yurtdışına yapılan mal satışlarının FOB değeridir.',
        'Gümrük beyanlı toplam FOB ihracat',
        'Dış talep ve rekabet gücü hakkında bilgi verir.',
        'Ülkenin dışarıya ne kadar mal sattığını gösterir.',
        'Takvim etkisi, fiyat etkisi ve miktar etkisi ayrıştırılmalıdır.',
        'Teknoloji düzeyi, pazar çeşitliliği ve reel kur duyarlılığı uzman okumada kritik önemdedir.'
    ),
    (
        'IMPORTS_CIF',
        'İthalat CIF',
        'external',
        'monthly',
        'usd_mn',
        'level',
        'NSA',
        null,
        'Yurtdışından alınan mal değeri',
        'Belirli dönemde yurtdışından yapılan mal alımlarının CIF değeridir.',
        'Gümrük beyanlı toplam CIF ithalat',
        'İç talep, enerji bağımlılığı ve ara malı ihtiyacı hakkında bilgi verir.',
        'Ülkenin dışarıdan ne kadar mal aldığını gösterir.',
        'Enerji, altın ve yatırım malı ayrımı ayrıca takip edilmelidir.',
        'Kur geçişkenliği ve üretim yapısına bağlı ithalat esnekliği modellemede önemlidir.'
    ),
    (
        'CENTRAL_GOV_BUDGET_BALANCE',
        'Merkezi Yönetim Bütçe Dengesi',
        'fiscal',
        'monthly',
        'try_mn',
        'level',
        'NSA',
        null,
        'Gelir ve gider farkı',
        'Merkezi yönetim bütçe gelirleri ile giderleri arasındaki farktır.',
        'Bütçe Gelirleri - Bütçe Giderleri',
        'Negatif değer bütçe açığını, pozitif değer bütçe fazlasını gösterir.',
        'Devletin gelirlerinin giderlerini karşılayıp karşılamadığını gösterir.',
        'Faiz dışı denge ile birlikte okunmalıdır.',
        'Tek seferlik gelirler, deprem harcaması, seçim etkisi ve nakit-tahakkuk farkı ayrıca değerlendirilmelidir.'
    ),
    (
        'POLICY_RATE',
        'Politika Faizi',
        'monetary',
        'monthly',
        'percent',
        'rate',
        'NSA',
        null,
        'Merkez bankasının temel politika faizi',
        'Para politikasının ana yönünü belirleyen kısa vadeli politika faizidir.',
        'Resmi politika faizi seviyesi',
        'Sıkılaşma veya gevşeme yönünü anlamak için temel göstergedir.',
        'Merkez bankasının ekonomiyi frenleyip destekleyip desteklemediğini özetler.',
        'Fonlama kompozisyonu ve efektif fonlama maliyeti de ayrıca izlenmelidir.',
        'Beklenti kanalı, kur kanalı ve kredi kanalı üzerinden gecikmeli etkiler üretir.'
    )
on conflict (indicator_code) do update
set
    indicator_name = excluded.indicator_name,
    category = excluded.category,
    frequency = excluded.frequency,
    unit = excluded.unit,
    value_type = excluded.value_type,
    seasonal_adjustment = excluded.seasonal_adjustment,
    base_year = excluded.base_year,
    description_short = excluded.description_short,
    description_long = excluded.description_long,
    formula_text = excluded.formula_text,
    interpretation_text = excluded.interpretation_text,
    learner_note = excluded.learner_note,
    analyst_note = excluded.analyst_note,
    expert_note = excluded.expert_note;

insert into indicator_components (indicator_id, component_code, component_name, parent_component_id, description, sort_order)
select i.id, x.component_code, x.component_name, null, x.description, x.sort_order
from indicators i
join (
    values
        ('GDP_REAL_GROWTH_YOY', 'TOTAL', 'Toplam', 'Toplam reel büyüme oranı', 1),
        ('GDP_REAL_GROWTH_YOY', 'HOUSEHOLD_CONSUMPTION', 'Hanehalkı Tüketimi', 'Harcama yöntemiyle büyüme katkı kalemi', 2),
        ('GDP_REAL_GROWTH_YOY', 'GOVERNMENT_CONSUMPTION', 'Kamu Tüketimi', 'Harcama yöntemiyle büyüme katkı kalemi', 3),
        ('GDP_REAL_GROWTH_YOY', 'INVESTMENT', 'Yatırım', 'Sabit sermaye oluşumu ve ilgili yatırım katkısı', 4),
        ('GDP_REAL_GROWTH_YOY', 'NET_EXPORTS', 'Net İhracat', 'İhracat eksi ithalat katkısı', 5),

        ('IPI_YOY', 'TOTAL', 'Toplam', 'Toplam sanayi üretimi', 1),
        ('IPI_YOY', 'MINING', 'Madencilik', 'Madencilik ve taş ocakçılığı', 2),
        ('IPI_YOY', 'MANUFACTURING', 'İmalat', 'İmalat sanayi üretimi', 3),
        ('IPI_YOY', 'ENERGY', 'Enerji', 'Elektrik, gaz, buhar ve iklimlendirme', 4),
        ('IPI_YOY', 'CAPITAL_GOODS', 'Sermaye Malı', 'Ana sanayi grubu kırılımı', 5),
        ('IPI_YOY', 'INTERMEDIATE_GOODS', 'Ara Malı', 'Ana sanayi grubu kırılımı', 6),

        ('CPI_YOY', 'HEADLINE', 'Manşet', 'Toplam tüketici fiyatları', 1),
        ('CPI_YOY', 'FOOD', 'Gıda', 'Gıda ve alkolsüz içecekler', 2),
        ('CPI_YOY', 'ENERGY', 'Enerji', 'Enerji kalemleri', 3),
        ('CPI_YOY', 'GOODS', 'Mal', 'Mal grubu', 4),
        ('CPI_YOY', 'SERVICES', 'Hizmet', 'Hizmet grubu', 5),

        ('CORE_CPI_YOY', 'CORE', 'Çekirdek', 'Çekirdek enflasyon ana göstergesi', 1),
        ('CORE_CPI_YOY', 'CORE_GOODS', 'Çekirdek Mal', 'İşlenmemiş gıda ve enerji hariç mal grubu', 2),
        ('CORE_CPI_YOY', 'CORE_SERVICES', 'Çekirdek Hizmet', 'Temel hizmet eğilimi', 3),

        ('PPI_YOY', 'TOTAL', 'Toplam', 'Toplam üretici fiyatları', 1),
        ('PPI_YOY', 'DOMESTIC', 'Yurtiçi Üretici Fiyatları', 'Yurtiçi üretici fiyatları', 2),
        ('PPI_YOY', 'INTERMEDIATE_GOODS', 'Ara Malı', 'Ana sanayi grubu kırılımı', 3),
        ('PPI_YOY', 'ENERGY', 'Enerji', 'Enerji fiyatları', 4),

        ('UNEMP_RATE', 'TOTAL', 'Toplam', 'Toplam işsizlik oranı', 1),
        ('UNEMP_RATE', 'YOUTH', 'Genç', 'Genç işsizlik oranı', 2),
        ('UNEMP_RATE', 'FEMALE', 'Kadın', 'Kadın işsizlik oranı', 3),
        ('UNEMP_RATE', 'MALE', 'Erkek', 'Erkek işsizlik oranı', 4),

        ('LFPR', 'TOTAL', 'Toplam', 'Toplam işgücüne katılım oranı', 1),
        ('LFPR', 'FEMALE', 'Kadın', 'Kadın işgücüne katılım oranı', 2),
        ('LFPR', 'MALE', 'Erkek', 'Erkek işgücüne katılım oranı', 3),

        ('CURRENT_ACCOUNT_BALANCE', 'TOTAL', 'Toplam', 'Toplam cari denge', 1),
        ('CURRENT_ACCOUNT_BALANCE', 'GOODS', 'Mal Dengesi', 'Mal ticareti dengesi', 2),
        ('CURRENT_ACCOUNT_BALANCE', 'SERVICES', 'Hizmet Dengesi', 'Hizmet gelir-gider dengesi', 3),
        ('CURRENT_ACCOUNT_BALANCE', 'PRIMARY_INCOME', 'Birincil Gelir', 'Faiz, kar transferleri ve benzeri gelir-giderler', 4),
        ('CURRENT_ACCOUNT_BALANCE', 'SECONDARY_INCOME', 'İkincil Gelir', 'Transfer kalemleri', 5),

        ('EXPORTS_FOB', 'TOTAL', 'Toplam', 'Toplam mal ihracatı', 1),
        ('EXPORTS_FOB', 'EU', 'AB', 'Avrupa Birliği pazarına ihracat', 2),
        ('EXPORTS_FOB', 'MIDDLE_EAST', 'Orta Doğu', 'Orta Doğu bölgesine ihracat', 3),
        ('EXPORTS_FOB', 'HIGH_TECH', 'Yüksek Teknoloji', 'Yüksek teknoloji ürün ihracatı', 4),

        ('IMPORTS_CIF', 'TOTAL', 'Toplam', 'Toplam mal ithalatı', 1),
        ('IMPORTS_CIF', 'ENERGY', 'Enerji', 'Enerji ithalatı', 2),
        ('IMPORTS_CIF', 'GOLD', 'Altın', 'Altın ithalatı', 3),
        ('IMPORTS_CIF', 'INTERMEDIATE_GOODS', 'Ara Malı', 'Ara malı ithalatı', 4),
        ('IMPORTS_CIF', 'CAPITAL_GOODS', 'Sermaye Malı', 'Sermaye malı ithalatı', 5),

        ('CENTRAL_GOV_BUDGET_BALANCE', 'TOTAL', 'Toplam', 'Toplam bütçe dengesi', 1),
        ('CENTRAL_GOV_BUDGET_BALANCE', 'REVENUES', 'Gelirler', 'Toplam bütçe gelirleri', 2),
        ('CENTRAL_GOV_BUDGET_BALANCE', 'EXPENDITURES', 'Giderler', 'Toplam bütçe giderleri', 3),
        ('CENTRAL_GOV_BUDGET_BALANCE', 'INTEREST_EXPENDITURES', 'Faiz Giderleri', 'Faiz giderleri', 4),
        ('CENTRAL_GOV_BUDGET_BALANCE', 'PRIMARY_BALANCE', 'Faiz Dışı Denge', 'Faiz dışı bütçe dengesi', 5),

        ('POLICY_RATE', 'ONE_WEEK_REPO', 'Bir Hafta Vadeli Repo', 'Ana politika faizi', 1),
        ('POLICY_RATE', 'OVERNIGHT_BORROWING', 'Gecelik Borç Alma', 'Faiz koridoru alt bandı', 2),
        ('POLICY_RATE', 'OVERNIGHT_LENDING', 'Gecelik Borç Verme', 'Faiz koridoru üst bandı', 3)
) as x(indicator_code, component_code, component_name, description, sort_order)
    on i.indicator_code = x.indicator_code
on conflict (indicator_id, component_code) do update
set
    component_name = excluded.component_name,
    description = excluded.description,
    sort_order = excluded.sort_order;
