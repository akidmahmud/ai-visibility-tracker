"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";

type Run = { id: string; status: string; promptCount: number; answersSoFar: number };

/** Live progress of a running capture; polls while a run is RUNNING and refreshes the page when it ends. */
export function RunProgress({ brandId, engines }: { brandId: string; engines: number }) {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["runs", brandId],
    queryFn: async (): Promise<Run[]> => (await fetch(`/api/data/brands/${brandId}/runs`)).json(),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "RUNNING") ? 4000 : false),
  });
  const running = data?.find((r) => r.status === "RUNNING");
  const wasRunning = useRef(false);

  useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      router.refresh(); // numbers are ready: the run is only marked done after its rollups are written
    }
  }, [running, router]);

  if (!running) return null;
  const expected = running.promptCount * engines;
  const done = Math.min(running.answersSoFar, expected);
  return (
    <Card role="status" className="space-y-2 p-4 text-sm">
      <p className="font-medium">Run in progress: {done} of {expected} answers captured</p>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${expected ? (done / expected) * 100 : 0}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Each answer takes 5–30 seconds. You can leave this page; the run continues.</p>
    </Card>
  );
}
