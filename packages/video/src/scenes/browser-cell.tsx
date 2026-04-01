import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { fontFamily } from "../utils/font";

export const CELL_WIDTH_PX = 640;
export const CELL_HEIGHT_PX = 360;

const CHROME_TOOLBAR_HEIGHT_PX = 42;
const CHROME_BROWSER_FRAME_HEIGHT_PX = CHROME_TOOLBAR_HEIGHT_PX;
const BROWSER_VIEWPORT_HEIGHT_PX = CELL_HEIGHT_PX - CHROME_BROWSER_FRAME_HEIGHT_PX;
const LEGACY_CHROME_BAR_HEIGHT_PX = 36;
const CHROME_OMNIBOX_WIDTH_PX = 391;
const CHROME_OMNIBOX_HORIZONTAL_PADDING_PX = 12;
const CHROME_OMNIBOX_VERTICAL_PADDING_PX = 6;
const CHROME_TOOLBAR_PADDING_TOP_PX = 8;
const CHROME_TOOLBAR_PADDING_RIGHT_PX = 12;
const CHROME_TOOLBAR_PADDING_BOTTOM_PX = 4;
const CHROME_TOOLBAR_PADDING_LEFT_PX = 12;
const CHROME_TOOLBAR_CONTENT_GAP_PX = 8;
const CHROME_TOOLBAR_GROUP_WIDTH_PX = 84;
const CHROME_TOOLBAR_GROUP_GAP_PX = 4;
const CHROME_TOOLBAR_BUTTON_SIZE_PX = 24;
const CHROME_TOOLBAR_BUTTON_ICON_SIZE_PX = 14;
const CHROME_TOOLBAR_ICON_STROKE_WIDTH_PX = 1.8;
const CHROME_TOOLBAR_GLYPH_FONT_SIZE_PX = 16;
const CHROME_TOOLBAR_REFRESH_GLYPH_FONT_SIZE_PX = 17;
const CHROME_TOOLBAR_BUTTON_BACKGROUND = "rgba(60, 64, 67, 0.06)";
const CHROME_TOOLBAR_BUTTON_COLOR = "#5f6368";
const CHROME_OMNIBOX_GAP_PX = 6;
const CHROME_OMNIBOX_ICON_SIZE_PX = 18;
const CHROME_OMNIBOX_SHADOW =
  "color(display-p3 0 0 0 / 16%) 0px 0px 0px 0.5px, color(display-p3 0 0 0 / 3%) 0px 1px 5px";
const CHROME_OMNIBOX_TEXT_COLOR = "color(display-p3 0.317 0.317 0.317)";
const CHROME_OMNIBOX_FONT_FAMILY = '"OpenRunde-Medium", "Open_Runde", system-ui, sans-serif';
const CHROME_WINDOW_OUTER_RADIUS_PX = 10;

const browserViewportOffsetY = (contentY: number) => CHROME_BROWSER_FRAME_HEIGHT_PX + contentY;

const legacyPaperIntroWaypointToCellY = (legacyCellY: number) =>
  browserViewportOffsetY((legacyCellY * BROWSER_VIEWPORT_HEIGHT_PX) / CELL_HEIGHT_PX);

const legacyGenericCursorCellY = (legacyCellY: number) =>
  browserViewportOffsetY(
    ((legacyCellY - LEGACY_CHROME_BAR_HEIGHT_PX) * BROWSER_VIEWPORT_HEIGHT_PX) /
      (CELL_HEIGHT_PX - LEGACY_CHROME_BAR_HEIGHT_PX),
  );

const CURSOR_KEYFRAMES = [0, 12, 35, 42, 65, 72, 85, 95];
const CURSOR_X_VALUES = [460, 280, 280, 280, 280, 280, 280, 280];
const CURSOR_Y_VALUES_LEGACY = [60, 130, 130, 185, 185, 248, 248, 248];
const CURSOR_Y_VALUES = CURSOR_Y_VALUES_LEGACY.map(legacyGenericCursorCellY);

const FIELD_1_START_FRAME = 12;
const FIELD_1_END_FRAME = 38;
const FIELD_2_START_FRAME = 42;
const FIELD_2_END_FRAME = 68;
const BUTTON_PRESS_FRAME = 78;
const SUCCESS_FRAME = 85;

const FIELD_1_TEXT = "foo@bar.xyz";
const FIELD_2_TEXT = "••••••••";
const CHARS_PER_FRAME = 0.7;
const FAQ_ARTBOARD_HEIGHT_PX = 424;
const FAQ_ARTBOARD_SCALE = BROWSER_VIEWPORT_HEIGHT_PX / FAQ_ARTBOARD_HEIGHT_PX;
const FAQ_ARTBOARD_LEFT_PX = 0;
const FAQ_PAPER_SHADOW = "#00000029 0px 0px 0px 0.5px, #00000008 0px 1px 5px";
const FAQ_TITLE_LEFT_PX = 71;
const FAQ_TITLE_TOP_PX = 71;
const FAQ_TITLE_WIDTH_PX = 560;
const FAQ_SIDEBAR_LEFT_PX = 101;
const FAQ_SIDEBAR_TOP_PX = 133;
const FAQ_SIDEBAR_WIDTH_PX = 170;
const FAQ_SIDEBAR_HEIGHT_PX = 164;
const FAQ_PILL_LEFT_PX = 295;
const FAQ_PILL_WIDTH_PX = 301;
const FAQ_PILL_HEIGHT_PX = 45;
const FAQ_PILL_TOPS_PX = [133, 191, 249, 307];
const FAQ_MUTED_LEFT_PX = 314;
const FAQ_MUTED_WIDTHS_PX = [199, 118, 159, 68];
const FAQ_MUTED_TOPS_PX = [151, 209, 267, 325];
const FAQ_LIGHT_LEFT_PX = 550;
const FAQ_LIGHT_WIDTH_PX = 33;
const FAQ_CONTENT_MAX_RIGHT_PX = Math.max(
  FAQ_TITLE_LEFT_PX + FAQ_TITLE_WIDTH_PX,
  FAQ_PILL_LEFT_PX + FAQ_PILL_WIDTH_PX,
  FAQ_LIGHT_LEFT_PX + FAQ_LIGHT_WIDTH_PX,
);
const FAQ_ARTBOARD_PAD_RIGHT_PX = 8;
const FAQ_ARTBOARD_WIDTH_PX = FAQ_CONTENT_MAX_RIGHT_PX + FAQ_ARTBOARD_PAD_RIGHT_PX;
const FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX =
  (CELL_WIDTH_PX - FAQ_ARTBOARD_WIDTH_PX * FAQ_ARTBOARD_SCALE) / 2;
const FAQ_BAR_HEIGHT_PX = 9;
const FAQ_FIELD_SHADOW = FAQ_PAPER_SHADOW;
const FAQ_BAR_MUTED = "#b4b4b4";
const FAQ_BAR_LIGHT = "#e3e3e3";
const FAQ_SIGNUP_TITLE_FONT_FAMILY = '"OpenRunde-Bold", "Open_Runde", system-ui, sans-serif';
const FAQ_TITLE_FONT_FAMILY = '"Open Runde", "OpenRunde", system-ui, sans-serif';
const FAQ_PAGE_BACKGROUND =
  "linear-gradient(in oklab 180deg, oklab(100% 0 0) 0%, oklab(100% 0 0 / 97%) 100%)";
const FAQ_CURSOR_PILL_X =
  FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX + (FAQ_PILL_LEFT_PX + FAQ_PILL_WIDTH_PX / 2) * FAQ_ARTBOARD_SCALE;
const FAQ_PILL_CENTER_Y = FAQ_PILL_TOPS_PX.map(
  (topPx) => (topPx + FAQ_PILL_HEIGHT_PX / 2) * FAQ_ARTBOARD_SCALE,
);
const FAQ_CURSOR_WAYPOINT_FRAMES = [0, 12, 35, 42, 65, 72, 85, 95];
const FAQ_CURSOR_SEGMENT_CURVE_PX = [55, -45, 50, -38, 35, -32, 28];
const FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX = 0;
const FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX_2 = 0;
const FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX = 0;
const FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2 = 0;
const POINTER_CURSOR_RENDER_WIDTH_PX = 37;
const POINTER_CURSOR_RENDER_HEIGHT_PX = 41;
const POINTER_CURSOR_HOTSPOT_X_PX = 19;
const POINTER_CURSOR_HOTSPOT_Y_PX = 16;
const POINTER_CURSOR_LEFT_OFFSET_PX = 17;
const POINTER_CURSOR_TOP_OFFSET_PX = 15;
const FAQ_COMPOSITE_WIDTH_PX = 210;
const FAQ_COMPOSITE_HEIGHT_PX = 97.9375;
const FAQ_COMPOSITE_BADGE_LEFT_PX = 43;
const FAQ_COMPOSITE_BADGE_TOP_PX = 35;
const FAQ_COMPOSITE_POINTER_RENDER_WIDTH_PX = 101;
const FAQ_COMPOSITE_POINTER_RENDER_HEIGHT_PX = FAQ_COMPOSITE_POINTER_RENDER_WIDTH_PX * (32 / 33);
const FAQ_COMPOSITE_POINTER_TIP_VIEWBOX_X = 3.439;
const FAQ_COMPOSITE_POINTER_TIP_VIEWBOX_Y = 2.939;
const FAQ_COMPOSITE_HOTSPOT_X_PX =
  (FAQ_COMPOSITE_POINTER_TIP_VIEWBOX_X / 33) * FAQ_COMPOSITE_POINTER_RENDER_WIDTH_PX;
const FAQ_COMPOSITE_HOTSPOT_Y_PX =
  (FAQ_COMPOSITE_POINTER_TIP_VIEWBOX_Y / 32) * FAQ_COMPOSITE_POINTER_RENDER_HEIGHT_PX;
const FAQ_COMPOSITE_ORANGE = "color(display-p3 1 0.602 0.001)";
const FAQ_COMPOSITE_BADGE_SHADOW = "0px 0px 13px rgba(131, 131, 131, 0.43)";
const FAQ_CURSOR_MIN_X_PX = FAQ_COMPOSITE_HOTSPOT_X_PX;
const FAQ_CURSOR_MAX_X_PX = CELL_WIDTH_PX - FAQ_COMPOSITE_WIDTH_PX + FAQ_COMPOSITE_HOTSPOT_X_PX;
const FAQ_CURSOR_MIN_Y_PX = FAQ_COMPOSITE_HOTSPOT_Y_PX;
const FAQ_CURSOR_MAX_Y_PX = CELL_HEIGHT_PX - FAQ_COMPOSITE_HEIGHT_PX + FAQ_COMPOSITE_HOTSPOT_Y_PX;
const FAQ_CURSOR_WAYPOINTS = [
  {
    x: Math.min(415 + FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX, FAQ_CURSOR_MAX_X_PX),
    y: legacyPaperIntroWaypointToCellY(55),
  },
  { x: 380 + FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(125) },
  { x: 330 + FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(95) },
  {
    x: FAQ_CURSOR_PILL_X - 15,
    y: Math.min(browserViewportOffsetY(FAQ_PILL_CENTER_Y[0]), FAQ_CURSOR_MAX_Y_PX),
  },
  {
    x: FAQ_CURSOR_PILL_X + 12,
    y: Math.min(browserViewportOffsetY(FAQ_PILL_CENTER_Y[1]), FAQ_CURSOR_MAX_Y_PX),
  },
  {
    x: FAQ_CURSOR_PILL_X - 15,
    y: Math.min(browserViewportOffsetY(FAQ_PILL_CENTER_Y[2]), FAQ_CURSOR_MAX_Y_PX),
  },
  {
    x: FAQ_CURSOR_PILL_X + 12,
    y: Math.min(browserViewportOffsetY(FAQ_PILL_CENTER_Y[3]), FAQ_CURSOR_MAX_Y_PX),
  },
  {
    x: FAQ_CURSOR_PILL_X,
    y: Math.min(browserViewportOffsetY(FAQ_PILL_CENTER_Y[3]), FAQ_CURSOR_MAX_Y_PX),
  },
];

const NEWSLETTER_ARTBOARD_HEIGHT_PX = 424;
const NEWSLETTER_ARTBOARD_SCALE = BROWSER_VIEWPORT_HEIGHT_PX / NEWSLETTER_ARTBOARD_HEIGHT_PX;
const NEWSLETTER_ARTBOARD_LEFT_PX = FAQ_ARTBOARD_LEFT_PX;
const NEWSLETTER_ARTBOARD_TOP_PX = 0;
const NEWSLETTER_FIELD_SHADOW =
  "color(display-p3 0 0 0 / 16%) 0px 0px 0px 0.5px, color(display-p3 0 0 0 / 3%) 0px 1px 5px";
