import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="card"
    className={cn(
      "flex flex-col gap-3 overflow-hidden rounded-xl bg-card py-3 text-sm text-card-foreground ring-1 ring-foreground/10",
      className,
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="card-header"
    className={cn(
      "grid auto-rows-min items-start gap-1 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
      className,
    )}
    {...props}
  />
);

const CardTitle = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="card-title"
    className={cn("text-base leading-snug font-medium", className)}
    {...props}
  />
);

const CardDescription = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="card-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);

const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div data-slot="card-content" className={cn("px-4", className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
