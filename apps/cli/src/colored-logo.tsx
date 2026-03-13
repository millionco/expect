import { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./constants.js";

const EYE_WIDTH = 20;
const EYE_HEIGHT = 10;
const EYE_GAP = -2;
const RENDER_WIDTH = EYE_WIDTH * 2 + EYE_GAP;
const RENDER_HEIGHT = EYE_HEIGHT;
const FRAME_INTERVAL_MS = 50;
const SPHERE_RADIUS = 1.2;
const SPHERE_STEPS = 55;
const PERSPECTIVE_DISTANCE = 4;
const SCALE_X = 6;
const SCALE_Y = 3;
const PUPIL_RADIUS = 0.55;
const IRIS_MULTIPLIER = 2.2;
const GLINT_OFFSET_X = -0.18;
const GLINT_OFFSET_Y = -0.25;
const GLINT_RADIUS = 0.2;
const SECONDARY_GLINT_OFFSET_X = 0.12;
const SECONDARY_GLINT_OFFSET_Y = 0.15;
const SECONDARY_GLINT_RADIUS = 0.1;
const PUPIL_MAX_X = 0.4;
const PUPIL_MAX_Y = 0.25;
const SMOOTHING_FACTOR = 1;
const MOUSE_SENSITIVITY_X = 20;
const MOUSE_SENSITIVITY_Y = 10;
const MOUSE_ENABLE = "\x1b[?1003h\x1b[?1006h";
const MOUSE_DISABLE = "\x1b[?1003l\x1b[?1006l";
const CURSOR_POSITION_QUERY = "\x1b[6n";
const MOUSE_SGR_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const CURSOR_POSITION_PATTERN = /\x1b\[(\d+);(\d+)R/;

const SHADING = " .·:*";

interface Cell {
  char: string;
  zone: string;
}

interface PupilTarget {
  x: number;
  y: number;
  z: number;
}

const lerp = (from: number, to: number, factor: number): number =>
  from + (to - from) * factor;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const renderEye = (pupil: PupilTarget, offsetX: number, grid: Cell[][], zBuffer: number[][]) => {
  const eyeCenterX = offsetX + EYE_WIDTH / 2;
  const eyeCenterY = EYE_HEIGHT / 2;

  for (let theta = 0; theta < SPHERE_STEPS; theta++) {
    const thetaAngle = (theta / SPHERE_STEPS) * Math.PI * 2;
    const cosTheta = Math.cos(thetaAngle);
    const sinTheta = Math.sin(thetaAngle);

    for (let phi = 0; phi < SPHERE_STEPS; phi++) {
      const phiAngle = (phi / SPHERE_STEPS) * Math.PI;
      const sinPhi = Math.sin(phiAngle);

      const normalX = sinPhi * cosTheta;
      const normalY = Math.cos(phiAngle);
      const normalZ = sinPhi * sinTheta;

      const pointX = SPHERE_RADIUS * normalX;
      const pointY = SPHERE_RADIUS * normalY;
      const pointZ = SPHERE_RADIUS * normalZ;

      const depth = PERSPECTIVE_DISTANCE / (PERSPECTIVE_DISTANCE + pointZ);
      const screenX = Math.round(pointX * depth * SCALE_X + eyeCenterX);
      const screenY = Math.round(pointY * depth * SCALE_Y + eyeCenterY);

      if (screenY < 0 || screenY >= RENDER_HEIGHT || screenX < 0 || screenX >= RENDER_WIDTH) continue;
      if (depth <= zBuffer[screenY][screenX]) continue;

      const distanceToPupil = Math.sqrt(
        (normalX - pupil.x) ** 2 + (normalY - pupil.y) ** 2 + (normalZ - pupil.z) ** 2,
      );

      let char: string;
      let zone: string;

      const glintX = pupil.x + GLINT_OFFSET_X;
      const glintY = pupil.y + GLINT_OFFSET_Y;
      const glintZ = pupil.z;
      const distanceToGlint = Math.sqrt(
        (normalX - glintX) ** 2 + (normalY - glintY) ** 2 + (normalZ - glintZ) ** 2,
      );

      const secondaryGlintX = pupil.x + SECONDARY_GLINT_OFFSET_X;
      const secondaryGlintY = pupil.y + SECONDARY_GLINT_OFFSET_Y;
      const distanceToSecondaryGlint = Math.sqrt(
        (normalX - secondaryGlintX) ** 2 + (normalY - secondaryGlintY) ** 2 + (normalZ - pupil.z) ** 2,
      );

      if (distanceToGlint < GLINT_RADIUS) {
        char = "✦";
        zone = "glint";
      } else if (distanceToSecondaryGlint < SECONDARY_GLINT_RADIUS) {
        char = "·";
        zone = "glint";
      } else if (distanceToPupil < PUPIL_RADIUS) {
        char = " ";
        zone = "pupil";
      } else if (distanceToPupil < PUPIL_RADIUS * IRIS_MULTIPLIER) {
        char = "◦";
        zone = "iris";
      } else {
        const luminance = normalX * 0.2 + normalY * 0.6 - normalZ * 0.5;
        const shadingIndex = Math.max(0, Math.min(SHADING.length - 1, Math.round((luminance + 1) / 2 * (SHADING.length - 1))));
        char = SHADING[shadingIndex];
        zone = "sclera";
      }

      zBuffer[screenY][screenX] = depth;
      grid[screenY][screenX] = { char, zone };
    }
  }
};

const renderFrame = (pupil: PupilTarget): Cell[][] => {
  const grid = Array.from({ length: RENDER_HEIGHT }, () =>
    Array.from({ length: RENDER_WIDTH }, (): Cell => ({ char: " ", zone: "empty" })),
  );
  const zBuffer = Array.from({ length: RENDER_HEIGHT }, () =>
    Array.from({ length: RENDER_WIDTH }, () => -Infinity),
  );

  renderEye(pupil, 0, grid, zBuffer);
  renderEye(pupil, EYE_WIDTH + EYE_GAP, grid, zBuffer);

  return grid;
};

export const ColoredLogo = () => {
  const [pupil, setPupil] = useState<PupilTarget>({ x: 0, y: 0, z: -0.5 });
  const targetRef = useRef<PupilTarget>({ x: 0, y: 0, z: -0.5 });
  const currentRef = useRef<PupilTarget>({ x: 0, y: 0, z: -0.5 });
  const eyeScreenCol = useRef<number | null>(null);

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);
    process.stdout.write(CURSOR_POSITION_QUERY);

    const handleData = (data: Buffer) => {
      const str = data.toString();

      const cprMatch = str.match(CURSOR_POSITION_PATTERN);
      if (cprMatch && eyeScreenCol.current === null) {
        eyeScreenCol.current = parseInt(cprMatch[2], 10) + Math.floor(RENDER_WIDTH / 2);
        return;
      }

      const match = str.match(MOUSE_SGR_PATTERN);
      if (!match || eyeScreenCol.current === null) return;

      const col = parseInt(match[2], 10);
      const row = parseInt(match[3], 10);
      const termRows = process.stdout.rows || 24;
      const eyeCenterRow = termRows - Math.floor(RENDER_HEIGHT / 2);
      const deltaX = col - eyeScreenCol.current;
      const deltaY = row - eyeCenterRow;

      targetRef.current = {
        x: clamp((deltaX / MOUSE_SENSITIVITY_X) * PUPIL_MAX_X, -PUPIL_MAX_X, PUPIL_MAX_X),
        y: clamp((deltaY / MOUSE_SENSITIVITY_Y) * PUPIL_MAX_Y, -PUPIL_MAX_Y, PUPIL_MAX_Y),
        z: -0.45,
      };
    };

    process.stdin.on("data", handleData);

    const interval = setInterval(() => {
      currentRef.current = {
        x: lerp(currentRef.current.x, targetRef.current.x, SMOOTHING_FACTOR),
        y: lerp(currentRef.current.y, targetRef.current.y, SMOOTHING_FACTOR),
        z: lerp(currentRef.current.z, targetRef.current.z, SMOOTHING_FACTOR),
      };
      setPupil({ ...currentRef.current });
    }, FRAME_INTERVAL_MS);

    return () => {
      process.stdout.write(MOUSE_DISABLE);
      process.stdin.off("data", handleData);
      clearInterval(interval);
    };
  }, []);

  const frame = renderFrame(pupil);

  return (
    <Box flexDirection="column">
      {frame.map((row, rowIndex) => (
        <Text key={rowIndex}>
          {row.map((cell, colIndex) => {
            const color =
              cell.zone === "pupil" ? "#222222"
                : cell.zone === "iris" ? COLORS.TEXT
                  : cell.zone === "sclera" ? COLORS.DIM
                    : undefined;
            return (
              <Text key={colIndex} color={color}>{cell.char}</Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
};
