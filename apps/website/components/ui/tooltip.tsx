"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

const TOOLTIP_FONT_FAMILY =
  '"SF Pro Display", "SFProDisplay-Medium", "SF_Pro_Display", system-ui, sans-serif'

function TooltipProvider({
  delay = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      className={cn(className)}
      {...props}
    />
  )
}

interface TooltipContentProps extends React.ComponentProps<typeof TooltipPrimitive.Popup> {
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"]
  align?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["align"]
  sideOffset?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["sideOffset"]
  alignOffset?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["alignOffset"]
}

function TooltipContent({
  className,
  side = "top",
  align = "center",
  sideOffset = 10,
  alignOffset,
  style,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        data-slot="tooltip-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1.5 text-[11px]/4.5 font-medium tracking-[0em] text-white antialiased shadow-lg [transform-origin:var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out data-[starting-style]:scale-[0.97] data-[ending-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[instant]:duration-0",
            className
          )}
          style={{ fontFamily: TOOLTIP_FONT_FAMILY, ...style }}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
