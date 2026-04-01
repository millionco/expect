import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect, Schema } from "effect";
import { SimulatorNotFoundError, SimulatorBootError, XcodeNotInstalledError } from "./errors";

const execFileAsync = promisify(execFile);

export interface IosDevice {
  readonly name: string;
  readonly udid: string;
  readonly state: string;
  readonly runtime: string;
  readonly isReal: boolean;
}

const SimctlDeviceSchema = Schema.Struct({
  name: Schema.String,
  udid: Schema.String,
  state: Schema.String,
});

const SimctlOutputSchema = Schema.Struct({
  devices: Schema.Record(Schema.String, Schema.Array(SimctlDeviceSchema)),
});

const execCommand = Effect.fn("IosSimulator.execCommand")(function* (
  command: string,
  args: string[],
) {
  return yield* Effect.tryPromise({
    try: () => execFileAsync(command, args),
    catch: (cause) =>
      new XcodeNotInstalledError({
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  });
});

const listSimulators = Effect.fn("IosSimulator.listSimulators")(function* () {
  const { stdout } = yield* execCommand("xcrun", ["simctl", "list", "devices", "--json"]);

  const decoded = yield* Schema.decodeUnknownEffect(SimctlOutputSchema)(JSON.parse(stdout)).pipe(
    Effect.catchTag("SchemaError", (error) =>
      new XcodeNotInstalledError({ cause: error.message }).asEffect(),
    ),
  );

  const devices: IosDevice[] = [];
  for (const [runtime, deviceList] of Object.entries(decoded.devices)) {
    for (const device of deviceList) {
      devices.push({
        name: device.name,
        udid: device.udid,
        state: device.state,
        runtime,
        isReal: false,
      });
    }
  }

  return devices;
});

const listRealDevices = Effect.fn("IosSimulator.listRealDevices")(function* () {
  const result = yield* execCommand("xcrun", ["xctrace", "list", "devices"]).pipe(
    Effect.catchTag("XcodeNotInstalledError", () => Effect.succeed({ stdout: "", stderr: "" })),
  );

  const devices: IosDevice[] = [];
  let inDevices = false;

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("== Devices ==")) {
      inDevices = true;
      continue;
    }
    if (trimmed.startsWith("== Simulators ==")) break;
    if (!inDevices || trimmed.length === 0) continue;

    const udidStart = trimmed.lastIndexOf("(");
    if (udidStart === -1) continue;
    const udid = trimmed.slice(udidStart + 1, -1);
    if (!udid.includes("-") || udid.length <= 20) continue;

    const namePart = trimmed.slice(0, udidStart).trim();
    const parenPos = namePart.lastIndexOf("(");
    const name = parenPos !== -1 ? namePart.slice(0, parenPos).trim() : namePart;

    devices.push({ name, udid, state: "Connected", runtime: "", isReal: true });
  }

  return devices;
});

export const listAllDevices = Effect.fn("IosSimulator.listAllDevices")(function* () {
  const simulators = yield* listSimulators().pipe(
    Effect.catchTag("XcodeNotInstalledError", () => Effect.succeed([] as IosDevice[])),
  );
  const realDevices = yield* listRealDevices();
  return [...simulators, ...realDevices];
});

export const bootSimulator = Effect.fn("IosSimulator.bootSimulator")(function* (udid: string) {
  yield* Effect.annotateCurrentSpan({ udid });

  yield* Effect.tryPromise({
    try: () => execFileAsync("xcrun", ["simctl", "boot", udid]),
    catch: (cause) =>
      new SimulatorBootError({
        udid,
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  }).pipe(
    Effect.catchTag("SimulatorBootError", (error) => {
      if (error.cause.includes("current state: Booted")) return Effect.void;
      return error.asEffect();
    }),
  );

  yield* Effect.logInfo("iOS simulator booted", { udid });
});

export const selectDevice = Effect.fn("IosSimulator.selectDevice")(function* (
  deviceName?: string,
  udid?: string,
) {
  if (udid) {
    const devices = yield* listAllDevices();
    const found = devices.find((device) => device.udid === udid);
    if (!found) return yield* new SimulatorNotFoundError({ device: udid });
    return found;
  }

  if (deviceName) {
    const devices = yield* listAllDevices();
    const lowerName = deviceName.toLowerCase();
    const found = devices.find((device) => device.name.toLowerCase().includes(lowerName));
    if (!found) return yield* new SimulatorNotFoundError({ device: deviceName });
    return found;
  }

  const simulators = yield* listSimulators();
  const iphones = simulators.filter((device) => device.name.startsWith("iPhone"));

  if (iphones.length === 0) {
    if (simulators.length === 0) {
      return yield* new SimulatorNotFoundError({ device: "any iPhone simulator" });
    }
    return simulators[0]!;
  }

  const proDevice = iphones.find((device) => device.name.includes("Pro"));
  if (proDevice) return proDevice;
  return iphones[iphones.length - 1]!;
});

export const extractPlatformVersion = (runtime: string): string | undefined => {
  const match = runtime.match(/iOS[- ](\d+[.-]\d+)/);
  if (!match) return undefined;
  return match[1]!.replace("-", ".");
};
