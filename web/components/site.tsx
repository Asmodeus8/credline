"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Logo, cx } from "@/components/ui";

export function SiteHeader({ right, dark }: { right?: ReactNode; dark?: boolean }) {
  return (
    <header className={cx("relative z-10", dark ? "text-sheet" : "")}>
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Credline home">
          <Logo light={dark} />
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-2">
          {right ?? (
            <>
              <Link href="/signin" className={cx("hidden rounded-full px-4 py-2 text-sm font-medium sm:block", dark ? "text-sheet/80 hover:text-sheet" : "text-ink-2 hover:text-ink")}>
                Sign in
              </Link>
              <Button href="/apply" tone={dark ? "secondary" : "primary"} size="sm" className="h-9 px-4">
                Apply <ArrowRight className="size-3.5" />
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[13px] text-mute sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Logo />
        <p>Sandbox build. No real money moves and the credit bureau is simulated.</p>
        <Link href="/console" className="font-medium text-ink-2 hover:text-ink">
          Staff console
        </Link>
      </div>
    </footer>
  );
}
