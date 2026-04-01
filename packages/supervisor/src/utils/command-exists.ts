import whichSync from "which";

export const commandExists = (command: string): Promise<boolean> =>
  Promise.resolve(
    (() => {
      try {
        return Boolean(whichSync.sync(command));
      } catch {
        return false;
      }
    })(),
  );
