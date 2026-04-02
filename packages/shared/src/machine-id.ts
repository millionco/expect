import { machineId as getRawMachineId } from "node-machine-id";

let cached: Promise<string> | undefined;

export const machineId = (): Promise<string> => {
  if (!cached) {
    cached = getRawMachineId();
  }
  return cached;
};
