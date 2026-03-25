export const VIDEO_WIDTH_PX = 1920;
export const VIDEO_HEIGHT_PX = 1080;
export const VIDEO_FPS = 30;

export const BACKGROUND_COLOR = "#0a0a0a";
export const TEXT_COLOR = "#d4d4d8";
export const MUTED_COLOR = "#737373";
export const RED_COLOR = "#f87171";
export const GREEN_COLOR = "#4ade80";
export const YELLOW_COLOR = "#eab308";
export const CYAN_COLOR = "#22d3ee";
export const OVERLAY_GRADIENT_RGB = "10, 10, 10";
export const OVERLAY_GRADIENT_HEIGHT_PX = 420;
export const OVERLAY_GRADIENT_HORIZONTAL_PADDING_PX = 120;
export const OVERLAY_GRADIENT_BOTTOM_PADDING_PX = 80;
export const OVERLAY_GRADIENT_BOTTOM_ALPHA = 0.96;
export const OVERLAY_GRADIENT_MIDDLE_ALPHA = 0.55;
export const OVERLAY_GRADIENT_MIDDLE_STOP_PERCENT = 50;

export const COMMAND = "npx expect";
export const CONTENT_WIDTH_PX = 1400;

export const TYPING_FONT_SIZE_PX = 100;
export const TYPING_CHAR_WIDTH_PX = 60;
export const CHAR_FRAMES = 2;
export const CURSOR_BLINK_FRAMES = 16;
export const TYPING_INITIAL_DELAY_FRAMES = 15;
export const TYPING_POST_PAUSE_FRAMES = 24;
export const TYPING_PAN_THRESHOLD_PX = CONTENT_WIDTH_PX * 0.6;

export const DIFF_FILE_FONT_SIZE_PX = 48;
export const FRAMES_PER_FILE = 3;
export const DIFF_SCAN_INITIAL_DELAY_FRAMES = 5;
export const DIFF_FILES = [
  { path: "src/components/Button.tsx", added: 12, removed: 3 },
  { path: "src/components/UserCard.tsx", added: 45, removed: 18 },
  { path: "src/components/Dashboard.tsx", added: 23, removed: 7 },
  { path: "src/components/Modal.tsx", added: 8, removed: 0 },
  { path: "src/components/Sidebar.tsx", added: 15, removed: 4 },
  { path: "src/components/Header.tsx", added: 6, removed: 2 },
  { path: "src/components/Footer.tsx", added: 3, removed: 1 },
  { path: "src/components/NavBar.tsx", added: 19, removed: 8 },
  { path: "src/components/Avatar.tsx", added: 7, removed: 0 },
  { path: "src/components/Tooltip.tsx", added: 11, removed: 5 },
  { path: "src/components/Dropdown.tsx", added: 28, removed: 12 },
  { path: "src/components/Table.tsx", added: 34, removed: 9 },
  { path: "src/hooks/useAuth.ts", added: 42, removed: 15 },
  { path: "src/hooks/useDebounce.ts", added: 5, removed: 2 },
  { path: "src/hooks/useFetch.ts", added: 18, removed: 6 },
  { path: "src/hooks/useLocalStorage.ts", added: 9, removed: 3 },
  { path: "src/hooks/useMediaQuery.ts", added: 4, removed: 1 },
  { path: "src/hooks/useClickOutside.ts", added: 6, removed: 0 },
  { path: "src/hooks/useForm.ts", added: 31, removed: 14 },
  { path: "src/hooks/useThrottle.ts", added: 3, removed: 1 },
  { path: "src/pages/Home.tsx", added: 16, removed: 5 },
  { path: "src/pages/Settings.tsx", added: 22, removed: 8 },
  { path: "src/pages/Profile.tsx", added: 37, removed: 11 },
  { path: "src/pages/Login.tsx", added: 14, removed: 4 },
  { path: "src/pages/Register.tsx", added: 20, removed: 7 },
  { path: "src/pages/NotFound.tsx", added: 3, removed: 0 },
  { path: "src/pages/Dashboard.tsx", added: 41, removed: 16 },
  { path: "src/pages/Checkout.tsx", added: 25, removed: 9 },
  { path: "src/actions/deleteUser.ts", added: 8, removed: 3 },
  { path: "src/actions/updateProfile.ts", added: 12, removed: 4 },
  { path: "src/actions/createPost.ts", added: 15, removed: 6 },
  { path: "src/actions/uploadFile.ts", added: 7, removed: 2 },
  { path: "src/actions/sendEmail.ts", added: 10, removed: 3 },
  { path: "src/utils/format.ts", added: 4, removed: 1 },
  { path: "src/utils/validate.ts", added: 9, removed: 3 },
  { path: "src/utils/debounce.ts", added: 2, removed: 0 },
  { path: "src/utils/cn.ts", added: 1, removed: 0 },
  { path: "src/utils/date.ts", added: 6, removed: 2 },
  { path: "src/utils/slug.ts", added: 3, removed: 1 },
  { path: "src/context/ThemeProvider.tsx", added: 17, removed: 5 },
  { path: "src/context/AuthProvider.tsx", added: 29, removed: 10 },
  { path: "src/context/CartProvider.tsx", added: 13, removed: 4 },
  { path: "src/context/NotificationProvider.tsx", added: 8, removed: 2 },
  { path: "src/lib/api.ts", added: 21, removed: 7 },
  { path: "src/lib/db.ts", added: 5, removed: 1 },
  { path: "src/lib/cache.ts", added: 11, removed: 3 },
  { path: "src/lib/redis.ts", added: 6, removed: 2 },
  { path: "src/lib/stripe.ts", added: 4, removed: 0 },
  { path: "src/lib/email.ts", added: 9, removed: 3 },
  { path: "src/middleware/auth.ts", added: 18, removed: 6 },
  { path: "src/middleware/rateLimit.ts", added: 7, removed: 2 },
  { path: "src/middleware/cors.ts", added: 3, removed: 1 },
  { path: "src/middleware/logging.ts", added: 5, removed: 0 },
  { path: "src/types/user.ts", added: 10, removed: 3 },
  { path: "src/types/post.ts", added: 8, removed: 2 },
  { path: "src/types/api.ts", added: 6, removed: 1 },
  { path: "src/config/env.ts", added: 4, removed: 0 },
];

