import { bench, describe } from "vite-plus/test";

import { estimateBrowserCapacity, getSystemStats } from "../src/estimate-browser-capacity";

describe("estimate-browser-capacity", () => {
  bench("getSystemStats", () => {
    getSystemStats();
  });

  bench("estimateBrowserCapacity", () => {
    estimateBrowserCapacity();
  });
});
