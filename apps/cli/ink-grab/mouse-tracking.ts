import { EventEmitter } from "node:events";

const BUTTON_NAMES = ["left", "middle", "right", "none"] as const;

type ButtonName = (typeof BUTTON_NAMES)[number];

export interface MouseEvent {
  x: number;
  y: number;
  button: ButtonName | "up" | "down";
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  down: boolean;
  name: "scroll" | "move" | "buttons";
}

interface MouseTrackingEvents {
  click: [press: MouseEvent, release: MouseEvent];
  down: [event: MouseEvent];
  up: [event: MouseEvent];
  buttons: [event: MouseEvent];
  move: [event: MouseEvent];
  scroll: [event: MouseEvent];
  event: [event: MouseEvent];
}

const ESC = 0x1b;
const BRACKET = 0x5b;
const UPPER_M = 0x4d;
const LOWER_M = 0x6d;
const LESS_THAN = 0x3c;
const CTRL_C = 0x03;

const decodeButton = (value: number): MouseEvent => {
  const event: MouseEvent = {
    x: 0,
    y: 0,
    button: "none",
    shift: Boolean(value & 4),
    meta: Boolean(value & 8),
    ctrl: Boolean(value & 16),
    down: false,
    name: "buttons",
  };

  if (value & 64) {
    event.name = "scroll";
    event.button = value & 1 ? "down" : "up";
  } else {
    event.name = value & 32 ? "move" : "buttons";
    event.button = BUTTON_NAMES[value & 3];
    event.down = (value & 3) !== 3;
  }

  return event;
};

export class MouseTracking extends EventEmitter<MouseTrackingEvents> {
  private readonly input: NodeJS.ReadStream;
  private readonly output: NodeJS.WriteStream;
  private pendingDown: MouseEvent | null = null;

  constructor() {
    super();
    this.input = process.stdin;
    this.output = process.stdout;
    this.onData = this.onData.bind(this);

    this.on("buttons", (event) => {
      if (event.button === "none") {
        this.emit("up", event);
        if (this.pendingDown) {
          this.emit("click", this.pendingDown, event);
        }
        this.pendingDown = null;
      } else {
        this.emit("down", event);
        this.pendingDown = event;
      }
    });
  }

  start(): this {
    this.input.on("data", this.onData);
    this.output.write("\x1b[?1006h");
    this.output.write("\x1b[?1003h");
    return this;
  }

  stop(): this {
    this.input.removeListener("data", this.onData);
    this.output.write("\x1b[?1003l");
    this.output.write("\x1b[?1006l");
    return this;
  }

  private onData(data: Buffer): void {
    for (let index = 0; index < data.length; index++) {
      const byte = data[index];

      if (byte === CTRL_C) {
        process.emit("SIGINT", "SIGINT");
        continue;
      }

      if (byte !== ESC || index >= data.length - 2 || data[index + 1] !== BRACKET) {
        continue;
      }

      index += 2;
      const marker = data[index];

      if (marker === LESS_THAN) {
        const parsed = this.parseXtermSgr(data, index);
        if (parsed) {
          index = parsed.endIndex;
          this.emit("event", parsed.event);
          this.emit(parsed.event.name, parsed.event);
        }
      } else if (marker === UPPER_M) {
        const parsed = this.parseStandard(data, index);
        if (parsed) {
          index = parsed.endIndex;
          this.emit("event", parsed.event);
          this.emit(parsed.event.name, parsed.event);
        }
      }
    }
  }

  private parseXtermSgr(
    data: Buffer,
    startIndex: number,
  ): { event: MouseEvent; endIndex: number } | null {
    let index = startIndex;
    const raw: number[] = [];

    while (index < data.length) {
      const value = data[index];
      raw.push(value);
      if (value === UPPER_M || value === LOWER_M) break;
      index++;
    }

    if (index >= data.length) return null;

    const isDown = raw[raw.length - 1] === UPPER_M;
    const content = Buffer.from(raw).toString("ascii").slice(1, -1).split(";").map(Number);

    if (content.length < 3) return null;

    const event = decodeButton(content[0]);
    if (!isDown) {
      event.button = "none";
      event.down = false;
    }
    event.x = content[1];
    event.y = content[2];

    return { event, endIndex: index };
  }

  private parseStandard(
    data: Buffer,
    startIndex: number,
  ): { event: MouseEvent; endIndex: number } | null {
    let index = startIndex + 1;
    if (index + 2 >= data.length) return null;

    const event = decodeButton(data[index++] - 32);
    event.x = data[index++] - 32;
    event.y = data[index] - 32;

    return { event, endIndex: index };
  }
}

export const createMouseTracking = (): MouseTracking => new MouseTracking();