const NEWSLETTER_TITLE_LEFT_PX = 129;
const NEWSLETTER_TITLE_TOP_PX = 210;
const NEWSLETTER_SUBTITLE_LINE_LEFT_PX = 206;
const NEWSLETTER_SUBTITLE_LINE_TOP_PX = 260;
const NEWSLETTER_SUBTITLE_LINE_WIDTH_PX = 148;
const NEWSLETTER_SUBTITLE_LINE_HEIGHT_PX = 11;
const NEWSLETTER_CARD_LEFT_PX = 44;
const NEWSLETTER_CARD_TOP_PX = 69;
const NEWSLETTER_CARD_WIDTH_PX = 456;
const NEWSLETTER_CARD_HEIGHT_PX = 112;
const NEWSLETTER_INPUT_LEFT_PX = 44;
const NEWSLETTER_INPUT_TOP_PX = 312;
const NEWSLETTER_INPUT_WIDTH_PX = 318;
const NEWSLETTER_INPUT_HEIGHT_PX = 38;
const NEWSLETTER_BUTTON_LEFT_PX = 370;
const NEWSLETTER_BUTTON_TOP_PX = 312;
const NEWSLETTER_BUTTON_WIDTH_PX = 130;
const NEWSLETTER_BUTTON_HEIGHT_PX = 38;
const NEWSLETTER_INPUT_SKELETON_LEFT_PX = 59;
const NEWSLETTER_INPUT_SKELETON_TOP_PX = 327;
const NEWSLETTER_INPUT_SKELETON_WIDTH_PX = 141;
const NEWSLETTER_INPUT_SKELETON_HEIGHT_PX = 9;
const NEWSLETTER_BUTTON_SKELETON_LEFT_PX = 403;
const NEWSLETTER_BUTTON_SKELETON_TOP_PX = 325;
const NEWSLETTER_BUTTON_SKELETON_WIDTH_PX = 64;
const NEWSLETTER_BUTTON_SKELETON_HEIGHT_PX = 11;
const NEWSLETTER_CONTROL_RADIUS_PX = 12;
const NEWSLETTER_CONTENT_MAX_RIGHT_PX = Math.max(
  NEWSLETTER_CARD_LEFT_PX + NEWSLETTER_CARD_WIDTH_PX,
  NEWSLETTER_BUTTON_LEFT_PX + NEWSLETTER_BUTTON_WIDTH_PX,
);
const NEWSLETTER_ARTBOARD_PAD_RIGHT_PX = FAQ_ARTBOARD_PAD_RIGHT_PX;
const NEWSLETTER_ARTBOARD_WIDTH_PX =
  NEWSLETTER_CONTENT_MAX_RIGHT_PX + NEWSLETTER_ARTBOARD_PAD_RIGHT_PX;
const NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX =
  (CELL_WIDTH_PX - NEWSLETTER_ARTBOARD_WIDTH_PX * NEWSLETTER_ARTBOARD_SCALE) / 2;

const NEWSLETTER_COMPOSITE_WIDTH_PX = 264;
const NEWSLETTER_COMPOSITE_HEIGHT_PX = 97.9375;
const NEWSLETTER_COMPOSITE_BADGE_LEFT_PX = 43;
const NEWSLETTER_COMPOSITE_BADGE_TOP_PX = 40;
const NEWSLETTER_COMPOSITE_POINTER_RENDER_WIDTH_PX = 101;
const NEWSLETTER_COMPOSITE_BADGE_SHADOW = "0px 0px 13px color(display-p3 0.514 0.514 0.514 / 43%)";
const NEWSLETTER_COMPOSITE_BADGE_BACKGROUND = "color(display-p3 0.915 0 0)";
const NEWSLETTER_COMPOSITE_BADGE_OUTLINE = "3px solid color(display-p3 1 1 1)";
const NEWSLETTER_CURSOR_MIN_X_PX = FAQ_COMPOSITE_HOTSPOT_X_PX;
const NEWSLETTER_CURSOR_MAX_X_PX =
  CELL_WIDTH_PX - NEWSLETTER_COMPOSITE_WIDTH_PX + FAQ_COMPOSITE_HOTSPOT_X_PX;
const NEWSLETTER_CURSOR_MIN_Y_PX = FAQ_COMPOSITE_HOTSPOT_Y_PX;
const NEWSLETTER_CURSOR_MAX_Y_PX =
  CELL_HEIGHT_PX - NEWSLETTER_COMPOSITE_HEIGHT_PX + FAQ_COMPOSITE_HOTSPOT_Y_PX;
const NEWSLETTER_INPUT_CENTER_ARTBOARD_X = NEWSLETTER_INPUT_LEFT_PX + NEWSLETTER_INPUT_WIDTH_PX / 2;
const NEWSLETTER_INPUT_CENTER_ARTBOARD_Y = NEWSLETTER_INPUT_TOP_PX + NEWSLETTER_INPUT_HEIGHT_PX / 2;
const NEWSLETTER_INPUT_CENTER_X =
  NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX +
  NEWSLETTER_INPUT_CENTER_ARTBOARD_X * NEWSLETTER_ARTBOARD_SCALE;
const NEWSLETTER_INPUT_CENTER_Y =
  NEWSLETTER_ARTBOARD_TOP_PX + NEWSLETTER_INPUT_CENTER_ARTBOARD_Y * NEWSLETTER_ARTBOARD_SCALE;
const NEWSLETTER_BUTTON_CENTER_X =
  NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX +
  (NEWSLETTER_BUTTON_LEFT_PX + NEWSLETTER_BUTTON_WIDTH_PX / 2) * NEWSLETTER_ARTBOARD_SCALE;
const NEWSLETTER_CURSOR_WAYPOINT_FRAMES = FAQ_CURSOR_WAYPOINT_FRAMES;
const NEWSLETTER_CURSOR_SEGMENT_CURVE_PX = FAQ_CURSOR_SEGMENT_CURVE_PX;
const NEWSLETTER_CURSOR_WOBBLE_X_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX;
const NEWSLETTER_CURSOR_WOBBLE_X_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
const NEWSLETTER_CURSOR_WOBBLE_Y_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
const NEWSLETTER_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
const NEWSLETTER_CURSOR_WAYPOINTS = [
  {
    x: Math.min(415 + NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX, NEWSLETTER_CURSOR_MAX_X_PX),
    y: legacyPaperIntroWaypointToCellY(55),
  },
  { x: 380 + NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(125) },
  { x: 330 + NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(95) },
  {
    x: NEWSLETTER_INPUT_CENTER_X - 15,
    y: Math.min(browserViewportOffsetY(NEWSLETTER_INPUT_CENTER_Y), NEWSLETTER_CURSOR_MAX_Y_PX),
  },
  {
    x: NEWSLETTER_BUTTON_CENTER_X + 12,
    y: Math.min(browserViewportOffsetY(NEWSLETTER_INPUT_CENTER_Y), NEWSLETTER_CURSOR_MAX_Y_PX),
  },
  {
    x: NEWSLETTER_INPUT_CENTER_X - 15,
    y: Math.min(browserViewportOffsetY(NEWSLETTER_INPUT_CENTER_Y), NEWSLETTER_CURSOR_MAX_Y_PX),
  },
  {
    x: NEWSLETTER_BUTTON_CENTER_X + 12,
    y: Math.min(browserViewportOffsetY(NEWSLETTER_INPUT_CENTER_Y), NEWSLETTER_CURSOR_MAX_Y_PX),
  },
  {
    x: NEWSLETTER_BUTTON_CENTER_X,
    y: Math.min(browserViewportOffsetY(NEWSLETTER_INPUT_CENTER_Y), NEWSLETTER_CURSOR_MAX_Y_PX),
  },
];

const DASHBOARD_RT_ARTBOARD_HEIGHT_PX = 424;
const DASHBOARD_RT_ARTBOARD_SCALE = BROWSER_VIEWPORT_HEIGHT_PX / DASHBOARD_RT_ARTBOARD_HEIGHT_PX;
const DASHBOARD_RT_ARTBOARD_LEFT_PX = FAQ_ARTBOARD_LEFT_PX;
const DASHBOARD_RT_ARTBOARD_TOP_PX = 0;
const DASHBOARD_RT_CARD_SHADOW = NEWSLETTER_FIELD_SHADOW;
const DASHBOARD_RT_CHART_LEFT_PX = 44;
const DASHBOARD_RT_CHART_TOP_PX = 269;
const DASHBOARD_RT_CHART_WIDTH_PX = 471;
const DASHBOARD_RT_CHART_HEIGHT_PX = 109;
const DASHBOARD_RT_TITLE_LEFT_PX = 159;
const DASHBOARD_RT_TITLE_TOP_PX = 71;
const DASHBOARD_RT_LINE_LEFT_PX = 206;
const DASHBOARD_RT_LINE_TOP_PX = 116;
const DASHBOARD_RT_LINE_WIDTH_PX = 148;
const DASHBOARD_RT_LINE_HEIGHT_PX = 11;
const DASHBOARD_RT_CARD_TOP_PX = 150;
const DASHBOARD_RT_CARD_WIDTH_PX = 145;
const DASHBOARD_RT_CARD_HEIGHT_PX = 107;
const DASHBOARD_RT_CARD_LEFTS_PX = [44, 207, 370];
const DASHBOARD_RT_METRIC_TOP_PX = 205;
const DASHBOARD_RT_METRIC_LEFTS_PX = [60, 223, 386];
const DASHBOARD_RT_METRIC_VALUES = ["8,291", "342", "$12.4k"];
const DASHBOARD_RT_SKELETON_TOP_PX = 192;
const DASHBOARD_RT_SKELETON_WIDTH_PX = 26;
const DASHBOARD_RT_SKELETON_HEIGHT_PX = 9;
const DASHBOARD_RT_TITLE_FONT_FAMILY = '"OpenRunde-Bold", "Open_Runde", system-ui, sans-serif';
const DASHBOARD_RT_METRIC_FONT_FAMILY = '"OpenRunde-Semibold", "Open_Runde", system-ui, sans-serif';
const DASHBOARD_RT_CONTENT_MAX_RIGHT_PX = Math.max(
  DASHBOARD_RT_CHART_LEFT_PX + DASHBOARD_RT_CHART_WIDTH_PX,
  DASHBOARD_RT_CARD_LEFTS_PX[DASHBOARD_RT_CARD_LEFTS_PX.length - 1] + DASHBOARD_RT_CARD_WIDTH_PX,
);
const DASHBOARD_RT_ARTBOARD_PAD_RIGHT_PX = FAQ_ARTBOARD_PAD_RIGHT_PX;
const DASHBOARD_RT_ARTBOARD_WIDTH_PX =
  DASHBOARD_RT_CONTENT_MAX_RIGHT_PX + DASHBOARD_RT_ARTBOARD_PAD_RIGHT_PX;
const DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX =
  (CELL_WIDTH_PX - DASHBOARD_RT_ARTBOARD_WIDTH_PX * DASHBOARD_RT_ARTBOARD_SCALE) / 2;

const DASHBOARD_CURSOR_COMPOSITE_WIDTH_PX = 263;
const DASHBOARD_CURSOR_COMPOSITE_HEIGHT_PX = 97.9375;
const DASHBOARD_CURSOR_BADGE_LEFT_PX = 40;
const DASHBOARD_CURSOR_BADGE_TOP_PX = 36;
const DASHBOARD_CURSOR_MIN_X_PX = FAQ_COMPOSITE_HOTSPOT_X_PX;
const DASHBOARD_CURSOR_MAX_X_PX =
  CELL_WIDTH_PX - DASHBOARD_CURSOR_COMPOSITE_WIDTH_PX + FAQ_COMPOSITE_HOTSPOT_X_PX;
const DASHBOARD_CURSOR_MIN_Y_PX = FAQ_COMPOSITE_HOTSPOT_Y_PX;
const DASHBOARD_CURSOR_MAX_Y_PX =
  CELL_HEIGHT_PX - DASHBOARD_CURSOR_COMPOSITE_HEIGHT_PX + FAQ_COMPOSITE_HOTSPOT_Y_PX;
const DASHBOARD_CURSOR_CHART_CENTER_ARTBOARD_X =
  DASHBOARD_RT_CHART_LEFT_PX + DASHBOARD_RT_CHART_WIDTH_PX / 2;
const DASHBOARD_CURSOR_CHART_CENTER_ARTBOARD_Y =
  DASHBOARD_RT_CHART_TOP_PX + DASHBOARD_RT_CHART_HEIGHT_PX / 2;
const DASHBOARD_CURSOR_CHART_CENTER_X =
  DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX +
  DASHBOARD_CURSOR_CHART_CENTER_ARTBOARD_X * DASHBOARD_RT_ARTBOARD_SCALE;
const DASHBOARD_CURSOR_CHART_CENTER_Y =
  DASHBOARD_RT_ARTBOARD_TOP_PX +
  DASHBOARD_CURSOR_CHART_CENTER_ARTBOARD_Y * DASHBOARD_RT_ARTBOARD_SCALE;
const DASHBOARD_CURSOR_MIDDLE_CARD_CENTER_ARTBOARD_X =
  DASHBOARD_RT_CARD_LEFTS_PX[1] + DASHBOARD_RT_CARD_WIDTH_PX / 2;
const DASHBOARD_CURSOR_THIRD_CARD_CENTER_ARTBOARD_X =
  DASHBOARD_RT_CARD_LEFTS_PX[2] + DASHBOARD_RT_CARD_WIDTH_PX / 2;
const DASHBOARD_CURSOR_CARD_ROW_CENTER_ARTBOARD_Y =
  DASHBOARD_RT_CARD_TOP_PX + DASHBOARD_RT_CARD_HEIGHT_PX / 2;
const DASHBOARD_CURSOR_MIDDLE_CARD_CENTER_X =
  DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX +
  DASHBOARD_CURSOR_MIDDLE_CARD_CENTER_ARTBOARD_X * DASHBOARD_RT_ARTBOARD_SCALE;
