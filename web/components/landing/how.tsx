"use client";

import { Bell, Check } from "lucide-react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "./motion";

function useTyped(text: string, start: boolean, speed = 55) {
  const [n, setN] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!start) return;
    if (reduce) {
      const id = requestAnimationFrame(() => setN(text.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [start, text, speed, reduce]);
  return text.slice(0, n);
}

function FormMock() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-60px" });
  const name = useTyped("Ngozi Adebayo", seen);
  const income = useTyped("₦350,000", seen && name.length >= 13, 90);
  return (
    <div ref={ref} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 flex-1 rounded-full bg-ink/10"
            animate={seen ? { backgroundColor: i < 2 ? "#0f6b4f" : "#e2dfd6" } : undefined}
            transition={{ delay: 0.4 + i * 0.5 }}
          />
        ))}
      </div>
      {[
        ["Full name", name],
        ["Monthly income", income],
      ].map(([k, v]) => (
        <div key={k}>
          <p className="text-[11px] text-mute">{k}</p>
          <div className="mt-1 flex h-9 items-center rounded-lg border border-line-2 px-3 text-sm">
            {v}
            <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-ink" />
          </div>
        </div>
      ))}
      <div className="h-9 rounded-full bg-ink text-center text-[13px] leading-9 font-medium text-sheet">Get my decision</div>
    </div>
  );
}

function ScoreMock() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-60px" });
  const [score, setScore] = useState(300);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!seen) return;
    const c = animate(300, 672, { duration: reduce ? 0 : 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setScore(Math.round(v)) });
    return () => c.stop();
  }, [seen, reduce]);
  const bars = [
    ["Bureau", 120, 160],
    ["Income", 90, 110],
    ["Debt to income", 70, 100],
  ] as const;
  return (
    <div ref={ref} className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] text-mute">Score</p>
          <p className="num text-[34px] leading-none font-semibold">{score}</p>
        </div>
        <motion.span
          className="rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={seen ? { opacity: 1, scale: 1 } : undefined}
          transition={{ delay: 1.8, type: "spring", stiffness: 260, damping: 14 }}
        >
          Approved
        </motion.span>
      </div>
      <div className="mt-4 space-y-2.5">
        {bars.map(([k, v, max], i) => (
          <div key={k}>
            <div className="flex justify-between text-[11px]">
              <span className="text-mute">{k}</span>
              <span className="num font-medium text-brand">+{v}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={seen ? { width: `${(v / max) * 100}%` } : undefined}
                transition={{ delay: 0.4 + i * 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayoutMock() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className="relative h-[214px]">
      <motion.div
        className="absolute inset-x-0 top-0 flex gap-3 rounded-2xl bg-ink p-3.5 text-sheet shadow-pop"
        initial={{ y: -20, opacity: 0 }}
        animate={seen ? { y: 0, opacity: 1 } : undefined}
        transition={{ delay: 0.3, type: "spring", stiffness: 160, damping: 16 }}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-lime text-ink">
          <Bell className="size-4" />
        </span>
        <span className="min-w-0 text-[12px] leading-snug">
          <span className="block font-semibold">Credit alert · GTBank</span>
          <span className="block text-sheet/65">₦148,500.00 from CREDLINE/LN-R6K953WB</span>
        </span>
      </motion.div>
      <div className="absolute inset-x-0 bottom-0 rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[11px] text-mute">Repayments, auto-debited</p>
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="grid h-9 place-items-center rounded-lg border border-line text-[11px] text-mute"
              animate={seen && i < 4 ? { backgroundColor: "#dcefe4", borderColor: "#dcefe4", color: "#0b5440" } : undefined}
              transition={{ delay: 1 + i * 0.35 }}
            >
              {seen && i < 4 ? <Check className="size-3.5" /> : `M${i + 1}`}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Apply in three minutes", body: "Your phone number, BVN, income and the account you want paid into. No paperwork and no branch visit.", Mock: FormMock },
  { n: "02", title: "A decision you can read", body: "Policy rules, an affordability check and a points scorecard. You see the outcome and the reasons, never just a no.", Mock: ScoreMock },
  { n: "03", title: "Paid out, then on autopilot", body: "Link a card, get paid straight away, and repayments are taken on each due date. Pay early whenever you like.", Mock: PayoutMock },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <p className="text-[12px] font-semibold tracking-[0.16em] text-brand uppercase">How it works</p>
        <h2 className="display mt-3 max-w-2xl text-[44px] leading-[1.02] sm:text-[56px]">From application to cash in your account, in minutes.</h2>
      </Reveal>
      <div className="relative mt-16 grid gap-6 lg:grid-cols-3">
        <div className="pointer-events-none absolute top-[38px] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-line-2 to-transparent lg:block" />
        {STEPS.map(({ n, title, body, Mock }, i) => (
          <Reveal key={n} delay={i * 0.12}>
            <div className="group relative h-full rounded-[22px] border border-line bg-sheet p-6 transition duration-300 hover:-translate-y-1 hover:shadow-pop">
              <span className="relative z-10 grid size-[52px] place-items-center rounded-2xl bg-ink font-mono text-[13px] text-lime transition group-hover:rotate-[-6deg]">{n}</span>
              <h3 className="mt-6 text-[20px] font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{body}</p>
              <div className="mt-7 rounded-[18px] bg-paper p-4">
                <Mock />
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
