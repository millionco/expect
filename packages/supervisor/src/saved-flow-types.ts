type SavedFlow = import("@expect/shared/models").SavedFlow;
type SavedFlowStep = import("@expect/shared/models").SavedFlowStep;

export interface SavedFlowEnvironment {
  baseUrl: string;
  cookies: boolean;
}

export interface SavedFlowFileData {
  formatVersion: number;
  title: string;
  description: string;
  slug: string;
  savedTargetScope: string;
  savedTargetDisplayName: string;
  selectedCommit?: string;
  flow: {
    title: string;
    userInstruction: string;
    steps: Array<{
      id: string;
      title: string;
      instruction: string;
      expectedOutcome: string;
    }>;
  };
  environment: SavedFlowEnvironment;
}
