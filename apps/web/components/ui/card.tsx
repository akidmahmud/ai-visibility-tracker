import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

/** Card title row: title, optional subtitle, optional right-side controls. */
export function CardHeader({ title, subtitle, children, className }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)}>
      <div>
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
