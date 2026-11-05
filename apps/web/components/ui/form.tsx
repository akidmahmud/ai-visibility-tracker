import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(field, "w-auto py-1.5", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm", className)} {...props} />;
}
