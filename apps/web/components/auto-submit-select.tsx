"use client";

import { Select } from "@/components/ui/form";

/** A select that saves its form as soon as the value changes. */
export function AutoSubmitSelect(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
