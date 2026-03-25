export interface CommonProperties {
  readonly timestamp: string;
  readonly projectId: string;
}

export interface EventMap {
  // Plan
  "plan:draft_created": { readonly draft_id: string };
  "plan:generated": { readonly plan_id: string; readonly step_count: number };
  "plan:approved": { readonly plan_id: string };
  "plan:rejected": { readonly plan_id: string };

  // Execution
  "run:started": { readonly plan_id: string };
  "run:completed": {
    readonly plan_id: string;
    readonly passed: number;
    readonly failed: number;
    readonly step_count: number;
    readonly file_count: number;
    readonly duration_ms: number;
  };
  "run:failed": { readonly plan_id: string; readonly error_tag: string };

  // Steps
  "step:started": { readonly step_id: string; readonly plan_id: string };
  "step:completed": { readonly step_id: string; readonly plan_id: string };
  "step:failed": { readonly step_id: string; readonly plan_id: string; readonly error_tag: string };

  // Browser
  "browser:launched": { readonly headless: boolean };
  "browser:closed": { readonly session_duration_ms: number };
  "browser:cookies_injected": { readonly cookie_count: number };

  // Agent
  "agent:session_created": { readonly session_id: string };
  "agent:tool_called": { readonly tool_name: string };

  // Errors
  "error:unexpected": { readonly error_tag: string; readonly error_message: string };
  "error:expected": { readonly error_tag: string; readonly error_message: string };

  // Session
  "session:started": {
    readonly mode: "interactive" | "headless";
    readonly skip_planning: boolean;
    readonly browser_headed: boolean;
  };
  "session:ended": { readonly session_ms: number };

  // Flows
  "flow:saved": { readonly step_count: number };
  "flow:reused": { readonly slug: string; readonly step_count: number };
}
