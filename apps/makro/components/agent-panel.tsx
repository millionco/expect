"use client";

import { useEffect, useState } from "react";

type AgentStatus = "ok" | "warning" | "error" | "unknown";
type AgentCategory = "makro" | "haber" | "sistem";

interface AgentCheckResult {
  id: string;
  label: string;
  category: AgentCategory;
  status: AgentStatus;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

interface AgentSummary {
  errorCount: number;
  warningCount: number;
  okCount: number;
  total: number;
}

interface AgentApiResponse {
  agents: AgentCheckResult[];
  summary: AgentSummary;
  checkedAt: string;
}

const POLL_INTERVAL_MS = 60_000;

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-400",
  error: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  ok: "Çalışıyor",
  warning: "Uyarı",
  error: "Hata",
  unknown: "Bilinmiyor",
};

const CATEGORY_LABEL: Record<AgentCategory, string> = {
  makro: "Makro",
  haber: "Haber",
  sistem: "Sistem",
};

const StatusDot = ({ status, pulse }: { status: AgentStatus; pulse?: boolean }) => (
  <span className="relative inline-flex h-2 w-2 flex-shrink-0">
    {pulse && status !== "ok" && (
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${STATUS_DOT_CLASS[status]}`}
      />
    )}
    <span className={`relative inline-flex h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
  </span>
);

export const AgentPanel = () => {
  const [data, setData] = useState<AgentApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [expanded, setExpanded] = useState(false);

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as AgentApiResponse;
      setData(json);
      setLastUpdated(
        new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
      );
    } catch {
      // Sessiz hata — bir sonraki polling döngüsünde tekrar denenecek
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const overallStatus: AgentStatus =
    !data || isLoading
      ? "unknown"
      : data.summary.errorCount > 0
        ? "error"
        : data.summary.warningCount > 0
          ? "warning"
          : "ok";

  return (
    <article className="makro-surface rounded-[1.5rem] p-4">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <StatusDot status={overallStatus} pulse />
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Ajan Durumu
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                overallStatus === "ok"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : overallStatus === "warning"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {data.summary.errorCount > 0 && `${data.summary.errorCount} hata`}
              {data.summary.errorCount === 0 && data.summary.warningCount > 0 && `${data.summary.warningCount} uyarı`}
              {data.summary.errorCount === 0 && data.summary.warningCount === 0 && `${data.summary.okCount}/${data.summary.total} tamam`}
            </span>
          )}
          <svg
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
          Ajanlar kontrol ediliyor…
        </div>
      )}

      {expanded && data && (
        <div className="mt-3 grid gap-1.5">
          {(["makro", "haber", "sistem"] as AgentCategory[]).map((category) => {
            const categoryAgents = data.agents.filter((a) => a.category === category);
            if (categoryAgents.length === 0) return null;

            return (
              <div key={category}>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                  {CATEGORY_LABEL[category]}
                </p>
                {categoryAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-background/70 px-3 py-2 mb-1"
                  >
                    <StatusDot status={agent.status} pulse={agent.status !== "ok"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">{agent.label}</p>
                        <span className="flex-shrink-0 text-[9px] text-muted-foreground">
                          {STATUS_LABEL[agent.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] leading-4 text-muted-foreground">
                        {agent.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground/60">
        Son kontrol: {lastUpdated} — 60 sn&apos;de otomatik yenilenir
      </p>
    </article>
  );
};
