export const FRAME_DIFF_IDLE_THRESHOLD = 0.005;
export const IDLE_CUT_THRESHOLD_SECONDS = 3;
export const SCENE_CHANGE_THRESHOLD = 0.15;
export const MIN_ACTIVE_SEGMENT_SECONDS = 1;
export const FRAMES_PER_SECOND = 1;

export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv"] as const;
export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};
