"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" produces the file. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
      {label}
    </Button>
  );
}

/** On a print page: open the dialog once the charts have drawn. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);
  return null;
}
