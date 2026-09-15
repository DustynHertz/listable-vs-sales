import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-xl",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;
export const AlertDialogCancel = ({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>) => (
  <AlertDialogPrimitive.Cancel asChild {...props}>
    <Button variant="outline">{children}</Button>
  </AlertDialogPrimitive.Cancel>
);
export const AlertDialogAction = ({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>) => (
  <AlertDialogPrimitive.Action asChild {...props}>
    <Button variant="destructive">{children}</Button>
  </AlertDialogPrimitive.Action>
);