const DASHBOARD_CURSOR_THIRD_CARD_CENTER_X =
  DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX +
  DASHBOARD_CURSOR_THIRD_CARD_CENTER_ARTBOARD_X * DASHBOARD_RT_ARTBOARD_SCALE;
const DASHBOARD_CURSOR_CARD_ROW_CENTER_Y =
  DASHBOARD_RT_ARTBOARD_TOP_PX +
  DASHBOARD_CURSOR_CARD_ROW_CENTER_ARTBOARD_Y * DASHBOARD_RT_ARTBOARD_SCALE;
const DASHBOARD_CURSOR_WAYPOINT_FRAMES = FAQ_CURSOR_WAYPOINT_FRAMES;
const DASHBOARD_CURSOR_SEGMENT_CURVE_PX = FAQ_CURSOR_SEGMENT_CURVE_PX;
const DASHBOARD_CURSOR_WOBBLE_X_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX;
const DASHBOARD_CURSOR_WOBBLE_X_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
const DASHBOARD_CURSOR_WOBBLE_Y_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
const DASHBOARD_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
const DASHBOARD_CURSOR_WAYPOINTS = [
  {
    x: Math.min(415 + DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX, DASHBOARD_CURSOR_MAX_X_PX),
    y: legacyPaperIntroWaypointToCellY(55),
  },
  { x: 380 + DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(125) },
  {
    x: Math.min(330 + DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX, DASHBOARD_CURSOR_CHART_CENTER_X),
    y: Math.min(browserViewportOffsetY(DASHBOARD_CURSOR_CHART_CENTER_Y), DASHBOARD_CURSOR_MAX_Y_PX),
  },
  {
    x: DASHBOARD_CURSOR_MIDDLE_CARD_CENTER_X - 15,
    y: Math.min(
      browserViewportOffsetY(DASHBOARD_CURSOR_CARD_ROW_CENTER_Y),
      DASHBOARD_CURSOR_MAX_Y_PX,
    ),
  },
  {
    x: DASHBOARD_CURSOR_THIRD_CARD_CENTER_X + 12,
    y: Math.min(
      browserViewportOffsetY(DASHBOARD_CURSOR_CARD_ROW_CENTER_Y),
      DASHBOARD_CURSOR_MAX_Y_PX,
    ),
  },
  {
    x: DASHBOARD_CURSOR_MIDDLE_CARD_CENTER_X - 15,
    y: Math.min(
      browserViewportOffsetY(DASHBOARD_CURSOR_CARD_ROW_CENTER_Y),
      DASHBOARD_CURSOR_MAX_Y_PX,
    ),
  },
  {
    x: DASHBOARD_CURSOR_THIRD_CARD_CENTER_X + 12,
    y: Math.min(
      browserViewportOffsetY(DASHBOARD_CURSOR_CARD_ROW_CENTER_Y),
      DASHBOARD_CURSOR_MAX_Y_PX,
    ),
  },
  {
    x: DASHBOARD_CURSOR_THIRD_CARD_CENTER_X,
    y: Math.min(
      browserViewportOffsetY(DASHBOARD_CURSOR_CARD_ROW_CENTER_Y),
      DASHBOARD_CURSOR_MAX_Y_PX,
    ),
  },
];

const CHECKOUT_PAPER_ARTBOARD_HEIGHT_PX = 424;
const CHECKOUT_PAPER_ARTBOARD_SCALE =
  BROWSER_VIEWPORT_HEIGHT_PX / CHECKOUT_PAPER_ARTBOARD_HEIGHT_PX;
const CHECKOUT_PAPER_ARTBOARD_LEFT_PX = FAQ_ARTBOARD_LEFT_PX;
const CHECKOUT_PAPER_ARTBOARD_TOP_PX = 0;
const CHECKOUT_PAPER_FIELD_SHADOW = NEWSLETTER_FIELD_SHADOW;
const CHECKOUT_PAPER_FIELD_LEFT_PX = 75;
const CHECKOUT_PAPER_FIELD_WIDTH_PX = 409;
const CHECKOUT_PAPER_FIELD_HEIGHT_PX = 38;
const CHECKOUT_PAPER_CONTENT_MAX_RIGHT_PX =
  CHECKOUT_PAPER_FIELD_LEFT_PX + CHECKOUT_PAPER_FIELD_WIDTH_PX;
const CHECKOUT_PAPER_ARTBOARD_PAD_RIGHT_PX = FAQ_ARTBOARD_PAD_RIGHT_PX;
const CHECKOUT_PAPER_ARTBOARD_WIDTH_PX =
  CHECKOUT_PAPER_CONTENT_MAX_RIGHT_PX + CHECKOUT_PAPER_ARTBOARD_PAD_RIGHT_PX;
const CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX =
  (CELL_WIDTH_PX - CHECKOUT_PAPER_ARTBOARD_WIDTH_PX * CHECKOUT_PAPER_ARTBOARD_SCALE) / 2;
const CHECKOUT_PAPER_CONTROL_RADIUS_PX = 12;
const CHECKOUT_PAPER_TITLE_LEFT_PX = 184;
const CHECKOUT_PAPER_TITLE_TOP_PX = 63;
const CHECKOUT_PAPER_WHITE_FIELD_TOPS_PX = [125, 177, 289];
const CHECKOUT_FIELD_1_TEXT = "john@email.com";
const CHECKOUT_FIELD_2_TEXT = "••••••••••";
const CHECKOUT_FIELD_PLACEHOLDER_LABELS = ["Email", "Password", "Confirm"];
const CHECKOUT_FIELD_SKELETON_LEFT_PX = 94;
const CHECKOUT_FIELD_SKELETON_WIDTH_PX = 101;
const CHECKOUT_PAPER_BUTTON_TOP_PX = 337;
const CHECKOUT_PAPER_BLUE = "color(display-p3 0.267 0.503 0.967)";
const CHECKOUT_PAPER_SKELETONS: {
  left: number;
  top: number;
  width: number;
  height: number;
  backgroundColor: string;
}[] = [
  {
    left: 94,
    top: 303,
    width: 141,
    height: 9,
    backgroundColor: "color(display-p3 0.881 0.881 0.881)",
  },
  {
    left: 210,
    top: 191,
    width: 141,
    height: 9,
    backgroundColor: "color(display-p3 0.881 0.881 0.881)",
  },
  {
    left: 229,
    top: 139,
    width: 101,
    height: 9,
    backgroundColor: "color(display-p3 0.881 0.881 0.881)",
  },
  {
    left: 75,
    top: 266,
    width: 141,
    height: 9,
    backgroundColor: "color(display-p3 0.705 0.705 0.705)",
  },
  {
    left: 263,
    top: 236,
    width: 33,
    height: 9,
    backgroundColor: "color(display-p3 0.890 0.890 0.890)",
  },
  {
    left: 249,
    top: 350,
    width: 64,
    height: 11,
    backgroundColor: "color(display-p3 1 1 1 / 30%)",
  },
];

const CHECKOUT_CURSOR_FIELD_CENTER_ARTBOARD_X =
  CHECKOUT_PAPER_FIELD_LEFT_PX + CHECKOUT_PAPER_FIELD_WIDTH_PX / 2;
const CHECKOUT_CURSOR_FIRST_FIELD_CENTER_ARTBOARD_Y =
  CHECKOUT_PAPER_WHITE_FIELD_TOPS_PX[0] + CHECKOUT_PAPER_FIELD_HEIGHT_PX / 2;
const CHECKOUT_CURSOR_BUTTON_CENTER_ARTBOARD_Y =
  CHECKOUT_PAPER_BUTTON_TOP_PX + CHECKOUT_PAPER_FIELD_HEIGHT_PX / 2;
const CHECKOUT_CURSOR_FIELD_CENTER_X =
  CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX +
  CHECKOUT_CURSOR_FIELD_CENTER_ARTBOARD_X * CHECKOUT_PAPER_ARTBOARD_SCALE;
const CHECKOUT_CURSOR_FIRST_FIELD_CENTER_Y =
  CHECKOUT_PAPER_ARTBOARD_TOP_PX +
  CHECKOUT_CURSOR_FIRST_FIELD_CENTER_ARTBOARD_Y * CHECKOUT_PAPER_ARTBOARD_SCALE;
const CHECKOUT_CURSOR_BUTTON_CENTER_X = CHECKOUT_CURSOR_FIELD_CENTER_X;
const CHECKOUT_CURSOR_BUTTON_CENTER_Y =
  CHECKOUT_PAPER_ARTBOARD_TOP_PX +
  CHECKOUT_CURSOR_BUTTON_CENTER_ARTBOARD_Y * CHECKOUT_PAPER_ARTBOARD_SCALE;

const CHECKOUT_CURSOR_COMPOSITE_WIDTH_PX = 258;
const CHECKOUT_CURSOR_COMPOSITE_HEIGHT_PX = 97.9375;
const CHECKOUT_CURSOR_BADGE_LEFT_PX = 45;
const CHECKOUT_CURSOR_BADGE_TOP_PX = 40;
const CHECKOUT_COMPOSITE_BADGE_BACKGROUND = NEWSLETTER_COMPOSITE_BADGE_BACKGROUND;
const CHECKOUT_COMPOSITE_BADGE_OUTLINE = NEWSLETTER_COMPOSITE_BADGE_OUTLINE;
const CHECKOUT_COMPOSITE_BADGE_SHADOW = NEWSLETTER_COMPOSITE_BADGE_SHADOW;
const CHECKOUT_CURSOR_MIN_X_PX = FAQ_COMPOSITE_HOTSPOT_X_PX;
const CHECKOUT_CURSOR_MAX_X_PX =
  CELL_WIDTH_PX - CHECKOUT_CURSOR_COMPOSITE_WIDTH_PX + FAQ_COMPOSITE_HOTSPOT_X_PX;
const CHECKOUT_CURSOR_MIN_Y_PX = FAQ_COMPOSITE_HOTSPOT_Y_PX;
const CHECKOUT_CURSOR_MAX_Y_PX =
  CELL_HEIGHT_PX - CHECKOUT_CURSOR_COMPOSITE_HEIGHT_PX + FAQ_COMPOSITE_HOTSPOT_Y_PX;
const CHECKOUT_CURSOR_WAYPOINT_FRAMES = FAQ_CURSOR_WAYPOINT_FRAMES;
const CHECKOUT_CURSOR_SEGMENT_CURVE_PX = FAQ_CURSOR_SEGMENT_CURVE_PX;
const CHECKOUT_CURSOR_WOBBLE_X_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX;
const CHECKOUT_CURSOR_WOBBLE_X_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
const CHECKOUT_CURSOR_WOBBLE_Y_AMPLITUDE_PX = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
const CHECKOUT_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2 = FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
const CHECKOUT_CURSOR_WAYPOINTS = [
  {
    x: Math.min(415 + CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX, CHECKOUT_CURSOR_MAX_X_PX),
    y: legacyPaperIntroWaypointToCellY(55),
  },
  { x: 380 + CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(125) },
  { x: 330 + CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX, y: legacyPaperIntroWaypointToCellY(95) },
  {
    x: CHECKOUT_CURSOR_FIELD_CENTER_X - 15,
    y: Math.min(
      browserViewportOffsetY(CHECKOUT_CURSOR_FIRST_FIELD_CENTER_Y),
      CHECKOUT_CURSOR_MAX_Y_PX,
    ),
  },
  {
    x: CHECKOUT_CURSOR_BUTTON_CENTER_X + 12,
    y: Math.min(browserViewportOffsetY(CHECKOUT_CURSOR_BUTTON_CENTER_Y), CHECKOUT_CURSOR_MAX_Y_PX),
  },
  {
    x: CHECKOUT_CURSOR_FIELD_CENTER_X - 15,
    y: Math.min(browserViewportOffsetY(CHECKOUT_CURSOR_BUTTON_CENTER_Y), CHECKOUT_CURSOR_MAX_Y_PX),
  },
  {
    x: CHECKOUT_CURSOR_BUTTON_CENTER_X + 12,
    y: Math.min(browserViewportOffsetY(CHECKOUT_CURSOR_BUTTON_CENTER_Y), CHECKOUT_CURSOR_MAX_Y_PX),
  },
  {
    x: CHECKOUT_CURSOR_BUTTON_CENTER_X,
    y: Math.min(browserViewportOffsetY(CHECKOUT_CURSOR_BUTTON_CENTER_Y), CHECKOUT_CURSOR_MAX_Y_PX),
  },
];

export type PageVariant =
  | "signup"
  | "login"
  | "dashboard"
  | "profile"
  | "checkout"
  | "inbox"
  | "kanban"
  | "analytics";

const bar = (style?: CSSProperties): ReactNode => (
  <div style={{ height: 12, backgroundColor: "#e5e5e5", borderRadius: 6, ...style }} />
);

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const quadraticBezier1D = (p0: number, p1: number, p2: number, t: number) => {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
};

const getQuadraticBezierControl = (
  p0: { x: number; y: number },
  p2: { x: number; y: number },
  curvePx: number,
) => {
  const midX = (p0.x + p2.x) / 2;
  const midY = (p0.y + p2.y) / 2;
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = (-dy / len) * curvePx;
  const perpY = (dx / len) * curvePx;
  return { x: midX + perpX, y: midY + perpY };
};

