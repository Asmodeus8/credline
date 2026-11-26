"use client";

import { ArrowRight, Plus } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, Logo, cx } from "@/components/ui";
import { installment } from "@/lib/engine";
import { naira } from "@/lib/format";
import { CountUp, Reveal } from "./motion";

const P = 20_000_000;
const N = 6;
const RATE = 350;

function schedule() {
  const inst = installment(P, N, RATE);
  let bal = P;
  return Array.from({ length: N }, (_, i) => {
    const interest = Math.round(bal * (RATE / 10_000));
    const principal = i === N - 1 ? bal : inst - interest;
    bal -= principal;
    return { interest, principal };
  });
}

const ROWS = schedule();

export function EarlyPayoff() {
  const rows = ROWS;
  const full = rows.reduce((s, r) => s + r.interest, 0);
  const options = rows.map((_, m) => {
    const paid = rows.slice(0, m + 1).reduce((s, r) => s + r.interest, 0);
    return { month: m + 1, paid, saved: full - paid };
  });
  const [pick, setPick] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });
  const chosen = options[pick];

  return (
    <section id="early" className="mx-auto grid max-w-6xl scroll-mt-20 gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:py-32">
      <Reveal>
        <p className="text-[12px] font-semibold tracking-[0.16em] text-brand uppercase">Repay early, pay less</p>
        <h2 className="display mt-3 text-[44px] leading-[1.02] sm:text-[56px]">Close any day. Keep the interest you didn&apos;t use.</h2>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-mute">
          Interest is charged on what you still owe, month by month. Settle early and you pay only up to the current month. There&apos;s no early repayment fee.
        </p>
        <div className="mt-8 rounded-[20px] border border-line bg-sheet p-5">
          <p className="text-[13px] text-mute">
            A {naira(P)} salary loan over {N} months, closed in month {chosen.month}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] text-mute">Interest you pay</p>
              <AnimatePresence mode="popLayout">
                <motion.p key={chosen.month} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="num text-[28px] font-semibold">
                  {naira(chosen.paid)}
                </motion.p>
              </AnimatePresence>
            </div>
            <div>
              <p className="text-[12px] text-mute">You save</p>
              <AnimatePresence mode="popLayout">
                <motion.p key={chosen.month} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="num text-[28px] font-semibold text-brand">
                  {naira(chosen.saved)}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div ref={ref} className="rounded-[24px] border border-line bg-sheet p-6 shadow-card sm:p-8">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">Interest paid if you close in month…</span>
            <span className="flex items-center gap-3 text-mute">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-ink" /> paid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-lime" /> saved
              </span>
            </span>
          </div>
          <div className="mt-8 flex h-64 items-end gap-3 sm:gap-4">
            {options.map((o, i) => (
              <button key={o.month} onMouseEnter={() => setPick(i)} onFocus={() => setPick(i)} onClick={() => setPick(i)} className="group flex h-full flex-1 flex-col justify-end" aria-label={`Close in month ${o.month}`}>
                <motion.div
                  className={cx("w-full rounded-t-lg transition-colors", pick === i ? "bg-lime" : "bg-lime/35")}
                  initial={{ height: 0 }}
                  animate={seen ? { height: `${(o.saved / full) * 100}%` } : undefined}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.div
                  className={cx("w-full rounded-b-lg transition-colors", pick === i ? "bg-ink" : "bg-ink/25", o.saved === 0 && "rounded-t-lg")}
                  initial={{ height: 0 }}
                  animate={seen ? { height: `${(o.paid / full) * 100}%` } : undefined}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className={cx("mt-3 text-center text-[13px]", pick === i ? "font-semibold" : "text-mute")}>{o.month}</span>
              </button>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Numbers() {
  const items = [
    { to: 60, format: (n: number) => `${Math.round(n)}s`, label: "or less for a decision, day or night" },
    { to: 40, format: (n: number) => `${Math.round(n)}%`, label: "of income is the most repayments can take" },
    { to: 3, format: (n: number) => `${Math.round(n)} days`, label: "of grace before a late fee, charged once" },
    { to: 0, format: () => "₦0", label: "to repay early or close your loan" },
  ];
  return (
    <section className="border-y border-line bg-sheet">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-5 py-14 sm:px-8 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.label} delay={i * 0.08} className={cx("px-2 lg:px-6", i > 0 && "lg:border-l lg:border-line")}>
            <p className="display text-[52px] leading-none">
              <CountUp to={it.to} format={it.format} />
            </p>
            <p className="mt-3 max-w-[200px] text-[14px] text-mute">{it.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  ["How is the decision made?", "Five policy rules first: age, minimum income, verifiable income, no arrears at the credit bureau and no previous write-off. Then an affordability check, then a points scorecard. 600 or more is approved automatically, 520 to 599 goes to a credit officer, and you always see the reasons."],
  ["What does a loan cost?", "Salary loans are 3.5% a month on the reducing balance, with a 1% fee deducted at payout. Before you accept, the offer shows the amount you receive, every repayment, the total cost and the APR."],
  ["What happens if I miss a payment?", "We retry your card on the following days. After a 3-day grace period, a one-off late fee is added to that instalment. You can pay what's overdue from your account at any time."],
  ["Can I repay early?", "Yes, any day and for free. You pay what you owe plus the current month's interest, and the remaining interest is waived."],
  ["How much can I borrow the first time?", "Up to ₦200,000, sized so repayments stay within 40% of your income after existing debt. Repay on time and your next loan is scored on your history with us."],
  ["Is this a real lender?", "No. This is a demonstration build with a simulated credit bureau and sandbox payments, so no real money moves."],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-5 pb-24 sm:px-8 lg:pb-32">
      <Reveal>
        <h2 className="display text-center text-[44px] leading-[1.05] sm:text-[52px]">Questions, answered plainly</h2>
      </Reveal>
      <div className="mt-12 divide-y divide-line border-y border-line">
        {FAQ.map(([q, a], i) => (
          <Reveal key={q} delay={i * 0.04}>
            <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-6 py-6 text-left" aria-expanded={open === i}>
              <span className="text-[18px] font-medium tracking-tight">{q}</span>
              <motion.span animate={{ rotate: open === i ? 45 : 0 }} className={cx("grid size-9 shrink-0 place-items-center rounded-full border transition-colors", open === i ? "border-ink bg-ink text-lime" : "border-line-2")}>
                <Plus className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <p className="max-w-2xl pb-6 text-[16px] leading-relaxed text-mute">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-5 pb-20 sm:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-ink px-8 py-16 text-center text-sheet sm:py-24">
          <motion.div
            className="pointer-events-none absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime/15"
            animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute top-1/2 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime/20"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.3, 0.8] }}
            transition={{ duration: 6, delay: 1, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="pointer-events-none absolute -bottom-40 left-1/2 size-[500px] -translate-x-1/2 rounded-full bg-brand/50 blur-[120px]" />
          <h2 className="display relative mx-auto max-w-3xl text-[46px] leading-[1.02] sm:text-[68px]">
            Know your offer in <em className="text-lime">under a minute.</em>
          </h2>
          <p className="relative mx-auto mt-5 max-w-md text-sheet/60">Checking costs nothing and your answer comes with its reasons.</p>
          <div className="relative mt-9 flex justify-center">
            <Button href="/apply" size="lg" tone="lime" className="group">
              Start my application <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-mute">Transparent salary and business loans, decided in minutes. Sandbox build: the bureau is simulated and no real money moves.</p>
        </div>
        {[
          ["Loans", [["Salary loan", "/apply"], ["Business loan", "/apply"], ["Quick cash", "/apply"]]],
          ["Learn", [["How it works", "#how"], ["The decision", "#engine"], ["FAQ", "#faq"]]],
          ["Account", [["Sign in", "/signin"], ["Apply", "/apply"], ["Staff console", "/console"]]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <p className="text-[12px] font-semibold tracking-[0.14em] text-ink-2 uppercase">{title as string}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {(links as string[][]).map(([l, h]) => (
                <li key={l}>
                  <Link href={h} className="text-mute transition hover:text-ink">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-6 text-center text-[12px] text-mute">Credline is a portfolio project. Not a licensed lender.</div>
    </footer>
  );
}
