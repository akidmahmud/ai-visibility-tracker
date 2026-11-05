import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export const TableHeader = (p: React.ComponentProps<"thead">) => <thead {...p} className={cn("border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground", p.className)} />;
export const TableBody = (p: React.ComponentProps<"tbody">) => <tbody {...p} className={cn("divide-y", p.className)} />;
export const TableRow = (p: React.ComponentProps<"tr">) => <tr {...p} className={cn("transition-colors hover:bg-muted/60", p.className)} />;
export const TableHead = ({ numeric, ...p }: React.ComponentProps<"th"> & { numeric?: boolean }) => (
  <th {...p} className={cn("px-3 py-2.5 font-medium", numeric && "text-right", p.className)} />
);
export const TableCell = ({ numeric, ...p }: React.ComponentProps<"td"> & { numeric?: boolean }) => (
  <td {...p} className={cn("p-3", numeric && "text-right tabular-nums", p.className)} />
);
