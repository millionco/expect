"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RegistryProvider } from "@effect/atom-react";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { ReplayViewer } from "@/components/replay/replay-viewer";
import { TestSelector } from "@/components/replay/test-selector";
import { TestViewer } from "@/components/replay/test-viewer";
import { selectedTestIdAtom } from "@/lib/replay/atoms/selected-test";
import { DEMO_TRACE } from "@/lib/demo-trace";
import { DEMO_EVENTS } from "@/lib/demo-events";

const DemoMode = () => {
  return <ReplayViewer events={DEMO_EVENTS} steps={DEMO_TRACE} autoPlay />;
};

const LiveMode = () => {
  const selectedId = useAtomValue(selectedTestIdAtom);
  const hasSelectedTest = Option.isSome(selectedId);

  return (
    <>
      <TestSelector />
      {hasSelectedTest && <TestViewer />}
    </>
  );
};

const ReplayPageInner = () => {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  if (isDemo) {
    return <DemoMode />;
  }

  return <LiveMode />;
};

export default function ReplayPage() {
  return (
    <RegistryProvider>
      <Suspense>
        <ReplayPageInner />
      </Suspense>
    </RegistryProvider>
  );
}
