export interface CommonProperties {
  readonly timestamp: string;
  readonly projectId: string;
}

export interface EventMap {
  // Execution
  "run:started": undefined;
  "run:completed": {
    readonly passed: number;
    readonly failed: number;
    readonly step_count: number;
    readonly file_count: number;
    readonly duration_ms: number;
  };
  "run:failed": { readonly error_tag: string };
  "run:cancelled": undefined;

  // Steps
  "step:started": { readonly step_id: string };
  "step:completed": { readonly step_id: string };
  "step:failed": { readonly step_id: string; readonly error_tag: string };

  // Browser
  "browser:launched": { readonly headless: boolean };
  "browser:opened": {
    readonly source: "mcp_open";
    readonly browser_type: "chromium" | "webkit" | "firefox";
    readonly browser_name: string;
    readonly browser_mode: "headed" | "headless";
    readonly connection_mode: "launched" | "cdp" | "system_chrome";
    readonly is_external_browser: boolean;
    readonly cookie_count: number;
  };
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
    readonly agent: string;
    readonly parent_agent: string | undefined;
    readonly browser_headed: boolean;
  };
  "session:ended": { readonly session_ms: number };

  // Flows
  "flow:saved": { readonly step_count: number };
  "flow:reused": { readonly slug: string; readonly step_count: number };

  // Live Preview
  "live_preview:opened": undefined;

  // Context
  "context:selected": {
    readonly context_type: "working_tree" | "branch" | "pull_request" | "commit";
  };

  // Port / URL selection
  "port:selected": {
    readonly port_count: number;
    readonly has_custom_url: boolean;
    readonly source: "running" | "detected";
  };
  "port:skipped": undefined;

  // Cookies
  "cookies:toggled": { readonly enabled: boolean };
  "cookies:sync_choice": { readonly choice: "use_cookies" | "skip_cookies" };
  "cookies:browser_selection": {
    readonly selected_count: number;
    readonly browsers: string;
  };
  "cookies:cleared": undefined;

  // Results actions
  "results:copied_to_clipboard": undefined;
  "results:posted_to_pr": undefined;
  "results:restarted": undefined;

  // Suggestions
  "suggestion:accepted": undefined;
}
