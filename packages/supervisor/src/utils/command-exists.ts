import { isCommandAvailable } from "@expect/agent";

export const commandExists = (command: string): boolean => isCommandAvailable(command);
