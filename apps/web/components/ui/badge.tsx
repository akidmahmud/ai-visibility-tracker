import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-muted-foreground",
      success: "border-transparent bg-green-100 text-green-800",
      warning: "border-transparent bg-amber-100 text-amber-900",
      danger: "border-transparent bg-red-100 text-red-800",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
