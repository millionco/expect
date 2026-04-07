"use client";

import { useEffect } from "react";

export function ReactGrab() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    import("react-grab").then(({ init }) => init());
  }, []);

  return null;
}
