import { NextResponse } from "next/server";
import { runAllAgents } from "@/lib/agents";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const agents = await runAllAgents();
  const errorCount = agents.filter((a) => a.status === "error").length;
  const warningCount = agents.filter((a) => a.status === "warning").length;
  const okCount = agents.filter((a) => a.status === "ok").length;

  return NextResponse.json({
    agents,
    summary: { errorCount, warningCount, okCount, total: agents.length },
    checkedAt: new Date().toISOString(),
  });
};
