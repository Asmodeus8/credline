"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CornerDownLeft,
  FastForward,
  FileText,
  HandCoins,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Send,
  SlidersHorizontal,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type NavItem = { href: string; label: string; icon: typeof LayoutGrid; badge?: boolean };

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/console", label: "Overview", icon: LayoutGrid }] },
  {
    title: "Lending",
    items: [
      { href: "/console/applications", label: "Review queue", icon: Inbox, badge: true },
      { href: "/console/loans", label: "Loans", icon: Wallet },
      { href: "/console/borrowers", label: "Borrowers", icon: Users },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/console/disbursements", label: "Disbursements", icon: Send },
      { href: "/console/repayments", label: "Repayments", icon: HandCoins },
      { href: "/console/collections", label: "Collections", icon: Banknote },
    ],
  },
  { title: "Insights", items: [{ href: "/console/reports", label: "Reports", icon: BarChart3 }] },
  {
    title: "Admin",
    items: [
      { href: "/console/products", label: "Products", icon: SlidersHorizontal },
      { href: "/console/team", label: "Team", icon: User },
      { href: "/console/audit", label: "Audit trail", icon: ScrollText },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>();
  const [today, setToday] = useState<string>();
  const [queue, setQueue] = useState(0);
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <nav className="space-y-5">
      {NAV.map((group, gi) => (
        <div key={gi}>
          {group.title && <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.16em] text-sheet/35 uppercase">{group.title}</p>}
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = href === "/console" ? path === href : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenu(false)}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition",
                    active ? "bg-sheet/10 text-sheet" : "text-sheet/55 hover:bg-sheet/5 hover:text-sheet",
                  )}
                >
                  {active && <motion.span layoutId="nav-active" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-lime" />}
                  <Icon className={cx("size-[18px] transition", active ? "text-lime" : "group-hover:text-sheet")} />
                  <span className="flex-1">{label}</span>
                  {badge && queue > 0 && <span className="num rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-ink">{queue}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
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
      <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col justify-between overflow-y-auto bg-ink p-4 lg:flex">
          <div>
            <div className="px-2 pt-2 pb-7">
              <Logo light />
            </div>
            {nav}
          </div>
          <div className="pt-6">{profile}</div>
        </aside>

        {menu && (
          <div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={() => setMenu(false)}>
            <aside className="rise flex h-full w-72 flex-col justify-between overflow-y-auto bg-ink p-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <div className="flex items-center justify-between px-2 pt-2 pb-7">
                  <Logo light />
                  <button onClick={() => setMenu(false)} className="text-sheet/60" aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>
                {nav}
              </div>
              <div className="pt-6">{profile}</div>
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
              <button
                onClick={() => setPalette(true)}
                className="ml-4 hidden h-9 w-64 items-center gap-2 rounded-full border border-line bg-sheet px-3.5 text-[13px] text-mute transition hover:border-ink/30 md:flex"
              >
                <Search className="size-3.5" />
                <span className="flex-1 text-left">Search borrowers, loans…</span>
                <kbd className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px]">Ctrl K</kbd>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setPalette(true)} className="rounded-full p-2 text-mute hover:bg-ink/5 md:hidden" aria-label="Search">
                  <Search className="size-4" />
                </button>
                <span className="hidden items-center gap-2 rounded-full border border-line bg-sheet px-3 py-1.5 text-[13px] xl:flex">
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
          <main className="px-4 py-6 sm:px-8 sm:py-8">
            <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              {children}
            </motion.div>
          </main>
        </div>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed right-6 bottom-6 z-50 max-w-sm rounded-2xl bg-ink px-5 py-4 text-sm text-sheet shadow-pop"
          >
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-lime uppercase">End of day ran</p>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </ConsoleContext.Provider>
  );
}

type Hit = { kind: string; label: string; meta: string; href: string; icon: typeof LayoutGrid };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      api<{
        borrowers: { id: number; name: string; phone: string }[];
        loans: { id: number; reference: string; status: string; name: string }[];
        applications: { id: number; reference: string; status: string; name: string }[];
      }>(`/console/search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          setResults([
            ...r.borrowers.map((b) => ({ kind: "Borrower", label: b.name, meta: b.phone, href: `/console/borrowers/${b.id}`, icon: Users })),
            ...r.loans.map((l) => ({ kind: "Loan", label: l.reference, meta: `${l.name} · ${l.status.toLowerCase().replaceAll("_", " ")}`, href: `/console/loans/${l.id}`, icon: Wallet })),
            ...r.applications.map((a) => ({ kind: "Application", label: a.reference, meta: `${a.name} · ${a.status.toLowerCase().replaceAll("_", " ")}`, href: `/console/applications/${a.id}`, icon: FileText })),
          ]);
          setActive(0);
        })
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const pages = useMemo(
    () => ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())).map((i) => ({ kind: "Page", label: i.label, meta: "Go to", href: i.href, icon: i.icon })),
    [q],
  );
  const hits = q.trim().length >= 2 ? [...results, ...pages] : pages;

  const go = (h: Hit) => {
    router.push(h.href);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-xl overflow-hidden rounded-[20px] bg-sheet shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search className="size-4 text-mute" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && hits[active]) go(hits[active]);
            }}
            placeholder="Search names, phone numbers, LN- or APP- references"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-mute">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {hits.length === 0 && <li className="px-4 py-8 text-center text-sm text-mute">No matches</li>}
          {hits.map((h, i) => (
            <li key={h.kind + h.href}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === active ? "bg-paper" : "")}
              >
                <span className={cx("grid size-8 place-items-center rounded-lg", i === active ? "bg-ink text-lime" : "bg-paper text-mute")}>
                  <h.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.label}</span>
                  <span className="block truncate text-[12px] text-mute">{h.meta}</span>
                </span>
                <span className="text-[11px] text-mute">{h.kind}</span>
                {i === active && <CornerDownLeft className="size-3.5 text-mute" />}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>,
    document.body,
  );
}

function Crumbs({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean).slice(1);
  const section = ALL_ITEMS.find((n) => n.href !== "/console" && path.startsWith(n.href));
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm">
      {parts.length > 1 && section ? (
        <Link href={section.href} className="font-semibold hover:underline">
          {section.label}
        </Link>
      ) : (
        <span className="font-semibold">{section?.label ?? "Overview"}</span>
      )}
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
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Sparkline({ values, color = "#0f6b4f", className }: { values: number[]; color?: string; className?: string }) {
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 34;
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const id = `g${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("h-9 w-28", className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: "easeOut" }} />
    </svg>
  );
}

export function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return null;
  const change = (now - before) / before;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", good ? "bg-brand-soft text-brand-2" : "bg-bad-soft text-bad")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(change * 100).toFixed(0)}%
    </span>
  );
}