const getFaqCursorHotspot = (frame: number) => {
  const frames = FAQ_CURSOR_WAYPOINT_FRAMES;
  const lastFrame = frames[frames.length - 1];
  const lastWaypoint = FAQ_CURSOR_WAYPOINTS[FAQ_CURSOR_WAYPOINTS.length - 1];

  const applyWobbleAndClamp = (x: number, y: number) => {
    let xx = x + Math.sin(frame * 0.42) * FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX;
    xx += Math.sin(frame * 0.11 + 1.1) * FAQ_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
    let yy = y + Math.cos(frame * 0.38) * FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
    yy += Math.sin(frame * 0.17) * FAQ_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
    return {
      x: clampNumber(xx, FAQ_CURSOR_MIN_X_PX, FAQ_CURSOR_MAX_X_PX),
      y: clampNumber(yy, FAQ_CURSOR_MIN_Y_PX, FAQ_CURSOR_MAX_Y_PX),
    };
  };

  const f = clampNumber(frame, 0, lastFrame);

  if (f >= lastFrame) {
    return applyWobbleAndClamp(lastWaypoint.x, lastWaypoint.y);
  }

  if (f <= frames[0]) {
    const pStart = FAQ_CURSOR_WAYPOINTS[0];
    return applyWobbleAndClamp(pStart.x, pStart.y);
  }

  let seg = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (f >= frames[i] && f <= frames[i + 1]) {
      seg = i;
      break;
    }
  }

  const f0 = frames[seg];
  const f1 = frames[seg + 1];
  const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
  const p0 = FAQ_CURSOR_WAYPOINTS[seg];
  const p2 = FAQ_CURSOR_WAYPOINTS[seg + 1];
  const curve = FAQ_CURSOR_SEGMENT_CURVE_PX[seg] ?? 0;
  const p1 = getQuadraticBezierControl(p0, p2, curve);

  const x = quadraticBezier1D(p0.x, p1.x, p2.x, t);
  const y = quadraticBezier1D(p0.y, p1.y, p2.y, t);
  return applyWobbleAndClamp(x, y);
};

const getNewsletterCursorHotspot = (frame: number) => {
  const frames = NEWSLETTER_CURSOR_WAYPOINT_FRAMES;
  const lastFrame = frames[frames.length - 1];
  const lastWaypoint = NEWSLETTER_CURSOR_WAYPOINTS[NEWSLETTER_CURSOR_WAYPOINTS.length - 1];

  const applyWobbleAndClamp = (x: number, y: number) => {
    let xx = x + Math.sin(frame * 0.42) * NEWSLETTER_CURSOR_WOBBLE_X_AMPLITUDE_PX;
    xx += Math.sin(frame * 0.11 + 1.1) * NEWSLETTER_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
    let yy = y + Math.cos(frame * 0.38) * NEWSLETTER_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
    yy += Math.sin(frame * 0.17) * NEWSLETTER_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
    return {
      x: clampNumber(xx, NEWSLETTER_CURSOR_MIN_X_PX, NEWSLETTER_CURSOR_MAX_X_PX),
      y: clampNumber(yy, NEWSLETTER_CURSOR_MIN_Y_PX, NEWSLETTER_CURSOR_MAX_Y_PX),
    };
  };

  const f = clampNumber(frame, 0, lastFrame);

  if (f >= lastFrame) {
    return applyWobbleAndClamp(lastWaypoint.x, lastWaypoint.y);
  }

  if (f <= frames[0]) {
    const pStart = NEWSLETTER_CURSOR_WAYPOINTS[0];
    return applyWobbleAndClamp(pStart.x, pStart.y);
  }

  let seg = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (f >= frames[i] && f <= frames[i + 1]) {
      seg = i;
      break;
    }
  }

  const f0 = frames[seg];
  const f1 = frames[seg + 1];
  const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
  const p0 = NEWSLETTER_CURSOR_WAYPOINTS[seg];
  const p2 = NEWSLETTER_CURSOR_WAYPOINTS[seg + 1];
  const curve = NEWSLETTER_CURSOR_SEGMENT_CURVE_PX[seg] ?? 0;
  const p1 = getQuadraticBezierControl(p0, p2, curve);

  const x = quadraticBezier1D(p0.x, p1.x, p2.x, t);
  const y = quadraticBezier1D(p0.y, p1.y, p2.y, t);
  return applyWobbleAndClamp(x, y);
};

const getDashboardCursorHotspot = (frame: number) => {
  const frames = DASHBOARD_CURSOR_WAYPOINT_FRAMES;
  const lastFrame = frames[frames.length - 1];
  const lastWaypoint = DASHBOARD_CURSOR_WAYPOINTS[DASHBOARD_CURSOR_WAYPOINTS.length - 1];

  const applyWobbleAndClamp = (x: number, y: number) => {
    let xx = x + Math.sin(frame * 0.42) * DASHBOARD_CURSOR_WOBBLE_X_AMPLITUDE_PX;
    xx += Math.sin(frame * 0.11 + 1.1) * DASHBOARD_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
    let yy = y + Math.cos(frame * 0.38) * DASHBOARD_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
    yy += Math.sin(frame * 0.17) * DASHBOARD_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
    return {
      x: clampNumber(xx, DASHBOARD_CURSOR_MIN_X_PX, DASHBOARD_CURSOR_MAX_X_PX),
      y: clampNumber(yy, DASHBOARD_CURSOR_MIN_Y_PX, DASHBOARD_CURSOR_MAX_Y_PX),
    };
  };

  const f = clampNumber(frame, 0, lastFrame);

  if (f >= lastFrame) {
    return applyWobbleAndClamp(lastWaypoint.x, lastWaypoint.y);
  }

  if (f <= frames[0]) {
    const pStart = DASHBOARD_CURSOR_WAYPOINTS[0];
    return applyWobbleAndClamp(pStart.x, pStart.y);
  }

  let seg = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (f >= frames[i] && f <= frames[i + 1]) {
      seg = i;
      break;
    }
  }

  const f0 = frames[seg];
  const f1 = frames[seg + 1];
  const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
  const p0 = DASHBOARD_CURSOR_WAYPOINTS[seg];
  const p2 = DASHBOARD_CURSOR_WAYPOINTS[seg + 1];
  const curve = DASHBOARD_CURSOR_SEGMENT_CURVE_PX[seg] ?? 0;
  const p1 = getQuadraticBezierControl(p0, p2, curve);

  const x = quadraticBezier1D(p0.x, p1.x, p2.x, t);
  const y = quadraticBezier1D(p0.y, p1.y, p2.y, t);
  return applyWobbleAndClamp(x, y);
};

const getCheckoutCursorHotspot = (frame: number) => {
  const frames = CHECKOUT_CURSOR_WAYPOINT_FRAMES;
  const lastFrame = frames[frames.length - 1];
  const lastWaypoint = CHECKOUT_CURSOR_WAYPOINTS[CHECKOUT_CURSOR_WAYPOINTS.length - 1];

  const applyWobbleAndClamp = (x: number, y: number) => {
    let xx = x + Math.sin(frame * 0.42) * CHECKOUT_CURSOR_WOBBLE_X_AMPLITUDE_PX;
    xx += Math.sin(frame * 0.11 + 1.1) * CHECKOUT_CURSOR_WOBBLE_X_AMPLITUDE_PX_2;
    let yy = y + Math.cos(frame * 0.38) * CHECKOUT_CURSOR_WOBBLE_Y_AMPLITUDE_PX;
    yy += Math.sin(frame * 0.17) * CHECKOUT_CURSOR_WOBBLE_Y_AMPLITUDE_PX_2;
    return {
      x: clampNumber(xx, CHECKOUT_CURSOR_MIN_X_PX, CHECKOUT_CURSOR_MAX_X_PX),
      y: clampNumber(yy, CHECKOUT_CURSOR_MIN_Y_PX, CHECKOUT_CURSOR_MAX_Y_PX),
    };
  };

  const f = clampNumber(frame, 0, lastFrame);

  if (f >= lastFrame) {
    return applyWobbleAndClamp(lastWaypoint.x, lastWaypoint.y);
  }

  if (f <= frames[0]) {
    const pStart = CHECKOUT_CURSOR_WAYPOINTS[0];
    return applyWobbleAndClamp(pStart.x, pStart.y);
  }

  let seg = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (f >= frames[i] && f <= frames[i + 1]) {
      seg = i;
      break;
    }
  }

  const f0 = frames[seg];
  const f1 = frames[seg + 1];
  const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
  const p0 = CHECKOUT_CURSOR_WAYPOINTS[seg];
  const p2 = CHECKOUT_CURSOR_WAYPOINTS[seg + 1];
  const curve = CHECKOUT_CURSOR_SEGMENT_CURVE_PX[seg] ?? 0;
  const p1 = getQuadraticBezierControl(p0, p2, curve);

  const x = quadraticBezier1D(p0.x, p1.x, p2.x, t);
  const y = quadraticBezier1D(p0.y, p1.y, p2.y, t);
  return applyWobbleAndClamp(x, y);
};

const getFormAnimationState = (frame: number) => {
  const field1Active = frame >= FIELD_1_START_FRAME && frame < FIELD_1_END_FRAME;
  const field1TypedChars = Math.min(
    FIELD_1_TEXT.length,
    Math.max(0, Math.floor((frame - FIELD_1_START_FRAME) * CHARS_PER_FRAME)),
  );
  const field1HasText = field1TypedChars > 0 || frame >= FIELD_1_END_FRAME;

  const field2Active = frame >= FIELD_2_START_FRAME && frame < FIELD_2_END_FRAME;
  const field2TypedChars = Math.min(
    FIELD_2_TEXT.length,
    Math.max(0, Math.floor((frame - FIELD_2_START_FRAME) * CHARS_PER_FRAME)),
  );
  const field2HasText = field2TypedChars > 0 || frame >= FIELD_2_END_FRAME;

  const buttonPressed = frame >= BUTTON_PRESS_FRAME && frame < SUCCESS_FRAME;
  const success = frame >= SUCCESS_FRAME;

  const field1Display = field1HasText
    ? field1TypedChars > 0
      ? FIELD_1_TEXT.slice(0, field1TypedChars)
      : FIELD_1_TEXT
    : undefined;

  const field2Display = field2HasText
    ? field2TypedChars > 0
      ? FIELD_2_TEXT.slice(0, field2TypedChars)
      : FIELD_2_TEXT
    : undefined;

  return {
    buttonPressed,
    field1Active,
    field1Display,
    field2Active,
    field2Display,
    success,
  };
};

const getActivePillIndex = (frame: number): number => {
  if (frame >= 72) return 3;
  if (frame >= 42) return 2;
  if (frame >= 12) return 1;
  return 0;
};

