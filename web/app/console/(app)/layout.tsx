import { Suspense } from "react";
import { ConsoleShell } from "@/components/console";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ConsoleShell>{children}</ConsoleShell>
    </Suspense>
  );
}
