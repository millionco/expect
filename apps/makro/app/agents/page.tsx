import { MakroShell } from "@/components/makro-shell";
import { AgentPanel } from "@/components/agent-panel";
import { NEWS_FEED_SOURCES } from "@/lib/get-news-feed";

export default function AgentsPage() {
  return (
    <MakroShell
      eyebrow="Ajan Durumu"
      title="Arka plan ajanları ve kaynak izleme"
      description="Tüm veri kaynaklarının, haber akışlarının ve sistem bileşenlerinin anlık durumu. Panel 60 saniyede bir otomatik yenilenir."
    >
      {/* Ajan paneli tam genişlik, expand edilmiş */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-3">
          <AgentPanel />
        </div>
      </section>

      {/* Kayıtlı haber kaynakları */}
      <section className="makro-surface rounded-[1.5rem] p-4 sm:p-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Kayıtlı haber kaynakları
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
            RSS akışı izlenen kaynaklar
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {NEWS_FEED_SOURCES.length} kaynak kayıtlı — her 5 dakikada kontrol edilir
          </p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {NEWS_FEED_SOURCES.map((source) => (
            <div
              key={source.id}
              className="rounded-2xl border border-border bg-background/92 px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground">{source.label}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/60">
                {source.url}
              </p>
              <span className="mt-2 inline-flex rounded-full border border-border bg-background/90 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {source.category}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Bilgi */}
      <section className="makro-surface rounded-[1.5rem] p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Nasıl çalışır
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "Makro Ajanlar",
              body: "TCMB kur XML, EVDS3 tahmin serileri ve yayın takvimini sürekli denetler. Bugün güncellenmemiş veya erişilemeyen kaynakları uyarı olarak işaretler.",
            },
            {
              title: "Sistem Ajanlar",
              body: "Veritabanı bağlantısını ve iç tahmin dosyasının tazeliğini izler. 30 günden eski veri veya eksik dosya otomatik uyarı üretir.",
            },
            {
              title: "Haber Ajanları",
              body: "10 Türk ekonomi haber kaynağının RSS akışına erişilebilirliğini test eder. Kaynakların yarısından fazlası erişilemezse uyarı verir.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-background/92 px-4 py-3"
            >
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </MakroShell>
  );
}