export function Kpi({ label, value, hint, accent, spark, delta }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string; spark?: number[]; delta?: ReactNode }) {
  return (
    <div className="group rounded-[18px] border border-line bg-sheet p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgb(20_24_21/0.35)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] text-mute">
          {accent && <span className="size-2 rounded-full" style={{ background: accent }} />}
          {label}
        </p>
        {delta}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="num text-[28px] leading-none font-semibold tracking-tight">{value}</p>
        {spark && <Sparkline values={spark} color={accent ?? "#0f6b4f"} />}
      </div>
      {hint && <p className="mt-2 text-[12px] text-mute">{hint}</p>}
    </div>
  );
}

export function ScorePill({ score, large }: { score: number; large?: boolean }) {
  const tone = score >= 600 ? "text-brand bg-brand-soft" : score >= 520 ? "text-info bg-info-soft" : "text-bad bg-bad-soft";
  return <span className={cx("num inline-flex rounded-full font-semibold", tone, large ? "px-3 py-1 text-[15px]" : "px-2 py-0.5 text-[12px]")}>{score}</span>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 border-b border-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative px-3.5 pt-1 pb-3 text-sm font-medium transition", o.value === value ? "text-ink" : "text-mute hover:text-ink")}
        >
          {o.label}
          {o.count !== undefined && <span className="num ml-1.5 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[11px]">{o.count}</span>}
          {o.value === value && <motion.span layoutId={`tab-${options.map((x) => x.value).join("")}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
        </button>
      ))}
    </div>
  );
}

export function exportCsv(name: string, rows: Record<string, unknown>[], columns: [string, string][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [columns.map(([, h]) => esc(h)).join(","), ...rows.map((r) => columns.map(([k]) => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
