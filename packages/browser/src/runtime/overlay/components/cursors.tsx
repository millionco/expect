import type { CursorShape } from "../lib/constants";
import { PointerCursor } from "./cursor-pointer";

export const detectCursorShape = (_x: number, _y: number): CursorShape => "pointer";

export const CursorIcon = (_props: { shape: CursorShape }) => <PointerCursor />;