const renderSignupContent = (frame: number) => {
  const activePill = getActivePillIndex(frame);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#ffffff",
        backgroundImage: FAQ_PAGE_BACKGROUND,
        fontSynthesis: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: FAQ_ARTBOARD_LAYOUT_OFFSET_X_PX,
          top: 0,
          width: FAQ_ARTBOARD_WIDTH_PX,
          height: FAQ_ARTBOARD_HEIGHT_PX,
          transform: `scale(${FAQ_ARTBOARD_SCALE})`,
          transformOrigin: "top left",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: FAQ_TITLE_LEFT_PX,
            top: FAQ_TITLE_TOP_PX,
            width: FAQ_TITLE_WIDTH_PX,
            fontSize: 27,
            lineHeight: "41px",
            letterSpacing: "-1.08px",
            textAlign: "center",
            color: "#111111",
            fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
            fontWeight: 700,
          }}
        >
          Questions? Our FAQ:
        </div>

        <div
          style={{
            position: "absolute",
            left: FAQ_SIDEBAR_LEFT_PX,
            top: FAQ_SIDEBAR_TOP_PX,
            width: FAQ_SIDEBAR_WIDTH_PX,
            height: FAQ_SIDEBAR_HEIGHT_PX,
            borderRadius: 15,
            boxShadow: FAQ_FIELD_SHADOW,
          }}
        />

        {FAQ_PILL_TOPS_PX.map((topPx, index) => (
          <div
            key={topPx}
            style={{
              position: "absolute",
              left: FAQ_PILL_LEFT_PX,
              top: topPx,
              width: FAQ_PILL_WIDTH_PX,
              height: FAQ_PILL_HEIGHT_PX,
              borderRadius: 999,
              backgroundColor: index === activePill ? "#f0f4ff" : "#ffffff",
              boxShadow:
                index === activePill
                  ? "color(display-p3 0.267 0.503 0.967 / 40%) 0px 0px 0px 1.5px, color(display-p3 0 0 0 / 3%) 0px 1px 5px"
                  : FAQ_FIELD_SHADOW,
            }}
          />
        ))}

        {FAQ_MUTED_TOPS_PX.map((topPx, index) => (
          <div
            key={`muted-${topPx}`}
            style={{
              position: "absolute",
              left: FAQ_MUTED_LEFT_PX,
              top: topPx,
              width: FAQ_MUTED_WIDTHS_PX[index],
              height: FAQ_BAR_HEIGHT_PX,
              borderRadius: 999,
              backgroundColor: FAQ_BAR_MUTED,
            }}
          />
        ))}

        {FAQ_MUTED_TOPS_PX.map((topPx) => (
          <div
            key={`light-${topPx}`}
            style={{
              position: "absolute",
              left: FAQ_LIGHT_LEFT_PX,
              top: topPx,
              width: FAQ_LIGHT_WIDTH_PX,
              height: FAQ_BAR_HEIGHT_PX,
              borderRadius: 999,
              backgroundColor: FAQ_BAR_LIGHT,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const NEWSLETTER_EMAIL_TEXT = "user@example.com";

const renderNewsletterContent = (frame: number) => {
  const inputActive = frame >= FIELD_1_START_FRAME && frame < FIELD_1_END_FRAME;
  const typedChars = Math.min(
    NEWSLETTER_EMAIL_TEXT.length,
    Math.max(0, Math.floor((frame - FIELD_1_START_FRAME) * CHARS_PER_FRAME)),
  );
  const hasText = typedChars > 0 || frame >= FIELD_1_END_FRAME;
  const typedDisplay = hasText
    ? typedChars > 0
      ? NEWSLETTER_EMAIL_TEXT.slice(0, typedChars)
      : NEWSLETTER_EMAIL_TEXT
    : undefined;
  const btnPressed = frame >= BUTTON_PRESS_FRAME && frame < SUCCESS_FRAME;

  return (
    <div
      style={{
        position: "absolute",
        left: NEWSLETTER_ARTBOARD_LAYOUT_OFFSET_X_PX,
        top: NEWSLETTER_ARTBOARD_TOP_PX,
        width: NEWSLETTER_ARTBOARD_WIDTH_PX,
        height: NEWSLETTER_ARTBOARD_HEIGHT_PX,
        transform: `scale(${NEWSLETTER_ARTBOARD_SCALE})`,
        transformOrigin: "top left",
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: NEWSLETTER_ARTBOARD_WIDTH_PX,
          height: NEWSLETTER_ARTBOARD_HEIGHT_PX,
          borderRadius: 31,
          backgroundImage: FAQ_PAGE_BACKGROUND,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_TITLE_LEFT_PX,
          top: NEWSLETTER_TITLE_TOP_PX,
          fontSize: 27,
          lineHeight: "41px",
          letterSpacing: "-0.03em",
          color: "#111111",
          fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
          fontWeight: 700,
        }}
      >
        Subscribe to Newsletter
      </div>
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_SUBTITLE_LINE_LEFT_PX,
          top: NEWSLETTER_SUBTITLE_LINE_TOP_PX,
          width: NEWSLETTER_SUBTITLE_LINE_WIDTH_PX,
          height: NEWSLETTER_SUBTITLE_LINE_HEIGHT_PX,
          borderRadius: 999,
          backgroundColor: "color(display-p3 0.899 0.899 0.899)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_CARD_LEFT_PX,
          top: NEWSLETTER_CARD_TOP_PX,
          width: NEWSLETTER_CARD_WIDTH_PX,
          height: NEWSLETTER_CARD_HEIGHT_PX,
          borderRadius: 15,
          backgroundColor: "color(display-p3 1 1 1)",
          boxShadow: NEWSLETTER_FIELD_SHADOW,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_BUTTON_LEFT_PX,
          top: NEWSLETTER_BUTTON_TOP_PX,
          width: NEWSLETTER_BUTTON_WIDTH_PX,
          height: NEWSLETTER_BUTTON_HEIGHT_PX,
          borderRadius: NEWSLETTER_CONTROL_RADIUS_PX,
          backgroundColor: "color(display-p3 0.267 0.503 0.967)",
          boxShadow: NEWSLETTER_FIELD_SHADOW,
          transform: btnPressed ? "scale(0.96)" : "scale(1)",
          transformOrigin: "center center",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_INPUT_LEFT_PX,
          top: NEWSLETTER_INPUT_TOP_PX,
          width: NEWSLETTER_INPUT_WIDTH_PX,
          height: NEWSLETTER_INPUT_HEIGHT_PX,
          borderRadius: NEWSLETTER_CONTROL_RADIUS_PX,
          backgroundColor: inputActive ? "#eff6ff" : "color(display-p3 1 1 1)",
          boxShadow: inputActive
            ? "color(display-p3 0.267 0.503 0.967 / 50%) 0px 0px 0px 1.5px"
            : NEWSLETTER_FIELD_SHADOW,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
        }}
      >
        {typedDisplay ? (
          <span
            style={{
              fontSize: 13,
              color: "#333",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "0em",
            }}
          >
            {typedDisplay}
          </span>
        ) : (
          !inputActive && (
            <div
              style={{
                width: NEWSLETTER_INPUT_SKELETON_WIDTH_PX,
                height: 9,
                borderRadius: 999,
                backgroundColor: "color(display-p3 0.881 0.881 0.881)",
              }}
            />
          )
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: NEWSLETTER_BUTTON_SKELETON_LEFT_PX,
          top: NEWSLETTER_BUTTON_SKELETON_TOP_PX,
          width: NEWSLETTER_BUTTON_SKELETON_WIDTH_PX,
          height: NEWSLETTER_BUTTON_SKELETON_HEIGHT_PX,
          borderRadius: 999,
          backgroundColor: "color(display-p3 1 1 1 / 30%)",
        }}
      />
    </div>
  );
};

const getActiveCardIndex = (frame: number): number => {
  if (frame >= 65) return 2;
  if (frame >= 42) return 1;
  if (frame >= 12) return 0;
  return -1;
};

const renderDashboardPaperContent = (frame: number) => {
  const activeCard = getActiveCardIndex(frame);

  return (
    <div
      style={{
        position: "absolute",
        left: DASHBOARD_RT_ARTBOARD_LAYOUT_OFFSET_X_PX,
        top: DASHBOARD_RT_ARTBOARD_TOP_PX,
        width: DASHBOARD_RT_ARTBOARD_WIDTH_PX,
        height: DASHBOARD_RT_ARTBOARD_HEIGHT_PX,
        transform: `scale(${DASHBOARD_RT_ARTBOARD_SCALE})`,
        transformOrigin: "top left",
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: DASHBOARD_RT_ARTBOARD_WIDTH_PX,
          height: DASHBOARD_RT_ARTBOARD_HEIGHT_PX,
          borderRadius: 31,
          backgroundImage: FAQ_PAGE_BACKGROUND,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: DASHBOARD_RT_CHART_LEFT_PX,
          top: DASHBOARD_RT_CHART_TOP_PX,
          width: DASHBOARD_RT_CHART_WIDTH_PX,
          height: DASHBOARD_RT_CHART_HEIGHT_PX,
          borderRadius: 15,
          backgroundColor: "color(display-p3 1 1 1)",
          boxShadow: DASHBOARD_RT_CARD_SHADOW,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: DASHBOARD_RT_TITLE_LEFT_PX,
          top: DASHBOARD_RT_TITLE_TOP_PX,
          fontSize: 27,
          lineHeight: "41px",
          letterSpacing: "-0.03em",
          color: "#111111",
          fontFamily: DASHBOARD_RT_TITLE_FONT_FAMILY,
          fontWeight: 700,
        }}
      >
        Real-time dashboard
      </div>
      <div
        style={{
          position: "absolute",
          left: DASHBOARD_RT_LINE_LEFT_PX,
          top: DASHBOARD_RT_LINE_TOP_PX,
          width: DASHBOARD_RT_LINE_WIDTH_PX,
          height: DASHBOARD_RT_LINE_HEIGHT_PX,
          borderRadius: 999,
          backgroundColor: "color(display-p3 0.899 0.899 0.899)",
        }}
      />
      {DASHBOARD_RT_CARD_LEFTS_PX.map((leftPx, index) => (
        <div
          key={leftPx}
          style={{
            position: "absolute",
            left: leftPx,
            top: DASHBOARD_RT_CARD_TOP_PX,
            width: DASHBOARD_RT_CARD_WIDTH_PX,
            height: DASHBOARD_RT_CARD_HEIGHT_PX,
            borderRadius: 15,
            backgroundColor: index === activeCard ? "#f0f4ff" : "color(display-p3 1 1 1)",
            boxShadow:
              index === activeCard
                ? "color(display-p3 0.267 0.503 0.967 / 40%) 0px 0px 0px 1.5px, color(display-p3 0 0 0 / 3%) 0px 1px 5px"
                : DASHBOARD_RT_CARD_SHADOW,
          }}
        />
      ))}
      {DASHBOARD_RT_METRIC_LEFTS_PX.map((leftPx, index) => (
        <div
          key={`metric-${leftPx}`}
          style={{
            position: "absolute",
            left: leftPx,
            top: DASHBOARD_RT_METRIC_TOP_PX,
            fontSize: 27,
            lineHeight: "41px",
            letterSpacing: "-0.03em",
            color: "#111111",
            fontFamily: DASHBOARD_RT_METRIC_FONT_FAMILY,
            fontWeight: 600,
          }}
        >
          {DASHBOARD_RT_METRIC_VALUES[index]}
        </div>
      ))}
      {DASHBOARD_RT_METRIC_LEFTS_PX.map((leftPx) => (
        <div
          key={`sk-${leftPx}`}
          style={{
            position: "absolute",
            left: leftPx,
            top: DASHBOARD_RT_SKELETON_TOP_PX,
            width: DASHBOARD_RT_SKELETON_WIDTH_PX,
            height: DASHBOARD_RT_SKELETON_HEIGHT_PX,
            borderRadius: 999,
            backgroundColor: "color(display-p3 0.872 0.872 0.872)",
          }}
        />
      ))}
    </div>
  );
};

const renderCheckoutPaperContent = (frame: number) => {
  const field1Active = frame >= FIELD_1_START_FRAME && frame < FIELD_1_END_FRAME;
  const field1Chars = Math.min(
    CHECKOUT_FIELD_1_TEXT.length,
    Math.max(0, Math.floor((frame - FIELD_1_START_FRAME) * CHARS_PER_FRAME)),
  );
  const field1HasText = field1Chars > 0 || frame >= FIELD_1_END_FRAME;
  const field1Display = field1HasText
    ? field1Chars > 0
      ? CHECKOUT_FIELD_1_TEXT.slice(0, field1Chars)
      : CHECKOUT_FIELD_1_TEXT
    : undefined;

  const field2Active = frame >= FIELD_2_START_FRAME && frame < FIELD_2_END_FRAME;
  const field2Chars = Math.min(
    CHECKOUT_FIELD_2_TEXT.length,
    Math.max(0, Math.floor((frame - FIELD_2_START_FRAME) * CHARS_PER_FRAME)),
  );
  const field2HasText = field2Chars > 0 || frame >= FIELD_2_END_FRAME;
  const field2Display = field2HasText
    ? field2Chars > 0
      ? CHECKOUT_FIELD_2_TEXT.slice(0, field2Chars)
      : CHECKOUT_FIELD_2_TEXT
    : undefined;

  const btnPressed = frame >= BUTTON_PRESS_FRAME && frame < SUCCESS_FRAME;
  const activeFieldIndex = field2Active ? 1 : field1Active ? 0 : -1;

  return (
    <div
      style={{
        position: "absolute",
        left: CHECKOUT_PAPER_ARTBOARD_LAYOUT_OFFSET_X_PX,
        top: CHECKOUT_PAPER_ARTBOARD_TOP_PX,
        width: CHECKOUT_PAPER_ARTBOARD_WIDTH_PX,
        height: CHECKOUT_PAPER_ARTBOARD_HEIGHT_PX,
        transform: `scale(${CHECKOUT_PAPER_ARTBOARD_SCALE})`,
        transformOrigin: "top left",
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: CHECKOUT_PAPER_ARTBOARD_WIDTH_PX,
          height: CHECKOUT_PAPER_ARTBOARD_HEIGHT_PX,
          borderRadius: 31,
          backgroundImage: FAQ_PAGE_BACKGROUND,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: CHECKOUT_PAPER_TITLE_LEFT_PX,
          top: CHECKOUT_PAPER_TITLE_TOP_PX,
          fontSize: 27,
          lineHeight: "41px",
          letterSpacing: "-0.03em",
          color: "#111111",
          fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
          fontWeight: 700,
        }}
      >
        Create account
      </div>
      {CHECKOUT_PAPER_WHITE_FIELD_TOPS_PX.map((topPx, index) => {
        const isActive = index === activeFieldIndex;
        const displayText = index === 0 ? field1Display : index === 1 ? field2Display : undefined;

        return (
          <div
            key={topPx}
            style={{
              position: "absolute",
              left: CHECKOUT_PAPER_FIELD_LEFT_PX,
              top: topPx,
              width: CHECKOUT_PAPER_FIELD_WIDTH_PX,
              height: CHECKOUT_PAPER_FIELD_HEIGHT_PX,
              borderRadius: CHECKOUT_PAPER_CONTROL_RADIUS_PX,
              backgroundColor: isActive ? "#eff6ff" : "color(display-p3 1 1 1)",
              boxShadow: isActive
                ? "color(display-p3 0.267 0.503 0.967 / 50%) 0px 0px 0px 1.5px"
                : CHECKOUT_PAPER_FIELD_SHADOW,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
            }}
          >
            {displayText ? (
              <span
                style={{
                  fontSize: 13,
                  color: "#333",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {displayText}
              </span>
            ) : (
              !isActive && (
                <div
                  style={{
                    width: CHECKOUT_FIELD_SKELETON_WIDTH_PX,
                    height: 9,
                    borderRadius: 999,
                    backgroundColor: "color(display-p3 0.881 0.881 0.881)",
                  }}
                />
              )
            )}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: CHECKOUT_PAPER_FIELD_LEFT_PX,
          top: CHECKOUT_PAPER_BUTTON_TOP_PX,
          width: CHECKOUT_PAPER_FIELD_WIDTH_PX,
          height: CHECKOUT_PAPER_FIELD_HEIGHT_PX,
          borderRadius: CHECKOUT_PAPER_CONTROL_RADIUS_PX,
          backgroundColor: CHECKOUT_PAPER_BLUE,
          boxShadow: CHECKOUT_PAPER_FIELD_SHADOW,
          transform: btnPressed ? "scale(0.96)" : "scale(1)",
          transformOrigin: "center center",
        }}
      />
      {CHECKOUT_PAPER_SKELETONS.map((skeleton, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: skeleton.left,
            top: skeleton.top,
            width: skeleton.width,
            height: skeleton.height,
            borderRadius: 999,
            backgroundColor: skeleton.backgroundColor,
          }}
        />
      ))}
    </div>
  );
};

const renderVariantContent = (variant: PageVariant, frame: number) => {
  switch (variant) {
    case "signup":
      return renderSignupContent(frame);

    case "login":
      return renderFormContent(variant, frame);

    case "dashboard":
      return renderDashboardPaperContent(frame);

    case "profile":
      return (
        <div
          style={{
            padding: "30px 60px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#e8e8e8",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "#aaa",
            }}
          >
            JD
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#111",
              fontFamily: "system-ui",
              marginBottom: 6,
            }}
          >
            Jane Doe
          </div>
          <div style={{ fontSize: 13, color: "#999", fontFamily: "system-ui", marginBottom: 20 }}>
            jane@example.com
          </div>
          <div style={{ width: "100%" }}>
            {bar({ marginBottom: 10 })}
            {bar({ width: "75%", marginBottom: 10 })}
            {bar({ width: "85%" })}
          </div>
        </div>
      );

    case "checkout":
      return renderCheckoutPaperContent(frame);

    case "inbox":
      return (
        <div style={{ padding: "8px 0" }}>
          {["Alice Cooper", "DevOps Bot", "Jane Smith", "GitHub", "Team Standup"].map(
            (sender, index) => (
              <div
                key={sender}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 24px",
                  backgroundColor: index < 2 ? "#fafafa" : "transparent",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#e8e8e8",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: index < 2 ? 600 : 400,
                      color: "#333",
                      fontFamily: "system-ui",
                    }}
                  >
                    {sender}
                  </div>
                  {bar({ width: "70%", marginTop: 5, height: 8 })}
                </div>
              </div>
            ),
          )}
        </div>
      );

    case "kanban":
      return (
        <div style={{ display: "flex", gap: 12, padding: "12px 20px", height: 280 }}>
          {["To do", "In progress", "Done"].map((column) => (
            <div
              key={column}
              style={{
                flex: 1,
                backgroundColor: "#fafafa",
                borderRadius: 10,
                padding: 10,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#888",
                  fontFamily: "system-ui",
                  marginBottom: 10,
                }}
              >
                {column}
              </div>
              {Array.from({ length: column === "In progress" ? 2 : 3 }, (_, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {bar({ width: "80%", marginBottom: 6 })}
                  {bar({ width: "50%", height: 8 })}
                </div>
              ))}
            </div>
          ))}
        </div>
      );

    case "analytics":
      return renderNewsletterContent(frame);
  }
};

const renderFormContent = (variant: "signup" | "login", frame: number) => {
  const { buttonPressed, field1Active, field1Display, field2Active, field2Display, success } =
    getFormAnimationState(frame);
  const isLogin = variant === "login";

  return (
    <div style={{ padding: "32px 100px" }}>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: "#111",
          marginBottom: 20,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {isLogin ? "Welcome back" : "Sign up"}
      </div>

      <div
        style={{
          border: `2px solid ${field1Active ? "#3b82f6" : "#e0e0e0"}`,
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 12,
          fontSize: 15,
          fontFamily,
          color: "#333",
          backgroundColor: field1Active ? "#eff6ff" : "#fafafa",
          minHeight: 20,
        }}
      >
        {field1Display ?? <span style={{ color: "#bbb" }}>{isLogin ? "Username" : "Email"}</span>}
      </div>

      <div
        style={{
          border: `2px solid ${field2Active ? "#3b82f6" : "#e0e0e0"}`,
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 20,
          fontSize: 15,
          fontFamily,
          color: "#333",
          backgroundColor: field2Active ? "#eff6ff" : "#fafafa",
          minHeight: 20,
        }}
      >
        {field2Display ?? <span style={{ color: "#bbb" }}>Password</span>}
      </div>

      <div
        style={{
          backgroundColor: success ? "#22c55e" : "#111",
          color: "#fff",
          borderRadius: 8,
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          transform: buttonPressed ? "scale(0.96)" : "scale(1)",
        }}
      >
        {success ? "✓" : isLogin ? "Log in" : "Submit"}
      </div>
    </div>
  );
};

interface BrowserCellProps {
  frameOffset?: number;
  variant?: PageVariant;
}

interface ChromeToolbarButtonProps {
  children: ReactNode;
}

interface ChromeToolbarIconProps {
  children: ReactNode;
  viewBox?: string;
}

interface ChromeToolbarGlyphProps {
  children: ReactNode;
  fontSize?: number;
}

const ChromeToolbarButton = ({ children }: ChromeToolbarButtonProps) => (
  <div
    style={{
      width: CHROME_TOOLBAR_BUTTON_SIZE_PX,
      height: CHROME_TOOLBAR_BUTTON_SIZE_PX,
      borderRadius: 999,
      backgroundColor: CHROME_TOOLBAR_BUTTON_BACKGROUND,
      color: CHROME_TOOLBAR_BUTTON_COLOR,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

const ChromeToolbarIcon = ({ children, viewBox = "0 0 24 24" }: ChromeToolbarIconProps) => (
  <svg
    viewBox={viewBox}
    width={CHROME_TOOLBAR_BUTTON_ICON_SIZE_PX}
    height={CHROME_TOOLBAR_BUTTON_ICON_SIZE_PX}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    stroke="currentColor"
    strokeWidth={CHROME_TOOLBAR_ICON_STROKE_WIDTH_PX}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      width: CHROME_TOOLBAR_BUTTON_ICON_SIZE_PX,
      height: "auto",
      flexShrink: 0,
    }}
  >
    {children}
  </svg>
);

const ChromeToolbarGlyph = ({
  children,
  fontSize = CHROME_TOOLBAR_GLYPH_FONT_SIZE_PX,
}: ChromeToolbarGlyphProps) => (
  <span
    style={{
      fontSize,
      lineHeight: 1,
      fontFamily: "system-ui, sans-serif",
      fontWeight: 500,
      color: CHROME_TOOLBAR_BUTTON_COLOR,
      display: "block",
      transform: "translateY(-0.5px)",
    }}
  >
    {children}
  </span>
);

const ChromeBrowserToolbar = () => (
  <div
    style={{
      flexShrink: 0,
      height: CHROME_TOOLBAR_HEIGHT_PX,
      backgroundColor: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: `${CHROME_TOOLBAR_PADDING_TOP_PX}px ${CHROME_TOOLBAR_PADDING_RIGHT_PX}px ${CHROME_TOOLBAR_PADDING_BOTTOM_PX}px ${CHROME_TOOLBAR_PADDING_LEFT_PX}px`,
      boxSizing: "border-box",
      fontSynthesis: "none",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
    }}
  >
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: CHROME_TOOLBAR_CONTENT_GAP_PX,
      }}
    >
      <div
        style={{
          width: CHROME_TOOLBAR_GROUP_WIDTH_PX,
          display: "flex",
          alignItems: "center",
          gap: CHROME_TOOLBAR_GROUP_GAP_PX,
          flexShrink: 0,
        }}
      >
        <ChromeToolbarButton>
          <ChromeToolbarGlyph>&larr;</ChromeToolbarGlyph>
        </ChromeToolbarButton>
        <ChromeToolbarButton>
          <ChromeToolbarGlyph>&rarr;</ChromeToolbarGlyph>
        </ChromeToolbarButton>
        <ChromeToolbarButton>
          <ChromeToolbarGlyph fontSize={CHROME_TOOLBAR_REFRESH_GLYPH_FONT_SIZE_PX}>
            ↻
          </ChromeToolbarGlyph>
        </ChromeToolbarButton>
      </div>

      <div
        style={{
          width: CHROME_OMNIBOX_WIDTH_PX,
          maxWidth: "100%",
          flexShrink: 1,
          borderRadius: 999,
          backgroundColor: "color(display-p3 1 1 1)",
          boxShadow: CHROME_OMNIBOX_SHADOW,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: CHROME_OMNIBOX_GAP_PX,
          padding: `${CHROME_OMNIBOX_VERTICAL_PADDING_PX}px ${CHROME_OMNIBOX_HORIZONTAL_PADDING_PX}px`,
        }}
      >
        <svg
          viewBox="0 0 190.5 190.5"
          width={CHROME_OMNIBOX_ICON_SIZE_PX}
          height={CHROME_OMNIBOX_ICON_SIZE_PX}
          xmlns="http://www.w3.org/2000/svg"
          style={{
            width: CHROME_OMNIBOX_ICON_SIZE_PX,
            height: "auto",
            flexShrink: 0,
          }}
        >
          <path
            fill="#FFFFFF"
            d="M95.252 142.873c26.304 0 47.627-21.324 47.627-47.628s-21.323-47.628-47.627-47.628-47.627 21.324-47.627 47.628 21.323 47.628 47.627 47.628z"
          />
          <path
            fill="#229342"
            d="m54.005 119.07-41.24-71.43a95.227 95.227 0 0 0-.003 95.25 95.234 95.234 0 0 0 82.496 47.61l41.24-71.43v-.011a47.613 47.613 0 0 1-17.428 17.443 47.62 47.62 0 0 1-47.632.007 47.62 47.62 0 0 1-17.433-17.437z"
          />
          <path
            fill="#FBC116"
            d="m136.495 119.067-41.239 71.43a95.229 95.229 0 0 0 82.489-47.622A95.24 95.24 0 0 0 190.5 95.248a95.237 95.237 0 0 0-12.772-47.623H95.249l-.01.007a47.62 47.62 0 0 1 23.819 6.372 47.618 47.618 0 0 1 17.439 17.431 47.62 47.62 0 0 1-.001 47.633z"
          />
          <path
            fill="#1A73E8"
            d="M95.252 132.961c20.824 0 37.705-16.881 37.705-37.706S116.076 57.55 95.252 57.55 57.547 74.431 57.547 95.255s16.881 37.706 37.705 37.706z"
          />
          <path
            fill="#E33B2E"
            d="M95.252 47.628h82.479A95.237 95.237 0 0 0 142.87 12.76 95.23 95.23 0 0 0 95.245 0a95.222 95.222 0 0 0-47.623 12.767 95.23 95.23 0 0 0-34.856 34.872l41.24 71.43.011.006a47.62 47.62 0 0 1-.015-47.633 47.61 47.61 0 0 1 41.252-23.815z"
          />
        </svg>
        <div
          style={{
            fontSize: 14,
            lineHeight: "18px",
            letterSpacing: "0em",
            fontFamily: CHROME_OMNIBOX_FONT_FAMILY,
            fontWeight: 500,
            color: CHROME_OMNIBOX_TEXT_COLOR,
            flexShrink: 0,
          }}
        >
          localhost:3000
        </div>
      </div>

      <div
        style={{
          width: CHROME_TOOLBAR_GROUP_WIDTH_PX,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: CHROME_TOOLBAR_GROUP_GAP_PX,
          flexShrink: 0,
        }}
      >
        <ChromeToolbarButton>
          <ChromeToolbarIcon>
            <path d="M12 3.75l2.547 5.163 5.698.828-4.122 4.018.973 5.677L12 16.757l-5.096 2.679.974-5.677-4.123-4.018 5.699-.828L12 3.75Z" />
          </ChromeToolbarIcon>
        </ChromeToolbarButton>
        <ChromeToolbarButton>
          <ChromeToolbarIcon>
            <rect x="5.25" y="6.25" width="13.5" height="11.5" rx="2.25" />
            <path d="M13.5 6.25v11.5" />
          </ChromeToolbarIcon>
        </ChromeToolbarButton>
        <ChromeToolbarButton>
          <ChromeToolbarIcon>
            <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
          </ChromeToolbarIcon>
        </ChromeToolbarButton>
      </div>
    </div>
  </div>
);

