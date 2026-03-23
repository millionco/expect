import type { eventWithTime } from "@rrweb/types";
import type { ViewerRunState } from "@/types";
import { StepPanel } from "@/components/step-panel";
import { ReplayPlayer } from "@/components/replay-player";
import { FIXTURE_EVENTS, FIXTURE_STEP_STATE } from "@/fixture";

interface ViewerData {
  readonly events: eventWithTime[];
  readonly stepState: ViewerRunState;
}

declare global {
  interface Window {
    __VIEWER_DATA__?: ViewerData;
  }
}

const DEV_FIXTURE: ViewerData | undefined = import.meta.env.DEV
  ? { events: FIXTURE_EVENTS, stepState: FIXTURE_STEP_STATE }
  : undefined;

export const App = () => {
  const data = window.__VIEWER_DATA__ ?? DEV_FIXTURE;

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto p-8 text-center text-muted-foreground">
        No viewer data found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <StepPanel state={data.stepState} />
      <ReplayPlayer events={data.events} />
    </div>
  );
};
