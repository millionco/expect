export const CATEGORY_ORDER = [
  "growth",
  "inflation",
  "labor",
  "external",
  "fiscal",
  "monetary",
] as const;

export const SQL_PREVIEW_LINE_COUNT = 40;
export const HOME_CATEGORY_PREVIEW_COUNT = 3;
export const HOME_SOURCE_PREVIEW_COUNT = 5;
export const LIVE_FEED_REVALIDATE_SECONDS = 300;
export const AGENT_CHECK_TIMEOUT_MS = 8_000;
export const NEWS_FEED_REVALIDATE_SECONDS = 300;
export const NEWS_ITEMS_PER_SOURCE = 5;
export const LIVE_FEED_TIMEOUT_MS = 12_000;
export const OPENING_RISK_SCORE_MAX = 100;
export const INFLATION_RISK_THRESHOLD_HIGH = 30;
export const INFLATION_RISK_THRESHOLD_ALERT = 24;
export const CURRENCY_GAP_ALERT_LEVEL = 5;
export const CURRENCY_GAP_SCORE_MAX = 8;
export const POLICY_SLOPE_ALERT_LEVEL = 5;
export const POLICY_SLOPE_SCORE_MAX = 10;
export const CALENDAR_DENSITY_ALERT_DAYS = 2;
export const CALENDAR_DENSITY_SCORE_WINDOW_DAYS = 4;