export const BrowserCell = ({ frameOffset = 0, variant = "signup" }: BrowserCellProps) => {
  const faqPlaneFilterId = useId().replace(/:/g, "");
  const analyticsPlaneFilterId = useId().replace(/:/g, "");
  const dashboardPlaneFilterId = useId().replace(/:/g, "");
  const checkoutPlaneFilterId = useId().replace(/:/g, "");
  const rawFrame = useCurrentFrame();
  const frame = rawFrame + frameOffset;

  const faqHotspot = variant === "signup" ? getFaqCursorHotspot(frame) : undefined;
  const newsletterHotspot = variant === "analytics" ? getNewsletterCursorHotspot(frame) : undefined;
  const dashboardHotspot = variant === "dashboard" ? getDashboardCursorHotspot(frame) : undefined;
  const checkoutHotspot = variant === "checkout" ? getCheckoutCursorHotspot(frame) : undefined;
  const cursorX =
    faqHotspot !== undefined
      ? faqHotspot.x
      : newsletterHotspot !== undefined
        ? newsletterHotspot.x
        : dashboardHotspot !== undefined
          ? dashboardHotspot.x
          : checkoutHotspot !== undefined
            ? checkoutHotspot.x
            : interpolate(frame, CURSOR_KEYFRAMES, CURSOR_X_VALUES, {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
  const cursorY =
    faqHotspot !== undefined
      ? faqHotspot.y
      : newsletterHotspot !== undefined
        ? newsletterHotspot.y
        : dashboardHotspot !== undefined
          ? dashboardHotspot.y
          : checkoutHotspot !== undefined
            ? checkoutHotspot.y
            : interpolate(frame, CURSOR_KEYFRAMES, CURSOR_Y_VALUES, {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

  const CLICK_DURATION = 3;
  const isClickFrame = (clickFrame: number) =>
    frame >= clickFrame && frame < clickFrame + CLICK_DURATION;
  const buttonPressed =
    isClickFrame(12) || isClickFrame(42) || isClickFrame(65) || isClickFrame(BUTTON_PRESS_FRAME);

  return (
    <div
      style={{
        width: CELL_WIDTH_PX,
        height: CELL_HEIGHT_PX,
        borderRadius: CHROME_WINDOW_OUTER_RADIUS_PX,
        overflow: "hidden",
        backgroundColor: "#edeef0",
        position: "relative",
        boxShadow:
          "0 8px 28px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.08)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ChromeBrowserToolbar />

      <div
        style={{
          flex: 1,
          position: "relative",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        {renderVariantContent(variant, frame)}
      </div>

      {variant === "signup" ? (
        <div
          style={{
            position: "absolute",
            left: cursorX - FAQ_COMPOSITE_HOTSPOT_X_PX,
            top: cursorY - FAQ_COMPOSITE_HOTSPOT_Y_PX,
            width: FAQ_COMPOSITE_WIDTH_PX,
            height: FAQ_COMPOSITE_HEIGHT_PX,
            pointerEvents: "none",
            transform: buttonPressed ? "scale(0.92)" : "scale(1)",
            transformOrigin: `${FAQ_COMPOSITE_HOTSPOT_X_PX}px ${FAQ_COMPOSITE_HOTSPOT_Y_PX}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: FAQ_COMPOSITE_BADGE_LEFT_PX,
              top: FAQ_COMPOSITE_BADGE_TOP_PX,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              width: "fit-content",
              borderRadius: 999,
              backgroundColor: FAQ_COMPOSITE_ORANGE,
              outline: "3px solid #ffffff",
              boxShadow: FAQ_COMPOSITE_BADGE_SHADOW,
              zIndex: 1,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={30}
              height={30}
              fill="none"
              style={{ flexShrink: 0, color: "#FFFFFF" }}
            >
              <path
                d="M13.998 21.75C16.253 21.75 18.033 21.75 19.352 21.554C20.69 21.354 21.776 20.922 22.376 19.863L22.48 19.664C22.951 18.661 22.758 17.571 22.276 16.395C21.893 15.457 21.277 14.348 20.499 13.02L19.669 11.616L17.744 8.371L17.698 8.293C16.596 6.434 15.723 4.963 14.911 3.965C14.083 2.946 13.184 2.25 12 2.25C10.816 2.25 9.917 2.946 9.089 3.965C8.472 4.724 7.819 5.756 7.057 7.024L6.256 8.371L4.331 11.616L4.283 11.696C3.135 13.633 2.228 15.161 1.724 16.395C1.21 17.65 1.025 18.806 1.624 19.863L1.742 20.055C2.36 20.975 3.393 21.367 4.648 21.554C5.967 21.75 7.747 21.75 10.002 21.75L13.998 21.75ZM12 14.5C11.448 14.5 11 14.052 11 13.5V9C11 8.448 11.448 8 12 8C12.552 8 13 8.448 13 9V13.5C13 14.052 12.552 14.5 12 14.5ZM12 18.002C11.448 18.002 11 17.554 11 17.002V16.992C11 16.44 11.448 15.992 12 15.992C12.552 15.992 13 16.44 13 16.992V17.002C13 17.554 12.552 18.002 12 18.002Z"
                fill="#FFFFFF"
              />
            </svg>
            <div
              style={{
                width: "fit-content",
                letterSpacing: "-0.01em",
                height: 17,
                fontSize: 22,
                lineHeight: "18px",
                color: "#ffffff",
                fontFamily: FAQ_TITLE_FONT_FAMILY,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Slow app
            </div>
          </div>
          <svg
            width={33}
            height={32}
            viewBox="0 0 33 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: FAQ_COMPOSITE_POINTER_RENDER_WIDTH_PX,
              height: "auto",
              zIndex: 2,
            }}
          >
            <defs>
              <filter
                id={faqPlaneFilterId}
                x="0"
                y="0.5"
                width="20"
                height="20"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dy="1" />
                <feGaussianBlur stdDeviation="1.5" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0" />
                <feBlend
                  mode="normal"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_2399_8369"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_2399_8369"
                  result="shape"
                />
              </filter>
            </defs>
            <g filter={`url(#${faqPlaneFilterId})`}>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.439 2.939C3.855 2.523 4.476 2.389 5.027 2.596L16.027 6.721C16.642 6.951 17.035 7.555 16.998 8.21C16.96 8.866 16.501 9.421 15.864 9.58L11.237 10.737L10.08 15.364C9.921 16.001 9.366 16.46 8.71 16.498C8.055 16.535 7.451 16.142 7.221 15.527L3.096 4.527C2.889 3.976 3.023 3.355 3.439 2.939Z"
                fill="#FFFFFF"
              />
            </g>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.676 3.532C4.492 3.463 4.285 3.508 4.146 3.646C4.008 3.785 3.963 3.992 4.032 4.176L8.157 15.176C8.234 15.38 8.435 15.512 8.653 15.499C8.872 15.487 9.057 15.334 9.11 15.121L10.412 9.912L15.621 8.61C15.834 8.557 15.987 8.372 15.999 8.153C16.012 7.935 15.88 7.734 15.676 7.657L4.676 3.532Z"
              fill="#FF9300"
            />
          </svg>
        </div>
      ) : variant === "analytics" ? (
        <div
          style={{
            position: "absolute",
            left: cursorX - FAQ_COMPOSITE_HOTSPOT_X_PX,
            top: cursorY - FAQ_COMPOSITE_HOTSPOT_Y_PX,
            width: NEWSLETTER_COMPOSITE_WIDTH_PX,
            height: NEWSLETTER_COMPOSITE_HEIGHT_PX,
            pointerEvents: "none",
            transform: buttonPressed ? "scale(0.92)" : "scale(1)",
            transformOrigin: `${FAQ_COMPOSITE_HOTSPOT_X_PX}px ${FAQ_COMPOSITE_HOTSPOT_Y_PX}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: NEWSLETTER_COMPOSITE_BADGE_LEFT_PX,
              top: NEWSLETTER_COMPOSITE_BADGE_TOP_PX,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              width: "fit-content",
              borderRadius: 999,
              backgroundColor: NEWSLETTER_COMPOSITE_BADGE_BACKGROUND,
              outline: NEWSLETTER_COMPOSITE_BADGE_OUTLINE,
              boxShadow: NEWSLETTER_COMPOSITE_BADGE_SHADOW,
              zIndex: 1,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={30}
              height={30}
              fill="none"
              style={{ flexShrink: 0, color: "#FFFFFF" }}
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M7.139 16.124C6.065 16.124 5.194 16.963 5.194 17.999C5.194 19.035 6.065 19.874 7.139 19.874C8.213 19.874 9.083 19.035 9.083 17.999C9.083 16.963 8.213 16.124 7.139 16.124ZM3.25 17.999C3.25 15.928 4.991 14.249 7.139 14.249C8.578 14.249 9.835 15.003 10.508 16.124H13.492C14.165 15.003 15.422 14.249 16.861 14.249C19.009 14.249 20.75 15.928 20.75 17.999C20.75 20.07 19.009 21.749 16.861 21.749C14.713 21.749 12.972 20.07 12.972 17.999L11.028 17.999C11.028 20.07 9.287 21.749 7.139 21.749C4.991 21.749 3.25 20.07 3.25 17.999ZM16.861 16.124C15.787 16.124 14.917 16.963 14.917 17.999C14.917 19.035 15.787 19.874 16.861 19.874C17.935 19.874 18.806 19.035 18.806 17.999C18.806 16.963 17.935 16.124 16.861 16.124Z"
                fill="#FFFFFF"
              />
              <path
                d="M5.316 4.596C5.61 2.71 7.673 1.663 9.353 2.592L9.968 2.932C11.235 3.632 12.765 3.632 14.031 2.932L14.646 2.592C16.327 1.663 18.39 2.71 18.683 4.596L19.741 11.384C19.779 11.627 19.695 11.873 19.517 12.043C19.338 12.213 19.088 12.284 18.847 12.234C16.732 11.794 10.967 11.166 5.135 12.237C4.896 12.281 4.651 12.206 4.477 12.037C4.303 11.867 4.221 11.624 4.259 11.384L5.316 4.596Z"
                fill="#FFFFFF"
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12.001 11.999C8.226 11.999 4.896 12.658 2.665 13.657C2.182 13.873 1.595 13.697 1.354 13.265C1.113 12.833 1.308 12.307 1.791 12.091C4.361 10.941 8.009 10.249 12.001 10.249C15.992 10.249 19.64 10.941 22.21 12.091C22.693 12.307 22.889 12.833 22.647 13.265C22.406 13.697 21.819 13.873 21.336 13.657C19.105 12.658 15.775 11.999 12.001 11.999Z"
                fill="#FFFFFF"
              />
            </svg>
            <div
              style={{
                width: "fit-content",
                letterSpacing: "-0.01em",
                height: 17,
                fontSize: 22,
                lineHeight: "18px",
                color: "color(display-p3 1 1 1)",
                fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Vulnerable
            </div>
          </div>
          <svg
            width={33}
            height={32}
            viewBox="0 0 33 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: NEWSLETTER_COMPOSITE_POINTER_RENDER_WIDTH_PX,
              height: "auto",
              zIndex: 2,
            }}
          >
            <defs>
              <filter
                id={analyticsPlaneFilterId}
                x="0"
                y="0.5"
                width="20"
                height="20"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dy="1" />
                <feGaussianBlur stdDeviation="1.5" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0" />
                <feBlend
                  mode="normal"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_2399_8369"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_2399_8369"
                  result="shape"
                />
              </filter>
            </defs>
            <g filter={`url(#${analyticsPlaneFilterId})`}>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.439 2.939C3.855 2.523 4.476 2.389 5.027 2.596L16.027 6.721C16.642 6.951 17.035 7.555 16.998 8.21C16.96 8.866 16.501 9.421 15.864 9.58L11.237 10.737L10.08 15.364C9.921 16.001 9.366 16.46 8.71 16.498C8.055 16.535 7.451 16.142 7.221 15.527L3.096 4.527C2.889 3.976 3.023 3.355 3.439 2.939Z"
                fill="#FFFFFF"
              />
            </g>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.676 3.532C4.492 3.463 4.285 3.508 4.146 3.646C4.008 3.785 3.963 3.992 4.032 4.176L8.157 15.176C8.234 15.38 8.435 15.512 8.653 15.499C8.872 15.487 9.057 15.334 9.11 15.121L10.412 9.912L15.621 8.61C15.834 8.557 15.987 8.372 15.999 8.153C16.012 7.935 15.88 7.734 15.676 7.657L4.676 3.532Z"
              fill="#FF0000"
            />
          </svg>
        </div>
      ) : variant === "dashboard" ? (
        <div
          style={{
            position: "absolute",
            left: cursorX - FAQ_COMPOSITE_HOTSPOT_X_PX,
            top: cursorY - FAQ_COMPOSITE_HOTSPOT_Y_PX,
            width: DASHBOARD_CURSOR_COMPOSITE_WIDTH_PX,
            height: DASHBOARD_CURSOR_COMPOSITE_HEIGHT_PX,
            pointerEvents: "none",
            transform: buttonPressed ? "scale(0.92)" : "scale(1)",
            transformOrigin: `${FAQ_COMPOSITE_HOTSPOT_X_PX}px ${FAQ_COMPOSITE_HOTSPOT_Y_PX}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: DASHBOARD_CURSOR_BADGE_LEFT_PX,
              top: DASHBOARD_CURSOR_BADGE_TOP_PX,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              width: "fit-content",
              borderRadius: 999,
              backgroundColor: NEWSLETTER_COMPOSITE_BADGE_BACKGROUND,
              outline: NEWSLETTER_COMPOSITE_BADGE_OUTLINE,
              boxShadow: NEWSLETTER_COMPOSITE_BADGE_SHADOW,
              zIndex: 1,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={30}
              height={30}
              fill="none"
              style={{ flexShrink: 0, color: "#FFFFFF" }}
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M17.158 2.247C17.574 2.61 17.616 3.242 17.253 3.658L15.453 5.719C15.09 6.135 14.458 6.178 14.042 5.814C13.626 5.451 13.584 4.819 13.947 4.403L15.747 2.342C16.11 1.926 16.742 1.884 17.158 2.247ZM6.842 2.247C7.258 1.884 7.89 1.926 8.253 2.342L10.053 4.403C10.416 4.819 10.374 5.451 9.958 5.814C9.542 6.178 8.91 6.135 8.547 5.719L6.747 3.658C6.384 3.242 6.426 2.61 6.842 2.247ZM3 5.6C3.552 5.6 4 6.048 4 6.6C4 7.399 4.244 8.083 4.591 8.546C4.937 9.008 5.34 9.2 5.7 9.2C6.252 9.2 6.7 9.648 6.7 10.2C6.7 10.752 6.252 11.2 5.7 11.2C4.569 11.2 3.621 10.586 2.991 9.746C2.36 8.905 2 7.79 2 6.6C2 6.048 2.448 5.6 3 5.6ZM21 5.6C21.552 5.6 22 6.048 22 6.6C22 7.79 21.64 8.905 21.009 9.746C20.378 10.586 19.431 11.2 18.3 11.2C17.748 11.2 17.3 10.752 17.3 10.2C17.3 9.648 17.748 9.2 18.3 9.2C18.66 9.2 19.063 9.008 19.409 8.546C19.756 8.083 20 7.399 20 6.6C20 6.048 20.448 5.6 21 5.6ZM2 13.8C2 13.248 2.448 12.8 3 12.8H5.7C6.252 12.8 6.7 13.248 6.7 13.8C6.7 14.352 6.252 14.8 5.7 14.8H3C2.448 14.8 2 14.352 2 13.8ZM17.3 13.8C17.3 13.248 17.748 12.8 18.3 12.8H21C21.552 12.8 22 13.248 22 13.8C22 14.352 21.552 14.8 21 14.8H18.3C17.748 14.8 17.3 14.352 17.3 13.8ZM3.891 17.854C4.521 17.014 5.469 16.4 6.6 16.4C7.152 16.4 7.6 16.848 7.6 17.4C7.6 17.952 7.152 18.4 6.6 18.4C6.24 18.4 5.837 18.592 5.491 19.054C5.144 19.517 4.9 20.201 4.9 21C4.9 21.552 4.452 22 3.9 22C3.348 22 2.9 21.552 2.9 21C2.9 19.811 3.26 18.695 3.891 17.854ZM16.4 17.4C16.4 16.848 16.848 16.4 17.4 16.4C18.531 16.4 19.479 17.014 20.109 17.854C20.74 18.695 21.1 19.811 21.1 21C21.1 21.552 20.652 22 20.1 22C19.548 22 19.1 21.552 19.1 21C19.1 20.201 18.856 19.517 18.509 19.054C18.163 18.592 17.76 18.4 17.4 18.4C16.848 18.4 16.4 17.952 16.4 17.4Z"
                fill="#FFFFFF"
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.188 9.027C6.072 8.958 6.014 8.924 5.957 8.915C5.86 8.9 5.753 8.938 5.687 9.012C5.648 9.055 5.627 9.115 5.583 9.235C5.174 10.366 4.949 11.613 4.949 12.901C4.949 17.602 7.941 21.751 11.999 21.751C16.057 21.751 19.049 17.602 19.049 12.901C19.049 11.597 18.819 10.335 18.4 9.193C18.367 9.105 18.351 9.061 18.326 9.027C18.252 8.926 18.112 8.88 17.993 8.919C17.952 8.931 17.911 8.959 17.828 9.015C16.485 9.986 14.95 10.635 13.301 10.861C13.032 10.898 12.897 10.916 12.823 11.001C12.749 11.086 12.749 11.215 12.749 11.475L12.749 13.799C12.749 14.214 12.414 14.549 11.999 14.549C11.585 14.549 11.249 14.214 11.249 13.799L11.249 11.475C11.249 11.215 11.249 11.086 11.176 11.001C11.102 10.916 10.967 10.898 10.698 10.861C9.056 10.636 7.527 9.991 6.188 9.027ZM6.79 6.93C6.627 7.155 6.546 7.268 6.573 7.398C6.6 7.527 6.725 7.602 6.976 7.751L7.012 7.772L7.04 7.792C8.5 8.85 10.196 9.449 11.999 9.449C13.803 9.449 15.499 8.85 16.959 7.792L16.97 7.784L17.047 7.732C17.279 7.577 17.394 7.5 17.416 7.374C17.439 7.249 17.361 7.141 17.206 6.926C15.942 5.179 14.116 4.051 11.999 4.051C9.881 4.051 8.054 5.181 6.79 6.93Z"
                fill="#FFFFFF"
              />
            </svg>
            <div
              style={{
                width: "fit-content",
                letterSpacing: "-0.01em",
                height: 17,
                fontSize: 22,
                lineHeight: "18px",
                color: "color(display-p3 1 1 1)",
                fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Error
            </div>
          </div>
          <svg
            width={33}
            height={32}
            viewBox="0 0 33 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: NEWSLETTER_COMPOSITE_POINTER_RENDER_WIDTH_PX,
              height: "auto",
              zIndex: 2,
            }}
          >
            <defs>
              <filter
                id={dashboardPlaneFilterId}
                x="0"
                y="0.5"
                width="20"
                height="20"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dy="1" />
                <feGaussianBlur stdDeviation="1.5" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0" />
                <feBlend
                  mode="normal"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_2399_8369"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_2399_8369"
                  result="shape"
                />
              </filter>
            </defs>
            <g filter={`url(#${dashboardPlaneFilterId})`}>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.439 2.939C3.855 2.523 4.476 2.389 5.027 2.596L16.027 6.721C16.642 6.951 17.035 7.555 16.998 8.21C16.96 8.866 16.501 9.421 15.864 9.58L11.237 10.737L10.08 15.364C9.921 16.001 9.366 16.46 8.71 16.498C8.055 16.535 7.451 16.142 7.221 15.527L3.096 4.527C2.889 3.976 3.023 3.355 3.439 2.939Z"
                fill="#FFFFFF"
              />
            </g>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.676 3.532C4.492 3.463 4.285 3.508 4.146 3.646C4.008 3.785 3.963 3.992 4.032 4.176L8.157 15.176C8.234 15.38 8.435 15.512 8.653 15.499C8.872 15.487 9.057 15.334 9.11 15.121L10.412 9.912L15.621 8.61C15.834 8.557 15.987 8.372 15.999 8.153C16.012 7.935 15.88 7.734 15.676 7.657L4.676 3.532Z"
              fill="#FF0000"
            />
          </svg>
        </div>
      ) : variant === "checkout" ? (
        <div
          style={{
            position: "absolute",
            left: cursorX - FAQ_COMPOSITE_HOTSPOT_X_PX,
            top: cursorY - FAQ_COMPOSITE_HOTSPOT_Y_PX,
            width: CHECKOUT_CURSOR_COMPOSITE_WIDTH_PX,
            height: CHECKOUT_CURSOR_COMPOSITE_HEIGHT_PX,
            pointerEvents: "none",
            transform: buttonPressed ? "scale(0.92)" : "scale(1)",
            transformOrigin: `${FAQ_COMPOSITE_HOTSPOT_X_PX}px ${FAQ_COMPOSITE_HOTSPOT_Y_PX}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: CHECKOUT_CURSOR_BADGE_LEFT_PX,
              top: CHECKOUT_CURSOR_BADGE_TOP_PX,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              width: "fit-content",
              borderRadius: 999,
              backgroundColor: CHECKOUT_COMPOSITE_BADGE_BACKGROUND,
              outline: CHECKOUT_COMPOSITE_BADGE_OUTLINE,
              boxShadow: CHECKOUT_COMPOSITE_BADGE_SHADOW,
              zIndex: 1,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={30}
              height={30}
              fill="none"
              style={{ flexShrink: 0, color: "#FFFFFF" }}
            >
              <path
                d="M13.998 21.75C16.253 21.75 18.033 21.75 19.352 21.554C20.69 21.354 21.776 20.922 22.376 19.863L22.48 19.664C22.951 18.661 22.758 17.571 22.276 16.395C21.893 15.457 21.277 14.348 20.499 13.02L19.669 11.616L17.744 8.371L17.698 8.293C16.596 6.434 15.723 4.963 14.911 3.965C14.083 2.946 13.184 2.25 12 2.25C10.816 2.25 9.917 2.946 9.089 3.965C8.472 4.724 7.819 5.756 7.057 7.024L6.256 8.371L4.331 11.616L4.283 11.696C3.135 13.633 2.228 15.161 1.724 16.395C1.21 17.65 1.025 18.806 1.624 19.863L1.742 20.055C2.36 20.975 3.393 21.367 4.648 21.554C5.967 21.75 7.747 21.75 10.002 21.75L13.998 21.75ZM12 14.5C11.448 14.5 11 14.052 11 13.5V9C11 8.448 11.448 8 12 8C12.552 8 13 8.448 13 9V13.5C13 14.052 12.552 14.5 12 14.5ZM12 18.002C11.448 18.002 11 17.554 11 17.002V16.992C11 16.44 11.448 15.992 12 15.992C12.552 15.992 13 16.44 13 16.992V17.002C13 17.554 12.552 18.002 12 18.002Z"
                fill="#FFFFFF"
              />
            </svg>
            <div
              style={{
                width: "fit-content",
                letterSpacing: "-0.01em",
                height: 17,
                fontSize: 22,
                lineHeight: "18px",
                color: "color(display-p3 1 1 1)",
                fontFamily: FAQ_SIGNUP_TITLE_FONT_FAMILY,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              500 error
            </div>
          </div>
          <svg
            width={33}
            height={32}
            viewBox="0 0 33 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: NEWSLETTER_COMPOSITE_POINTER_RENDER_WIDTH_PX,
              height: "auto",
              zIndex: 2,
            }}
          >
            <defs>
              <filter
                id={checkoutPlaneFilterId}
                x="0"
                y="0.5"
                width="20"
                height="20"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dy="1" />
                <feGaussianBlur stdDeviation="1.5" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0" />
                <feBlend
                  mode="normal"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_2399_8369"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_2399_8369"
                  result="shape"
                />
              </filter>
            </defs>
            <g filter={`url(#${checkoutPlaneFilterId})`}>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.439 2.939C3.855 2.523 4.476 2.389 5.027 2.596L16.027 6.721C16.642 6.951 17.035 7.555 16.998 8.21C16.96 8.866 16.501 9.421 15.864 9.58L11.237 10.737L10.08 15.364C9.921 16.001 9.366 16.46 8.71 16.498C8.055 16.535 7.451 16.142 7.221 15.527L3.096 4.527C2.889 3.976 3.023 3.355 3.439 2.939Z"
                fill="#FFFFFF"
              />
            </g>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4.676 3.532C4.492 3.463 4.285 3.508 4.146 3.646C4.008 3.785 3.963 3.992 4.032 4.176L8.157 15.176C8.234 15.38 8.435 15.512 8.653 15.499C8.872 15.487 9.057 15.334 9.11 15.121L10.412 9.912L15.621 8.61C15.834 8.557 15.987 8.372 15.999 8.153C16.012 7.935 15.88 7.734 15.676 7.657L4.676 3.532Z"
              fill="#FF0000"
            />
          </svg>
        </div>
      ) : (
        <svg
          width="32"
          height="33"
          viewBox="0 0 32 33"
          style={{
            position: "absolute",
            left: cursorX - POINTER_CURSOR_LEFT_OFFSET_PX,
            top: cursorY - POINTER_CURSOR_TOP_OFFSET_PX,
            width: POINTER_CURSOR_RENDER_WIDTH_PX,
            height: POINTER_CURSOR_RENDER_HEIGHT_PX,
            pointerEvents: "none",
            transform: buttonPressed ? "scale(0.8)" : "scale(1)",
            transformOrigin: `${POINTER_CURSOR_HOTSPOT_X_PX}px ${POINTER_CURSOR_HOTSPOT_Y_PX}px`,
          }}
        >
          <defs>
            <filter
              id="browser-cell-pointer-shadow"
              x="-2"
              y="-2"
              width="36"
              height="36"
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feOffset />
              <feGaussianBlur stdDeviation="1" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0" />
              <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1_316" />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_1_316"
                result="shape"
              />
            </filter>
          </defs>
          <g filter="url(#browser-cell-pointer-shadow)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M16.501 13.86L24.884 22.261C25.937 23.317 25.19 25.119 23.699 25.119L22.475 25.119L23.691 28.007C23.904 28.513 23.907 29.073 23.7 29.582C23.492 30.092 23.098 30.49 22.59 30.703C22.334 30.81 22.066 30.864 21.792 30.864C20.961 30.864 20.216 30.369 19.894 29.603L18.616 26.565L17.784 27.303C16.703 28.259 15 27.492 15 26.048V14.481C15 13.697 15.947 13.305 16.501 13.86Z"
              fill="#FFFFFF"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.999 15.129C15.999 14.998 16.159 14.932 16.25 15.025L24.159 22.95C24.59 23.382 24.284 24.119 23.674 24.119L20.97 24.118L22.769 28.394C22.996 28.934 22.742 29.555 22.203 29.781C21.662 30.008 21.042 29.755 20.816 29.216L18.998 24.892L17.139 26.539C16.723 26.907 16.081 26.651 16.007 26.127L15.999 26.026V15.129Z"
              fill="#000000"
            />
          </g>
        </svg>
      )}
    </div>
  );
};
