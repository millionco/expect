import { createWatchProgram } from "./commands/watch";

await createWatchProgram().parseAsync(process.argv);