export const TEST_PLAN_STEPS = [
  "Navigate to the login page and verify it loads correctly",
  "Enter valid credentials and submit the login form",
  "Verify the dashboard renders with the correct user data",
  "Click the settings button and verify the modal opens",
  "Update the profile name and verify the change persists",
  "Navigate to the user card and verify the new styling",
  "Test the logout flow and verify redirect to login page",
];

export const TEST_PLAN_FONT_SIZE_PX = 38;
export const FRAMES_PER_STEP = 6;
export const TEST_PLAN_INITIAL_DELAY_FRAMES = 15;

export const EXECUTION_STEP_FONT_SIZE_PX = 38;
export const EXECUTION_STEP_INTERVAL_FRAMES = 12;
export const EXECUTION_STEP_START_FRAME = 20;

export const SPINNER_CHARS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const SPINNER_SPEED_FRAMES = 3;

export const RESULTS_STEP_COUNT = 7;
export const RESULTS_ELAPSED_TIME = "12.4s";
export const RESULTS_ANIMATION_FRAMES = 20;

export const SCENE_TYPING_DURATION_FRAMES = 100;
export const SCENE_DIFF_SCAN_DURATION_FRAMES = 185;
export const SCENE_TEST_PLAN_DURATION_FRAMES = 135;
export const SCENE_BROWSER_EXECUTION_DURATION_FRAMES = 140;
export const SCENE_RESULTS_DURATION_FRAMES = 110;
export const TRANSITION_DURATION_FRAMES = 15;

export const TOTAL_DURATION =
  SCENE_TYPING_DURATION_FRAMES +
  SCENE_DIFF_SCAN_DURATION_FRAMES +
  SCENE_TEST_PLAN_DURATION_FRAMES +
  SCENE_BROWSER_EXECUTION_DURATION_FRAMES +
  SCENE_RESULTS_DURATION_FRAMES -
  TRANSITION_DURATION_FRAMES;
