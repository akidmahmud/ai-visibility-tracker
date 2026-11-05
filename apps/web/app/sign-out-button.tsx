"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Sign out"
      title="Sign out"
      className="size-8 px-0 text-slate-400 hover:bg-white/10 hover:text-white"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
      }}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
