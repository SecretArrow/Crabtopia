"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-white/10 relative h-2 w-full overflow-hidden rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-gradient-to-r from-[#12A7A0] via-[#37D5C8] to-[#7CF5E1] h-full w-full flex-1 transition-all duration-500 shadow-[0_0_10px_rgba(124,245,225,0.55)]"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
