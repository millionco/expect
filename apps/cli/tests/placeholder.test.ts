import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { ChangesFor } from "@expect/supervisor";
import { Screen, screenForWatchOrPortPicker } from "../src/stores/use-navigation";

let createExpectProgram: typeof import("../src/program").createExpectProgram;
let createWatchProgram: typeof import("../src/commands/watch").createWatchProgram;

describe("cli command wiring", () => {
  beforeAll(async () => {
    vi.stubGlobal("__VERSION__", "test");
    ({ createExpectProgram } = await import("../src/program"));
    ({ createWatchProgram } = await import("../src/commands/watch"));
  });

  it("registers the watch subcommand on the main CLI", () => {
    const program = createExpectProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("watch");
  });

  it("builds a standalone expect-watch program", () => {
    const program = createWatchProgram();

    expect(program.name()).toBe("expect-watch");

    const targetOption = program.options.find((option) => option.long === "--target");
    expect(targetOption?.defaultValue).toBe("unstaged");
  });

  it("routes watch mode directly when a URL is already present", () => {
    const screen = screenForWatchOrPortPicker({
      changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      instruction: "Watch http://localhost:3000 for regressions",
      requiresCookies: true,
    });

    expect(screen._tag).toBe("Watch");
  });

  it("routes watch mode through the port picker when no URL is present", () => {
    const screen = screenForWatchOrPortPicker({
      changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      instruction: "Watch the local dashboard",
      requiresCookies: true,
    });

    expect(screen).toEqual(
      Screen.PortPicker({
        changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
        instruction: "Watch the local dashboard",
        requiresCookies: true,
        mode: "watch",
      }),
    );
  });
});
