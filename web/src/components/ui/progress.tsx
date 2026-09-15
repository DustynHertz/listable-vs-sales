import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Progress({
  className,
  value,
  ...props
}: ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-slate-800 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
