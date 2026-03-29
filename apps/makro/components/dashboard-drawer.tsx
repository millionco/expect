"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type DrawerContent =
  | { type: "news"; title: string; source: string; description?: string; link: string; publishedAt: string }
  | { type: "indicator"; code: string; name: string; category: string; frequency: string; description: string; components: Array<{ code: string; name: string; description: string }> }
  | { type: "atlasian" }
  | { type: "agents" }
  | null;

interface DrawerContextValue {
  content: DrawerContent;
  open: (content: NonNullable<DrawerContent>) => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerContextValue>({
  content: null,
  open: () => undefined,
  close: () => undefined,
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const DashboardDrawerProvider = ({ children }: { children: React.ReactNode }) => {
  const [content, setContent] = useState<DrawerContent>(null);

  const open = useCallback((c: NonNullable<DrawerContent>) => setContent(c), []);
  const close = useCallback(() => setContent(null), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <DrawerContext.Provider value={{ content, open, close }}>
      {children}
      <DashboardDrawer />
    </DrawerContext.Provider>
  );
};

export const useDrawer = () => useContext(DrawerContext);

// ─── Drawer UI ─────────────────────────────────────────────────────────────────
const TREND_ICON = { up: "▲", down: "▼", stable: "—" };
const TREND_COLOR = {
  up: "text-red-400",
  down: "text-emerald-400",
  stable: "text-muted-foreground",
};
const CONFIDENCE_LABEL = { high: "Yüksek", medium: "Orta", low: "Düşük" };

const DashboardDrawer = () => {
  const { content, close } = useContext(DrawerContext);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isOpen = content !== null;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={close}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
      />

      {/* Drawer panel */}
      <div className="drawer-enter fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col shadow-2xl">
        <div className="makro-surface flex h-full flex-col overflow-hidden rounded-l-[1.5rem]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {content.type === "news" && "Haber Detayı"}
              {content.type === "indicator" && "Gösterge Detayı"}
              {content.type === "atlasian" && "ATLASIAN Analizi"}
              {content.type === "agents" && "Ajan Durumu"}
            </p>
            <button
              onClick={close}
              className="rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground transition-colors hover:border-accent/30 hover:text-accent"
              aria-label="Kapat"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {content.type === "news" && <NewsDrawerContent content={content} />}
            {content.type === "indicator" && <IndicatorDrawerContent content={content} />}
            {content.type === "atlasian" && <AtlasianDrawerContent />}
            {content.type === "agents" && <AgentsDrawerContent />}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── News Content ─────────────────────────────────────────────────────────────
const NewsDrawerContent = ({
  content,
}: {
  content: Extract<DrawerContent, { type: "news" }>;
}) => (
  <div className="grid gap-4">
    <div>
      <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        {content.source}
      </span>
      <p className="mt-3 text-xs text-muted-foreground">
        {new Date(content.publishedAt).toLocaleString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
    <h2 className="text-xl font-semibold leading-7 tracking-[-0.02em] text-foreground">
      {content.title}
    </h2>
    {content.description && (
      <p className="text-sm leading-7 text-muted-foreground">{content.description}</p>
    )}
    <a
      href={content.link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-accent/24 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:border-accent/40"
    >
      Haberi oku
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  </div>
);

// ─── Indicator Content ────────────────────────────────────────────────────────
const IndicatorDrawerContent = ({
  content,
}: {
  content: Extract<DrawerContent, { type: "indicator" }>;
}) => (
  <div className="grid gap-4">
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {content.code}
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
        {content.name}
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          {content.category}
        </span>
        <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          {content.frequency}
        </span>
      </div>
    </div>

    <p className="text-sm leading-7 text-muted-foreground">{content.description}</p>

    {content.components.length > 0 && (
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Alt Bileşenler
        </p>
        <div className="grid gap-1.5">
          {content.components.map((comp) => (
            <div
              key={comp.code}
              className="rounded-2xl border border-border bg-background/70 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{comp.name}</p>
                <p className="font-mono text-[10px] uppercase text-muted-foreground/60">
                  {comp.code}
                </p>
              </div>
              {comp.description && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{comp.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ─── ATLASIAN Content (live fetch) ────────────────────────────────────────────
interface ForecastItem {
  key: string;
  label: string;
  value: number | null;
  trend: "up" | "down" | "stable";
  confidence: "high" | "medium" | "low";
  rationale: string;
}

interface AtlasianResult {
  forecasts?: ForecastItem[];
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  keyThemes?: string[];
  newsItemCount?: number;
  error?: string;
}

const AtlasianDrawerContent = () => {
  const [data, setData] = useState<AtlasianResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    setSaved(false);
    try {
      const response = await fetch("/api/atlasian");
      const json = (await response.json()) as AtlasianResult;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  const saveForecasts = async () => {
    setSaving(true);
    try {
      await fetch("/api/atlasian", { method: "POST" });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm leading-6 text-muted-foreground">
          WSJ, CNBC, Yahoo Finance, Investing.com ve CoinDesk haberlerini Claude AI ile analiz eder ve
          Türkiye makro tahminleri üretir.
        </p>
        <a
          href="/atlasian"
          className="mt-3 inline-flex rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/30 hover:text-accent"
        >
          ATLASIAN çalışma alanını aç
        </a>
      </div>

      {!data && !loading && (
        <button
          onClick={runAnalysis}
          className="rounded-full border border-accent/24 bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent hover:border-accent/40"
        >
          ATLASIAN Analizi Başlat
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Haberler okunuyor ve analiz ediliyor…
        </div>
      )}

      {data && (
        <div className="grid gap-3">
          {data.error && (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
              Hata: {data.error}
            </p>
          )}

          {data.summary && (
            <div className="rounded-2xl border border-border bg-background/70 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Genel Sentez
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">{data.summary}</p>
              {data.keyThemes && data.keyThemes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.keyThemes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {data.forecasts && data.forecasts.length > 0 && (
            <div className="grid gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                AI Tahminleri ({data.newsItemCount} haber analiz edildi)
              </p>
              {data.forecasts.map((f) => (
                <div
                  key={f.key}
                  className="rounded-2xl border border-border bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${TREND_COLOR[f.trend]}`}>
                        {TREND_ICON[f.trend]}
                      </span>
                      <span className="font-mono text-base font-bold tabular-nums text-accent">
                        {f.value !== null ? f.value.toFixed(2) : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p className="text-xs leading-5 text-muted-foreground">{f.rationale}</p>
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">
                      {CONFIDENCE_LABEL[f.confidence]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={runAnalysis}
              className="rounded-full border border-border bg-background/80 px-4 py-2 text-xs font-medium text-foreground hover:border-accent/30"
            >
              Yenile
            </button>
            {data.forecasts && data.forecasts.length > 0 && (
              <button
                onClick={saveForecasts}
                disabled={saving || saved}
                className="rounded-full border border-accent/24 bg-accent/10 px-4 py-2 text-xs font-medium text-accent hover:border-accent/40 disabled:opacity-50"
              >
                {saved ? "Kaydedildi ✓" : saving ? "Kaydediliyor…" : "İç Tahmin Olarak Kaydet"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Agents Content (live fetch) ──────────────────────────────────────────────
type AgentStatus = "ok" | "warning" | "error" | "unknown";

interface AgentResult {
  id: string;
  label: string;
  category: string;
  status: AgentStatus;
  message: string;
}

interface AgentApiData {
  agents?: AgentResult[];
  summary?: { errorCount: number; warningCount: number; okCount: number; total: number };
}

const STATUS_DOT: Record<AgentStatus, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-400",
  error: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const AgentsDrawerContent = () => {
  const [data, setData] = useState<AgentApiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json() as Promise<AgentApiData>)
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid gap-3">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Ajanlar kontrol ediliyor…
        </div>
      )}

      {data?.summary && (
        <div className="flex gap-3">
          {[
            { label: "Tamam", count: data.summary.okCount, color: "text-emerald-400" },
            { label: "Uyarı", count: data.summary.warningCount, color: "text-amber-400" },
            { label: "Hata", count: data.summary.errorCount, color: "text-red-400" },
          ].map((item) => (
            <div key={item.label} className="flex-1 rounded-2xl border border-border bg-background/70 px-3 py-2 text-center">
              <p className={`text-xl font-bold tabular-nums ${item.color}`}>{item.count}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {data?.agents?.map((agent) => (
        <div
          key={agent.id}
          className="flex items-start gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3"
        >
          <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{agent.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{agent.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
