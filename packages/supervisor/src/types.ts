export interface SavedFlowStep {
  id: string;
  title: string;
  instruction: string;
  expectedOutcome: string;
}

export interface SavedFlow {
  title: string;
  userInstruction: string;
  steps: SavedFlowStep[];
}

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
  flow: SavedFlow;
  environment: SavedFlowEnvironment;
}
