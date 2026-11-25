"use client";

import { Banknote, CalendarDays, ChevronRight, FastForward, Inbox, LayoutGrid, LogOut, Menu, ScrollText, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button, Logo, cx } from "@/components/ui";
import { api, post } from "@/lib/api";
import { date } from "@/lib/format";
import type { Session } from "@/lib/types";

type Ctx = { session: Session; today?: string; tick: number; refresh: () => void };
const ConsoleContext = createContext<Ctx | null>(null);

export function useConsole() {
  const c = useContext(ConsoleContext);
  if (!c) throw new Error("outside console");
  return c;
}

const NAV = [
  { href: "/console", label: "Overview", icon: LayoutGrid },
  { href: "/console/applications", label: "Review queue", icon: Inbox, badge: true },
  { href: "/console/loans", label: "Loans", icon: Wallet },
  { href: "/console/collections", label: "Collections", icon: Banknote },
  { href: "/console/audit", label: "Audit trail", icon: ScrollText },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [today, setToday] = useState<string>();
  const [queue, setQueue] = useState(0);
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [advancing, setAdvancing] = useState<number>();
  const [toast, setToast] = useState<string>();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<Session>("/auth/session")
      .then((s) => (s.type === "STAFF" ? setSession(s) : router.replace("/console/signin")))
      .catch(() => router.replace("/console/signin"));
  }, [router]);

  useEffect(() => {
    if (!session) return;
    api<{ today: string }>("/sandbox/clock").then((c) => setToday(c.today)).catch(() => {});
    api<{ queue: { referred: number; pendingChecker: number } }>("/console/overview")
      .then((o) => setQueue(o.queue.referred + o.queue.pendingChecker))
      .catch(() => {});
  }, [session, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const advance = async (days: number) => {
    setAdvancing(days);
    try {
      const r = await post<{ today: string; debitsAttempted: number; debitsSucceeded: number; lateFeesCharged: number; bucketChanges: number }>(
        "/sandbox/clock/advance",
        { days },
      );
      setToday(r.today);
      setToast(
        `Moved to ${date(r.today)}. ${r.debitsSucceeded} of ${r.debitsAttempted} debits collected, ${r.lateFeesCharged} late fees, ${r.bucketChanges} bucket moves.`,
      );
      setTimeout(() => setToast(undefined), 6000);
      refresh();
    } finally {
      setAdvancing(undefined);
    }
  };

  const signOut = async () => {
    await post("/auth/logout");
    router.replace("/console/signin");
  };

  if (!session) return <div className="min-h-screen bg-paper" />;

  const nav = (
    <nav className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/console" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenu(false)}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition",
              active ? "bg-sheet/10 text-sheet" : "text-sheet/55 hover:bg-sheet/5 hover:text-sheet",
            )}
          >
            <Icon className={cx("size-4.5", active && "text-lime")} />
            <span className="flex-1">{label}</span>
            {badge && queue > 0 && <span className="num rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-ink">{queue}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const profile = (
    <div className="flex items-center gap-3 rounded-xl bg-sheet/5 p-3">
      <span className="grid size-9 place-items-center rounded-full bg-lime text-[12px] font-semibold text-ink">
        {session.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-sheet">{session.name}</span>
        <span className="block text-[12px] text-sheet/50">{session.role === "MANAGER" ? "Credit manager" : "Credit officer"}</span>
      </span>
      <button onClick={signOut} className="rounded-lg p-1.5 text-sheet/50 hover:bg-sheet/10 hover:text-sheet" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );

  return (
    <ConsoleContext.Provider value={{ session, today, tick, refresh }}>
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col justify-between bg-ink p-4 lg:flex">
          <div>
            <div className="px-2 pt-2 pb-8">
              <Logo light />
            </div>
            {nav}
          </div>
          {profile}
        </aside>

        {menu && (
          <div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={() => setMenu(false)}>
            <aside className="rise flex h-full w-72 flex-col justify-between bg-ink p-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <div className="flex items-center justify-between px-2 pt-2 pb-8">
                  <Logo light />
                  <button onClick={() => setMenu(false)} className="text-sheet/60" aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>
                {nav}
              </div>
              {profile}
            </aside>
          </div>
        )}

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
            <div className="flex h-15 items-center gap-3 px-4 sm:px-8">
              <button onClick={() => setMenu(true)} className="rounded-lg p-1.5 hover:bg-ink/5 lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <Crumbs path={path} />
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full border border-line bg-sheet px-3 py-1.5 text-[13px] sm:flex">
                  <CalendarDays className="size-3.5 text-mute" />
                  <span className="text-mute">Business date</span>
                  <span className="num font-semibold">{today ? date(today) : "…"}</span>
                </span>
                <div className="flex items-center rounded-full border border-line bg-sheet p-0.5">
                  <FastForward className="mx-2 size-3.5 text-mute" />
                  {[1, 7, 30].map((d) => (
                    <Button key={d} tone="ghost" size="sm" className="h-7 px-2.5" busy={advancing === d} disabled={advancing !== undefined} onClick={() => advance(d)}>
                      +{d}d
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
      {toast && (
        <div className="rise fixed right-6 bottom-6 z-50 max-w-sm rounded-2xl bg-ink px-5 py-4 text-sm text-sheet shadow-pop">
          <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-lime uppercase">End of day ran</p>
          {toast}
        </div>
      )}
    </ConsoleContext.Provider>
  );
}

function Crumbs({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean).slice(1);
  const section = NAV.find((n) => n.href !== "/console" && path.startsWith(n.href));
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="font-semibold">{section?.label ?? "Overview"}</span>
      {parts.length > 1 && (
        <>
          <ChevronRight className="size-3.5 text-mute" />
          <span className="truncate text-mute">Detail</span>
        </>
      )}
    </div>
  );
}

export function PageTitle({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[38px] leading-tight">{title}</h1>
        {meta && <div className="mt-1 text-sm text-mute">{meta}</div>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-sheet p-5 shadow-card">
      <p className="flex items-center gap-2 text-[13px] text-mute">
        {accent && <span className="size-2 rounded-full" style={{ background: accent }} />}
        {label}
      </p>
      <p className="num mt-2 text-[28px] leading-none font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-mute">{hint}</p>}
    </div>
  );
}

export function ScorePill({ score, large }: { score: number; large?: boolean }) {
  const tone = score >= 600 ? "text-brand bg-brand-soft" : score >= 520 ? "text-info bg-info-soft" : "text-bad bg-bad-soft";
  return <span className={cx("num inline-flex rounded-full font-semibold", tone, large ? "px-3 py-1 text-[15px]" : "px-2 py-0.5 text-[12px]")}>{score}</span>;
}
