import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "slate",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "slate" | "orange" | "red" | "green" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
