declare module "detect-terminal" {
  interface DetectTerminalOptions {
    preferOuter?: boolean;
  }
  export const detectTerminal: (options?: DetectTerminalOptions) => string | undefined;
  export default detectTerminal;
}
